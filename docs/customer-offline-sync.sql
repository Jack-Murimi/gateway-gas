-- Gateway Gas customer offline-first sync migration.
-- Review and run manually in Supabase SQL Editor. This has NOT been applied.

begin;

alter table public.customers
  add column if not exists deleted_at timestamptz;

create index if not exists idx_customers_updated_at_id
  on public.customers (updated_at asc, id asc);

create or replace function public.set_customer_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists customers_set_updated_at on public.customers;
create trigger customers_set_updated_at
before update on public.customers
for each row execute function public.set_customer_updated_at();

create or replace function public.touch_parent_customer_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_customer_id uuid;
begin
  if tg_op = 'DELETE' then
    v_customer_id := old.customer_id;
  else
    v_customer_id := new.customer_id;
  end if;

  update public.customers
     set updated_at = now()
   where id = v_customer_id;

  if tg_op = 'UPDATE' and old.customer_id is distinct from new.customer_id then
    update public.customers
       set updated_at = now()
     where id = old.customer_id;
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists customer_phones_touch_parent on public.customer_phones;
create trigger customer_phones_touch_parent
after insert or update or delete on public.customer_phones
for each row execute function public.touch_parent_customer_updated_at();

drop trigger if exists customer_locations_touch_parent on public.customer_locations;
create trigger customer_locations_touch_parent
after insert or update or delete on public.customer_locations
for each row execute function public.touch_parent_customer_updated_at();

-- All staff access remains subject to the existing underlying table RLS policies.
create or replace view public.customer_directory_sync
with (security_invoker = true)
as
select
  c.id,
  c.name,
  c.created_at,
  c.updated_at,
  c.is_active,
  c.deleted_at,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', p.id,
      'customer_id', p.customer_id,
      'phone_number', p.phone_number,
      'is_primary', p.is_primary
    ) order by p.is_primary desc, p.created_at asc, p.id asc)
    from public.customer_phones p
    where p.customer_id = c.id
  ), '[]'::jsonb) as phones,
  coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', l.id,
      'customer_id', l.customer_id,
      'estate', l.estate,
      'specific_address', l.specific_address,
      'is_default', l.is_default
    ) order by l.is_default desc, l.created_at asc, l.id asc)
    from public.customer_locations l
    where l.customer_id = c.id
  ), '[]'::jsonb) as locations
from public.customers c;

grant select on public.customer_directory_sync to authenticated;

-- Fresh balances only; security_invoker preserves the caller's orders RLS visibility.
create or replace view public.customer_outstanding_balances
with (security_invoker = true)
as
select
  o.customer_id,
  sum(o.total_kes)::numeric(14,2) as balance_kes
from public.orders o
where o.customer_id is not null
  and o.payment_status <> 'paid'
group by o.customer_id
having sum(o.total_kes) > 0;

grant select on public.customer_outstanding_balances to authenticated;

-- Deletion is now explicit and soft. Hard DELETE is removed from the staff API.
create or replace function public.soft_delete_customer(p_customer_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if public.current_user_role() not in ('admin', 'director', 'operator') then
    raise exception 'You are not authorised to archive customers.';
  end if;

  update public.customers
     set deleted_at = now(),
         updated_at = now()
   where id = p_customer_id
     and deleted_at is null;

  if not found then
    raise exception 'Customer not found or already archived.';
  end if;
end;
$$;

revoke all on function public.soft_delete_customer(uuid) from public, anon;
grant execute on function public.soft_delete_customer(uuid) to authenticated;
revoke delete on public.customers from authenticated;

commit;
