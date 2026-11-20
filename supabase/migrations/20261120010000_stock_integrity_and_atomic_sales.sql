-- Stock date, atomic POS sales & cancellations, strict supplier refills, transfer locking, and optimistic daily-count checks.

-- 1. Add stock_date to stock_audit_log
alter table public.stock_audit_log
  add column if not exists stock_date date;

update public.stock_audit_log
set stock_date = (created_at at time zone 'Africa/Nairobi')::date
where stock_date is null;

create index if not exists stock_audit_log_branch_stock_date_idx
  on public.stock_audit_log(branch_id, stock_date desc);

-- 2. Ensure non-negative stock constraint on branch_inventory
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.branch_inventory'::regclass
      and conname = 'branch_inventory_non_negative_chk'
  ) then
    alter table public.branch_inventory
      add constraint branch_inventory_non_negative_chk
      check (full_units >= 0 and empty_units >= 0);
  end if;
end $$;

-- 3. Idempotency key & collision-free sequence for orders
alter table public.orders
  add column if not exists client_request_id uuid;

create unique index if not exists orders_client_request_id_uidx
  on public.orders(client_request_id)
  where client_request_id is not null;

create sequence if not exists public.order_number_seq start with 100001;

-- 4. Track refill vs complete stock mode on supplier invoice items
alter table public.supplier_invoice_items
  add column if not exists stock_mode text not null default 'complete';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.supplier_invoice_items'::regclass
      and conname = 'supplier_invoice_items_stock_mode_chk'
  ) then
    alter table public.supplier_invoice_items
      add constraint supplier_invoice_items_stock_mode_chk
      check (stock_mode in ('refill', 'complete', 'none'));
  end if;
end $$;

-- 5. Clean audit trigger: rely on explicit app.stock_action set by RPCs + stock_date
create or replace function public.log_branch_inventory_change() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_prev_full integer := case when tg_op = 'INSERT' then 0 else coalesce(old.full_units, 0) end;
  v_prev_empty integer := case when tg_op = 'INSERT' then 0 else coalesce(old.empty_units, 0) end;
  v_action text := coalesce(nullif(current_setting('app.stock_action', true), ''), 'edit');
  v_note text := nullif(current_setting('app.stock_note', true), '');
  v_batch text := nullif(current_setting('app.stock_batch', true), '');
  v_stock_date text := nullif(current_setting('app.stock_date', true), '');
begin
  if tg_op = 'UPDATE' and v_prev_full = new.full_units and v_prev_empty = new.empty_units then
    return new;
  end if;
  if tg_op = 'INSERT' and new.full_units = 0 and new.empty_units = 0 and v_action <> 'initial' then
    return new;
  end if;

  insert into public.stock_audit_log(
    batch_id, action, branch_id, product_id,
    prev_full, prev_empty, new_full, new_empty,
    note, actor_id, stock_date
  )
  values (
    coalesce(v_batch::uuid, gen_random_uuid()),
    v_action,
    new.branch_id,
    new.product_id,
    v_prev_full,
    v_prev_empty,
    new.full_units,
    new.empty_units,
    v_note,
    auth.uid(),
    coalesce(v_stock_date::date, (now() at time zone 'Africa/Nairobi')::date)
  );
  return new;
end;
$$;

