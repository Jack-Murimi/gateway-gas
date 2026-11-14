'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { TrendingUp, Trophy, Package, AlertTriangle, Layers } from 'lucide-react';
import { Branch } from '@/types';
import { SalesTrendPoint, BranchSalesPoint, ProductSalesPoint, StockLevelPoint } from '@/lib/dashboard/aggregates';
import { formatKES, formatKESCompact } from '@/lib/formatters';
import { SalesTrendChart } from './sales-trend-chart';
import { BranchSalesChart } from './branch-sales-chart';
import { ProductSalesDonut } from './product-sales-donut';
import { StockLevelChart } from './stock-level-chart';

type ChartPayload = {
  branches: Pick<Branch, 'id' | 'name' | 'code'>[];
  currentMonth: string;
  monthLabel: string;
  salesTrendDay: SalesTrendPoint[];
  salesTrendMonth: SalesTrendPoint[];
  salesByBranch: BranchSalesPoint[];
  salesByProductByBranch: Record<string, ProductSalesPoint[]>;
  stockLevels: StockLevelPoint[];
};

export function DashboardChartsPanel() {
  const [payload, setPayload] = useState<ChartPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [trendGranularity, setTrendGranularity] = useState<'day' | 'month'>('day');
  const [trendBranch, setTrendBranch] = useState<string | 'all'>('all');
  const [productBranch, setProductBranch] = useState<string | 'all'>('all');
  const [globalBranch, setGlobalBranch] = useState<string | 'all'>('all');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch('/api/dashboard/charts', { cache: 'no-store' });
        if (!res.ok) throw new Error('Failed to load chart data');
        const json = (await res.json()) as ChartPayload;
        if (!cancelled) setPayload(json);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to load charts');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const branches = payload?.branches ?? [];

  // Branch is a filter and a grouping dimension on every chart.
  const trendData = useMemo(() => {
    const base = trendGranularity === 'day' ? payload?.salesTrendDay ?? [] : payload?.salesTrendMonth ?? [];
    const effective = trendBranch;
    if (effective === 'all') return base;
    return base.map((p) => ({ ...p, total: Number(p[effective] || 0) }));
  }, [payload, trendGranularity, trendBranch]);

  const branchSalesData = useMemo(() => {
    const base = payload?.salesByBranch ?? [];
    if (globalBranch === 'all') return base;
    return base.filter((b) => b.branchId === globalBranch);
  }, [payload, globalBranch]);

  const productData = useMemo(() => {
    const map = payload?.salesByProductByBranch;
    if (!map) return [];
    return map[productBranch] ?? map.all ?? [];
  }, [payload, productBranch]);

  const stockData = useMemo(() => {
    const base = payload?.stockLevels ?? [];
    if (globalBranch === 'all') return base;
    return base.filter((s) => s.branchId === globalBranch);
  }, [payload, globalBranch]);

  const glance = useMemo(() => {
    const monthSales = (payload?.salesByBranch ?? []).reduce((sum, b) => sum + b.total, 0);
    const byBranchAll = [...(payload?.salesByBranch ?? [])].sort((a, b) => b.total - a.total);
    const topBranch = byBranchAll[0];
    const activeBranches = byBranchAll.filter((b) => b.total > 0).length;
    const productAll = payload?.salesByProductByBranch?.all ?? [];
    const topProduct = [...productAll].sort((a, b) => b.total - a.total)[0];
    const lowStockCount = (payload?.stockLevels ?? []).filter((s) => s.fullUnits < s.reorderThreshold).length;
    const totalStock = (payload?.stockLevels ?? []).reduce((sum, s) => sum + s.fullUnits, 0);
    const trendBase = payload?.salesTrendDay ?? [];
    const recentTotal = trendBase.reduce((sum, p) => sum + p.total, 0);
    return { monthSales, topBranch, activeBranches, topProduct, lowStockCount, totalStock, recentTotal };
  }, [payload]);

  if (error) {
    return (
      <section className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm text-rose-700">
        {error}
      </section>
    );
  }

  return (
    <section className="space-y-4">
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <div className="flex flex-col gap-3 border-b border-slate-100 bg-gradient-to-r from-slate-950 via-slate-900 to-slate-800 px-4 py-4 text-white sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">At a glance</p>
            <h2 className="mt-0.5 text-lg font-semibold tracking-tight">Sales & stock performance</h2>
            <p className="mt-1 text-sm text-slate-300">
              {globalBranch === 'all' ? 'All branches' : branches.find((b) => b.id === globalBranch)?.name || 'Branch focus'} · {payload?.monthLabel ?? 'Current month'}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-xs font-medium text-slate-300" htmlFor="global-branch-filter">Branch focus</label>
            <select
              id="global-branch-filter"
              value={globalBranch}
              onChange={(e) => {
                const v = e.target.value === 'all' ? 'all' : e.target.value;
                setGlobalBranch(v);
                setTrendBranch(v);
                setProductBranch(v);
              }}
              className="h-9 rounded-md border border-slate-600 bg-slate-800/80 px-2.5 text-xs text-white focus:outline-none focus:ring-2 focus:ring-orange-500"
            >
              <option value="all">All branches</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-px bg-slate-200 lg:grid-cols-5">
          <div className="bg-white p-3.5 sm:p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-emerald-50 text-emerald-600"><TrendingUp className="h-4 w-4" /></span>
              <span className="text-[11px] font-medium uppercase tracking-wide">Month sales</span>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950 tabular-nums">{loading ? '—' : formatKES(glance.monthSales)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Paid, {payload?.monthLabel ?? 'this month'}</p>
          </div>
          <div className="bg-white p-3.5 sm:p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-orange-50 text-orange-600"><Trophy className="h-4 w-4" /></span>
              <span className="text-[11px] font-medium uppercase tracking-wide">Top branch</span>
            </div>
            <p className="mt-2 truncate text-lg font-semibold tracking-tight text-slate-950">{loading ? '—' : (glance.topBranch?.branchName || 'No sales yet')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{loading || !glance.topBranch ? '—' : `${formatKES(glance.topBranch.total)} this month`}</p>
          </div>
          <div className="bg-white p-3.5 sm:p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-50 text-blue-600"><Layers className="h-4 w-4" /></span>
              <span className="text-[11px] font-medium uppercase tracking-wide">Top product</span>
            </div>
            <p className="mt-2 truncate text-lg font-semibold tracking-tight text-slate-950">{loading ? '—' : (glance.topProduct?.name || 'No sales yet')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{loading || !glance.topProduct ? '—' : `${formatKES(glance.topProduct.total)} this month`}</p>
          </div>
          <div className="bg-white p-3.5 sm:p-4">
            <div className="flex items-center gap-2 text-slate-500">
              <span className="flex h-7 w-7 items-center justify-center rounded-md bg-slate-100 text-slate-600"><Package className="h-4 w-4" /></span>
              <span className="text-[11px] font-medium uppercase tracking-wide">Stock on hand</span>
            </div>
            <p className="mt-2 text-xl font-semibold tracking-tight text-slate-950 tabular-nums">{loading ? '—' : glance.totalStock.toLocaleString('en-KE')}</p>
            <p className="mt-0.5 text-xs text-slate-500">Total full units, all branches</p>
          </div>
          <div className="col-span-2 bg-white p-3.5 sm:p-4 lg:col-span-1">
            <div className="flex items-center gap-2 text-slate-500">
              <span className={`flex h-7 w-7 items-center justify-center rounded-md ${glance.lowStockCount > 0 ? 'bg-rose-50 text-rose-600' : 'bg-emerald-50 text-emerald-600'}`}><AlertTriangle className="h-4 w-4" /></span>
              <span className="text-[11px] font-medium uppercase tracking-wide">Stock alerts</span>
            </div>
            <p className={`mt-2 text-xl font-semibold tracking-tight tabular-nums ${glance.lowStockCount > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{loading ? '—' : (glance.lowStockCount > 0 ? `${glance.lowStockCount} below threshold` : 'All healthy')}</p>
            <p className="mt-0.5 text-xs text-slate-500">{loading ? '—' : (glance.lowStockCount > 0 ? 'Branches need restocking' : 'No branches under reorder level')}</p>
          </div>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <SalesTrendChart
          data={trendData}
          branches={branches as Branch[]}
          branchId={trendBranch}
          granularity={trendGranularity}
          onBranchChange={setTrendBranch}
          onGranularityChange={setTrendGranularity}
          loading={loading}
        />
        <BranchSalesChart
          data={branchSalesData}
          monthLabel={payload?.monthLabel ?? 'Current month'}
          loading={loading}
        />
        <ProductSalesDonut
          data={productData}
          branches={branches as Branch[]}
          branchId={productBranch}
          onBranchChange={setProductBranch}
          monthLabel={payload?.monthLabel ?? 'Current month'}
          loading={loading}
        />
        <StockLevelChart data={stockData} loading={loading} />
      </div>
    </section>
  );
}
