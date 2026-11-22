'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Building2,
  Calendar,
  Download,
  Landmark,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Branch, FinancialSummary } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { CATEGORY_META_MAP } from '@/lib/expenses';
import { buildPnlCsv } from '@/lib/finance';
import { formatKES, formatKESCompact } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

type PeriodPreset = 'this_month' | 'last_month' | 'last_30_days' | 'this_quarter' | 'custom';

function toLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function getPresetRange(preset: Exclude<PeriodPreset, 'custom'>): { start: string; end: string } {
  const now = new Date();
  const today = toLocalISODate(now);

  if (preset === 'this_month') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    return { start: toLocalISODate(start), end: today };
  }
  if (preset === 'last_month') {
    const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const end = new Date(now.getFullYear(), now.getMonth(), 0);
    return { start: toLocalISODate(start), end: toLocalISODate(end) };
  }
  if (preset === 'last_30_days') {
    const start = new Date(now);
    start.setDate(start.getDate() - 29);
    return { start: toLocalISODate(start), end: today };
  }
  // this_quarter
  const qMonth = Math.floor(now.getMonth() / 3) * 3;
  const start = new Date(now.getFullYear(), qMonth, 1);
  return { start: toLocalISODate(start), end: today };
}

interface PnlDashboardProps {
  branches: Branch[];
}

