'use client';

import React, { Fragment, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeftRight, Building2, Search, X, Package, Flame, Droplets } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import { compareProducts, groupProducts } from '@/lib/product-order';
import { createClient } from '@/lib/supabase/client';
import { Skeleton } from '@/components/ui/skeleton';
import type { Product } from '@/types';
import { StockSheet } from './stock-sheet';
import { StockAudit } from './stock-audit';

type Tab = 'stock' | 'daily' | 'adjustment' | 'initial' | 'audit';
type Stock = { full: number; empty: number };
type Category = 'all' | 'cylinder' | 'water' | 'accessory';
const EDIT_ROLES = ['admin', 'director', 'operator'];
const ZERO: Stock = { full: 0, empty: 0 };
const keyOf = (branchId: string, productId: string) => `${branchId}:${productId}`;


type ProductCost = {
  product_id: string;
  refill_cost_kes: number | null;
  complete_cost_kes: number | null;
  unit_cost_kes: number | null;
};

const formatCost = (value: number | null | undefined) =>
  value === null || value === undefined ? <span className="text-slate-300">—</span> : <strong className="font-semibold tabular-nums text-slate-800">{formatKES(value)}</strong>;

function stockStatus(product: Product, stock: Stock) {
  if (stock.full <= 0) return 'Out of stock';
  if (product.category === 'cylinder' && stock.full <= 5) return 'Low stock';
  return 'In stock';
}

