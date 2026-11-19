-- Stock takes (initial, daily count, adjustment) and automatic audit log on branch_inventory.
create table if not exists public.stock_audit_log (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  action text not null check (action in ('initial','daily','adjustment','sale','purchase','transfer','edit')),
  branch_id uuid not null references public.branches(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  prev_full integer not null default 0,
  prev_empty integer not null default 0,
  new_full integer not null default 0,
  new_empty integer not null default 0,
  note text,
  actor_id uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);
create index if not exists stock_audit_log_branch_created_idx on public.stock_audit_log(branch_id, created_at desc);
create index if not exists stock_audit_log_product_created_idx on public.stock_audit_log(product_id, created_at desc);
create index if not exists stock_audit_log_batch_idx on public.stock_audit_log(batch_id);
alter table public.stock_audit_log enable row level security;
revoke all on public.stock_audit_log from anon;
grant select on public.stock_audit_log to authenticated;
drop policy if exists "Approved staff view stock audit log" on public.stock_audit_log;
create policy "Approved staff view stock audit log" on public.stock_audit_log for select to authenticated using (public.is_staff_approved());

create or replace function public.log_branch_inventory_change() returns trigger
language plpgsql security definer set search_path = public, auth as $$
declare
  v_prev_full integer := case when tg_op = 'INSERT' then 0 else coalesce(old.full_units, 0) end;
  v_prev_empty integer := case when tg_op = 'INSERT' then 0 else coalesce(old.empty_units, 0) end;
  v_action text := nullif(current_setting('app.stock_action', true), '');
  v_note text := nullif(current_setting('app.stock_note', true), '');
  v_batch text := nullif(current_setting('app.stock_batch', true), '');
  v_order record;
begin
  if tg_op = 'UPDATE' and v_prev_full = new.full_units and v_prev_empty = new.empty_units then
    return new;
  end if;
  if tg_op = 'INSERT' and new.full_units = 0 and new.empty_units = 0 and coalesce(v_action, '') <> 'initial' then
    return new;
  end if;
  if v_action is null then
    select o.id, coalesce(nullif(o.receipt_number, ''), o.order_number) as label
    into v_order
    from public.orders o
    where o.sales_rep_id = auth.uid()
      and o.created_at > now() - interval '15 seconds'
      and exists (select 1 from public.order_items oi where oi.order_id = o.id)
    order by o.created_at desc limit 1;
    if v_order.id is not null then
      v_action := 'sale';
      v_batch := v_order.id::text;
      v_note := 'Sale ' || v_order.label;
    else
      v_action := 'edit';
    end if;
  end if;
  insert into public.stock_audit_log(batch_id, action, branch_id, product_id, prev_full, prev_empty, new_full, new_empty, note, actor_id)
  values (coalesce(v_batch::uuid, gen_random_uuid()), v_action, new.branch_id, new.product_id, v_prev_full, v_prev_empty, new.full_units, new.empty_units, v_note, auth.uid());
  return new;
end;
$$;

drop trigger if exists trg_branch_inventory_audit on public.branch_inventory;
create trigger trg_branch_inventory_audit after insert or update on public.branch_inventory
for each row execute function public.log_branch_inventory_change();

create or replace function public.apply_branch_stock(
  p_branch_id uuid, p_action text, p_note text, p_lines jsonb
) returns jsonb
language plpgsql security definer set search_path = public, auth as $$
declare
  v_batch uuid := gen_random_uuid();
  v_line jsonb;
  v_full integer;
  v_empty integer;
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
  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_full := greatest(0, coalesce((v_line->>'full_units')::integer, 0));
    v_empty := greatest(0, coalesce((v_line->>'empty_units')::integer, 0));
    insert into public.branch_inventory(branch_id, product_id, full_units, empty_units, updated_at)
    values (p_branch_id, (v_line->>'product_id')::uuid, v_full, v_empty, now())
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
revoke all on function public.apply_branch_stock(uuid, text, text, jsonb) from public, anon;
grant execute on function public.apply_branch_stock(uuid, text, text, jsonb) to authenticated;

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

  for v_line in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_product_id := (v_line->>'product_id')::uuid;
    v_full := greatest(0, coalesce((v_line->>'full_units')::integer, 0));
    v_empty := greatest(0, coalesce((v_line->>'empty_units')::integer, 0));
    if v_full = 0 and v_empty = 0 then continue; end if;

    select coalesce(full_units, 0) as full_units, coalesce(empty_units, 0) as empty_units
    into v_from from public.branch_inventory where branch_id = p_from_branch_id and product_id = v_product_id;

    if coalesce(v_from.full_units, 0) < v_full or coalesce(v_from.empty_units, 0) < v_empty then
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
