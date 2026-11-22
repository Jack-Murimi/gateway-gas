-- Phase 1 & 2: Persistent Shift Z-Reports, authoritative day-summary RPCs, and order lookup indexes.

-- 1. Indexes for fast sales history, receivables aging, and shift lookups
create index if not exists orders_branch_created_idx
  on public.orders(branch_id, created_at desc);

create index if not exists orders_receipt_number_idx
  on public.orders(receipt_number)
  where receipt_number is not null;

create index if not exists orders_unpaid_active_idx
  on public.orders(created_at desc)
  where payment_status <> 'paid'::payment_status
    and delivery_status <> 'cancelled'::delivery_status;

-- 2. Persistent Shift Z-Reports table (one sealed report per branch per shift_date)
create table if not exists public.shift_reports (
  id uuid primary key default gen_random_uuid(),
  report_number text unique not null,
  branch_id uuid not null references public.branches(id) on delete restrict,
  branch_name text not null,
  operator_id uuid not null references public.profiles(id) on delete restrict,
  operator_name text not null,
  shift_date date not null,
  total_sales_count integer not null default 0 check (total_sales_count >= 0),
  total_revenue_kes numeric(14,2) not null default 0 check (total_revenue_kes >= 0),
  unpaid_sales_count integer not null default 0 check (unpaid_sales_count >= 0),
  unpaid_total_kes numeric(14,2) not null default 0 check (unpaid_total_kes >= 0),
  mpesa_total_kes numeric(14,2) not null default 0 check (mpesa_total_kes >= 0),
  cash_total_kes numeric(14,2) not null default 0 check (cash_total_kes >= 0),
  bank_total_kes numeric(14,2) not null default 0 check (bank_total_kes >= 0),
  expected_cash_kes numeric(14,2) not null default 0 check (expected_cash_kes >= 0),
  declared_cash_kes numeric(14,2) not null default 0 check (declared_cash_kes >= 0),
  cash_variance_kes numeric(14,2) not null default 0,
  cylinders_sold_count integer not null default 0 check (cylinders_sold_count >= 0),
  accessories_sold_count integer not null default 0 check (accessories_sold_count >= 0),
  cylinder_breakdown jsonb not null default '[]'::jsonb,
  notes text,
  closed_at timestamptz not null default now(),
  unique (branch_id, shift_date)
);

create index if not exists shift_reports_branch_date_idx
  on public.shift_reports(branch_id, shift_date desc);

create index if not exists shift_reports_operator_idx
  on public.shift_reports(operator_id);

create index if not exists shift_reports_closed_at_idx
  on public.shift_reports(closed_at desc);

alter table public.shift_reports enable row level security;
revoke all on public.shift_reports from anon, authenticated;
grant select on public.shift_reports to authenticated;

drop policy if exists "Station staff view shift reports" on public.shift_reports;
create policy "Station staff view shift reports"
  on public.shift_reports for select
  to authenticated
  using ((select public.current_user_role()) in ('admin', 'director', 'operator', 'sales_rep'));

