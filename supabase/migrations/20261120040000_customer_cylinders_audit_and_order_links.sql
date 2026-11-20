-- 1. Ensure POS workspace columns exist on orders & order_items
alter table public.orders
  add column if not exists rider_ids uuid[] not null default '{}',
  add column if not exists vehicle_plate text,
  add column if not exists lpo_number text,
  add column if not exists sale_comment text;

alter table public.order_items
  add column if not exists branch_id uuid references public.branches(id);

create index if not exists orders_customer_id_created_idx
  on public.orders(customer_id, created_at desc)
  where customer_id is not null;

-- 2. Exclude cancelled orders from customer_outstanding_balances
create or replace view public.customer_outstanding_balances as
select
  o.customer_id,
  sum(o.total_kes)::numeric(14,2) as balance_kes
from public.orders o
where o.customer_id is not null
  and o.payment_status <> 'paid'::payment_status
  and o.delivery_status <> 'cancelled'::delivery_status
group by o.customer_id
having sum(o.total_kes) > 0::numeric;

-- 3. Customer Original Cylinders table
create table if not exists public.customer_cylinders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  quantity integer not null default 1 check (quantity > 0),
  serial_number text,
  notes text,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  updated_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_cylinders_customer_idx
  on public.customer_cylinders(customer_id);
create index if not exists customer_cylinders_product_idx
  on public.customer_cylinders(product_id);

alter table public.customer_cylinders enable row level security;
revoke all on public.customer_cylinders from anon;
grant select, insert, update, delete on public.customer_cylinders to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_cylinders' and policyname='Approved staff view customer cylinders') then
    create policy "Approved staff view customer cylinders"
      on public.customer_cylinders for select to authenticated
      using (public.is_staff_approved());
  end if;
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_cylinders' and policyname='Staff manage customer cylinders') then
    create policy "Staff manage customer cylinders"
      on public.customer_cylinders for all to authenticated
      using (public.current_user_role() in ('admin', 'director', 'operator', 'sales_rep'))
      with check (public.current_user_role() in ('admin', 'director', 'operator', 'sales_rep'));
  end if;
end $$;

-- 4. Customer Audit Log table (tracks original cylinders, customer profile changes, and payment settlements)
create table if not exists public.customer_audit_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  entity_type text not null check (entity_type in ('customer', 'cylinder', 'phone', 'location', 'payment')),
  action text not null check (action in ('created', 'updated', 'deleted', 'payment_recorded')),
  summary text not null,
  old_data jsonb,
  new_data jsonb,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index if not exists customer_audit_log_customer_created_idx
  on public.customer_audit_log(customer_id, created_at desc);

alter table public.customer_audit_log enable row level security;
revoke all on public.customer_audit_log from anon;
grant select on public.customer_audit_log to authenticated;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='customer_audit_log' and policyname='Approved staff view customer audit log') then
    create policy "Approved staff view customer audit log"
      on public.customer_audit_log for select to authenticated
      using (public.is_staff_approved());
  end if;
end $$;

-- 5. Automatic audit trigger on public.customer_cylinders
create or replace function public.log_customer_cylinder_change() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_old_name text;
  v_new_name text;
  v_summary text;
