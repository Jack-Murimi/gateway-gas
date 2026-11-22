-- Stock cutover timestamp per branch so historical pre-cutover sales and purchases
-- can be recorded for accounting/P&L/customer/supplier history without mutating live stock.

-- 1. Branch stock_cutoff_at (default initialized to 2026-11-19 00:01:00 EAT for existing branches)
alter table public.branches
  add column if not exists stock_cutoff_at timestamptz;

update public.branches
set stock_cutoff_at = '2026-11-19 00:01:00+03:00'::timestamptz
where stock_cutoff_at is null;

-- 2. Track whether an order or supplier invoice affected live stock
alter table public.orders
  add column if not exists affects_stock boolean not null default true;

alter table public.supplier_invoices
  add column if not exists affects_stock boolean not null default true;

-- 3. Admin/Director helper to adjust a branch's stock cutover timestamp if ever needed
create or replace function public.set_branch_stock_cutoff(
  p_branch_id uuid,
  p_cutoff_at timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  if public.current_user_role() not in ('admin', 'director') then
    raise exception 'Only admins or directors can update a branch stock cutover date.';
  end if;
  if p_branch_id is null or not exists (select 1 from public.branches where id = p_branch_id) then
    raise exception 'Branch not found.';
  end if;

  update public.branches
  set stock_cutoff_at = p_cutoff_at
  where id = p_branch_id;

  return jsonb_build_object('branch_id', p_branch_id, 'stock_cutoff_at', p_cutoff_at);
end;
$$;

revoke all on function public.set_branch_stock_cutoff(uuid, timestamptz) from public, anon;
grant execute on function public.set_branch_stock_cutoff(uuid, timestamptz) to authenticated;

-- 4. Update apply_branch_stock: add 6-arg overload with p_cutoff_at (and keep 5-arg & 4-arg delegates)
create or replace function public.apply_branch_stock(
  p_branch_id uuid,
  p_action text,
  p_note text,
  p_lines jsonb,
  p_stock_date date,
  p_cutoff_at timestamptz
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
  v_effective_cutoff timestamptz;
  v_effective_date date;
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

  v_effective_cutoff := coalesce(
    p_cutoff_at,
    case when p_stock_date is not null then (p_stock_date::text || ' 00:01:00+03:00')::timestamptz else null end
  );
  v_effective_date := coalesce(
    p_stock_date,
    case when v_effective_cutoff is not null then (v_effective_cutoff at time zone 'Africa/Nairobi')::date else null end
  );

  if p_action = 'initial' and v_effective_cutoff is not null then
    update public.branches
    set stock_cutoff_at = v_effective_cutoff
    where id = p_branch_id;
  end if;

  perform set_config('app.stock_action', p_action, true);
  perform set_config('app.stock_note', coalesce(p_note, ''), true);
  perform set_config('app.stock_batch', v_batch::text, true);
  perform set_config('app.stock_date', coalesce(v_effective_date::text, ''), true);

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
  return jsonb_build_object(
    'batch_id', v_batch,
    'changed', v_count,
    'stock_cutoff_at', v_effective_cutoff
  );
end;
$$;
revoke all on function public.apply_branch_stock(uuid, text, text, jsonb, date, timestamptz) from public, anon;
grant execute on function public.apply_branch_stock(uuid, text, text, jsonb, date, timestamptz) to authenticated;

create or replace function public.apply_branch_stock(
  p_branch_id uuid,
  p_action text,
  p_note text,
  p_lines jsonb,
  p_stock_date date
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
begin
  return public.apply_branch_stock(p_branch_id, p_action, p_note, p_lines, p_stock_date, null::timestamptz);
end;
$$;
revoke all on function public.apply_branch_stock(uuid, text, text, jsonb, date) from public, anon;
grant execute on function public.apply_branch_stock(uuid, text, text, jsonb, date) to authenticated;

-- 5. Update sync_product_cost_from_invoice: optional p_only_if_missing so historical pre-cutoff invoices
-- never overwrite newer product costs, while still backfilling blank costs.
create or replace function public.sync_product_cost_from_invoice(
  p_product_id uuid,
  p_category text,
  p_stock_mode text,
  p_unit_cost numeric,
  p_only_if_missing boolean
) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  if p_product_id is null or p_unit_cost is null or p_unit_cost <= 0 then
    return;
  end if;
  if public.current_user_role() not in ('admin', 'director', 'operator') then
    return;
  end if;

  if p_category = 'cylinder' then
    if p_stock_mode = 'refill' then
      insert into public.product_costs(product_id, refill_cost_kes, updated_by, updated_at)
      values (p_product_id, p_unit_cost, auth.uid(), now())
      on conflict (product_id) do update
      set refill_cost_kes = case
            when p_only_if_missing and public.product_costs.refill_cost_kes is not null
              then public.product_costs.refill_cost_kes
            else excluded.refill_cost_kes
          end,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
    elsif p_stock_mode = 'complete' then
      insert into public.product_costs(product_id, complete_cost_kes, updated_by, updated_at)
      values (p_product_id, p_unit_cost, auth.uid(), now())
      on conflict (product_id) do update
      set complete_cost_kes = case
            when p_only_if_missing and public.product_costs.complete_cost_kes is not null
              then public.product_costs.complete_cost_kes
            else excluded.complete_cost_kes
          end,
          updated_by = excluded.updated_by,
          updated_at = excluded.updated_at;
    end if;
  else
    insert into public.product_costs(product_id, unit_cost_kes, updated_by, updated_at)
    values (p_product_id, p_unit_cost, auth.uid(), now())
    on conflict (product_id) do update
    set unit_cost_kes = case
          when p_only_if_missing and public.product_costs.unit_cost_kes is not null
            then public.product_costs.unit_cost_kes
          else excluded.unit_cost_kes
        end,
        updated_by = excluded.updated_by,
        updated_at = excluded.updated_at;
  end if;
end;
$$;
revoke all on function public.sync_product_cost_from_invoice(uuid, text, text, numeric, boolean) from public, anon;
grant execute on function public.sync_product_cost_from_invoice(uuid, text, text, numeric, boolean) to authenticated;

create or replace function public.sync_product_cost_from_invoice(
  p_product_id uuid,
  p_category text,
  p_stock_mode text,
  p_unit_cost numeric
) returns void
language plpgsql security definer set search_path = public, auth as $$
begin
  perform public.sync_product_cost_from_invoice(p_product_id, p_category, p_stock_mode, p_unit_cost, false);
end;
$$;
revoke all on function public.sync_product_cost_from_invoice(uuid, text, text, numeric) from public, anon;
grant execute on function public.sync_product_cost_from_invoice(uuid, text, text, numeric) to authenticated;

-- 6. Update post_supplier_invoice to automatically skip stock mutations for invoices dated before branch stock_cutoff_at
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
  v_branch record;
  v_cutoff_date date;
  v_is_pre_cutoff boolean := false;
  v_item jsonb;
  v_product_id uuid;
  v_product record;
  v_qty numeric(14,3);
  v_unit_cost numeric(14,2);
  v_requested_track boolean;
  v_requested_mode text;
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

  select id, is_active, stock_cutoff_at
  into v_branch
  from public.branches
  where id = v_branch_id;

  if not found or not v_branch.is_active then
    raise exception 'Select an active branch.';
  end if;

  v_cutoff_date := case
    when v_branch.stock_cutoff_at is not null
      then (v_branch.stock_cutoff_at at time zone 'Africa/Nairobi')::date
    else null
  end;
  v_is_pre_cutoff := (v_cutoff_date is not null and v_invoice_date < v_cutoff_date);

  insert into public.supplier_invoices(
    id, supplier_id, branch_id, invoice_number, invoice_date, due_date,
    tax_kes, notes, affects_stock, created_by, posted_by
  )
  values(
    v_id, v_supplier_id, v_branch_id, v_invoice_number, v_invoice_date, v_due_date,
    v_tax, nullif(p_invoice->>'notes',''), not v_is_pre_cutoff, auth.uid(), auth.uid()
  );

  perform set_config('app.stock_action', 'purchase', true);
  perform set_config('app.stock_batch', v_id::text, true);
  perform set_config('app.stock_note', 'Invoice ' || v_invoice_number, true);
  perform set_config('app.stock_date', v_invoice_date::text, true);

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_product_id := nullif(v_item->>'product_id','')::uuid;
    v_qty := (v_item->>'quantity')::numeric;
    v_unit_cost := (v_item->>'unit_cost_kes')::numeric;
    v_requested_track := coalesce((v_item->>'track_stock')::boolean, false);
    v_description := trim(coalesce(v_item->>'description',''));
    v_requested_mode := coalesce(nullif(v_item->>'stock_mode', ''), case when v_requested_track then 'complete' else 'none' end);

    if v_qty is null or v_qty <= 0 or v_unit_cost is null or v_unit_cost < 0 or v_description = '' then
      raise exception 'Each invoice line needs a description, positive quantity and non-negative unit cost.';
    end if;
    if v_requested_mode not in ('refill', 'complete', 'none') then
      raise exception 'Invalid stock mode on invoice line.';
    end if;

    if v_is_pre_cutoff then
      v_track := false;
      v_stock_mode := 'none';
    else
      v_track := v_requested_track;
      v_stock_mode := case when v_track then v_requested_mode else 'none' end;
    end if;

    if v_track and (v_product_id is null or v_qty <> trunc(v_qty)) then
      raise exception 'Stock-tracked lines require a product and whole-number quantity.';
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
    values(v_id,v_product_id,v_description,v_qty,v_unit_cost,round(v_qty*v_unit_cost,2),v_track,v_stock_mode);

    if v_product_id is not null and v_unit_cost > 0 then
      -- Pre-cutoff historical invoices only fill missing product_costs and never overwrite newer costs
      perform public.sync_product_cost_from_invoice(
        v_product_id,
        v_product.category::text,
        case when v_requested_mode = 'none' then 'complete' else v_requested_mode end,
        v_unit_cost,
        v_is_pre_cutoff
      );
    end if;

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

-- 7. Update create_pos_order to skip stock checks & inventory deductions for sales before branch stock_cutoff_at
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
  v_existing_id uuid;
  v_order_id uuid := gen_random_uuid();
  v_branch_id uuid := nullif(p_order->>'branch_id', '')::uuid;
  v_customer_id uuid := nullif(p_order->>'customer_id', '')::uuid;
  v_mpesa_tx_id uuid := nullif(p_order->>'mpesa_transaction_id', '')::uuid;
  v_mpesa_tx record;
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
  v_order_affects_stock boolean := false;
  v_line_branch_id uuid;
  v_line_cutoff timestamptz;
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
    v_line_branch_id := coalesce(nullif(v_item->>'branch_id', '')::uuid, v_branch_id);

    if v_product_id is null or v_qty <= 0 or v_unit_price < 0 then
      raise exception 'Each sale line requires a product, positive quantity, and non-negative price.';
    end if;

    select id, is_active into v_product from public.products where id = v_product_id;
    if not found or not v_product.is_active then
      raise exception 'A product in this sale is missing or inactive.';
    end if;

    select stock_cutoff_at into v_line_cutoff from public.branches where id = v_line_branch_id;
    if v_line_cutoff is null or v_created_at >= v_line_cutoff then
      v_order_affects_stock := true;
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
    subtotal_kes, delivery_fee_kes, total_kes, affects_stock,
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
    v_order_affects_stock,
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

  if v_order_affects_stock then
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
        join public.branches b on b.id = coalesce(oi.branch_id, v_branch_id)
        where oi.order_id = v_order_id
          and (b.stock_cutoff_at is null or v_created_at >= b.stock_cutoff_at)
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
  end if;

  return v_order_id;
end;
$$;

revoke all on function public.create_pos_order(jsonb, jsonb) from public, anon;
grant execute on function public.create_pos_order(jsonb, jsonb) to authenticated;

-- 8. Update cancel_order so cancelling a pre-cutoff (affects_stock = false) order does NOT add phantom stock
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

  if coalesce(v_order.affects_stock, true) then
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
        left join public.branches b on b.id = coalesce(oi.branch_id, v_order.branch_id)
        where oi.order_id = p_order_id
          and oi.product_id is not null
          and (b.stock_cutoff_at is null or v_order.created_at >= b.stock_cutoff_at)
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
                and lower(rp.brand) = lower(l.incoming_brand)
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
  end if;

  return jsonb_build_object('order_id', p_order_id, 'status', 'cancelled', 'stock_restored', coalesce(v_order.affects_stock, true));
end;
$$;

revoke all on function public.cancel_order(uuid, text) from public, anon;
grant execute on function public.cancel_order(uuid, text) to authenticated;
