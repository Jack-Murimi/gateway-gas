-- Operating expenses & fleet bike registry.
-- Only approved administrators and directors can read, record, update, or void expenses.
-- Bikes are managed by administrators and directors and pre-populated from existing staff vehicle plates.

create table if not exists public.bikes (
  id uuid primary key default gen_random_uuid(),
  plate_number text not null unique check (
    length(trim(plate_number)) > 0
    and plate_number = upper(trim(plate_number))
  ),
  model text,
  branch_id uuid references public.branches(id) on delete set null,
  assigned_rider_id uuid references public.profiles(id) on delete set null,
  is_active boolean not null default true,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists bikes_branch_id_idx
  on public.bikes(branch_id) where branch_id is not null;
create index if not exists bikes_assigned_rider_id_idx
  on public.bikes(assigned_rider_id) where assigned_rider_id is not null;
create index if not exists bikes_created_by_idx
  on public.bikes(created_by) where created_by is not null;

create or replace function public.normalize_bike_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.plate_number := upper(trim(coalesce(new.plate_number, '')));
  new.model := nullif(trim(coalesce(new.model, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  if tg_op = 'INSERT' then
    new.created_by := coalesce(new.created_by, auth.uid());
    new.created_at := coalesce(new.created_at, now());
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_normalize_bike_fields on public.bikes;
create trigger trg_normalize_bike_fields
  before insert or update on public.bikes
  for each row execute function public.normalize_bike_fields();

-- Seed fleet bikes from existing staff profiles that already carry a vehicle plate.
insert into public.bikes (plate_number, branch_id, assigned_rider_id)
select distinct on (upper(trim(p.vehicle_plate)))
  upper(trim(p.vehicle_plate)),
  p.branch_id,
  p.id
from public.profiles p
where p.vehicle_plate is not null
  and length(trim(p.vehicle_plate)) > 0
order by upper(trim(p.vehicle_plate)), (p.approval_status = 'approved') desc, p.created_at asc
on conflict (plate_number) do nothing;

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  expense_date date not null default current_date,
  category text not null check (
    category in (
      'fuel',
      'bike_service',
      'salary',
      'rent',
      'utilities',
      'office_supplies',
      'licenses_permits',
      'other'
    )
  ),
  amount_kes numeric(14,2) not null check (amount_kes > 0),
  payment_method text not null default 'mpesa' check (
    payment_method in ('cash', 'mpesa', 'bank_transfer', 'cheque', 'pdq')
  ),
  payment_reference text,
  branch_id uuid references public.branches(id) on delete set null,
  bike_id uuid references public.bikes(id) on delete restrict,
  staff_id uuid references public.profiles(id) on delete set null,
  vendor_name text,
  description text not null check (length(trim(description)) > 0),
  fuel_litres numeric(10,2) check (fuel_litres is null or fuel_litres > 0),
  odometer_km integer check (odometer_km is null or odometer_km >= 0),
  salary_period text check (salary_period is null or salary_period ~ '^\d{4}-\d{2}$'),
  notes text,
  status text not null default 'posted' check (status in ('posted', 'void')),
  voided_at timestamptz,
  voided_by uuid references public.profiles(id) on delete set null,
  void_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint expenses_bike_required_for_fleet check (
    category not in ('fuel', 'bike_service') or bike_id is not null
  ),
  constraint expenses_void_fields_consistent check (
    (status = 'posted' and voided_at is null)
    or (status = 'void' and voided_at is not null and length(trim(coalesce(void_reason, ''))) >= 3)
  )
);

create index if not exists expenses_date_idx
  on public.expenses(expense_date desc, created_at desc);
create index if not exists expenses_category_date_idx
  on public.expenses(category, expense_date desc);
create index if not exists expenses_status_date_idx
  on public.expenses(status, expense_date desc);
create index if not exists expenses_bike_date_idx
  on public.expenses(bike_id, expense_date desc) where bike_id is not null;
create index if not exists expenses_branch_date_idx
  on public.expenses(branch_id, expense_date desc) where branch_id is not null;
create index if not exists expenses_staff_date_idx
  on public.expenses(staff_id, expense_date desc) where staff_id is not null;
create index if not exists expenses_created_by_idx
  on public.expenses(created_by) where created_by is not null;
create index if not exists expenses_updated_by_idx
  on public.expenses(updated_by) where updated_by is not null;
create index if not exists expenses_voided_by_idx
  on public.expenses(voided_by) where voided_by is not null;

create or replace function public.set_expense_audit_fields()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.description := trim(coalesce(new.description, ''));
  new.vendor_name := nullif(trim(coalesce(new.vendor_name, '')), '');
  new.payment_reference := nullif(trim(coalesce(new.payment_reference, '')), '');
  new.notes := nullif(trim(coalesce(new.notes, '')), '');
  new.salary_period := nullif(trim(coalesce(new.salary_period, '')), '');
  new.void_reason := nullif(trim(coalesce(new.void_reason, '')), '');

  if tg_op = 'INSERT' then
    if new.status <> 'posted' then
      raise exception 'New expenses must be recorded with status posted.';
    end if;
    new.created_by := coalesce(new.created_by, auth.uid());
    new.updated_by := auth.uid();
    new.created_at := coalesce(new.created_at, now());
    new.updated_at := now();
  else
    if old.status = 'void' then
      raise exception 'Voided expenses cannot be modified.';
    end if;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.updated_by := auth.uid();
    new.updated_at := now();
    if new.status = 'void' and old.status = 'posted' then
      new.voided_at := coalesce(new.voided_at, now());
      new.voided_by := coalesce(new.voided_by, auth.uid());
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_set_expense_audit_fields on public.expenses;
create trigger trg_set_expense_audit_fields
  before insert or update on public.expenses
  for each row execute function public.set_expense_audit_fields();

-- Row-Level Security & Least-Privilege Grants
alter table public.bikes enable row level security;
alter table public.expenses enable row level security;

revoke all on public.bikes, public.expenses from anon, authenticated;
grant select, insert, update on public.bikes to authenticated;
grant select, insert, update on public.expenses to authenticated;

drop policy if exists "Approved staff view bikes" on public.bikes;
create policy "Approved staff view bikes"
  on public.bikes for select
  to authenticated
  using ((select public.is_staff_approved()));

drop policy if exists "Admin and Director insert bikes" on public.bikes;
create policy "Admin and Director insert bikes"
  on public.bikes for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'director'));

drop policy if exists "Admin and Director update bikes" on public.bikes;
create policy "Admin and Director update bikes"
  on public.bikes for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'director'))
  with check ((select public.current_user_role()) in ('admin', 'director'));

drop policy if exists "Admin and Director view expenses" on public.expenses;
create policy "Admin and Director view expenses"
  on public.expenses for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'director'));

drop policy if exists "Admin and Director insert expenses" on public.expenses;
create policy "Admin and Director insert expenses"
  on public.expenses for insert
  to authenticated
  with check ((select public.current_user_role()) in ('admin', 'director'));

drop policy if exists "Admin and Director update expenses" on public.expenses;
create policy "Admin and Director update expenses"
  on public.expenses for update
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'director'))
  with check ((select public.current_user_role()) in ('admin', 'director'));
