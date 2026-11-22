import type { FinancialSummary, Order } from '@/types';
import { CATEGORY_META_MAP } from './expenses';

export type AgingBucket = '0-7' | '8-14' | '15-30' | '30+';

export function getInvoiceAgeDays(createdAt: string, nowMs = Date.now()): number {
  const createdMs = new Date(createdAt).getTime();
  if (Number.isNaN(createdMs)) return 0;
  return Math.max(0, Math.floor((nowMs - createdMs) / 86_400_000));
}

export function getAgingBucket(days: number): AgingBucket {
  if (days <= 7) return '0-7';
  if (days <= 14) return '8-14';
  if (days <= 30) return '15-30';
  return '30+';
}

export function summarizeReceivablesAging(orders: Order[], nowMs = Date.now()) {
  const buckets: Record<AgingBucket, { count: number; total_kes: number }> = {
    '0-7': { count: 0, total_kes: 0 },
    '8-14': { count: 0, total_kes: 0 },
    '15-30': { count: 0, total_kes: 0 },
    '30+': { count: 0, total_kes: 0 },
  };
  let totalCount = 0;
  let totalKes = 0;

  for (const o of orders) {
    if (o.delivery_status === 'cancelled' || o.payment_status === 'paid') continue;
    const days = getInvoiceAgeDays(o.created_at, nowMs);
    const bucket = getAgingBucket(days);
    const amount = Number(o.total_kes || 0);
    buckets[bucket].count += 1;
    buckets[bucket].total_kes += amount;
    totalCount += 1;
    totalKes += amount;
  }

  return { buckets, totalCount, totalKes };
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildSalesCsv(
  orders: Array<Order & { branch_name?: string; sales_rep_name?: string }>,
): string {
  const headers = [
    'Date',
    'Ticket #',
    'Receipt #',
    'Branch',
    'Customer',
    'Phone',
    'Type',
    'Items',
    'Payment Status',
    'Payment Method',
    'Payment Ref',
    'LPO #',
    'Delivery Status',
    'Total (KES)',
    'Cashier',
  ];

  const rows = [headers.map(escapeCsvCell).join(',')];
  for (const o of orders) {
    const itemsSummary = (o.items || [])
      .map((it) => `${it.quantity}x ${it.outgoing_brand}${it.cylinder_size_kg ? ` ${it.cylinder_size_kg}kg` : ''} (${it.order_type})`)
      .join('; ');
    rows.push(
      [
        o.created_at ? new Date(o.created_at).toLocaleString('en-KE') : '',
        o.order_number,
        o.receipt_number || '',
        o.branch_name || o.branch?.name || '',
        o.customer_name,
        o.customer_phone,
        o.is_pos_walkin ? 'Walk-in' : 'Delivery',
        itemsSummary,
        o.delivery_status === 'cancelled' ? 'cancelled' : o.payment_status,
        o.payment_method,
        o.payment_reference || '',
        o.lpo_number || '',
        o.delivery_status,
        Number(o.total_kes || 0).toFixed(2),
        o.sales_rep_name || o.sales_rep?.full_name || '',
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }
  return rows.join('\r\n');
}

export function buildPnlCsv(summary: FinancialSummary): string {
  const rows: string[][] = [
    ['Gateway Gas Profit & Loss Statement'],
    ['Period', `${summary.start_date} to ${summary.end_date}`],
    [],
    ['Line Item', 'Amount (KES)', 'Notes'],
    ['Billed Revenue (Non-Cancelled)', summary.revenue_billed_kes.toFixed(2), `${summary.orders_count} orders`],
    ['Collected Revenue (Paid)', summary.revenue_collected_kes.toFixed(2), `${summary.paid_orders_count} paid orders`],
    ['Unpaid Invoiced Sales', summary.revenue_unpaid_kes.toFixed(2), `${summary.unpaid_orders_count} unpaid orders`],
    ['Cost of Goods Sold (COGS)', (-summary.cogs_kes).toFixed(2), summary.items_missing_cost_count > 0 ? `${summary.items_missing_cost_count} line items missing cost` : 'All items costed'],
    ['Gross Profit', summary.gross_profit_kes.toFixed(2), `${summary.gross_margin_pct.toFixed(1)}% gross margin`],
    [],
    ['Operating Expenses', '', ''],
    ...summary.expenses_by_category.map((cat) => [
      CATEGORY_META_MAP[cat.category]?.label || cat.category,
      (-cat.total_kes).toFixed(2),
      `${cat.count} entries`,
    ]),
    ['Total Operating Expenses', (-summary.expenses_total_kes).toFixed(2), ''],
    ['Net Operating Profit', summary.net_profit_kes.toFixed(2), ''],
    [],
    ['Branch Profitability', 'Revenue (KES)', 'COGS (KES)', 'Gross Profit (KES)', 'Direct Expenses (KES)', 'Net Contribution (KES)'],
    ...summary.branch_breakdown.map((b) => [
      b.branch_name,
      b.revenue_kes.toFixed(2),
      b.cogs_kes.toFixed(2),
      b.gross_profit_kes.toFixed(2),
      b.expenses_kes.toFixed(2),
      b.net_contribution_kes.toFixed(2),
    ]),
  ];

  return rows.map((row) => row.map(escapeCsvCell).join(',')).join('\r\n');
}
