-- Supplier accounts payable: suppliers, posted invoices, invoice lines and payments.
-- All balances are derived from opening balances, posted invoices and payment allocations.
-- Posted invoices/payments are append-only. Corrections should use a controlled credit-note workflow.

create table if not exists public.suppliers (
  id uuid primary key default gen_random_uuid(),
  supplier_code text not null unique,
  name text not null,
  contact_person text,
  phone text,
  email text,
  kra_pin text,
  address text,
  opening_balance_kes numeric(14,2) not null default 0 check (opening_balance_kes >= 0),
  opening_balance_date date,
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  branch_id uuid not null references public.branches(id),
  invoice_number text not null,
  invoice_date date not null,
  due_date date,
  subtotal_kes numeric(14,2) not null default 0 check (subtotal_kes >= 0),
  tax_kes numeric(14,2) not null default 0 check (tax_kes >= 0),
  total_kes numeric(14,2) not null default 0 check (total_kes >= 0),
  notes text,
  status text not null default 'posted' check (status in ('posted','void')),
  created_by uuid references public.profiles(id) on delete set null,
  posted_by uuid references public.profiles(id) on delete set null,
  posted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (supplier_id, invoice_number)
);

create table if not exists public.supplier_invoice_items (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.supplier_invoices(id),
  product_id uuid references public.products(id),
  description text not null,
  quantity numeric(14,3) not null check (quantity > 0),
  unit_cost_kes numeric(14,2) not null check (unit_cost_kes >= 0),
  line_total_kes numeric(14,2) not null check (line_total_kes >= 0),
  track_stock boolean not null default false,
  created_at timestamptz not null default now(),
  check (not track_stock or product_id is not null)
);

create table if not exists public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references public.suppliers(id),
  payment_date date not null default current_date,
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  payment_method text not null check (payment_method in ('cash','mpesa','bank_transfer','cheque','pdq')),
  reference text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supplier_payments(id),
  invoice_id uuid references public.supplier_invoices(id),
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  created_at timestamptz not null default now()
);

create index if not exists supplier_invoices_supplier_date_idx on public.supplier_invoices(supplier_id, invoice_date desc);
create index if not exists supplier_invoices_branch_date_idx on public.supplier_invoices(branch_id, invoice_date desc);
create index if not exists supplier_invoice_items_invoice_idx on public.supplier_invoice_items(invoice_id);
create index if not exists supplier_payments_supplier_date_idx on public.supplier_payments(supplier_id, payment_date desc);
create index if not exists supplier_payment_allocations_invoice_idx on public.supplier_payment_allocations(invoice_id);

alter table public.suppliers enable row level security;
alter table public.supplier_invoices enable row level security;
alter table public.supplier_invoice_items enable row level security;
alter table public.supplier_payments enable row level security;
alter table public.supplier_payment_allocations enable row level security;

revoke all on public.suppliers, public.supplier_invoices, public.supplier_invoice_items, public.supplier_payments, public.supplier_payment_allocations from anon;
grant select, insert, update on public.suppliers to authenticated;
grant select, insert on public.supplier_invoices, public.supplier_invoice_items, public.supplier_payments, public.supplier_payment_allocations to authenticated;

drop policy if exists "Approved purchasing staff view suppliers" on public.suppliers;
create policy "Approved purchasing staff view suppliers" on public.suppliers for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing managers create suppliers" on public.suppliers;
create policy "Purchasing managers create suppliers" on public.suppliers for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing managers update suppliers" on public.suppliers;
create policy "Purchasing managers update suppliers" on public.suppliers for update to authenticated using (public.current_user_role() in ('admin','director','operator')) with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view supplier invoices" on public.supplier_invoices;
create policy "Approved purchasing staff view supplier invoices" on public.supplier_invoices for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create supplier invoices" on public.supplier_invoices;
create policy "Purchasing staff create supplier invoices" on public.supplier_invoices for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view supplier invoice items" on public.supplier_invoice_items;
create policy "Approved purchasing staff view supplier invoice items" on public.supplier_invoice_items for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create supplier invoice items" on public.supplier_invoice_items;
create policy "Purchasing staff create supplier invoice items" on public.supplier_invoice_items for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view supplier payments" on public.supplier_payments;
create policy "Approved purchasing staff view supplier payments" on public.supplier_payments for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create supplier payments" on public.supplier_payments;
create policy "Purchasing staff create supplier payments" on public.supplier_payments for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

