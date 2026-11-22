-- Phase 4: M-Pesa C2B Till Transactions + atomic matching in POS sales/settlements + unit_cost_kes snapshot on create_pos_order.

-- 1. Optional non-unique M-Pesa till/shortcode column on branches (supports shared tills across branches, e.g. Kileleshwa & Jamhuri)
alter table public.branches
  add column if not exists mpesa_shortcode text;

create index if not exists branches_mpesa_shortcode_idx
  on public.branches(mpesa_shortcode)
  where mpesa_shortcode is not null;

-- 2. M-Pesa C2B Transactions table
create table if not exists public.mpesa_transactions (
  id uuid primary key default gen_random_uuid(),
  trans_id text not null unique check (length(trim(trans_id)) > 0),
  trans_time timestamptz not null default now(),
  trans_amount numeric(14,2) not null check (trans_amount > 0),
  business_short_code text not null,
  bill_ref_number text,
  msisdn text,
  payer_name text,
  branch_id uuid references public.branches(id) on delete set null,
  matched_order_id uuid references public.orders(id) on delete set null,
  matched_at timestamptz,
  matched_by uuid references public.profiles(id) on delete set null,
  status text not null default 'unmatched' check (status in ('unmatched', 'matched', 'ignored')),
  notes text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mpesa_transactions_status_time_idx
  on public.mpesa_transactions(status, trans_time desc);

create index if not exists mpesa_transactions_shortcode_idx
  on public.mpesa_transactions(business_short_code);

create index if not exists mpesa_transactions_branch_idx
  on public.mpesa_transactions(branch_id)
  where branch_id is not null;

create index if not exists mpesa_transactions_matched_order_idx
  on public.mpesa_transactions(matched_order_id)
  where matched_order_id is not null;

create index if not exists mpesa_transactions_matched_by_idx
  on public.mpesa_transactions(matched_by)
  where matched_by is not null;

alter table public.mpesa_transactions enable row level security;
revoke all on public.mpesa_transactions from anon, authenticated;
grant select on public.mpesa_transactions to authenticated;

drop policy if exists "Station staff view mpesa transactions" on public.mpesa_transactions;
create policy "Station staff view mpesa transactions"
  on public.mpesa_transactions for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'director', 'operator', 'sales_rep'));

