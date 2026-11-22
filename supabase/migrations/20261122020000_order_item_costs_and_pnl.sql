-- Phase 3: Snapshot unit cost on order_items + Executive P&L and Cashflow summary RPC for Directors & Admins.

alter table public.order_items
  add column if not exists unit_cost_kes numeric(12,2)
  check (unit_cost_kes is null or unit_cost_kes >= 0);

create index if not exists order_items_order_id_idx
  on public.order_items(order_id);

create index if not exists order_items_product_id_idx
  on public.order_items(product_id)
  where product_id is not null;

create or replace function public.get_financial_summary(
  p_start_date date,
  p_end_date date,
  p_branch_id uuid default null
) returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_role user_role := public.current_user_role();
  v_sales record;
  v_cogs record;
  v_expenses_total numeric(14,2) := 0;
  v_expenses_hq numeric(14,2) := 0;
  v_expenses_by_cat jsonb := '[]'::jsonb;
  v_branch_breakdown jsonb := '[]'::jsonb;
  v_monthly_trend jsonb := '[]'::jsonb;
  v_supplier_payments_out numeric(14,2) := 0;
  v_total_receivables numeric(14,2) := 0;
  v_total_payables numeric(14,2) := 0;
  v_gross_profit numeric(14,2) := 0;
  v_gross_margin_pct numeric(8,2) := 0;
  v_net_profit numeric(14,2) := 0;
