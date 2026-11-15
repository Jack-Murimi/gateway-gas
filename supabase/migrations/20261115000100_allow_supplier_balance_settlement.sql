-- Allow settling outstanding balances for inactive suppliers. Deactivation only blocks new invoices.
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
  -- Inactive suppliers may still receive settlement payments for existing balances.
  perform 1 from public.suppliers where id=v_supplier_id for update;
  if not found then raise exception 'Supplier not found.'; end if;
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
revoke all on function public.record_supplier_payment(jsonb,jsonb) from public, anon;
grant execute on function public.record_supplier_payment(jsonb,jsonb) to authenticated;
