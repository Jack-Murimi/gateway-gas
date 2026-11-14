'use client';

import React, { useMemo } from 'react';
import { AreaChart, Area, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { formatKES, formatKESCompact } from '@/lib/formatters';
import { Branch } from '@/types';
import { SalesTrendPoint } from '@/lib/dashboard/aggregates';
import { ChartContainer, ChartEmpty, ChartLoading } from './chart-primitives';
import { CHART_AXIS_COLOR, CHART_GRID_COLOR, CHART_TOOLTIP_STYLE, getBranchColor } from './chart-theme';

type Props = {
  data: SalesTrendPoint[];
  branches: Branch[];
  branchId: string | 'all';
  granularity: 'day' | 'month';
  onBranchChange: (value: string | 'all') => void;
  onGranularityChange: (value: 'day' | 'month') => void;
  loading?: boolean;
};

export function SalesTrendChart({ data, branches, branchId, granularity, onBranchChange, onGranularityChange, loading }: Props) {
  const hasData = data.some((d) => d.total > 0);
  const showBranches = branchId === 'all' ? branches : branches.filter((b) => b.id === branchId);
  const periodTotal = useMemo(() => data.reduce((sum, d) => sum + (d.total || 0), 0), [data]);
  const peak = useMemo(() => data.reduce((m, d) => Math.max(m, d.total || 0), 0), [data]);

  return (
    <ChartContainer
      title="Sales trend"
      subtitle={`${granularity === 'day' ? 'Daily' : 'Monthly'} paid sales · Period total ${formatKES(periodTotal)}${peak > 0 ? ` · Peak ${formatKESCompact(peak)}` : ''}`}
      action={
        <div className="flex flex-wrap items-center gap-2">
          <select
            aria-label="Time period"
            value={granularity}
            onChange={(e) => onGranularityChange(e.target.value as 'day' | 'month')}
            className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-orange-500"
          >
            <option value="day">Daily (14d)</option>
            <option value="month">Monthly (6m)</option>
          </select>
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
        </div>
      }
    >
      {loading ? (
        <ChartLoading height={300} />
      ) : !hasData ? (
        <ChartEmpty height={300} message="No paid sales in this period. Sales will appear here as orders are paid." />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <defs>
                {showBranches.map((b, i) => {
                  const c = getBranchColor(b.id, i);
                  return (
                    <linearGradient key={b.id} id={`grad-${b.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={c} stopOpacity={0.25} />
                      <stop offset="95%" stopColor={c} stopOpacity={0.02} />
                    </linearGradient>
                  );
                })}
                <linearGradient id="grad-total" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={getBranchColor(showBranches[0]?.id || '', 0)} stopOpacity={0.25} />
                  <stop offset="95%" stopColor={getBranchColor(showBranches[0]?.id || '', 0)} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART_GRID_COLOR }} minTickGap={20} />
              <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatKESCompact(Number(v))} width={52} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value, name) => [formatKES(Number(value ?? 0)), String(name) === 'total' ? 'Total' : branches.find((b) => b.id === String(name))?.name || String(name)]}
                labelStyle={{ color: '#334155', fontWeight: 600 }}
              />
              {branchId === 'all' ? (
                showBranches.map((b, i) => (
                  <Area key={b.id} type="monotone" dataKey={b.id} name={b.name} stroke={getBranchColor(b.id, i)} fill={`url(#grad-${b.id})`} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
                ))
              ) : (
                <Area type="monotone" dataKey="total" name={showBranches[0]?.name || 'Sales'} stroke={getBranchColor(showBranches[0]?.id || '', 0)} fill="url(#grad-total)" strokeWidth={2.5} dot={{ r: 2 }} activeDot={{ r: 5 }} />
              )}
              <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartContainer>
  );
}
