'use client';

import React, { useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, Cell, LabelList } from 'recharts';
import { StockLevelPoint } from '@/lib/dashboard/aggregates';
import { ChartContainer, ChartEmpty, ChartLoading } from './chart-primitives';
import { CHART_AXIS_COLOR, CHART_GRID_COLOR, CHART_TOOLTIP_STYLE, getBranchColor } from './chart-theme';

type Props = {
  data: StockLevelPoint[];
  loading?: boolean;
};

export function StockLevelChart({ data, loading }: Props) {
  const hasData = data.length > 0;
  const threshold = data[0]?.reorderThreshold ?? 0;
  const below = useMemo(() => data.filter((d) => d.fullUnits < d.reorderThreshold), [data]);
  const lowest = useMemo(() => (data.length ? [...data].sort((a, b) => a.fullUnits - b.fullUnits)[0] : null), [data]);

  return (
    <ChartContainer
      title="Stock vs reorder threshold"
      subtitle={
        hasData
          ? `${below.length > 0 ? `${below.length} branch${below.length === 1 ? '' : 'es'} below threshold` : 'All branches above threshold'} · Threshold ${threshold.toLocaleString('en-KE')} units${lowest ? ` · Lowest: ${lowest.branchName}` : ''}`
          : 'Total full units on hand vs reorder threshold'
      }
    >
      {loading ? (
        <ChartLoading height={300} />
      ) : !hasData ? (
        <ChartEmpty height={300} message="No inventory data available." />
      ) : (
        <div className="w-full">
          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data} margin={{ top: 20, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={CHART_GRID_COLOR} strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="branchName" tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART_GRID_COLOR }} />
                <YAxis tick={{ fill: CHART_AXIS_COLOR, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                <Tooltip
                  contentStyle={CHART_TOOLTIP_STYLE}
                  formatter={(value, name) => {
                    const v = Number(value ?? 0);
                    const label = String(name) === 'fullUnits' ? 'Full units' : 'Reorder threshold';
                    return [v.toLocaleString('en-KE'), label];
                  }}
                  cursor={{ fill: '#f8fafc' }}
                />
                <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} />
                <Bar dataKey="reorderThreshold" name="Reorder threshold" fill="#e2e8f0" radius={[4, 4, 0, 0]} maxBarSize={28} />
                <Bar dataKey="fullUnits" name="Full units" radius={[4, 4, 0, 0]} maxBarSize={28}>
                  {data.map((entry, index) => {
                    const isBelow = entry.fullUnits < entry.reorderThreshold;
                    return <Cell key={entry.branchId} fill={isBelow ? '#ef4444' : getBranchColor(entry.branchId, index)} />;
                  })}
                  <LabelList dataKey="fullUnits" position="top" formatter={(v) => Number(v).toLocaleString('en-KE')} style={{ fill: '#475569', fontSize: 10, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
          {below.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {below.map((b) => (
                <span key={b.branchId} className="inline-flex items-center rounded-full bg-rose-50 px-2 py-0.5 text-[10px] font-medium text-rose-700 ring-1 ring-inset ring-rose-600/20">
                  {b.branchName}: {b.fullUnits.toLocaleString('en-KE')} / {b.reorderThreshold.toLocaleString('en-KE')}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </ChartContainer>
  );
}
