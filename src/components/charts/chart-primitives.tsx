'use client';

import React from 'react';

export function ChartContainer({ title, subtitle, children, action }: { title: string; subtitle?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="overflow-hidden rounded-lg border border-slate-200 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div>
          <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
          {subtitle && <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

export function ChartLoading({ height = 260 }: { height?: number }) {
  return (
    <div className="flex w-full items-center justify-center" style={{ height }} aria-busy="true" aria-live="polite">
      <div className="flex flex-col items-center gap-2 text-slate-500">
        <div className="h-6 w-6 animate-spin rounded-full border-2 border-slate-200 border-t-orange-600" />
        <span className="text-xs font-medium">Loading chart…</span>
      </div>
    </div>
  );
}

export function ChartEmpty({ height = 260, message = 'No data available for the selected period.' }: { height?: number; message?: string }) {
  return (
    <div className="flex w-full items-center justify-center rounded-md border border-dashed border-slate-200 bg-slate-50/50" style={{ height }}>
      <p className="px-4 text-center text-sm text-slate-500">{message}</p>
    </div>
  );
}