drop policy if exists "Approved purchasing staff view payment allocations" on public.supplier_payment_allocations;
create policy "Approved purchasing staff view payment allocations" on public.supplier_payment_allocations for select to authenticated using (public.current_user_role() in ('admin','director','operator'));
drop policy if exists "Purchasing staff create payment allocations" on public.supplier_payment_allocations;
create policy "Purchasing staff create payment allocations" on public.supplier_payment_allocations for insert to authenticated with check (public.current_user_role() in ('admin','director','operator'));

create or replace function public.post_supplier_invoice(p_invoice jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_supplier_id uuid := (p_invoice->>'supplier_id')::uuid;
  v_branch_id uuid := (p_invoice->>'branch_id')::uuid;
  v_invoice_number text := trim(coalesce(p_invoice->>'invoice_number',''));
  v_invoice_date date := coalesce((p_invoice->>'invoice_date')::date, current_date);
  v_due_date date := nullif(p_invoice->>'due_date','')::date;
  v_tax numeric(14,2) := greatest(coalesce((p_invoice->>'tax_kes')::numeric,0),0);
  v_subtotal numeric(14,2) := 0;
  v_item jsonb;
  v_product_id uuid;
  v_qty numeric(14,3);
  v_unit_cost numeric(14,2);
  v_track boolean;
  v_description text;
begin
  if public.current_user_role() not in ('admin','director','operator') then raise exception 'You are not authorised to post supplier invoices.'; end if;
  if v_supplier_id is null or v_branch_id is null or v_invoice_number = '' then raise exception 'Supplier, branch and supplier invoice number are required.'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'Add at least one invoice line.'; end if;
  if not exists(select 1 from public.suppliers where id=v_supplier_id and is_active) then raise exception 'Select an active supplier.'; end if;
  if not exists(select 1 from public.branches where id=v_branch_id and is_active) then raise exception 'Select an active branch.'; end if;
  insert into public.supplier_invoices(id,supplier_id,branch_id,invoice_number,invoice_date,due_date,tax_kes,notes,created_by,posted_by)
  values(v_id,v_supplier_id,v_branch_id,v_invoice_number,v_invoice_date,v_due_date,v_tax,nullif(p_invoice->>'notes',''),auth.uid(),auth.uid());
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_kes')::numeric;
    v_track := coalesce((v_item->>'track_stock')::boolean,false);
    v_description := trim(coalesce(v_item->>'description',''));
    if v_qty is null or v_qty <= 0 or v_unit_cost is null or v_unit_cost < 0 or v_description = '' then raise exception 'Each invoice line needs a description, positive quantity and non-negative unit cost.'; end if;
    if v_track and (v_product_id is null or v_qty <> trunc(v_qty)) then raise exception 'Stock-tracked lines require a product and whole-number quantity.'; end if;
    if v_product_id is not null and not exists(select 1 from public.products where id=v_product_id and is_active) then raise exception 'An invoice line references an inactive or missing product.'; end if;
    v_subtotal := v_subtotal + round(v_qty * v_unit_cost,2);
    insert into public.supplier_invoice_items(invoice_id,product_id,description,quantity,unit_cost_kes,line_total_kes,track_stock)
    values(v_id,v_product_id,v_description,v_qty,v_unit_cost,round(v_qty*v_unit_cost,2),v_track);
    if v_track then
      insert into public.branch_inventory(branch_id,product_id,full_units,empty_units,updated_at)
      values(v_branch_id,v_product_id,v_qty::integer,0,now())
      on conflict(branch_id,product_id) do update set full_units=public.branch_inventory.full_units+excluded.full_units,updated_at=now();
    end if;
  end loop;
  update public.supplier_invoices set subtotal_kes=v_subtotal,total_kes=v_subtotal+v_tax where id=v_id;
  return v_id;
end;
$$;

create or replace function public.record_supplier_payment(p_payment jsonb, p_allocations jsonb)
returns uuid language plpgsql security invoker set search_path = public
as $$
declare
  v_id uuid := gen_random_uuid();
  v_supplier_id uuid := (p_payment->>'supplier_id')::uuid;
  v_amount numeric(14,2) := (p_payment->>'amount_kes')::numeric;
  v_date date := coalesce((p_payment->>'payment_date')::date,current_date);
  v_method text := coalesce(p_payment->>'payment_method','');
  v_alloc jsonb;
  v_invoice_id uuid;
  v_alloc_amount numeric(14,2);
  v_sum numeric(14,2) := 0;
  v_outstanding numeric(14,2);
  v_opening_paid numeric(14,2);
  v_opening numeric(14,2);
begin
  if public.current_user_role() not in ('admin','director','operator') then raise exception 'You are not authorised to record supplier payments.'; end if;
  if v_supplier_id is null or v_amount is null or v_amount <= 0 then raise exception 'Select a supplier and enter a valid payment amount.'; end if;
  if v_method not in ('cash','mpesa','bank_transfer','cheque','pdq') then raise exception 'Select a valid payment method.'; end if;
  if jsonb_typeof(p_allocations) <> 'array' or jsonb_array_length(p_allocations)=0 then raise exception 'Allocate the payment to one or more outstanding balances.'; end if;
  perform 1 from public.suppliers where id=v_supplier_id and is_active for update;
  if not found then raise exception 'Supplier not found or inactive.'; end if;
  insert into public.supplier_payments(id,supplier_id,payment_date,amount_kes,payment_method,reference,notes,created_by)
  values(v_id,v_supplier_id,v_date,v_amount,v_method,nullif(p_payment->>'reference',''),nullif(p_payment->>'notes',''),auth.uid());
  for v_alloc in select value from jsonb_array_elements(p_allocations) loop
    v_invoice_id := nullif(v_alloc->>'invoice_id','')::uuid;
    v_alloc_amount := (v_alloc->>'amount_kes')::numeric;
    if v_alloc_amount is null or v_alloc_amount <= 0 then raise exception 'Payment allocations must be positive.'; end if;
    if v_invoice_id is null then
      select opening_balance_kes into v_opening from public.suppliers where id=v_supplier_id;
      select coalesce(sum(a.amount_kes),0) into v_opening_paid from public.supplier_payment_allocations a join public.supplier_payments p on p.id=a.payment_id where p.supplier_id=v_supplier_id and a.invoice_id is null;
      if v_alloc_amount > greatest(v_opening-v_opening_paid,0) then raise exception 'Payment exceeds the supplier opening balance remaining.'; end if;
    else
      perform 1 from public.supplier_invoices where id=v_invoice_id and supplier_id=v_supplier_id and status='posted' for update;
      if not found then raise exception 'Invoice does not belong to this supplier.'; end if;
      select i.total_kes-coalesce(sum(a.amount_kes),0) into v_outstanding from public.supplier_invoices i left join public.supplier_payment_allocations a on a.invoice_id=i.id where i.id=v_invoice_id group by i.id;
      if v_alloc_amount > greatest(v_outstanding,0) then raise exception 'Payment exceeds the invoice balance remaining.'; end if;
    end if;
    insert into public.supplier_payment_allocations(payment_id,invoice_id,amount_kes) values(v_id,v_invoice_id,v_alloc_amount);
    v_sum := v_sum+v_alloc_amount;
  end loop;
  if round(v_sum,2) <> round(v_amount,2) then raise exception 'The allocated amount must equal the payment amount.'; end if;
  return v_id;
end;
$$;

create or replace function public.guard_supplier_opening_balance()
returns trigger language plpgsql security invoker set search_path = public
as $$
begin
  if new.opening_balance_kes is distinct from old.opening_balance_kes or new.opening_balance_date is distinct from old.opening_balance_date then
    if exists(select 1 from public.supplier_invoices where supplier_id=old.id) or exists(select 1 from public.supplier_payments where supplier_id=old.id) then
      raise exception 'Opening balances cannot be changed after supplier transactions have been recorded. Use a separate adjustment workflow.';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists supplier_opening_balance_immutable on public.suppliers;
create trigger supplier_opening_balance_immutable before update on public.suppliers for each row execute function public.guard_supplier_opening_balance();

revoke all on function public.post_supplier_invoice(jsonb,jsonb) from public, anon;
revoke all on function public.record_supplier_payment(jsonb,jsonb) from public, anon;
grant execute on function public.post_supplier_invoice(jsonb,jsonb) to authenticated;
grant execute on function public.record_supplier_payment(jsonb,jsonb) to authenticated;
revoke all on function public.guard_supplier_opening_balance() from public, anon, authenticated;