export function PnlDashboard({ branches }: PnlDashboardProps) {
  const { showError, showSuccess } = useToast();
  const activeBranches = useMemo(() => branches.filter((b) => b.is_active !== false), [branches]);

  const initialRange = useMemo(() => getPresetRange('this_month'), []);
  const [preset, setPreset] = useState<PeriodPreset>('this_month');
  const [startDate, setStartDate] = useState<string>(initialRange.start);
  const [endDate, setEndDate] = useState<string>(initialRange.end);
  const [branchId, setBranchId] = useState<string>('all');

  const [summary, setSummary] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadSummary = useCallback(async () => {
    if (!startDate || !endDate) return;
    setLoading(true);
    setErrorMsg(null);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc('get_financial_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_branch_id: branchId === 'all' ? null : branchId,
      });
      if (error) throw error;
      const raw = data as FinancialSummary | null;
      if (!raw) {
        setSummary(null);
      } else {
        setSummary({
          ...raw,
          expenses_by_category: Array.isArray(raw.expenses_by_category) ? raw.expenses_by_category : [],
          branch_breakdown: Array.isArray(raw.branch_breakdown) ? raw.branch_breakdown : [],
          monthly_trend: Array.isArray(raw.monthly_trend) ? raw.monthly_trend : [],
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to load financial summary.';
      setErrorMsg(msg);
      showError(msg);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, branchId, showError]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  const handlePresetClick = (next: Exclude<PeriodPreset, 'custom'>) => {
    const range = getPresetRange(next);
    setPreset(next);
    setStartDate(range.start);
    setEndDate(range.end);
  };

  const handleExportCsv = () => {
    if (!summary) return;
    const csv = buildPnlCsv(summary);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gateway-gas-pnl-${summary.start_date}-to-${summary.end_date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showSuccess('Profit & Loss CSV exported.');
  };

  const netMarginPct = useMemo(() => {
    if (!summary || summary.revenue_billed_kes <= 0) return 0;
    return (summary.net_profit_kes / summary.revenue_billed_kes) * 100;
  }, [summary]);

  const collectionRatePct = useMemo(() => {
    if (!summary || summary.revenue_billed_kes <= 0) return 100;
    return (summary.revenue_collected_kes / summary.revenue_billed_kes) * 100;
  }, [summary]);

  return (
    <div className="space-y-5 text-left">
      {/* Controls Bar */}
      <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['this_month', 'This Month'],
                ['last_month', 'Last Month'],
                ['last_30_days', 'Last 30 Days'],
                ['this_quarter', 'This Quarter'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => handlePresetClick(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  preset === key
                    ? 'bg-slate-900 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadSummary()}
              disabled={loading}
              className="font-bold"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleExportCsv}
              disabled={!summary || loading}
              className="font-bold"
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              Export CSV
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-orange-600" /> From Date
            </label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => {
                setPreset('custom');
                setStartDate(e.target.value);
              }}
              className="w-full min-h-[42px] px-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-orange-600" /> To Date
            </label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => {
                setPreset('custom');
                setEndDate(e.target.value);
              }}
              className="w-full min-h-[42px] px-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold focus:border-orange-500 focus:outline-none"
            />
          </div>
          <div>
            <label className="block text-[11px] font-bold text-slate-600 mb-1 flex items-center gap-1">
              <Building2 className="w-3.5 h-3.5 text-orange-600" /> Branch Scope
            </label>
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="w-full min-h-[42px] px-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-bold focus:border-orange-500 focus:outline-none"
            >
              <option value="all">All Branches (Consolidated + HQ)</option>
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {errorMsg && (
        <div className="p-4 rounded-2xl border-2 border-rose-200 bg-rose-50 text-xs font-bold text-rose-800 flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{errorMsg}</span>
        </div>
      )}

      {loading && !summary ? (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            {Array.from({ length: 5 }).map((_, idx) => (
              <Skeleton key={idx} className="h-28 rounded-2xl" />
            ))}
          </div>
          <Skeleton className="h-72 rounded-2xl" />
        </div>
      ) : summary ? (
        <>
          {/* Missing COGS Warning */}
          {summary.items_missing_cost_count > 0 && (
            <div className="p-3.5 rounded-2xl border-2 border-amber-300 bg-amber-50 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-start gap-2.5 text-amber-950">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <span className="font-black">
                    {summary.items_missing_cost_count} of {summary.total_items_count} sold line items have no unit cost.
                  </span>{' '}
                  <span className="font-medium text-amber-900">
                    Gross profit may be overstated until product purchase costs are set in Inventory.
                  </span>
                </div>
              </div>
              <Link
                href="/inventory"
                className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold hover:bg-amber-700 shrink-0"
              >
                Set Product Costs
              </Link>
            </div>
          )}

          {/* Executive KPI Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Billed Revenue</div>
              <div className="text-xl font-black text-slate-900 mt-1">{formatKES(summary.revenue_billed_kes)}</div>
              <div className="text-[11px] text-slate-600 font-semibold mt-1">
                {formatKES(summary.revenue_collected_kes)} paid ({collectionRatePct.toFixed(0)}%)
              </div>
              {summary.revenue_unpaid_kes > 0 && (
                <div className="text-[11px] text-amber-700 font-bold">
                  {formatKES(summary.revenue_unpaid_kes)} unpaid ({summary.unpaid_orders_count})
                </div>
              )}
            </div>

            <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Cost of Goods (COGS)</div>
              <div className="text-xl font-black text-slate-800 mt-1">{formatKES(summary.cogs_kes)}</div>
              <div className="text-[11px] text-slate-500 font-semibold mt-1">
                {summary.orders_count} active orders
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border-2 border-emerald-200 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Gross Profit</div>
              <div className="text-xl font-black text-emerald-700 mt-1">{formatKES(summary.gross_profit_kes)}</div>
              <div className="text-[11px] text-emerald-700 font-bold mt-1">
                {summary.gross_margin_pct.toFixed(1)}% gross margin
              </div>
            </div>

            <div className="p-4 bg-white rounded-2xl border-2 border-rose-200 shadow-sm">
              <div className="text-[11px] font-black uppercase tracking-wider text-rose-700">Operating Expenses</div>
              <div className="text-xl font-black text-rose-700 mt-1">{formatKES(summary.expenses_total_kes)}</div>
              <div className="text-[11px] text-slate-500 font-semibold mt-1">
                {branchId === 'all' && summary.expenses_hq_kes > 0
                  ? `Incl. ${formatKES(summary.expenses_hq_kes)} HQ`
                  : `${summary.expenses_by_category.reduce((s, c) => s + c.count, 0)} posted entries`}
              </div>
            </div>

            <div
              className={`col-span-2 lg:col-span-1 p-4 rounded-2xl border-2 shadow-sm ${
                summary.net_profit_kes >= 0
                  ? 'bg-emerald-50 border-emerald-300'
                  : 'bg-rose-50 border-rose-300'
              }`}
            >
              <div className="text-[11px] font-black uppercase tracking-wider text-slate-700 flex items-center gap-1">
                {summary.net_profit_kes >= 0 ? (
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <TrendingDown className="w-3.5 h-3.5 text-rose-600" />
                )}
                Net Operating Profit
              </div>
              <div
                className={`text-xl font-black mt-1 ${
                  summary.net_profit_kes >= 0 ? 'text-emerald-800' : 'text-rose-800'
                }`}
              >
                {formatKES(summary.net_profit_kes)}
              </div>
              <div className="text-[11px] font-bold text-slate-600 mt-1">
                {netMarginPct.toFixed(1)}% net margin
              </div>
            </div>
          </div>

          {/* 6-Month Trend Chart */}
          <div className="p-4 sm:p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
              <div>
                <h2 className="text-sm font-black text-slate-900">6-Month Revenue, Expenses & Net Profit</h2>
                <p className="text-xs text-slate-500 font-medium">
                  Monthly performance ending {summary.end_date}
                </p>
              </div>
            </div>

            {summary.monthly_trend.length === 0 ? (
              <div className="py-12 text-center text-xs font-bold text-slate-400">
                No trend data available for this period.
              </div>
            ) : (
              <div className="w-full h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={summary.monthly_trend} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="label" tick={{ fontSize: 11, fontWeight: 700, fill: '#475569' }} />
                    <YAxis
                      tickFormatter={(v) => formatKESCompact(Number(v))}
                      tick={{ fontSize: 11, fontWeight: 700, fill: '#64748b' }}
                      width={56}
                    />
                    <Tooltip
                      formatter={(value) => formatKES(Number(value || 0))}
                      contentStyle={{
                        borderRadius: '12px',
                        border: '2px solid #e2e8f0',
                        fontSize: '12px',
                        fontWeight: 700,
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: '12px', fontWeight: 700 }} />
                    <Bar dataKey="revenue_kes" name="Revenue" fill="#0f172a" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Bar dataKey="expenses_kes" name="Op. Expenses" fill="#f97316" radius={[6, 6, 0, 0]} maxBarSize={36} />
                    <Line
                      type="monotone"
                      dataKey="net_profit_kes"
                      name="Net Profit"
                      stroke="#10b981"
                      strokeWidth={3}
                      dot={{ r: 4, fill: '#10b981' }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Cashflow & Working Capital + Operating Expense Breakdown */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Cashflow & Working Capital */}
            <div className="p-4 sm:p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-orange-600" />
                  <h2 className="text-sm font-black text-slate-900">Cashflow & Working Capital</h2>
                </div>
                <span
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-black ${
                    summary.cashflow.net_cashflow_kes >= 0
                      ? 'bg-emerald-100 text-emerald-800'
                      : 'bg-rose-100 text-rose-800'
                  }`}
                >
                  {summary.cashflow.net_cashflow_kes >= 0 ? (
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  ) : (
                    <ArrowDownRight className="w-3.5 h-3.5" />
                  )}
                  Net {formatKES(summary.cashflow.net_cashflow_kes)}
                </span>
              </div>

              <div className="space-y-2 text-xs">
                <div className="text-[11px] font-black uppercase tracking-wider text-emerald-700">Cash Inflows (Paid Sales)</div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>M-Pesa Sales</span>
                  <span className="font-bold text-slate-900">{formatKES(summary.cashflow.sales_mpesa_in_kes)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Cash Sales</span>
                  <span className="font-bold text-slate-900">{formatKES(summary.cashflow.sales_cash_in_kes)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Bank / PDQ / Cheque</span>
                  <span className="font-bold text-slate-900">{formatKES(summary.cashflow.sales_bank_in_kes)}</span>
                </div>
                <div className="flex justify-between pt-1.5 border-t border-slate-100 font-black text-emerald-800">
                  <span>Total Sales Cash In</span>
                  <span>{formatKES(summary.cashflow.total_inflows_kes)}</span>
                </div>
              </div>

              <div className="space-y-2 text-xs pt-1">
                <div className="text-[11px] font-black uppercase tracking-wider text-rose-700">Cash Outflows</div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Operating Expenses Paid</span>
                  <span className="font-bold text-rose-700">-{formatKES(summary.cashflow.expenses_out_kes)}</span>
                </div>
                <div className="flex justify-between font-semibold text-slate-700">
                  <span>Supplier Payments</span>
                  <span className="font-bold text-rose-700">-{formatKES(summary.cashflow.supplier_payments_out_kes)}</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
                <Link
                  href="/sales?tab=unpaid"
                  className="p-3 rounded-xl bg-amber-50 border border-amber-200 hover:border-amber-400 transition-colors"
                >
                  <div className="text-[10px] font-black uppercase text-amber-800">Total Receivables</div>
                  <div className="text-base font-black text-amber-950 mt-0.5">
                    {formatKES(summary.cashflow.total_receivables_kes)}
                  </div>
                  <div className="text-[10px] font-bold text-amber-700">Owed by customers →</div>
                </Link>
                <Link
                  href="/purchases"
                  className="p-3 rounded-xl bg-slate-50 border border-slate-200 hover:border-slate-400 transition-colors"
                >
                  <div className="text-[10px] font-black uppercase text-slate-600">Total Payables</div>
                  <div className="text-base font-black text-slate-900 mt-0.5">
                    {formatKES(summary.cashflow.total_payables_kes)}
                  </div>
                  <div className="text-[10px] font-bold text-slate-600">Owed to suppliers →</div>
                </Link>
              </div>
            </div>

            {/* Expenses by Category */}
            <div className="p-4 sm:p-5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-3">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Landmark className="w-4 h-4 text-orange-600" />
                  <h2 className="text-sm font-black text-slate-900">Operating Expenses by Category</h2>
                </div>
                <Link href="/expenses" className="text-xs font-bold text-orange-600 hover:underline">
                  Manage →
                </Link>
              </div>

              {summary.expenses_by_category.length === 0 ? (
                <div className="py-10 text-center text-xs font-bold text-slate-400">
                  No posted expenses recorded in this period.
                </div>
              ) : (
                <div className="space-y-3">
                  {summary.expenses_by_category.map((row) => {
                    const meta = CATEGORY_META_MAP[row.category];
                    const share = summary.expenses_total_kes > 0 ? (row.total_kes / summary.expenses_total_kes) * 100 : 0;
                    return (
                      <div key={row.category} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="font-bold text-slate-800">
                            {meta?.label || row.category}{' '}
                            <span className="text-slate-400 font-semibold">({row.count})</span>
                          </span>
                          <span className="font-black text-slate-900">
                            {formatKES(row.total_kes)}{' '}
                            <span className="text-slate-400 font-semibold text-[11px]">({share.toFixed(0)}%)</span>
                          </span>
                        </div>
                        <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className={`h-full rounded-full ${meta?.barClass || 'bg-slate-500'}`}
                            style={{ width: `${Math.min(100, Math.max(2, share))}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Per-Branch Profitability Table */}
          <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Building2 className="w-4 h-4 text-orange-600" />
                <h2 className="text-sm font-black text-slate-900">Branch Profitability Breakdown</h2>
              </div>
              {summary.expenses_hq_kes > 0 && branchId === 'all' && (
                <span className="text-[11px] font-bold text-slate-500">
                  Unallocated HQ Expenses: {formatKES(summary.expenses_hq_kes)}
                </span>
              )}
            </div>

            {summary.branch_breakdown.length === 0 ? (
              <div className="p-8 text-center text-xs font-bold text-slate-400">
                No branch activity in this date range.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left">
                  <thead className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wider text-slate-500">
                    <tr>
                      <th className="px-4 py-3 font-black">Branch</th>
                      <th className="px-3 py-3 font-black text-right">Orders</th>
                      <th className="px-3 py-3 font-black text-right">Revenue</th>
                      <th className="px-3 py-3 font-black text-right">COGS</th>
                      <th className="px-3 py-3 font-black text-right">Gross Profit</th>
                      <th className="px-3 py-3 font-black text-right">Direct Expenses</th>
                      <th className="px-4 py-3 font-black text-right">Net Contribution</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {summary.branch_breakdown.map((b) => {
                      const gm = b.revenue_kes > 0 ? (b.gross_profit_kes / b.revenue_kes) * 100 : 0;
                      return (
                        <tr key={b.branch_id} className="hover:bg-slate-50">
                          <td className="px-4 py-3 font-bold text-slate-900">
                            {b.branch_name}{' '}
                            <span className="text-[11px] text-slate-400 font-mono">({b.branch_code})</span>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-700">{b.orders_count}</td>
                          <td className="px-3 py-3 text-right font-bold text-slate-900">{formatKES(b.revenue_kes)}</td>
                          <td className="px-3 py-3 text-right font-semibold text-slate-600">{formatKES(b.cogs_kes)}</td>
                          <td className="px-3 py-3 text-right font-bold text-emerald-700">
                            {formatKES(b.gross_profit_kes)}{' '}
                            <span className="text-[10px] text-slate-400">({gm.toFixed(0)}%)</span>
                          </td>
                          <td className="px-3 py-3 text-right font-semibold text-rose-700">
                            {formatKES(b.expenses_kes)}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-black ${
                              b.net_contribution_kes >= 0 ? 'text-emerald-800' : 'text-rose-800'
                            }`}
                          >
                            {formatKES(b.net_contribution_kes)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      ) : null}
    </div>
  );
}
