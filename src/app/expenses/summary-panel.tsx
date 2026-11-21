'use client';

import React from 'react';
import { formatKES } from '@/lib/formatters';
import {
  CATEGORY_META_MAP,
  type BranchExpenseSummaryRow,
  type CategorySummaryRow,
  type PaymentMethodSummaryRow,
  type StaffSalarySummaryRow,
} from '@/lib/expenses';

interface SummaryPanelProps {
  periodLabel: string;
  categorySummary: CategorySummaryRow[];
  branchSummary: BranchExpenseSummaryRow[];
  paymentSummary: PaymentMethodSummaryRow[];
  salarySummary: StaffSalarySummaryRow[];
}

export function SummaryPanel({
  periodLabel,
  categorySummary,
  branchSummary,
  paymentSummary,
  salarySummary,
}: SummaryPanelProps) {
  return (
    <section className="grid gap-3 md:grid-cols-2">
      {/* Category Breakdown */}
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">By Category</h2>
          <span className="text-[11px] text-slate-500">{periodLabel}</span>
        </div>
        <div className="divide-y divide-slate-100 p-3">
          {categorySummary.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No posted expenses in this period.</p>
          ) : (
            categorySummary.map((row) => {
              const meta = CATEGORY_META_MAP[row.category];
              return (
                <div key={row.category} className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.badgeClass}`}>
                        {meta.shortLabel}
                      </span>
                      <span className="font-semibold text-slate-800">{row.label}</span>
                      <span className="text-[11px] text-slate-400">({row.count})</span>
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="font-bold text-slate-950">{formatKES(row.total_kes)}</span>
                      <span className="ml-1.5 text-[11px] text-slate-500">{row.share_pct.toFixed(0)}%</span>
                    </div>
                  </div>
                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className={`h-full rounded-full ${meta.barClass}`}
                      style={{ width: `${Math.max(2, Math.min(100, row.share_pct))}%` }}
                    />
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Branch Breakdown */}
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">By Branch / HQ</h2>
          <span className="text-[11px] text-slate-500">{periodLabel}</span>
        </div>
        <div className="divide-y divide-slate-100 p-3">
          {branchSummary.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No posted expenses in this period.</p>
          ) : (
            branchSummary.map((row) => (
              <div key={row.branch_id || 'hq'} className="space-y-1.5 py-2.5 first:pt-0 last:pb-0">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">{row.branch_name}</span>
                    <span className="text-[11px] text-slate-400">({row.count})</span>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="font-bold text-slate-950">{formatKES(row.total_kes)}</span>
                    <span className="ml-1.5 text-[11px] text-slate-500">{row.share_pct.toFixed(0)}%</span>
                  </div>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-slate-800"
                    style={{ width: `${Math.max(2, Math.min(100, row.share_pct))}%` }}
                  />
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Staff Salaries Summary */}
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">Salaries by Staff</h2>
          <span className="text-[11px] text-slate-500">{periodLabel}</span>
        </div>
        <div className="overflow-x-auto">
          {salarySummary.length === 0 ? (
            <p className="px-3 py-10 text-center text-xs text-slate-500">No salaries recorded in this period.</p>
          ) : (
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Staff / Payee</th>
                  <th className="px-2.5 py-2">Role</th>
                  <th className="px-2.5 py-2 text-right">Payments</th>
                  <th className="px-3 py-2 text-right">Total Paid</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {salarySummary.map((row) => (
                  <tr key={row.staff_id} className="hover:bg-slate-50">
                    <td className="px-3 py-2 font-semibold text-slate-900">{row.staff_name}</td>
                    <td className="px-2.5 py-2 capitalize text-slate-600">{row.role.replace('_', ' ')}</td>
                    <td className="px-2.5 py-2 text-right tabular-nums text-slate-600">{row.entries}</td>
                    <td className="px-3 py-2 text-right font-bold tabular-nums text-slate-950">
                      {formatKES(row.salary_kes)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Payment Method Breakdown */}
      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">By Payment Method</h2>
          <span className="text-[11px] text-slate-500">For cash & bank reconciliation</span>
        </div>
        <div className="divide-y divide-slate-100 p-3">
          {paymentSummary.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">No posted expenses in this period.</p>
          ) : (
            paymentSummary.map((row) => (
              <div key={row.payment_method} className="flex items-center justify-between gap-2 py-2.5 first:pt-0 last:pb-0 text-xs">
                <div>
                  <p className="font-semibold text-slate-900">{row.label}</p>
                  <p className="text-[11px] text-slate-500">
                    {row.count} transaction{row.count === 1 ? '' : 's'}
                  </p>
                </div>
                <div className="text-right tabular-nums">
                  <p className="font-bold text-slate-950">{formatKES(row.total_kes)}</p>
                  <p className="text-[11px] text-slate-500">{row.share_pct.toFixed(0)}%</p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </section>
  );
}