-- 3. Authoritative live summary for any branch + shift date (Africa/Nairobi timezone, no 200-order cap)
create or replace function public.get_shift_day_summary(
  p_branch_id uuid,
  p_shift_date date
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role user_role := public.current_user_role();
  v_totals record;
  v_items record;
  v_breakdown jsonb;
begin
  if v_role not in ('admin', 'director', 'operator', 'sales_rep') then
    raise exception 'Permission denied to view shift summaries.';
  end if;
  if p_branch_id is null or p_shift_date is null then
    raise exception 'Branch and shift date are required.';
  end if;

  select
    count(*)::integer as total_sales_count,
    coalesce(sum(case when o.payment_status = 'paid' then o.total_kes else 0 end), 0)::numeric(14,2) as total_revenue_kes,
    count(*) filter (where o.payment_status <> 'paid')::integer as unpaid_sales_count,
    coalesce(sum(case when o.payment_status <> 'paid' then o.total_kes else 0 end), 0)::numeric(14,2) as unpaid_total_kes,
    coalesce(sum(case when o.payment_status = 'paid' and o.payment_method = 'mpesa' then o.total_kes else 0 end), 0)::numeric(14,2) as mpesa_total_kes,
    coalesce(sum(case when o.payment_status = 'paid' and o.payment_method = 'cash' then o.total_kes else 0 end), 0)::numeric(14,2) as cash_total_kes,
    coalesce(sum(case when o.payment_status = 'paid' and o.payment_method not in ('mpesa', 'cash') then o.total_kes else 0 end), 0)::numeric(14,2) as bank_total_kes
  into v_totals
  from public.orders o
  where o.branch_id = p_branch_id
    and o.delivery_status <> 'cancelled'
    and (o.created_at at time zone 'Africa/Nairobi')::date = p_shift_date;

  select
    coalesce(sum(case when oi.order_type <> 'accessory' then oi.quantity else 0 end), 0)::integer as cylinders_sold_count,
    coalesce(sum(case when oi.order_type = 'accessory' then oi.quantity else 0 end), 0)::integer as accessories_sold_count
  into v_items
  from public.order_items oi
  join public.orders o on o.id = oi.order_id
  where o.branch_id = p_branch_id
    and o.delivery_status <> 'cancelled'
    and (o.created_at at time zone 'Africa/Nairobi')::date = p_shift_date;

  with day_items as (
    select
      oi.order_type,
      oi.outgoing_brand,
      coalesce(nullif(trim(oi.incoming_brand), ''), oi.outgoing_brand) as resolved_incoming_brand,
      oi.cylinder_size_kg,
      oi.quantity
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    where o.branch_id = p_branch_id
      and o.delivery_status <> 'cancelled'
      and (o.created_at at time zone 'Africa/Nairobi')::date = p_shift_date
      and oi.order_type <> 'accessory'
  ),
  raw_rows as (
    select outgoing_brand as brand, cylinder_size_kg as size_kg, quantity as full_sold, 0 as empty_in
    from day_items
    union all
    select resolved_incoming_brand as brand, cylinder_size_kg as size_kg, 0 as full_sold, quantity as empty_in
    from day_items
    where order_type = 'refill'
  ),
  grouped as (
    select
      brand,
      size_kg,
      sum(full_sold)::integer as full_sold,
      sum(empty_in)::integer as empty_in
    from raw_rows
    group by brand, size_kg
    order by size_kg nulls last, brand
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'brand', g.brand,
        'size_kg', g.size_kg,
        'full_sold', g.full_sold,
        'empty_in', g.empty_in
      )
    ),
    '[]'::jsonb
  )
  into v_breakdown
  from grouped g;

  return jsonb_build_object(
    'total_sales_count', coalesce(v_totals.total_sales_count, 0),
    'total_revenue_kes', coalesce(v_totals.total_revenue_kes, 0),
    'unpaid_sales_count', coalesce(v_totals.unpaid_sales_count, 0),
    'unpaid_total_kes', coalesce(v_totals.unpaid_total_kes, 0),
    'mpesa_total_kes', coalesce(v_totals.mpesa_total_kes, 0),
    'cash_total_kes', coalesce(v_totals.cash_total_kes, 0),
    'bank_total_kes', coalesce(v_totals.bank_total_kes, 0),
    'cylinders_sold_count', coalesce(v_items.cylinders_sold_count, 0),
    'accessories_sold_count', coalesce(v_items.accessories_sold_count, 0),
    'cylinder_breakdown', coalesce(v_breakdown, '[]'::jsonb)
  );
end;
$$;

revoke all on function public.get_shift_day_summary(uuid, date) from public, anon;
grant execute on function public.get_shift_day_summary(uuid, date) to authenticated;

