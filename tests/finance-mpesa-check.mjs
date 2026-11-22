import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const target = path.join(root, 'src', specifier.slice(2));
      const candidates = [target, `${target}.ts`, path.join(target, 'index.ts')];
      const filePath = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (filePath) return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    if ((specifier.startsWith('./') || specifier.startsWith('../')) && context.parentURL?.startsWith('file:')) {
      const parentDir = path.dirname(new URL(context.parentURL).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
      const target = path.resolve(parentDir, specifier);
      const candidates = [target, `${target}.ts`, path.join(target, 'index.ts')];
      const filePath = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (filePath) return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const { parseDarajaTransTime, normalizeDarajaPayload, rankMpesaCandidates } = await import('../src/lib/mpesa.ts');
const { getInvoiceAgeDays, getAgingBucket, summarizeReceivablesAging, buildSalesCsv, buildPnlCsv } = await import(
  '../src/lib/finance.ts'
);
const { cutoffDateEAT, cutoffTimeEAT, buildCutoffTimestampEAT, isDateBeforeStockCutoff, buildSaleCreatedAt } =
  await import('../src/lib/stock-cutoff.ts');

// 1. Daraja TransTime parsing (YYYYMMDDHHmmss EAT -> UTC ISO)
const parsedTime = parseDarajaTransTime('20261122143015');
assert.equal(parsedTime, '2026-11-22T11:30:15.000Z');

// 2. Daraja payload normalization
const normalized = normalizeDarajaPayload({
  TransID: '  tk89abc123 ',
  TransTime: '20261122150000',
  TransAmount: '3100.00',
  BusinessShortCode: '600111',
  BillRefNumber: 'INV-44',
  MSISDN: '254712345678',
  FirstName: 'Jane',
  MiddleName: '',
  LastName: 'Wanjiku',
});
assert.ok(normalized);
assert.equal(normalized.trans_id, 'TK89ABC123');
assert.equal(normalized.trans_amount, 3100);
assert.equal(normalized.business_short_code, '600111');
assert.equal(normalized.payer_name, 'Jane Wanjiku');
assert.equal(normalized.bill_ref_number, 'INV-44');

// Invalid payloads return null
assert.equal(normalizeDarajaPayload({ TransID: '', TransAmount: '100', BusinessShortCode: '600111' }), null);
assert.equal(normalizeDarajaPayload({ TransID: 'ABC', TransAmount: '0', BusinessShortCode: '600111' }), null);
assert.equal(normalizeDarajaPayload({ TransID: 'ABC', TransAmount: '500', BusinessShortCode: '' }), null);

// 3. M-Pesa candidate ranking (exact amount -> branch/shared till -> newest, ignores matched/ignored)
const txs = [
  {
    id: 't1',
    trans_id: 'OTHER_AMT_NEW',
    trans_time: '2026-11-22T12:00:00Z',
    trans_amount: 1500,
    business_short_code: '600111',
    branch_id: 'b1',
    status: 'unmatched',
    created_at: '2026-11-22T12:00:00Z',
  },
  {
    id: 't2',
    trans_id: 'EXACT_OTHER_BRANCH',
    trans_time: '2026-11-22T12:05:00Z',
    trans_amount: 3100,
    business_short_code: '600222',
    branch_id: 'b2',
    status: 'unmatched',
    created_at: '2026-11-22T12:05:00Z',
  },
  {
    id: 't3',
    trans_id: 'EXACT_SHARED_TILL',
    trans_time: '2026-11-22T11:55:00Z',
    trans_amount: 3100,
    business_short_code: '600111',
    branch_id: null, // shared till (Kileleshwa & Jamhuri)
    status: 'unmatched',
    created_at: '2026-11-22T11:55:00Z',
  },
  {
    id: 't4',
    trans_id: 'ALREADY_MATCHED',
    trans_time: '2026-11-22T12:10:00Z',
    trans_amount: 3100,
    business_short_code: '600111',
    branch_id: 'b1',
    status: 'matched',
    created_at: '2026-11-22T12:10:00Z',
  },
];

const ranked = rankMpesaCandidates(txs, 3100, 'b1', '600111');
assert.equal(ranked.length, 3); // matched excluded
assert.equal(ranked[0].trans_id, 'EXACT_SHARED_TILL'); // exact amount + shortcode match wins even when branch_id is null
assert.equal(ranked[0].exactAmount, true);
assert.equal(ranked[0].branchMatch, true);
assert.equal(ranked[1].trans_id, 'EXACT_OTHER_BRANCH');
assert.equal(ranked[2].trans_id, 'OTHER_AMT_NEW');

// 4. Receivables aging buckets
const nowMs = new Date('2026-11-22T12:00:00Z').getTime();
assert.equal(getInvoiceAgeDays('2026-11-20T12:00:00Z', nowMs), 2);
assert.equal(getAgingBucket(7), '0-7');
assert.equal(getAgingBucket(14), '8-14');
assert.equal(getAgingBucket(30), '15-30');
assert.equal(getAgingBucket(31), '30+');

const orders = [
  {
    id: 'o1',
    order_number: 'GG-1',
    receipt_number: '001',
    branch_id: 'b1',
    is_pos_walkin: true,
    customer_name: 'Alice, Ltd',
    customer_phone: '+254700111222',
    delivery_status: 'delivered',
    payment_method: 'cash',
    payment_status: 'pending',
    subtotal_kes: 3000,
    delivery_fee_kes: 0,
    total_kes: 3000,
    created_at: '2026-11-20T10:00:00Z', // 2d -> 0-7
    items: [
      {
        id: 'i1',
        order_id: 'o1',
        product_id: 'p1',
        order_type: 'refill',
        outgoing_brand: 'Total',
        cylinder_size_kg: 13,
        quantity: 1,
        unit_price_kes: 3000,
        subtotal_kes: 3000,
      },
    ],
  },
  {
    id: 'o2',
    order_number: 'GG-2',
    branch_id: 'b1',
    is_pos_walkin: false,
    customer_name: 'Bob Hotel',
    customer_phone: '+254700333444',
    delivery_status: 'delivered',
    payment_method: 'mpesa',
    payment_status: 'pending',
    subtotal_kes: 12000,
    delivery_fee_kes: 0,
    total_kes: 12000,
    created_at: '2026-11-10T10:00:00Z', // 12d -> 8-14
  },
  {
    id: 'o3',
    order_number: 'GG-3',
    branch_id: 'b1',
    is_pos_walkin: false,
    customer_name: 'Old Corp',
    customer_phone: '+254700555666',
    delivery_status: 'delivered',
    payment_method: 'bank_transfer',
    payment_status: 'pending',
    subtotal_kes: 45000,
    delivery_fee_kes: 0,
    total_kes: 45000,
    created_at: '2026-10-01T10:00:00Z', // >30d -> 30+
  },
  {
    id: 'o4',
    order_number: 'GG-4',
    branch_id: 'b1',
    is_pos_walkin: true,
    customer_name: 'Paid Customer',
    customer_phone: '+254700777888',
    delivery_status: 'delivered',
    payment_method: 'mpesa',
    payment_status: 'paid',
    subtotal_kes: 2500,
    delivery_fee_kes: 0,
    total_kes: 2500,
    created_at: '2026-11-22T09:00:00Z',
  },
  {
    id: 'o5',
    order_number: 'GG-5',
    branch_id: 'b1',
    is_pos_walkin: true,
    customer_name: 'Cancelled Customer',
    customer_phone: '+254700999000',
    delivery_status: 'cancelled',
    payment_method: 'cash',
    payment_status: 'pending',
    subtotal_kes: 9000,
    delivery_fee_kes: 0,
    total_kes: 9000,
    created_at: '2026-11-22T09:00:00Z',
  },
];

const aging = summarizeReceivablesAging(orders, nowMs);
assert.equal(aging.totalCount, 3);
assert.equal(aging.totalKes, 60000);
assert.equal(aging.buckets['0-7'].total_kes, 3000);
assert.equal(aging.buckets['8-14'].total_kes, 12000);
assert.equal(aging.buckets['15-30'].total_kes, 0);
assert.equal(aging.buckets['30+'].total_kes, 45000);

// 5. CSV builders
const salesCsv = buildSalesCsv(orders);
assert.ok(salesCsv.includes('"Alice, Ltd"'));
assert.ok(salesCsv.includes('1x Total 13kg (refill)'));
assert.ok(salesCsv.includes('cancelled'));

const pnlCsv = buildPnlCsv({
  start_date: '2026-11-01',
  end_date: '2026-11-22',
  branch_id: null,
  orders_count: 10,
  paid_orders_count: 8,
  unpaid_orders_count: 2,
  revenue_billed_kes: 100000,
  revenue_collected_kes: 80000,
  revenue_unpaid_kes: 20000,
  cogs_kes: 60000,
  items_missing_cost_count: 0,
  total_items_count: 15,
  gross_profit_kes: 40000,
  gross_margin_pct: 40,
  expenses_total_kes: 15000,
  expenses_hq_kes: 5000,
  expenses_by_category: [{ category: 'fuel', total_kes: 15000, count: 4 }],
  net_profit_kes: 25000,
  branch_breakdown: [
    {
      branch_id: 'b1',
      branch_name: 'Kileleshwa',
      branch_code: 'KIL-01',
      orders_count: 10,
      revenue_kes: 100000,
      collected_kes: 80000,
      cogs_kes: 60000,
      gross_profit_kes: 40000,
      expenses_kes: 10000,
      net_contribution_kes: 30000,
    },
  ],
  monthly_trend: [],
  cashflow: {
    sales_cash_in_kes: 20000,
    sales_mpesa_in_kes: 60000,
    sales_bank_in_kes: 0,
    total_inflows_kes: 80000,
    expenses_out_kes: 15000,
    supplier_payments_out_kes: 30000,
    net_cashflow_kes: 35000,
    total_receivables_kes: 20000,
    total_payables_kes: 10000,
  },
});
assert.ok(pnlCsv.includes('Gateway Gas Profit & Loss Statement'));
assert.ok(pnlCsv.includes('Bike Fuel'));
assert.ok(pnlCsv.includes('Kileleshwa'));

// 6. Stock cutover helpers (EAT UTC+3)
const cutoffIso = buildCutoffTimestampEAT('2026-11-19', '00:01');
assert.equal(cutoffIso, '2026-11-18T21:01:00.000Z');
assert.equal(cutoffDateEAT(cutoffIso), '2026-11-19');
assert.equal(cutoffTimeEAT(cutoffIso), '00:01');
assert.equal(isDateBeforeStockCutoff('2026-11-18', cutoffIso), true);
assert.equal(isDateBeforeStockCutoff('2026-11-19', cutoffIso), false);
assert.equal(isDateBeforeStockCutoff('2026-11-22', cutoffIso), false);

// Midnight edge case: recording a 2026-11-19 sale at 00:00:30 EAT still lands >= cutoff (00:01 EAT)
const midnightRef = new Date('2026-11-21T21:00:30.000Z'); // 2026-11-22 00:00:30 EAT
const nov19CreatedAt = buildSaleCreatedAt('2026-11-19', cutoffIso, midnightRef);
assert.ok(new Date(nov19CreatedAt).getTime() >= new Date(cutoffIso).getTime());

// Historical 2026-11-18 sale always lands strictly before cutoff
const nov18CreatedAt = buildSaleCreatedAt('2026-11-18', cutoffIso, midnightRef);
assert.ok(new Date(nov18CreatedAt).getTime() < new Date(cutoffIso).getTime());

console.log('M-Pesa normalization/ranking, receivables aging, CSV export, and stock cutover assertions passed.');