export default function InventoryPage() {
  const router = useRouter();
  const { currentUser, branches, products, inventory, refreshLiveData } = useStore();
  const { showError } = useToast();
  const [tab, setTab] = useState<Tab>('stock');
  const [branchId, setBranchId] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [brand, setBrand] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [sort, setSort] = useState('group');
  const [productCosts, setProductCosts] = useState<Record<string, ProductCost>>({});
  const [loadingCosts, setLoadingCosts] = useState(false);

  const approved = currentUser?.approval_status === 'approved';
  const canEdit = approved && !!currentUser && EDIT_ROLES.includes(currentUser.role);
  const canViewCost = approved && !!currentUser && ['admin', 'director'].includes(currentUser.role);
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches]);
  const stockMap = useMemo(() => {
    const map = new Map<string, Stock>();
    inventory.forEach(r => map.set(keyOf(r.branch_id, r.product_id), { full: r.full_units ?? 0, empty: r.empty_units ?? 0 }));
    return map;
  }, [inventory]);
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand))).sort(), [products]);
  useEffect(() => {
    let active = true;
    if (!canViewCost) {
      setProductCosts({});
      setLoadingCosts(false);
      return () => { active = false; };
    }
    setLoadingCosts(true);
    const supabase = createClient();
    void supabase.from('product_costs')
      .select('product_id, refill_cost_kes, complete_cost_kes, unit_cost_kes')
      .then(({ data, error }) => {
        if (!active) return;
        setLoadingCosts(false);
        if (error) {
          console.error('Could not load product costs:', error.message);
          showError('Could not load cost prices. Refresh and try again.');
          return;
        }
        const next: Record<string, ProductCost> = {};
        (data ?? []).forEach(row => {
          next[row.product_id] = {
            product_id: row.product_id,
            refill_cost_kes: row.refill_cost_kes === null ? null : Number(row.refill_cost_kes),
            complete_cost_kes: row.complete_cost_kes === null ? null : Number(row.complete_cost_kes),
            unit_cost_kes: row.unit_cost_kes === null ? null : Number(row.unit_cost_kes),
          };
        });
        setProductCosts(next);
      });
    return () => { active = false; };
  }, [canViewCost, showError]);

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const result = products.filter(p => {
      if (category !== 'all' && p.category !== category) return false;
      if (brand !== 'all' && p.brand !== brand) return false;
      return !q || `${p.name} ${p.brand} ${p.size_kg ?? ''} ${p.category}`.toLowerCase().includes(q);
    }).map(product => {
      const branchStocks = branches.map(b => stockMap.get(keyOf(b.id, product.id)) ?? ZERO);
      const stock = branchId === 'all'
        ? branchStocks.reduce((sum, s) => ({ full: sum.full + s.full, empty: sum.empty + s.empty }), { ...ZERO })
        : stockMap.get(keyOf(branchId, product.id)) ?? ZERO;
      const status = stockStatus(product, stock);
      return { product, stock, status };
    }).filter(row => !lowOnly || row.status !== 'In stock');

    result.sort((a, b) => {
      if (sort === 'stock-low') return (a.stock.full + a.stock.empty) - (b.stock.full + b.stock.empty);
      if (sort === 'stock-high') return (b.stock.full + b.stock.empty) - (a.stock.full + a.stock.empty);
      if (sort === 'name') return a.product.name.localeCompare(b.product.name);
      return compareProducts(a.product, b.product);
    });
    return result;
  }, [products, branches, stockMap, branchId, search, category, brand, lowOnly, sort]);

  const groupedRows = useMemo(
    () => (sort === 'group' ? groupProducts(rows, r => r.product) : [{ key: 'all', label: '', items: rows }]),
    [rows, sort]
  );

  const clearFilters = () => { setSearch(''); setCategory('all'); setBrand('all'); setLowOnly(false); setSort('group'); };
  const activeBranch = branchMap.get(branchId);

  if (!approved) return <div className="mx-auto max-w-md px-4 py-20 text-center">
    <h2 className="text-xl font-bold text-slate-900">Restricted inventory</h2>
    <p className="mt-1 text-sm text-slate-500">Sign in with an approved staff profile to view stock.</p>
  </div>;

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: 'stock', label: 'Stock' },
    { id: 'daily', label: 'Daily count' },
    { id: 'adjustment', label: 'Adjust all' },
    { id: 'initial', label: 'Initial stock' },
    { id: 'audit', label: 'Audit trail' },
  ];

  return <main className="mx-auto max-w-[1440px] space-y-2 px-2 pb-24 pt-2 sm:px-4 lg:px-5">
    <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-sm font-bold text-slate-950">Inventory</h1>
        <nav aria-label="Inventory navigation" className="flex gap-0.5 overflow-x-auto rounded bg-slate-100 p-0.5">
          {tabs.map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id)}
              className={`h-7 shrink-0 rounded px-2.5 text-xs font-semibold transition ${tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'}`}
            >
              {item.label}
            </button>
          ))}
        </nav>
      </div>
      <Link href="/inventory/transfers" className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
        <ArrowLeftRight className="h-3.5 w-3.5 text-orange-600" /> Transfers
      </Link>
    </header>

    {(tab === 'daily' || tab === 'adjustment' || tab === 'initial') && (
      <StockSheet
        mode={tab}
        branches={branches}
        branchId={branchId}
        onBranchChange={setBranchId}
        products={products}
        inventory={inventory}
        canEdit={canEdit}
        onApplied={refreshLiveData}
      />
    )}

    {tab === 'audit' && (
      <StockAudit branches={branches} branchId={branchId} onBranchChange={setBranchId} />
    )}

    {tab === 'stock' && <>
    <section className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2">
      <div className="relative min-w-[180px] flex-1">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or brands…" aria-label="Search products"
          className="h-8 w-full rounded border border-slate-300 bg-white pl-8 pr-7 text-xs text-slate-900 outline-none transition focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30" />
        {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>}
      </div>
      <label className="flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2 text-xs text-slate-500">
        <Building2 className="h-3.5 w-3.5 shrink-0" /><span className="sr-only">Branch</span>
        <select value={branchId} onChange={e => setBranchId(e.target.value)} aria-label="Filter by branch" className="bg-transparent text-xs font-semibold text-slate-800 outline-none">
          <option value="all">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
      </label>
      <select value={category} onChange={e => setCategory(e.target.value as Category)} aria-label="Filter by category" className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none">
        <option value="all">All products</option><option value="cylinder">Gas</option><option value="water">Water</option><option value="accessory">Accessories</option>
      </select>
      <select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Filter by brand" className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none">
        <option value="all">All brands</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}
      </select>
      <button type="button" onClick={() => setLowOnly(v => !v)} aria-pressed={lowOnly}
        className={`h-8 rounded border px-2.5 text-xs font-semibold transition ${lowOnly ? 'border-amber-300 bg-amber-50 text-amber-800' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
        Low / out
      </button>
      <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort stock" className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none">
        <option value="group">Grouped</option><option value="name">Name A–Z</option><option value="stock-low">Lowest stock</option><option value="stock-high">Highest stock</option>
      </select>
      {(search || category !== 'all' || brand !== 'all' || lowOnly || sort !== 'group') && <button type="button" onClick={clearFilters} className="h-8 px-1.5 text-xs font-semibold text-orange-700 hover:underline">Clear</button>}
    </section>

    <section className="space-y-3 md:hidden">
      {groupedRows.map(group => (
        <Fragment key={group.key}>
          {group.label && (
            <div className="flex items-center justify-between rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
              <span>{group.label}</span>
              <span className="text-[11px] font-semibold tabular-nums text-slate-500">{group.items.length}</span>
            </div>
          )}
          {group.items.map(({ product: p, stock, status }) => {
        const returnable = hasEmptyState(p);
        const meta = p.category === 'cylinder' ? { Icon: Flame, color: 'bg-orange-50 text-orange-700' } : p.category === 'water' ? { Icon: Droplets, color: 'bg-sky-50 text-sky-700' } : { Icon: Package, color: 'bg-violet-50 text-violet-700' };
        const Icon = meta.Icon;
        const total = stock.full + (returnable ? stock.empty : 0);
        const statusStyle = status === 'In stock' ? 'bg-emerald-50 text-emerald-700' : status === 'Low stock' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700';
        return <article
          key={p.id}
          onDoubleClick={() => router.push(`/inventory/products/${p.id}`)}
          title="Double-click to open product details"
          className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition hover:border-orange-300"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${meta.color}`}><Icon className="h-5 w-5" /></span>
              <span className="min-w-0"><span className="block break-words text-sm font-semibold text-slate-900">{p.name}</span><span className="block text-xs text-slate-500">{p.brand}{p.size_kg ? ` · ${p.size_kg}kg` : ''}</span></span>
            </div>
            <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-semibold ${statusStyle}`}>{status}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2.5 text-xs">
            <div><p className="text-[10px] uppercase tracking-wide text-slate-500">Selling price</p>
              {p.category === 'cylinder' ? <div className="mt-1 space-y-0.5"><p>Refill <strong className="text-slate-900">{formatKES(p.refill_price_kes)}</strong></p><p>New <strong className="text-slate-900">{formatKES(p.complete_price_kes)}</strong></p></div> : <strong className="mt-1 block text-slate-900">{formatKES(p.accessory_price_kes || p.complete_price_kes)}</strong>}
            </div>
            <div className="text-right"><p className="text-[10px] uppercase tracking-wide text-slate-500">Total stock</p><strong className="mt-1 block text-lg tabular-nums text-slate-900">{total.toLocaleString()}</strong></div>
          </div>
          {canViewCost && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3 text-xs">
            <span className="font-medium text-slate-500">Cost price</span>
            {loadingCosts ? <Skeleton className="h-3.5 w-20 rounded" /> : p.category === 'cylinder' ? <div className="flex flex-wrap justify-end gap-3"><span className="text-slate-500">Refill {formatCost(productCosts[p.id]?.refill_cost_kes)}</span><span className="text-slate-500">New {formatCost(productCosts[p.id]?.complete_cost_kes)}</span></div> : formatCost(productCosts[p.id]?.unit_cost_kes)}
          </div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">Remaining stock</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">Filled <strong className="min-w-6 text-right text-sm font-semibold tabular-nums text-slate-900">{stock.full.toLocaleString()}</strong></span>
              {returnable && <span className="inline-flex items-center gap-1 text-xs text-slate-500">Empty <strong className="min-w-6 text-right text-sm font-semibold tabular-nums text-slate-900">{stock.empty.toLocaleString()}</strong></span>}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500"><span>{activeBranch?.name ?? 'All branches'}</span><span>{branchId === 'all' ? 'Combined branches' : 'View only'}</span></div>
        </article>;
          })}
        </Fragment>
      ))}
      {rows.length === 0 && <div className="rounded-xl border border-slate-200 bg-white px-4 py-12 text-center"><p className="font-semibold text-slate-800">No matching products</p><p className="mt-1 text-xs text-slate-500">Try changing your search or filters.</p></div>}
      {rows.length > 0 && <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-bold text-slate-800"><span>Total stock</span><span className="tabular-nums">{rows.reduce((sum, row) => sum + row.stock.full + (hasEmptyState(row.product) ? row.stock.empty : 0), 0).toLocaleString()}</span></div>}
      <div className="flex items-center justify-between px-1 text-xs text-slate-500"><span>{rows.length} products</span><span>{branchId === 'all' ? 'All branches combined' : activeBranch?.code}</span></div>
    </section>

    <section className="hidden overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm md:block">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Product</th>
              {canViewCost && <th className="px-3 py-3 text-right">Cost</th>}
              <th className="px-3 py-3">Selling price</th>
              <th className="px-3 py-3">Remaining stock</th>
              <th className="px-3 py-3">Branch</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {groupedRows.map(group => (
              <Fragment key={group.key}>
                {group.label && (
                  <tr className="bg-slate-100/90">
                    <td colSpan={canViewCost ? 6 : 5} className="px-4 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                      <span className="flex items-center justify-between">
                        <span>{group.label}</span>
                        <span className="text-[10px] font-semibold tabular-nums text-slate-500">{group.items.length}</span>
                      </span>
                    </td>
                  </tr>
                )}
                {group.items.map(({ product: p, stock }) => {
                  const returnable = hasEmptyState(p);
                  const meta = p.category === 'cylinder' ? { Icon: Flame, color: 'bg-orange-50 text-orange-700' } : p.category === 'water' ? { Icon: Droplets, color: 'bg-sky-50 text-sky-700' } : { Icon: Package, color: 'bg-violet-50 text-violet-700' };
                  const Icon = meta.Icon;
                  const total = stock.full + (returnable ? stock.empty : 0);
                  const selling = p.category === 'cylinder'
                    ? <div className="space-y-0.5"><div>Refill <strong className="text-slate-900">{formatKES(p.refill_price_kes)}</strong></div><div>New <strong className="text-slate-900">{formatKES(p.complete_price_kes)}</strong></div></div>
                    : <strong className="text-slate-900">{formatKES(p.accessory_price_kes || p.complete_price_kes)}</strong>;
                  return <tr
                    key={p.id}
                    onDoubleClick={() => router.push(`/inventory/products/${p.id}`)}
                    title="Double-click to open product details"
                    className="cursor-pointer select-none transition-colors hover:bg-orange-50/50"
                  >
                    <td className="px-4 py-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.color}`}><Icon className="h-4 w-4" /></span>
                        <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{p.name}</span><span className="block truncate text-xs text-slate-500">{p.brand}{p.size_kg ? ` · ${p.size_kg}kg` : ''}</span></span>
                      </div>
                    </td>
                    {canViewCost && <td className="px-3 py-3 text-right text-xs">
                      {loadingCosts ? (
                        <div className="space-y-1">
                          <Skeleton className="ml-auto h-3.5 w-16 rounded" />
                          {p.category === 'cylinder' && <Skeleton className="ml-auto h-3.5 w-14 rounded" />}
                        </div>
                      ) : p.category === 'cylinder' ? <div className="space-y-0.5">
                        <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] text-slate-400">Refill</span>{formatCost(productCosts[p.id]?.refill_cost_kes)}</div>
                        <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] text-slate-400">New</span>{formatCost(productCosts[p.id]?.complete_cost_kes)}</div>
                      </div> : formatCost(productCosts[p.id]?.unit_cost_kes)}
                    </td>}
                    <td className="px-3 py-3 text-xs text-slate-600">{selling}</td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span className="w-9">Filled</span><strong className="min-w-7 text-right text-sm font-semibold tabular-nums text-slate-900">{stock.full.toLocaleString()}</strong></span>
                        {returnable && <span className="inline-flex items-center gap-1.5 text-xs text-slate-500"><span>Empty</span><strong className="min-w-7 text-right text-sm font-semibold tabular-nums text-slate-900">{stock.empty.toLocaleString()}</strong></span>}
                      </div>
                    </td>
                    <td className="px-3 py-3 text-xs font-medium text-slate-600">{activeBranch?.name ?? 'All branches'}</td>
                    <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{total.toLocaleString()}</td>
                  </tr>;
                })}
              </Fragment>
            ))}
            {rows.length === 0 && <tr><td colSpan={canViewCost ? 6 : 5} className="px-4 py-14 text-center"><p className="font-semibold text-slate-800">No matching products</p><p className="mt-1 text-xs text-slate-500">Try changing your search or filters.</p></td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold text-slate-900">
            <td colSpan={canViewCost ? 5 : 4} className="px-4 py-3 text-right">Total stock</td>
            <td className="px-4 py-3 text-right tabular-nums">{rows.reduce((sum, row) => sum + row.stock.full + (hasEmptyState(row.product) ? row.stock.empty : 0), 0).toLocaleString()}</td>
          </tr></tfoot>}
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        <span>{rows.length} products</span><span>{branchId === 'all' ? 'All branches combined' : activeBranch?.code}</span>
      </div>
    </section>
    </>}
  </main>;
}
