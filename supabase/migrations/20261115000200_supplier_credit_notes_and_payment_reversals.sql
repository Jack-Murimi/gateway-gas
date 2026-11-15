-- Supplier credit notes and payment reversals. Posted financial records remain immutable.
create table if not exists public.supplier_credit_notes (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  invoice_id uuid not null references public.supplier_invoices(id),
  credit_note_number text not null,
  credit_note_date date not null default current_date,
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  reason text not null check (length(trim(reason)) >= 5),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (supplier_id, credit_note_number)
);
create table if not exists public.supplier_payment_reversals (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  payment_id uuid not null unique references public.supplier_payments(id),
  reversal_date date not null default current_date,
  reason text not null check (length(trim(reason)) >= 5),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists supplier_credit_notes_invoice_idx on public.supplier_credit_notes(invoice_id, credit_note_date desc);
create index if not exists supplier_credit_notes_supplier_idx on public.supplier_credit_notes(supplier_id, credit_note_date desc);
create index if not exists supplier_payment_reversals_supplier_idx on public.supplier_payment_reversals(supplier_id, reversal_date desc);
alter table public.supplier_credit_notes enable row level security;
alter table public.supplier_payment_reversals enable row level security;
revoke all on public.supplier_credit_notes, public.supplier_payment_reversals from anon, authenticated;
grant select, insert on public.supplier_credit_notes, public.supplier_payment_reversals to authenticated;
drop policy if exists "Approved staff view supplier credit notes" on public.supplier_credit_notes;
create policy "Approved staff view supplier credit notes" on public.supplier_credit_notes for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Managers create supplier credit notes" on public.supplier_credit_notes;
create policy "Managers create supplier credit notes" on public.supplier_credit_notes for insert to authenticated with check (public.current_user_role() in ('admin','director'));
drop policy if exists "Approved staff view supplier payment reversals" on public.supplier_payment_reversals;
create policy "Approved staff view supplier payment reversals" on public.supplier_payment_reversals for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Managers create supplier payment reversals" on public.supplier_payment_reversals;
create policy "Managers create supplier payment reversals" on public.supplier_payment_reversals for insert to authenticated with check (public.current_user_role() in ('admin','director'));

create or replace function public.post_supplier_credit_note(p_credit jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_invoice_id uuid := nullif(p_credit->>'invoice_id','')::uuid;
  v_number text := trim(coalesce(p_credit->>'credit_note_number',''));
  v_date date := coalesce(nullif(p_credit->>'credit_note_date','')::date,current_date);
  v_amount numeric(14,2) := (p_credit->>'amount_kes')::numeric;
  v_reason text := trim(coalesce(p_credit->>'reason',''));
  v_supplier_id uuid;
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_credited numeric(14,2);
begin
  if public.current_user_role() not in ('admin','director') then raise exception 'Only administrators and directors can post supplier credit notes.'; end if;
  if v_invoice_id is null or v_number = '' or v_amount is null or v_amount <= 0 or length(v_reason) < 5 then raise exception 'Invoice, credit note number, positive amount and a clear reason are required.'; end if;
  select supplier_id,total_kes into v_supplier_id,v_total from public.supplier_invoices where id=v_invoice_id and status='posted' for update;
  if not found then raise exception 'Select a valid posted supplier invoice.'; end if;
  select coalesce(sum(a.amount_kes),0) into v_paid
  from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id
  left join public.supplier_payment_reversals r on r.payment_id=p.id
  where a.invoice_id=v_invoice_id and r.id is null;
  select coalesce(sum(amount_kes),0) into v_credited from public.supplier_credit_notes where invoice_id=v_invoice_id;
  if v_amount > greatest(v_total-v_paid-v_credited,0) then raise exception 'Credit note exceeds the unpaid invoice balance. This workflow does not create supplier credit on already-paid amounts.'; end if;
  insert into public.supplier_credit_notes(id,supplier_id,invoice_id,credit_note_number,credit_note_date,amount_kes,reason,created_by)
  values(v_id,v_supplier_id,v_invoice_id,v_number,v_date,v_amount,v_reason,auth.uid());
  return v_id;
end;
$$;

create or replace function public.reverse_supplier_payment(p_payment_id uuid,p_reversal_date date,p_reason text)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare v_id uuid := gen_random_uuid(); v_supplier_id uuid;
begin
  if public.current_user_role() not in ('admin','director') then raise exception 'Only administrators and directors can reverse supplier payments.'; end if;
  if p_payment_id is null or length(trim(coalesce(p_reason,''))) < 5 then raise exception 'Select a payment and provide a clear reversal reason.'; end if;
  select supplier_id into v_supplier_id from public.supplier_payments where id=p_payment_id for update;
  if not found then raise exception 'Supplier payment not found.'; end if;
  if exists(select 1 from public.supplier_payment_reversals where payment_id=p_payment_id) then raise exception 'This supplier payment has already been reversed.'; end if;
  insert into public.supplier_payment_reversals(id,supplier_id,payment_id,reversal_date,reason,created_by)
  values(v_id,v_supplier_id,p_payment_id,coalesce(p_reversal_date,current_date),trim(p_reason),auth.uid());
  return v_id;
end;
$$;

create or replace function public.record_supplier_payment(p_payment jsonb, p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid(); v_supplier_id uuid := (p_payment->>'supplier_id')::uuid;
  v_amount numeric(14,2) := (p_payment->>'amount_kes')::numeric;
  v_date date := coalesce((p_payment->>'payment_date')::date,current_date);
  v_method text := coalesce(p_payment->>'payment_method',''); v_alloc jsonb;
  v_invoice_id uuid; v_alloc_amount numeric(14,2); v_sum numeric(14,2) := 0;
  v_outstanding numeric(14,2); v_opening_paid numeric(14,2); v_opening numeric(14,2); v_credited numeric(14,2);
begin
  if public.current_user_role() not in ('admin','director','operator') then raise exception 'You are not authorised to record supplier payments.'; end if;
  if v_supplier_id is null or v_amount is null or v_amount <= 0 then raise exception 'Select a supplier and enter a valid payment amount.'; end if;
  if v_method not in ('cash','mpesa','bank_transfer','cheque','pdq') then raise exception 'Select a valid payment method.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then raise exception 'Allocate the payment to one or more outstanding balances.'; end if;
  perform 1 from public.suppliers where id=v_supplier_id for update;
  if not found then raise exception 'Supplier not found.'; end if;
  insert into public.supplier_payments(id,supplier_id,payment_date,amount_kes,payment_method,reference,notes,created_by)
  values(v_id,v_supplier_id,v_date,v_amount,v_method,nullif(p_payment->>'reference',''),nullif(p_payment->>'notes',''),auth.uid());
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_invoice_id := nullif(v_alloc->>'invoice_id','')::uuid; v_alloc_amount := (v_alloc->>'amount_kes')::numeric;
    if v_alloc_amount is null or v_alloc_amount <= 0 then raise exception 'Payment allocations must be positive.'; end if;
    if v_invoice_id is null then
      select opening_balance_kes into v_opening from public.suppliers where id=v_supplier_id;
      select coalesce(sum(a.amount_kes),0) into v_opening_paid from public.supplier_payment_allocations a
      join public.supplier_payments p on p.id=a.payment_id left join public.supplier_payment_reversals r on r.payment_id=p.id
      where p.supplier_id=v_supplier_id and a.invoice_id is null and r.id is null;
      if v_alloc_amount > greatest(v_opening-v_opening_paid,0) then raise exception 'Payment exceeds the supplier opening balance remaining.'; end if;
    else
      perform 1 from public.supplier_invoices where id=v_invoice_id and supplier_id=v_supplier_id and status='posted' for update;
      if not found then raise exception 'Invoice does not belong to this supplier.'; end if;
      select i.total_kes-coalesce(sum(a.amount_kes) filter (where r.id is null),0) into v_outstanding
      from public.supplier_invoices i left join public.supplier_payment_allocations a on a.invoice_id=i.id
      left join public.supplier_payments p on p.id=a.payment_id left join public.supplier_payment_reversals r on r.payment_id=p.id
      where i.id=v_invoice_id group by i.id;
      select coalesce(sum(amount_kes),0) into v_credited from public.supplier_credit_notes where invoice_id=v_invoice_id;
      v_outstanding := v_outstanding-v_credited;
      if v_alloc_amount > greatest(v_outstanding,0) then raise exception 'Payment exceeds the invoice balance remaining.'; end if;
    end if;
    insert into public.supplier_payment_allocations(payment_id,invoice_id,amount_kes) values(v_id,v_invoice_id,v_alloc_amount);
    v_sum := v_sum+v_alloc_amount;
  end loop;
  if round(v_sum,2) <> round(v_amount,2) then raise exception 'The allocated amount must equal the payment amount.'; end if;
  return v_id;
end;
$$;

revoke all on function public.post_supplier_credit_note(jsonb) from public, anon;
revoke all on function public.reverse_supplier_payment(uuid,date,text) from public, anon;
revoke all on function public.record_supplier_payment(jsonb,jsonb) from public, anon;
grant execute on function public.post_supplier_credit_note(jsonb) to authenticated;
grant execute on function public.reverse_supplier_payment(uuid,date,text) to authenticated;
grant execute on function public.record_supplier_payment(jsonb,jsonb) to authenticated;