-- 6. Atomic POS order creation with FOR UPDATE locking, idempotency & brand-swap empty crediting
create or replace function public.create_pos_order(
  p_order jsonb,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_role user_role := public.current_user_role();
  v_client_req_id uuid := nullif(p_order->>'client_request_id', '')::uuid;
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
    id, order_number, client_request_id, branch_id, sales_rep_id,
    rider_id, rider_ids, vehicle_plate, receipt_number, lpo_number, sale_comment,
    is_pos_walkin, customer_name, customer_phone, delivery_estate, delivery_address,
    delivery_status, payment_method, payment_status, payment_reference,
    subtotal_kes, delivery_fee_kes, total_kes,
    assigned_at, delivered_at, created_at, updated_at
  ) values (
    v_order_id,
    v_order_number,
    v_client_req_id,
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
    nullif(trim(coalesce(p_order->>'payment_reference', '')), ''),
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
    quantity, unit_price_kes, subtotal_kes
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
    (x->>'quantity')::integer * (x->>'unit_price_kes')::numeric
  from jsonb_array_elements(p_items) as x;

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

-- 7. Atomic order cancellation: restores full units and reverses refill empties
create or replace function public.cancel_order(
  p_order_id uuid,
  p_reason text default null
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
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

-- 8. Supplier invoice posting: strict empty check on refills + explicit 'purchase' audit tag
create or replace function public.post_supplier_invoice(p_invoice jsonb, p_items jsonb)
returns uuid language plpgsql security invoker set search_path = public, auth
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
  v_product record;
  v_qty numeric(14,3);
  v_unit_cost numeric(14,2);
  v_track boolean;
  v_stock_mode text;
  v_description text;
  v_inv record;
begin
  if public.current_user_role() not in ('admin','director','operator') then
    raise exception 'You are not authorised to post supplier invoices.';
  end if;
  if v_supplier_id is null or v_branch_id is null or v_invoice_number = '' then
    raise exception 'Supplier, branch and supplier invoice number are required.';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'Add at least one invoice line.';
  end if;
  if not exists(select 1 from public.suppliers where id=v_supplier_id and is_active) then
    raise exception 'Select an active supplier.';
  end if;
  if not exists(select 1 from public.branches where id=v_branch_id and is_active) then
    raise exception 'Select an active branch.';
  end if;

  insert into public.supplier_invoices(id,supplier_id,branch_id,invoice_number,invoice_date,due_date,tax_kes,notes,created_by,posted_by)
  values(v_id,v_supplier_id,v_branch_id,v_invoice_number,v_invoice_date,v_due_date,v_tax,nullif(p_invoice->>'notes',''),auth.uid(),auth.uid());

  perform set_config('app.stock_action', 'purchase', true);
  perform set_config('app.stock_batch', v_id::text, true);
  perform set_config('app.stock_note', 'Invoice ' || v_invoice_number, true);
  perform set_config('app.stock_date', v_invoice_date::text, true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_kes')::numeric;
    v_track := coalesce((v_item->>'track_stock')::boolean,false);
    v_description := trim(coalesce(v_item->>'description',''));
    v_stock_mode := coalesce(nullif(v_item->>'stock_mode', ''), case when v_track then 'complete' else 'none' end);

    if v_qty is null or v_qty <= 0 or v_unit_cost is null or v_unit_cost < 0 or v_description = '' then
      raise exception 'Each invoice line needs a description, positive quantity and non-negative unit cost.';
    end if;
    if v_track and (v_product_id is null or v_qty <> trunc(v_qty)) then
      raise exception 'Stock-tracked lines require a product and whole-number quantity.';
    end if;
    if v_stock_mode not in ('refill', 'complete', 'none') then
      raise exception 'Invalid stock mode on invoice line.';
    end if;

    v_product := null;
    if v_product_id is not null then
      select id, name, category, brand, refill_price_kes, is_active
      into v_product
      from public.products
      where id = v_product_id;
      if not found or not v_product.is_active then
        raise exception 'An invoice line references an inactive or missing product.';
      end if;
    end if;

    v_subtotal := v_subtotal + round(v_qty * v_unit_cost,2);
    insert into public.supplier_invoice_items(invoice_id,product_id,description,quantity,unit_cost_kes,line_total_kes,track_stock,stock_mode)
    values(v_id,v_product_id,v_description,v_qty,v_unit_cost,round(v_qty*v_unit_cost,2),v_track,case when v_track then v_stock_mode else 'none' end);

    if v_track then
      if v_stock_mode = 'refill' then
        select full_units, empty_units
        into v_inv
        from public.branch_inventory
        where branch_id = v_branch_id and product_id = v_product_id
        for update;

        if not found or coalesce(v_inv.empty_units, 0) < v_qty::integer then
          raise exception 'Cannot refill % x %: branch only has % empty containers available.',
            v_qty::integer, coalesce(v_product.name, v_description), coalesce(v_inv.empty_units, 0);
        end if;

        update public.branch_inventory
        set full_units = full_units + v_qty::integer,
            empty_units = empty_units - v_qty::integer,
            updated_at = now()
        where branch_id = v_branch_id and product_id = v_product_id;
      else
        insert into public.branch_inventory(branch_id,product_id,full_units,empty_units,updated_at)
        values(v_branch_id,v_product_id,v_qty::integer,0,now())
        on conflict(branch_id,product_id) do update
        set full_units = public.branch_inventory.full_units + excluded.full_units,
            updated_at = now();
      end if;
    end if;
  end loop;

  update public.supplier_invoices set subtotal_kes=v_subtotal,total_kes=v_subtotal+v_tax where id=v_id;
  return v_id;
end;
$$;

-- 9. Lock source rows in transfer_branch_stock to prevent concurrent negative transfers
create or replace function public.transfer_branch_stock(
  p_from_branch_id uuid, p_to_branch_id uuid, p_note text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_batch uuid := gen_random_uuid();
  v_line jsonb;
  v_product_id uuid;
  v_full integer;
  v_empty integer;
  v_from record;
  v_from_name text;
  v_to_name text;
  v_count integer := 0;
begin
  if public.current_user_role() not in ('admin', 'director', 'operator') then
    raise exception 'Permission denied to transfer stock';
  end if;
  if p_from_branch_id is null or p_to_branch_id is null or p_from_branch_id = p_to_branch_id then
    raise exception 'Select two different branches';
  end if;
  select name into v_from_name from public.branches where id = p_from_branch_id;
  select name into v_to_name from public.branches where id = p_to_branch_id;
  perform set_config('app.stock_action', 'transfer', true);
  perform set_config('app.stock_note', coalesce(nullif(trim(p_note), ''), v_from_name || ' → ' || v_to_name), true);
  perform set_config('app.stock_batch', v_batch::text, true);
  perform set_config('app.stock_date', ((now() at time zone 'Africa/Nairobi')::date)::text, true);

  for v_line in
    select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
    order by (value->>'product_id')
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_full := greatest(0, coalesce((v_line->>'full_units')::integer, 0));
    v_empty := greatest(0, coalesce((v_line->>'empty_units')::integer, 0));
    if v_full = 0 and v_empty = 0 then continue; end if;

    select coalesce(full_units, 0) as full_units, coalesce(empty_units, 0) as empty_units
    into v_from
    from public.branch_inventory
    where branch_id = p_from_branch_id and product_id = v_product_id
    for update;

    if not found or coalesce(v_from.full_units, 0) < v_full or coalesce(v_from.empty_units, 0) < v_empty then
      raise exception 'Requested transfer exceeds source branch stock';
    end if;

    update public.branch_inventory
    set full_units = full_units - v_full, empty_units = empty_units - v_empty, updated_at = now()
    where branch_id = p_from_branch_id and product_id = v_product_id;

    insert into public.branch_inventory(branch_id, product_id, full_units, empty_units, updated_at)
    values (p_to_branch_id, v_product_id, v_full, v_empty, now())
    on conflict (branch_id, product_id) do update
    set full_units = public.branch_inventory.full_units + excluded.full_units,
        empty_units = public.branch_inventory.empty_units + excluded.empty_units,
        updated_at = now();
  end loop;

  select count(*) into v_count from public.stock_audit_log where batch_id = v_batch;
  return jsonb_build_object('batch_id', v_batch, 'changed', v_count);
end;
$$;
revoke all on function public.transfer_branch_stock(uuid, uuid, text, jsonb) from public, anon;
grant execute on function public.transfer_branch_stock(uuid, uuid, text, jsonb) to authenticated;

-- 10. Optimistic concurrency check + stock_date support on apply_branch_stock (5-arg + 4-arg delegate)
create or replace function public.apply_branch_stock(
  p_branch_id uuid,
  p_action text,
  p_note text,
  p_lines jsonb,
  p_stock_date date
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_batch uuid := gen_random_uuid();
  v_line jsonb;
  v_product_id uuid;
  v_full integer;
  v_empty integer;
  v_exp_full integer;
  v_exp_empty integer;
  v_inv record;
  v_product_name text;
  v_count integer := 0;
begin
  if public.current_user_role() not in ('admin', 'director', 'operator') then
    raise exception 'Permission denied to modify branch stock';
  end if;
  if p_action not in ('initial', 'daily', 'adjustment') then
    raise exception 'Invalid stock action';
  end if;
  if p_action = 'initial' and exists (select 1 from public.stock_audit_log where branch_id = p_branch_id and action = 'initial') then
    raise exception 'Initial stock has already been recorded for this branch. Use Stock adjustment or Daily count instead.';
  end if;

  perform set_config('app.stock_action', p_action, true);
  perform set_config('app.stock_note', coalesce(p_note, ''), true);
  perform set_config('app.stock_batch', v_batch::text, true);
  perform set_config('app.stock_date', coalesce(p_stock_date::text, ''), true);

  for v_line in
    select value from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb))
    order by (value->>'product_id')
  loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_full := greatest(0, coalesce((v_line->>'full_units')::integer, 0));
    v_empty := greatest(0, coalesce((v_line->>'empty_units')::integer, 0));
    v_exp_full := nullif(v_line->>'expected_full', '')::integer;
    v_exp_empty := nullif(v_line->>'expected_empty', '')::integer;

    if p_action in ('daily', 'adjustment') and (v_exp_full is not null or v_exp_empty is not null) then
      select full_units, empty_units
      into v_inv
      from public.branch_inventory
      where branch_id = p_branch_id and product_id = v_product_id
      for update;

      if coalesce(v_inv.full_units, 0) <> coalesce(v_exp_full, coalesce(v_inv.full_units, 0))
         or coalesce(v_inv.empty_units, 0) <> coalesce(v_exp_empty, coalesce(v_inv.empty_units, 0)) then
        select name into v_product_name from public.products where id = v_product_id;
        raise exception 'Stock for % changed while this sheet was open (expected % / %, now % / %). Refresh and re-check before saving.',
          coalesce(v_product_name, 'product'),
          coalesce(v_exp_full, 0), coalesce(v_exp_empty, 0),
          coalesce(v_inv.full_units, 0), coalesce(v_inv.empty_units, 0);
      end if;
    end if;

    insert into public.branch_inventory(branch_id, product_id, full_units, empty_units, updated_at)
    values (p_branch_id, v_product_id, v_full, v_empty, now())
    on conflict (branch_id, product_id) do update
    set full_units = excluded.full_units, empty_units = excluded.empty_units, updated_at = now()
    where public.branch_inventory.full_units is distinct from excluded.full_units
       or public.branch_inventory.empty_units is distinct from excluded.empty_units
       or p_action = 'initial';
  end loop;

  select count(*) into v_count from public.stock_audit_log where batch_id = v_batch;
  return jsonb_build_object('batch_id', v_batch, 'changed', v_count);
end;
$$;
revoke all on function public.apply_branch_stock(uuid, text, text, jsonb, date) from public, anon;
grant execute on function public.apply_branch_stock(uuid, text, text, jsonb, date) to authenticated;

create or replace function public.apply_branch_stock(
  p_branch_id uuid,
  p_action text,
  p_note text,
  p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
begin
  return public.apply_branch_stock(p_branch_id, p_action, p_note, p_lines, null::date);
end;
$$;
revoke all on function public.apply_branch_stock(uuid, text, text, jsonb) from public, anon;
grant execute on function public.apply_branch_stock(uuid, text, text, jsonb) to authenticated;
