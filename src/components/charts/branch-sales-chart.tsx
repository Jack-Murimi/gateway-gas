'use client';

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell, LabelList } from 'recharts';
import { formatKES, formatKESCompact } from '@/lib/formatters';
import { BranchSalesPoint } from '@/lib/dashboard/aggregates';
import { ChartContainer, ChartEmpty, ChartLoading } from './chart-primitives';
import { CHART_AXIS_COLOR, CHART_GRID_COLOR, CHART_TOOLTIP_STYLE, getBranchColor } from './chart-theme';

type Props = {
  data: BranchSalesPoint[];
  monthLabel: string;
  loading?: boolean;
};

export function BranchSalesChart({ data, monthLabel, loading }: Props) {
  const sorted = useMemo(() => [...data].sort((a, b) => b.total - a.total), [data]);
  const total = useMemo(() => sorted.reduce((sum, d) => sum + d.total, 0), [sorted]);
  const hasData = sorted.some((d) => d.total > 0);
  const leader = sorted[0];

  return (
    <ChartContainer
      title="Sales by branch"
      subtitle={hasData ? `Current month (${monthLabel}) · Total ${formatKES(total)}${leader && leader.total > 0 ? ` · Leader: ${leader.branchName}` : ''}` : `Current month (${monthLabel})`}
    >
      {loading ? (
        <ChartLoading height={300} />
      ) : !hasData ? (
        <ChartEmpty height={300} message="No paid sales recorded this month." />
      ) : (
        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={sorted} margin={{ top: 24, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="branchName" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART_GRID_COLOR }} />
              <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={false} tickFormatter={(v) => formatKESCompact(Number(v))} width={52} />
              <Tooltip
                contentStyle={CHART_TOOLTIP_STYLE}
                formatter={(value) => {
                  const v = Number(value ?? 0);
                  const pct = total > 0 ? ((v / total) * 100).toFixed(1) : '0.0';
                  return [`${formatKES(v)} (${pct}%)`, 'Paid sales'];
                }}
                cursor={{ fill: '#f8fafc' }}
              />
              <Bar dataKey="total" name="Sales" radius={[6, 6, 0, 0]} maxBarSize={64}>
                {sorted.map((entry, index) => (
                  <Cell key={entry.branchId} fill={getBranchColor(entry.branchId, index)} />
                ))}
                <LabelList dataKey="total" position="top" formatter={(v) => (Number(v) > 0 ? formatKESCompact(Number(v)) : '')} style={{ fill: '#475569', fontSize: 10, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </ChartContainer>
  );
}