-- 4. Authoritative RPC to seal and persist a daily Z-Report
create or replace function public.close_shift_report(
  p_branch_id uuid,
  p_shift_date date,
  p_declared_cash_kes numeric,
  p_notes text default null
) returns public.shift_reports
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role user_role := public.current_user_role();
  v_branch record;
  v_operator record;
  v_summary jsonb;
  v_expected_cash numeric(14,2);
  v_declared numeric(14,2);
  v_prefix text;
  v_seq integer;
  v_report_number text;
  v_row public.shift_reports;
begin
  if v_role not in ('admin', 'director', 'operator', 'sales_rep') then
    raise exception 'Permission denied to close shifts.';
  end if;
  if p_branch_id is null or p_shift_date is null then
    raise exception 'Select a branch and shift date.';
  end if;
  if p_declared_cash_kes is null or p_declared_cash_kes < 0 then
    raise exception 'Declared cash must be KES 0 or more.';
  end if;

  select id, name, code, is_active into v_branch
  from public.branches
  where id = p_branch_id;

  if not found or not v_branch.is_active then
    raise exception 'Select an active branch.';
  end if;

  if exists (
    select 1 from public.shift_reports
    where branch_id = p_branch_id and shift_date = p_shift_date
  ) then
    raise exception 'This shift has already been closed for % on %.', v_branch.name, p_shift_date;
  end if;

  select id, full_name into v_operator
  from public.profiles
  where id = auth.uid();

  if not found then
    raise exception 'Operator profile not found.';
  end if;

  v_summary := public.get_shift_day_summary(p_branch_id, p_shift_date);
  v_expected_cash := coalesce((v_summary->>'cash_total_kes')::numeric, 0);
  v_declared := round(p_declared_cash_kes, 2);

  v_prefix := upper(coalesce(nullif(split_part(v_branch.code, '-', 1), ''), 'STN'));
  select count(*) + 1 into v_seq
  from public.shift_reports
  where branch_id = p_branch_id and shift_date = p_shift_date;

  v_report_number := 'Z-' || v_prefix || '-' || to_char(p_shift_date, 'YYYYMMDD') || '-' || lpad(v_seq::text, 2, '0');

  insert into public.shift_reports (
    report_number,
    branch_id,
    branch_name,
    operator_id,
    operator_name,
    shift_date,
    total_sales_count,
    total_revenue_kes,
    unpaid_sales_count,
    unpaid_total_kes,
    mpesa_total_kes,
    cash_total_kes,
    bank_total_kes,
    expected_cash_kes,
    declared_cash_kes,
    cash_variance_kes,
    cylinders_sold_count,
    accessories_sold_count,
    cylinder_breakdown,
    notes
  ) values (
    v_report_number,
    v_branch.id,
    v_branch.name,
    v_operator.id,
    v_operator.full_name,
    p_shift_date,
    coalesce((v_summary->>'total_sales_count')::integer, 0),
    coalesce((v_summary->>'total_revenue_kes')::numeric, 0),
    coalesce((v_summary->>'unpaid_sales_count')::integer, 0),
    coalesce((v_summary->>'unpaid_total_kes')::numeric, 0),
    coalesce((v_summary->>'mpesa_total_kes')::numeric, 0),
    v_expected_cash,
    coalesce((v_summary->>'bank_total_kes')::numeric, 0),
    v_expected_cash,
    v_declared,
    v_declared - v_expected_cash,
    coalesce((v_summary->>'cylinders_sold_count')::integer, 0),
    coalesce((v_summary->>'accessories_sold_count')::integer, 0),
    coalesce(v_summary->'cylinder_breakdown', '[]'::jsonb),
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning * into v_row;

  return v_row;
end;
$$;

revoke all on function public.close_shift_report(uuid, date, numeric, text) from public, anon;
grant execute on function public.close_shift_report(uuid, date, numeric, text) to authenticated;