-- 3. Update create_pos_order to snapshot unit_cost_kes AND atomically claim mpesa_transaction_id if provided
create or replace function public.create_pos_order(
  p_order jsonb,
  p_items jsonb
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role user_role := public.current_user_role();
  v_client_req_id uuid := nullif(p_order->>'client_request_id', '')::uuid;
  v_customer_id uuid := nullif(p_order->>'customer_id', '')::uuid;
  v_mpesa_tx_id uuid := nullif(p_order->>'mpesa_transaction_id', '')::uuid;
  v_mpesa_tx record;
  v_existing_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_branch_id uuid := nullif(p_order->>'branch_id', '')::uuid;
  v_is_walkin boolean := coalesce((p_order->>'is_pos_walkin')::boolean, true);
  v_rider_ids uuid[] := coalesce(
    (select array_agg(x::uuid) from jsonb_array_elements_text(coalesce(p_order->'rider_ids', '[]'::jsonb)) as x),
    '{}'::uuid[]
  );
  v_delivery_fee numeric := greatest(0, coalesce((p_order->>'delivery_fee_kes')::numeric, 0));
  v_created_at timestamptz := coalesce(nullif(p_order->>'created_at', '')::timestamptz, now());
  v_receipt_number text := nullif(trim(coalesce(p_order->>'receipt_number', '')), '');
  v_payment_ref text := nullif(trim(coalesce(p_order->>'payment_reference', '')), '');
  v_order_number text;
  v_delivery_status delivery_status;
  v_subtotal numeric := 0;
  v_item jsonb;
  v_product_id uuid;
  v_product record;
  v_qty integer;
  v_unit_price numeric;
  v_order_type order_type;
  v_delta record;
  v_inv record;
  v_branch_name text;
begin
  if v_role not in ('admin', 'director', 'operator', 'sales_rep') then
    raise exception 'Permission denied to record sales.';
  end if;

  if v_client_req_id is not null then
    select id into v_existing_id from public.orders where client_request_id = v_client_req_id;
    if v_existing_id is not null then
      return v_existing_id;
    end if;
  end if;

  if v_branch_id is null or not exists (select 1 from public.branches where id = v_branch_id and is_active) then
    raise exception 'Select an active branch.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one product to the sale.';
  end if;

  if v_mpesa_tx_id is not null then
    select * into v_mpesa_tx
    from public.mpesa_transactions
    where id = v_mpesa_tx_id
    for update;

    if not found then
      raise exception 'Selected M-Pesa transaction was not found.';
    end if;
    if v_mpesa_tx.status <> 'unmatched' then
      raise exception 'M-Pesa receipt % has already been claimed or ignored.', v_mpesa_tx.trans_id;
    end if;
    if v_payment_ref is null then
      v_payment_ref := v_mpesa_tx.trans_id;
    end if;
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id', '')::uuid;
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    v_unit_price := coalesce((v_item->>'unit_price_kes')::numeric, 0);
    v_order_type := (v_item->>'order_type')::order_type;

    if v_product_id is null or v_qty <= 0 or v_unit_price < 0 then
      raise exception 'Each sale line requires a product, positive quantity, and non-negative price.';
    end if;

    select id, is_active into v_product from public.products where id = v_product_id;
    if not found or not v_product.is_active then
      raise exception 'A product in this sale is missing or inactive.';
    end if;

    v_subtotal := v_subtotal + (v_qty * v_unit_price);
  end loop;

  v_order_number := 'GWG-' || lpad(nextval('public.order_number_seq')::text, 6, '0');
  v_delivery_status := case
    when v_is_walkin then 'delivered'::delivery_status
    when array_length(v_rider_ids, 1) > 0 then 'assigned'::delivery_status
    else 'pending'::delivery_status
  end;

  insert into public.orders (
    id, order_number, client_request_id, customer_id, branch_id, sales_rep_id,
    rider_id, rider_ids, vehicle_plate, receipt_number, lpo_number, sale_comment,
    is_pos_walkin, customer_name, customer_phone, delivery_estate, delivery_address,
    delivery_status, payment_method, payment_status, payment_reference,
    subtotal_kes, delivery_fee_kes, total_kes,
    assigned_at, delivered_at, created_at, updated_at
  ) values (
    v_order_id,
    v_order_number,
    v_client_req_id,
    v_customer_id,
    v_branch_id,
    auth.uid(),
    v_rider_ids[1],
    v_rider_ids,
    nullif(trim(coalesce(p_order->>'vehicle_plate', '')), ''),
    v_receipt_number,
    nullif(trim(coalesce(p_order->>'lpo_number', '')), ''),
    nullif(trim(coalesce(p_order->>'sale_comment', '')), ''),
    v_is_walkin,
    coalesce(nullif(trim(coalesce(p_order->>'customer_name', '')), ''), 'Walk-in Counter Customer'),
    coalesce(nullif(trim(coalesce(p_order->>'customer_phone', '')), ''), '+254700000000'),
    nullif(trim(coalesce(p_order->>'delivery_estate', '')), ''),
    nullif(trim(coalesce(p_order->>'delivery_address', '')), ''),
    v_delivery_status,
    coalesce(nullif(p_order->>'payment_method', '')::payment_method, 'cash'::payment_method),
    coalesce(nullif(p_order->>'payment_status', '')::payment_status, 'paid'::payment_status),
    v_payment_ref,
    v_subtotal,
    v_delivery_fee,
    v_subtotal + v_delivery_fee,
    case when not v_is_walkin and array_length(v_rider_ids, 1) > 0 then now() else null end,
    case when v_is_walkin then v_created_at else null end,
    v_created_at,
    now()
  );

  insert into public.order_items (
    order_id, branch_id, product_id, order_type,
    outgoing_brand, incoming_brand, cylinder_size_kg,
    quantity, unit_price_kes, unit_cost_kes, subtotal_kes
  )
  select
    v_order_id,
    coalesce(nullif(x->>'branch_id', '')::uuid, v_branch_id),
    (x->>'product_id')::uuid,
    (x->>'order_type')::order_type,
    coalesce(x->>'outgoing_brand', ''),
    nullif(trim(coalesce(x->>'incoming_brand', '')), ''),
    nullif(x->>'cylinder_size_kg', '')::numeric,
    (x->>'quantity')::integer,
    (x->>'unit_price_kes')::numeric,
    case
      when p.category = 'cylinder' and (x->>'order_type') = 'refill' then pc.refill_cost_kes
      when p.category = 'cylinder' then coalesce(pc.complete_cost_kes, pc.refill_cost_kes)
      else coalesce(pc.unit_cost_kes, pc.complete_cost_kes, pc.refill_cost_kes)
    end,
    (x->>'quantity')::integer * (x->>'unit_price_kes')::numeric
  from jsonb_array_elements(p_items) as x
  left join public.products p on p.id = (x->>'product_id')::uuid
  left join public.product_costs pc on pc.product_id = (x->>'product_id')::uuid;

  if v_mpesa_tx_id is not null then
    update public.mpesa_transactions
    set status = 'matched',
        matched_order_id = v_order_id,
        matched_at = now(),
        matched_by = auth.uid()
    where id = v_mpesa_tx_id;
  end if;

  perform set_config('app.stock_action', 'sale', true);
  perform set_config('app.stock_batch', v_order_id::text, true);
  perform set_config('app.stock_note', 'Sale ' || coalesce(v_receipt_number, v_order_number), true);
  perform set_config('app.stock_date', ((v_created_at at time zone 'Africa/Nairobi')::date)::text, true);

  for v_delta in
    with lines as (
      select
        coalesce(oi.branch_id, v_branch_id) as branch_id,
        oi.product_id,
        oi.order_type,
        oi.incoming_brand,
        oi.quantity,
        p.category,
        p.brand,
        p.size_kg,
        p.refill_price_kes
      from public.order_items oi
      join public.products p on p.id = oi.product_id
      where oi.order_id = v_order_id
    ),
    raw_deltas as (
      select branch_id, product_id, -quantity as full_delta, 0 as empty_delta
      from lines
      union all
      select
        l.branch_id,
        coalesce(
          (
            select rp.id
            from public.products rp
            where l.incoming_brand is not null
              and l.size_kg is not null
              and rp.category = l.category
              and lower(rp.brand) = lower(l.incoming_brand)
              and rp.size_kg = l.size_kg
            limit 1
          ),
          l.product_id
        ) as product_id,
        0 as full_delta,
        l.quantity as empty_delta
      from lines l
      where l.order_type = 'refill'
        and (
          l.category = 'cylinder'
          or (l.category = 'water' and coalesce(l.refill_price_kes, 0) > 0 and lower(coalesce(l.brand, '')) <> 'japeli')
        )
    )
    select branch_id, product_id, sum(full_delta)::integer as full_delta, sum(empty_delta)::integer as empty_delta
    from raw_deltas
    group by branch_id, product_id
    order by branch_id, product_id
  loop
    select full_units, empty_units
    into v_inv
    from public.branch_inventory
    where branch_id = v_delta.branch_id and product_id = v_delta.product_id
    for update;

    if not found then
      if v_delta.full_delta < 0 then
        select name into v_product from public.products where id = v_delta.product_id;
        select name into v_branch_name from public.branches where id = v_delta.branch_id;
        raise exception 'Insufficient stock: % has 0 available at %, but % requested.',
          coalesce(v_product.name, 'Product'), coalesce(v_branch_name, 'selected branch'), abs(v_delta.full_delta);
      end if;
      insert into public.branch_inventory(branch_id, product_id, full_units, empty_units, updated_at)
      values (v_delta.branch_id, v_delta.product_id, greatest(0, v_delta.full_delta), greatest(0, v_delta.empty_delta), now());
    else
      if v_inv.full_units + v_delta.full_delta < 0 then
        select name into v_product from public.products where id = v_delta.product_id;
        select name into v_branch_name from public.branches where id = v_delta.branch_id;
        raise exception 'Insufficient stock: % has % available at %, but % requested.',
          coalesce(v_product.name, 'Product'), v_inv.full_units, coalesce(v_branch_name, 'selected branch'), abs(v_delta.full_delta);
      end if;
      update public.branch_inventory
      set full_units = full_units + v_delta.full_delta,
          empty_units = empty_units + v_delta.empty_delta,
          updated_at = now()
      where branch_id = v_delta.branch_id and product_id = v_delta.product_id;
    end if;
  end loop;

  return v_order_id;
end;
$$;

revoke all on function public.create_pos_order(jsonb, jsonb) from public, anon;
grant execute on function public.create_pos_order(jsonb, jsonb) to authenticated;

-- 4. Update settle_customer_order (4-arg with default + 3-arg compatibility) to optionally claim an M-Pesa transaction
create or replace function public.settle_customer_order(
  p_order_id uuid,
  p_payment_method payment_method,
  p_payment_reference text,
  p_mpesa_transaction_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order record;
  v_mpesa_tx record;
  v_ref text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_label text;
begin
  if public.current_user_role() not in ('admin', 'director', 'operator', 'sales_rep') then
    raise exception 'Permission denied to record customer payments.';
  end if;

  select * into v_order from public.orders where id = p_order_id for update;
  if not found then
    raise exception 'Receipt not found.';
  end if;
  if v_order.delivery_status = 'cancelled' then
    raise exception 'Cannot mark a cancelled receipt as paid.';
  end if;
  if v_order.payment_status = 'paid' then
    raise exception 'This receipt is already paid.';
  end if;

  if p_mpesa_transaction_id is not null then
    select * into v_mpesa_tx
    from public.mpesa_transactions
    where id = p_mpesa_transaction_id
    for update;

    if not found then
      raise exception 'Selected M-Pesa transaction was not found.';
    end if;
    if v_mpesa_tx.status <> 'unmatched' then
      raise exception 'M-Pesa receipt % has already been claimed or ignored.', v_mpesa_tx.trans_id;
    end if;
    if v_ref is null then
      v_ref := v_mpesa_tx.trans_id;
    end if;

    update public.mpesa_transactions
    set status = 'matched',
        matched_order_id = p_order_id,
        matched_at = now(),
        matched_by = auth.uid()
    where id = p_mpesa_transaction_id;
  end if;

  update public.orders
  set payment_status = 'paid',
      payment_method = p_payment_method,
      payment_reference = coalesce(v_ref, payment_reference),
      updated_at = now()
  where id = p_order_id;

  if v_order.customer_id is not null then
    v_label := coalesce(nullif(trim(v_order.receipt_number), ''), v_order.order_number);
    insert into public.customer_audit_log(customer_id, entity_type, action, summary, old_data, new_data, actor_id)
    values (
      v_order.customer_id,
      'payment',
      'payment_recorded',
      'Settled receipt ' || v_label || ' (KES ' || round(v_order.total_kes)::text || ' via ' || upper(p_payment_method::text) || ')'
        || case when v_ref is not null then ' · Ref ' || v_ref else '' end,
      jsonb_build_object('order_id', v_order.id, 'payment_status', v_order.payment_status),
      jsonb_build_object('order_id', v_order.id, 'payment_status', 'paid', 'payment_method', p_payment_method, 'payment_reference', v_ref, 'total_kes', v_order.total_kes),
      auth.uid()
    );
  end if;

  return jsonb_build_object('order_id', p_order_id, 'payment_status', 'paid', 'payment_reference', v_ref);
end;
$$;

revoke all on function public.settle_customer_order(uuid, payment_method, text, uuid) from public, anon;
grant execute on function public.settle_customer_order(uuid, payment_method, text, uuid) to authenticated;

-- Keep 3-arg signature delegating cleanly so existing callers never fail PostgREST overload lookup
create or replace function public.settle_customer_order(
  p_order_id uuid,
  p_payment_method payment_method,
  p_payment_reference text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  return public.settle_customer_order(p_order_id, p_payment_method, p_payment_reference, null::uuid);
end;
$$;

revoke all on function public.settle_customer_order(uuid, payment_method, text) from public, anon;
grant execute on function public.settle_customer_order(uuid, payment_method, text) to authenticated;

-- 5. Update cancel_order so any matched M-Pesa transaction is automatically released back to unmatched
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_order record;
  v_delta record;
  v_note text;
begin
  if public.current_user_role() not in ('admin', 'director', 'operator') then
    raise exception 'Permission denied to cancel orders.';
  end if;

  select * into v_order
  from public.orders
  where id = p_order_id
  for update;

  if not found then
    raise exception 'Order not found.';
  end if;
  if v_order.delivery_status = 'cancelled' then
    raise exception 'Order is already cancelled.';
  end if;

  v_note := 'Cancelled ' || coalesce(nullif(trim(v_order.receipt_number), ''), v_order.order_number)
    || case when nullif(trim(coalesce(p_reason, '')), '') is not null then ' · ' || trim(p_reason) else '' end;

  update public.orders
  set delivery_status = 'cancelled',
      sale_comment = case
        when nullif(trim(coalesce(p_reason, '')), '') is null then sale_comment
        when nullif(trim(coalesce(sale_comment, '')), '') is null then 'Cancelled: ' || trim(p_reason)
        else sale_comment || ' | Cancelled: ' || trim(p_reason)
      end,
      updated_at = now()
  where id = p_order_id;

  -- Release any matched M-Pesa till payment linked to this voided order
  update public.mpesa_transactions
  set status = 'unmatched',
      matched_order_id = null,
      matched_at = null,
      matched_by = null
  where matched_order_id = p_order_id;

  perform set_config('app.stock_action', 'adjustment', true);
  perform set_config('app.stock_batch', p_order_id::text, true);
  perform set_config('app.stock_note', v_note, true);
  perform set_config('app.stock_date', ((now() at time zone 'Africa/Nairobi')::date)::text, true);

  for v_delta in
    with lines as (
      select
        coalesce(oi.branch_id, v_order.branch_id) as branch_id,
        oi.product_id,
        oi.order_type,
        oi.incoming_brand,
        oi.quantity,
        p.category,
        p.brand,
        p.size_kg,
        p.refill_price_kes
      from public.order_items oi
      left join public.products p on p.id = oi.product_id
      where oi.order_id = p_order_id
        and oi.product_id is not null
    ),
    raw_deltas as (
      select branch_id, product_id, quantity as full_delta, 0 as empty_delta
      from lines
      union all
      select
        l.branch_id,
        coalesce(
          (
            select rp.id
            from public.products rp
            where l.incoming_brand is not null
              and l.size_kg is not null
              and rp.category = l.category
              and lower(rp.brand) = lower(trim(l.incoming_brand))
              and rp.size_kg = l.size_kg
            limit 1
          ),
          l.product_id
        ) as product_id,
        0 as full_delta,
        -l.quantity as empty_delta
      from lines l
      where l.order_type = 'refill'
        and (
          l.category = 'cylinder'
          or (l.category = 'water' and coalesce(l.refill_price_kes, 0) > 0 and lower(coalesce(l.brand, '')) <> 'japeli')
        )
    )
    select branch_id, product_id, sum(full_delta)::integer as full_delta, sum(empty_delta)::integer as empty_delta
    from raw_deltas
    group by branch_id, product_id
    order by branch_id, product_id
  loop
    insert into public.branch_inventory(branch_id, product_id, full_units, empty_units, updated_at)
    values (v_delta.branch_id, v_delta.product_id, greatest(0, v_delta.full_delta), greatest(0, v_delta.empty_delta), now())
    on conflict (branch_id, product_id) do update
    set full_units = greatest(0, public.branch_inventory.full_units + v_delta.full_delta),
        empty_units = greatest(0, public.branch_inventory.empty_units + v_delta.empty_delta),
        updated_at = now();
  end loop;

  return jsonb_build_object('order_id', p_order_id, 'status', 'cancelled');
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;

-- 6. Director/Admin reconciliation RPC to ignore/restore unmatched till deposits
create or replace function public.update_mpesa_transaction_status(
  p_transaction_id uuid,
  p_status text,
  p_notes text default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_tx record;
begin
  if public.current_user_role() not in ('admin', 'director') then
    raise exception 'Permission denied to reconcile M-Pesa transactions.';
  end if;
  if p_status not in ('unmatched', 'ignored') then
    raise exception 'Status can only be toggled between unmatched and ignored.';
  end if;

  select * into v_tx from public.mpesa_transactions where id = p_transaction_id for update;
  if not found then
    raise exception 'M-Pesa transaction not found.';
  end if;
  if v_tx.status = 'matched' then
    raise exception 'Cannot change status of a transaction already matched to an order.';
  end if;

  update public.mpesa_transactions
  set status = p_status,
      notes = coalesce(nullif(trim(coalesce(p_notes, '')), ''), notes)
  where id = p_transaction_id;

  return jsonb_build_object('id', p_transaction_id, 'status', p_status);
end;
$$;

revoke all on function public.update_mpesa_transaction_status(uuid, text, text) from public, anon;
grant execute on function public.update_mpesa_transaction_status(uuid, text, text) to authenticated;
