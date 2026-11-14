'use client';

import React, { useMemo } from 'react';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { formatKES, formatKESCompact } from '@/lib/formatters';
import { Branch } from '@/types';
import { ProductSalesPoint } from '@/lib/dashboard/aggregates';
import { ChartContainer, ChartEmpty, ChartLoading } from './chart-primitives';
import { CHART_TOOLTIP_STYLE, PRODUCT_COLORS } from './chart-theme';

type Props = {
  data: ProductSalesPoint[];
  branches: Branch[];
  branchId: string | 'all';
  onBranchChange: (value: string | 'all') => void;
  monthLabel: string;
  loading?: boolean;
};

export function ProductSalesDonut({ data, branches, branchId, onBranchChange, monthLabel, loading }: Props) {
  const sorted = useMemo(() => [...data].sort((a, b) => b.total - a.total), [data]);
  const hasData = sorted.some((d) => d.total > 0);
  const total = sorted.reduce((sum, d) => sum + d.total, 0);
  const top = sorted.slice(0, 5);

  return (
    <ChartContainer
      title="Sales mix by product / size"
      subtitle={`What sold in ${monthLabel} · Total ${hasData ? formatKES(total) : 'KES 0'}`}
      action={
        <select
          aria-label="Filter by branch"
          value={branchId}
          onChange={(e) => onBranchChange(e.target.value === 'all' ? 'all' : e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
      }
    >
      {loading ? (
        <ChartLoading height={300} />
      ) : !hasData ? (
        <ChartEmpty height={300} message="No paid product sales in this period." />
      ) : (
        <div className="grid h-[300px] grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="relative h-[220px] sm:h-full">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={sorted} dataKey="total" nameKey="name" cx="50%" cy="50%" innerRadius="58%" outerRadius="85%" paddingAngle={2}>
                  {sorted.map((entry, index) => (
                    <Cell key={entry.name} fill={PRODUCT_COLORS[index % PRODUCT_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip contentStyle={CHART_TOOLTIP_STYLE} formatter={(value, name) => [formatKES(Number(value ?? 0)), String(name ?? '')]} />
              </PieChart>
            </ResponsiveContainer>
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
              <span className="text-xs text-slate-500">Total</span>
              <span className="text-lg font-semibold text-slate-900">{formatKESCompact(total)}</span>
            </div>
          </div>
          <div className="flex min-h-0 flex-col justify-center px-1">
            <p className="mb-2 text-[11px] font-medium uppercase tracking-wide text-slate-500">Top contributors</p>
            <ul className="space-y-2 overflow-auto pr-1">
              {top.map((item, index) => {
                const pct = total > 0 ? (item.total / total) * 100 : 0;
                return (
                  <li key={item.name} className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: PRODUCT_COLORS[index % PRODUCT_COLORS.length] }} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate font-medium text-slate-800">{item.name}</span>
                        <span className="shrink-0 tabular-nums text-slate-600">{pct.toFixed(0)}%</span>
                      </div>
                      <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: PRODUCT_COLORS[index % PRODUCT_COLORS.length] }} />
                      </div>
                      <p className="mt-0.5 text-[10px] text-slate-500">{formatKES(item.total)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            {sorted.length > 5 && <p className="mt-2 text-[10px] text-slate-500">+{sorted.length - 5} more categories in tooltip/mix</p>}
          </div>
        </div>
      )}
    </ChartContainer>
  );
}