begin
  if tg_op = 'INSERT' then
    select name into v_new_name from public.products where id = new.product_id;
    v_summary := 'Added original cylinder: ' || new.quantity || ' × ' || coalesce(v_new_name, 'Cylinder')
      || case when nullif(trim(coalesce(new.serial_number, '')), '') is not null then ' (Serial: ' || trim(new.serial_number) || ')' else '' end;
    insert into public.customer_audit_log(customer_id, entity_type, action, summary, old_data, new_data, actor_id)
    values (
      new.customer_id, 'cylinder', 'created', v_summary, null,
      jsonb_build_object('product_id', new.product_id, 'product_name', v_new_name, 'quantity', new.quantity, 'serial_number', new.serial_number, 'notes', new.notes),
      auth.uid()
    );
    return new;
  elsif tg_op = 'UPDATE' then
    if old.product_id = new.product_id
       and old.quantity = new.quantity
       and coalesce(old.serial_number, '') = coalesce(new.serial_number, '')
       and coalesce(old.notes, '') = coalesce(new.notes, '') then
      return new;
    end if;
    select name into v_old_name from public.products where id = old.product_id;
    select name into v_new_name from public.products where id = new.product_id;
    v_summary := 'Updated original cylinder: ' || old.quantity || ' × ' || coalesce(v_old_name, 'Cylinder')
      || ' → ' || new.quantity || ' × ' || coalesce(v_new_name, 'Cylinder')
      || case when nullif(trim(coalesce(new.serial_number, '')), '') is not null then ' (Serial: ' || trim(new.serial_number) || ')' else '' end;
    insert into public.customer_audit_log(customer_id, entity_type, action, summary, old_data, new_data, actor_id)
    values (
      new.customer_id, 'cylinder', 'updated', v_summary,
      jsonb_build_object('product_id', old.product_id, 'product_name', v_old_name, 'quantity', old.quantity, 'serial_number', old.serial_number, 'notes', old.notes),
      jsonb_build_object('product_id', new.product_id, 'product_name', v_new_name, 'quantity', new.quantity, 'serial_number', new.serial_number, 'notes', new.notes),
      auth.uid()
    );
    return new;
  elsif tg_op = 'DELETE' then
    select name into v_old_name from public.products where id = old.product_id;
    v_summary := 'Removed original cylinder: ' || old.quantity || ' × ' || coalesce(v_old_name, 'Cylinder');
    insert into public.customer_audit_log(customer_id, entity_type, action, summary, old_data, new_data, actor_id)
    values (
      old.customer_id, 'cylinder', 'deleted', v_summary,
      jsonb_build_object('product_id', old.product_id, 'product_name', v_old_name, 'quantity', old.quantity, 'serial_number', old.serial_number, 'notes', old.notes),
      null,
      auth.uid()
    );
    return old;
  end if;
  return null;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_customer_cylinders_audit') then
    create trigger trg_customer_cylinders_audit
      after insert or update or delete on public.customer_cylinders
      for each row execute function public.log_customer_cylinder_change();
  end if;
end $$;

-- 6. Automatic audit trigger on public.customers (name / active status changes)
create or replace function public.log_customer_profile_change() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_parts text[] := '{}';
begin
  if coalesce(old.name, '') <> coalesce(new.name, '') then
    v_parts := array_append(v_parts, 'Name: ' || coalesce(nullif(old.name, ''), 'Unnamed') || ' → ' || coalesce(nullif(new.name, ''), 'Unnamed'));
  end if;
  if old.is_active is distinct from new.is_active then
    v_parts := array_append(v_parts, case when new.is_active then 'Reactivated customer' else 'Deactivated customer' end);
  end if;
  if array_length(v_parts, 1) > 0 then
    insert into public.customer_audit_log(customer_id, entity_type, action, summary, old_data, new_data, actor_id)
    values (
      new.id, 'customer', 'updated', array_to_string(v_parts, ' · '),
      jsonb_build_object('name', old.name, 'is_active', old.is_active),
      jsonb_build_object('name', new.name, 'is_active', new.is_active),
      auth.uid()
    );
  end if;
  return new;
end;
$$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'trg_customers_profile_audit') then
    create trigger trg_customers_profile_audit
      after update on public.customers
      for each row execute function public.log_customer_profile_change();
  end if;
end $$;

-- 7. RPC to settle an unpaid customer receipt and log it to customer_audit_log
create or replace function public.settle_customer_order(
  p_order_id uuid,
  p_payment_method payment_method,
  p_payment_reference text default null
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_order record;
  v_ref text := nullif(trim(coalesce(p_payment_reference, '')), '');
  v_label text;
begin
  if public.current_user_role() not in ('admin', 'director', 'operator') then
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

  return jsonb_build_object('order_id', p_order_id, 'payment_status', 'paid');
end;
$$;
revoke all on function public.settle_customer_order(uuid, payment_method, text) from public, anon;
grant execute on function public.settle_customer_order(uuid, payment_method, text) to authenticated;

-- 8. Update create_pos_order so customer_id is always saved on orders
create or replace function public.create_pos_order(
  p_order jsonb,
  p_items jsonb
) returns uuid
language plpgsql security definer set search_path = public, auth as $$
declare
  v_role user_role := public.current_user_role();
  v_client_req_id uuid := nullif(p_order->>'client_request_id', '')::uuid;
  v_customer_id uuid := nullif(p_order->>'customer_id', '')::uuid;
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