begin
  if v_role not in ('admin', 'director') then
    raise exception 'Permission denied: Profit & Loss reporting is restricted to Directors and Administrators.';
  end if;
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Select a valid date range.';
  end if;

  -- 1. Sales totals in period (non-cancelled)
  select
    count(*)::integer as orders_count,
    count(*) filter (where o.payment_status = 'paid')::integer as paid_orders_count,
    count(*) filter (where o.payment_status <> 'paid')::integer as unpaid_orders_count,
    coalesce(sum(o.total_kes), 0)::numeric(14,2) as revenue_billed_kes,
    coalesce(sum(case when o.payment_status = 'paid' then o.total_kes else 0 end), 0)::numeric(14,2) as revenue_collected_kes,
    coalesce(sum(case when o.payment_status <> 'paid' then o.total_kes else 0 end), 0)::numeric(14,2) as revenue_unpaid_kes,
    coalesce(sum(case when o.payment_status = 'paid' and o.payment_method = 'cash' then o.total_kes else 0 end), 0)::numeric(14,2) as cash_in_kes,
    coalesce(sum(case when o.payment_status = 'paid' and o.payment_method = 'mpesa' then o.total_kes else 0 end), 0)::numeric(14,2) as mpesa_in_kes,
    coalesce(sum(case when o.payment_status = 'paid' and o.payment_method not in ('cash', 'mpesa') then o.total_kes else 0 end), 0)::numeric(14,2) as bank_in_kes
  into v_sales
  from public.orders o
  where o.delivery_status <> 'cancelled'
    and (o.created_at at time zone 'Africa/Nairobi')::date between p_start_date and p_end_date
    and (p_branch_id is null or o.branch_id = p_branch_id);

  -- 2. COGS from snapshotted unit_cost_kes with fallback to current product_costs
  with line_costs as (
    select
      oi.quantity,
      coalesce(
        oi.unit_cost_kes,
        case
          when p.category = 'cylinder' and oi.order_type = 'refill' then pc.refill_cost_kes
          when p.category = 'cylinder' then coalesce(pc.complete_cost_kes, pc.refill_cost_kes)
          else coalesce(pc.unit_cost_kes, pc.complete_cost_kes, pc.refill_cost_kes)
        end
      ) as resolved_unit_cost
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.product_costs pc on pc.product_id = oi.product_id
    where o.delivery_status <> 'cancelled'
      and (o.created_at at time zone 'Africa/Nairobi')::date between p_start_date and p_end_date
      and (p_branch_id is null or coalesce(oi.branch_id, o.branch_id) = p_branch_id)
  )
  select
    coalesce(sum(quantity * coalesce(resolved_unit_cost, 0)), 0)::numeric(14,2) as cogs_kes,
    count(*) filter (where resolved_unit_cost is null or resolved_unit_cost <= 0)::integer as items_missing_cost_count,
    count(*)::integer as total_items_count
  into v_cogs
  from line_costs;

  -- 3. Operating expenses (posted only)
  select
    coalesce(sum(e.amount_kes), 0)::numeric(14,2),
    coalesce(sum(case when e.branch_id is null then e.amount_kes else 0 end), 0)::numeric(14,2)
  into v_expenses_total, v_expenses_hq
  from public.expenses e
  where e.status = 'posted'
    and e.expense_date between p_start_date and p_end_date
    and (p_branch_id is null or e.branch_id = p_branch_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'category', c.category,
        'total_kes', c.total_kes,
        'count', c.cnt
      )
      order by c.total_kes desc
    ),
    '[]'::jsonb
  )
  into v_expenses_by_cat
  from (
    select
      e.category,
      coalesce(sum(e.amount_kes), 0)::numeric(14,2) as total_kes,
      count(*)::integer as cnt
    from public.expenses e
    where e.status = 'posted'
      and e.expense_date between p_start_date and p_end_date
      and (p_branch_id is null or e.branch_id = p_branch_id)
    group by e.category
  ) c;

  -- 4. Per-branch profitability breakdown
  with branch_sales as (
    select
      o.branch_id,
      count(*)::integer as orders_count,
      coalesce(sum(o.total_kes), 0)::numeric(14,2) as revenue_kes,
      coalesce(sum(case when o.payment_status = 'paid' then o.total_kes else 0 end), 0)::numeric(14,2) as collected_kes
    from public.orders o
    where o.delivery_status <> 'cancelled'
      and (o.created_at at time zone 'Africa/Nairobi')::date between p_start_date and p_end_date
    group by o.branch_id
  ),
  branch_cogs as (
    select
      coalesce(oi.branch_id, o.branch_id) as branch_id,
      coalesce(sum(
        oi.quantity * coalesce(
          oi.unit_cost_kes,
          case
            when p.category = 'cylinder' and oi.order_type = 'refill' then pc.refill_cost_kes
            when p.category = 'cylinder' then coalesce(pc.complete_cost_kes, pc.refill_cost_kes)
            else coalesce(pc.unit_cost_kes, pc.complete_cost_kes, pc.refill_cost_kes)
          end,
          0
        )
      ), 0)::numeric(14,2) as cogs_kes
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.product_costs pc on pc.product_id = oi.product_id
    where o.delivery_status <> 'cancelled'
      and (o.created_at at time zone 'Africa/Nairobi')::date between p_start_date and p_end_date
    group by coalesce(oi.branch_id, o.branch_id)
  ),
  branch_exp as (
    select
      e.branch_id,
      coalesce(sum(e.amount_kes), 0)::numeric(14,2) as expenses_kes
    from public.expenses e
    where e.status = 'posted'
      and e.branch_id is not null
      and e.expense_date between p_start_date and p_end_date
    group by e.branch_id
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'branch_id', b.id,
        'branch_name', b.name,
        'branch_code', b.code,
        'orders_count', coalesce(bs.orders_count, 0),
        'revenue_kes', coalesce(bs.revenue_kes, 0),
        'collected_kes', coalesce(bs.collected_kes, 0),
        'cogs_kes', coalesce(bc.cogs_kes, 0),
        'gross_profit_kes', coalesce(bs.revenue_kes, 0) - coalesce(bc.cogs_kes, 0),
        'expenses_kes', coalesce(be.expenses_kes, 0),
        'net_contribution_kes', (coalesce(bs.revenue_kes, 0) - coalesce(bc.cogs_kes, 0)) - coalesce(be.expenses_kes, 0)
      )
      order by coalesce(bs.revenue_kes, 0) desc, b.code
    ),
    '[]'::jsonb
  )
  into v_branch_breakdown
  from public.branches b
  left join branch_sales bs on bs.branch_id = b.id
  left join branch_cogs bc on bc.branch_id = b.id
  left join branch_exp be on be.branch_id = b.id
  where b.is_active
    and (p_branch_id is null or b.id = p_branch_id);

  -- 5. 6-month trend ending at p_end_date's month
  with months as (
    select generate_series(
      date_trunc('month', p_end_date::timestamp)::date - interval '5 months',
      date_trunc('month', p_end_date::timestamp)::date,
      interval '1 month'
    )::date as month_start
  ),
  m_sales as (
    select
      date_trunc('month', (o.created_at at time zone 'Africa/Nairobi'))::date as month_start,
      coalesce(sum(o.total_kes), 0)::numeric(14,2) as revenue_kes
    from public.orders o
    where o.delivery_status <> 'cancelled'
      and (p_branch_id is null or o.branch_id = p_branch_id)
      and (o.created_at at time zone 'Africa/Nairobi')::date >= (date_trunc('month', p_end_date::timestamp)::date - interval '5 months')::date
      and (o.created_at at time zone 'Africa/Nairobi')::date <= (date_trunc('month', p_end_date::timestamp)::date + interval '1 month - 1 day')::date
    group by 1
  ),
  m_cogs as (
    select
      date_trunc('month', (o.created_at at time zone 'Africa/Nairobi'))::date as month_start,
      coalesce(sum(
        oi.quantity * coalesce(
          oi.unit_cost_kes,
          case
            when p.category = 'cylinder' and oi.order_type = 'refill' then pc.refill_cost_kes
            when p.category = 'cylinder' then coalesce(pc.complete_cost_kes, pc.refill_cost_kes)
            else coalesce(pc.unit_cost_kes, pc.complete_cost_kes, pc.refill_cost_kes)
          end,
          0
        )
      ), 0)::numeric(14,2) as cogs_kes
    from public.order_items oi
    join public.orders o on o.id = oi.order_id
    left join public.products p on p.id = oi.product_id
    left join public.product_costs pc on pc.product_id = oi.product_id
    where o.delivery_status <> 'cancelled'
      and (p_branch_id is null or coalesce(oi.branch_id, o.branch_id) = p_branch_id)
      and (o.created_at at time zone 'Africa/Nairobi')::date >= (date_trunc('month', p_end_date::timestamp)::date - interval '5 months')::date
      and (o.created_at at time zone 'Africa/Nairobi')::date <= (date_trunc('month', p_end_date::timestamp)::date + interval '1 month - 1 day')::date
    group by 1
  ),
  m_exp as (
    select
      date_trunc('month', e.expense_date::timestamp)::date as month_start,
      coalesce(sum(e.amount_kes), 0)::numeric(14,2) as expenses_kes
    from public.expenses e
    where e.status = 'posted'
      and (p_branch_id is null or e.branch_id = p_branch_id)
      and e.expense_date >= (date_trunc('month', p_end_date::timestamp)::date - interval '5 months')::date
      and e.expense_date <= (date_trunc('month', p_end_date::timestamp)::date + interval '1 month - 1 day')::date
    group by 1
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'label', to_char(m.month_start, 'Mon YY'),
        'revenue_kes', coalesce(ms.revenue_kes, 0),
        'cogs_kes', coalesce(mc.cogs_kes, 0),
        'gross_profit_kes', coalesce(ms.revenue_kes, 0) - coalesce(mc.cogs_kes, 0),
        'expenses_kes', coalesce(me.expenses_kes, 0),
        'net_profit_kes', (coalesce(ms.revenue_kes, 0) - coalesce(mc.cogs_kes, 0)) - coalesce(me.expenses_kes, 0)
      )
      order by m.month_start asc
    ),
    '[]'::jsonb
  )
  into v_monthly_trend
  from months m
  left join m_sales ms on ms.month_start = m.month_start
  left join m_cogs mc on mc.month_start = m.month_start
  left join m_exp me on me.month_start = m.month_start;

  -- 6. Supplier payments out in period (non-reversed)
  select coalesce(sum(sp.amount_kes), 0)::numeric(14,2)
  into v_supplier_payments_out
  from public.supplier_payments sp
  left join public.supplier_payment_reversals r on r.payment_id = sp.id
  where r.id is null
    and sp.payment_date between p_start_date and p_end_date;

  -- 7. Point-in-time total customer receivables & supplier payables
  select coalesce(sum(o.total_kes), 0)::numeric(14,2)
  into v_total_receivables
  from public.orders o
  where o.delivery_status <> 'cancelled'
    and o.payment_status <> 'paid'
    and (p_branch_id is null or o.branch_id = p_branch_id);

  with active_allocs as (
    select
      sp.supplier_id,
      a.invoice_id,
      sum(a.amount_kes)::numeric(14,2) as paid_kes
    from public.supplier_payment_allocations a
    join public.supplier_payments sp on sp.id = a.payment_id
    left join public.supplier_payment_reversals r on r.payment_id = sp.id
    where r.id is null
    group by sp.supplier_id, a.invoice_id
  ),
  inv_credits as (
    select invoice_id, sum(amount_kes)::numeric(14,2) as credited_kes
    from public.supplier_credit_notes
    group by invoice_id
  ),
  opening_due as (
    select coalesce(sum(greatest(0, s.opening_balance_kes - coalesce(aa.paid_kes, 0))), 0)::numeric(14,2) as amt
    from public.suppliers s
    left join active_allocs aa on aa.supplier_id = s.id and aa.invoice_id is null
  ),
  invoice_due as (
    select coalesce(sum(greatest(0, i.total_kes - coalesce(aa.paid_kes, 0) - coalesce(ic.credited_kes, 0))), 0)::numeric(14,2) as amt
    from public.supplier_invoices i
    left join active_allocs aa on aa.invoice_id = i.id
    left join inv_credits ic on ic.invoice_id = i.id
    where i.status = 'posted'
      and (p_branch_id is null or i.branch_id = p_branch_id)
  )
  select (select amt from opening_due) + (select amt from invoice_due)
  into v_total_payables;

  v_gross_profit := coalesce(v_sales.revenue_billed_kes, 0) - coalesce(v_cogs.cogs_kes, 0);
  if coalesce(v_sales.revenue_billed_kes, 0) > 0 then
    v_gross_margin_pct := round((v_gross_profit / v_sales.revenue_billed_kes) * 100, 2);
  end if;
  v_net_profit := v_gross_profit - coalesce(v_expenses_total, 0);

  return jsonb_build_object(
    'start_date', p_start_date,
    'end_date', p_end_date,
    'branch_id', p_branch_id,
    'orders_count', coalesce(v_sales.orders_count, 0),
    'paid_orders_count', coalesce(v_sales.paid_orders_count, 0),
    'unpaid_orders_count', coalesce(v_sales.unpaid_orders_count, 0),
    'revenue_billed_kes', coalesce(v_sales.revenue_billed_kes, 0),
    'revenue_collected_kes', coalesce(v_sales.revenue_collected_kes, 0),
    'revenue_unpaid_kes', coalesce(v_sales.revenue_unpaid_kes, 0),
    'cogs_kes', coalesce(v_cogs.cogs_kes, 0),
    'items_missing_cost_count', coalesce(v_cogs.items_missing_cost_count, 0),
    'total_items_count', coalesce(v_cogs.total_items_count, 0),
    'gross_profit_kes', v_gross_profit,
    'gross_margin_pct', v_gross_margin_pct,
    'expenses_total_kes', coalesce(v_expenses_total, 0),
    'expenses_hq_kes', coalesce(v_expenses_hq, 0),
    'expenses_by_category', coalesce(v_expenses_by_cat, '[]'::jsonb),
    'net_profit_kes', v_net_profit,
    'branch_breakdown', coalesce(v_branch_breakdown, '[]'::jsonb),
    'monthly_trend', coalesce(v_monthly_trend, '[]'::jsonb),
    'cashflow', jsonb_build_object(
      'sales_cash_in_kes', coalesce(v_sales.cash_in_kes, 0),
      'sales_mpesa_in_kes', coalesce(v_sales.mpesa_in_kes, 0),
      'sales_bank_in_kes', coalesce(v_sales.bank_in_kes, 0),
      'total_inflows_kes', coalesce(v_sales.revenue_collected_kes, 0),
      'expenses_out_kes', coalesce(v_expenses_total, 0),
      'supplier_payments_out_kes', coalesce(v_supplier_payments_out, 0),
      'net_cashflow_kes', coalesce(v_sales.revenue_collected_kes, 0) - coalesce(v_expenses_total, 0) - coalesce(v_supplier_payments_out, 0),
      'total_receivables_kes', coalesce(v_total_receivables, 0),
      'total_payables_kes', coalesce(v_total_payables, 0)
    )
  );
end;
$$;

revoke all on function public.get_financial_summary(date, date, uuid) from public, anon;
grant execute on function public.get_financial_summary(date, date, uuid) to authenticated;
