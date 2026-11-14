'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Building2, Search, SlidersHorizontal, X, Minus, Plus, Package, Flame, Droplets } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import type { Product } from '@/types';

type Stock = { full: number; empty: number };
type Category = 'all' | 'cylinder' | 'water' | 'accessory';
const EDIT_ROLES = ['admin', 'director', 'operator'];
const ZERO: Stock = { full: 0, empty: 0 };
const keyOf = (branchId: string, productId: string) => `${branchId}:${productId}`;

function CountControl({ value, disabled, onSave, label }: {
  value: number; disabled: boolean; onSave: (value: number) => void; label: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  if (editing && !disabled) {
    return <input autoFocus type="number" min="0" value={draft} aria-label={label}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { const n = Number(draft); if (Number.isInteger(n) && n >= 0 && n !== value) onSave(n); setEditing(false); }}
      onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { setDraft(String(value)); setEditing(false); } }}
      className="h-8 w-16 rounded-lg border border-orange-300 bg-white px-2 text-center text-sm font-semibold tabular-nums outline-none focus:ring-2 focus:ring-orange-500" />;
  }
  return <button type="button" disabled={disabled} onClick={() => { setDraft(String(value)); setEditing(true); }}
    title={disabled ? label : `Edit ${label}`}
    className="min-w-8 rounded-md px-1.5 py-1 text-sm font-semibold tabular-nums text-slate-900 hover:bg-orange-50 disabled:cursor-default">
    {value.toLocaleString()}
  </button>;
}

function stockStatus(product: Product, stock: Stock) {
  if (stock.full <= 0) return 'Out of stock';
  if (product.category === 'cylinder' && stock.full <= 5) return 'Low stock';
  return 'In stock';
}

export default function InventoryPage() {
  const { currentUser, branches, products, inventory, updateBranchStock } = useStore();
  const { showError, showSuccess } = useToast();
  const [branchId, setBranchId] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [brand, setBrand] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [sort, setSort] = useState('name');

  const approved = currentUser?.approval_status === 'approved';
  const canEdit = approved && !!currentUser && EDIT_ROLES.includes(currentUser.role);
  const branchMap = useMemo(() => new Map(branches.map(b => [b.id, b])), [branches]);
  const stockMap = useMemo(() => {
    const map = new Map<string, Stock>();
    inventory.forEach(r => map.set(keyOf(r.branch_id, r.product_id), { full: r.full_units ?? 0, empty: r.empty_units ?? 0 }));
    return map;
  }, [inventory]);
  const brands = useMemo(() => Array.from(new Set(products.map(p => p.brand))).sort(), [products]);

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
      return a.product.name.localeCompare(b.product.name);
    });
    return result;
  }, [products, branches, stockMap, branchId, search, category, brand, lowOnly, sort]);

  const updateCount = (productId: string, unit: 'full' | 'empty', next: number) => {
    if (branchId === 'all') {
      showError('Select a branch before adjusting stock.');
      return;
    }
    if (!canEdit) {
      showError('You do not have permission to adjust stock.');
      return;
    }
    const current = stockMap.get(keyOf(branchId, productId)) ?? ZERO;
    const delta = Math.max(0, Math.min(99999, next)) - current[unit];
    if (!delta) return;
    updateBranchStock(branchId, productId, unit === 'full' ? delta : 0, unit === 'empty' ? delta : 0);
    showSuccess('Stock update submitted.');
  };

  const clearFilters = () => { setSearch(''); setCategory('all'); setBrand('all'); setLowOnly(false); setSort('name'); };
  const activeBranch = branchMap.get(branchId);

  if (!approved) return <div className="mx-auto max-w-md px-4 py-20 text-center">
    <h2 className="text-xl font-bold text-slate-900">Restricted inventory</h2>
    <p className="mt-1 text-sm text-slate-500">Sign in with an approved staff profile to view stock.</p>
  </div>;

  return <main className="mx-auto max-w-7xl space-y-4 px-4 pb-24 pt-5 sm:px-6 lg:px-8">
    <header className="flex flex-wrap items-center justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Stock</h1>
        <p className="mt-1 text-sm text-slate-500">One clear list of products and available quantities.</p>
      </div>
      <Link href="/inventory/transfers" className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50">
        <ArrowLeftRight className="h-4 w-4 text-orange-600" /> Stock transfers
      </Link>
    </header>

    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or brands…" aria-label="Search products"
            className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100" />
          {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-200"><X className="h-4 w-4" /></button>}
        </div>
        <label className="flex h-10 shrink-0 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500">
          <Building2 className="h-4 w-4" />
          <span className="sr-only">Branch</span>
          <select value={branchId} onChange={e => setBranchId(e.target.value)} aria-label="Filter by branch" className="max-w-[190px] bg-transparent text-sm font-semibold text-slate-800 outline-none">
            <option value="all">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        <label className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-2.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
          <SlidersHorizontal className="h-3.5 w-3.5" />
          <select value={category} onChange={e => setCategory(e.target.value as Category)} aria-label="Filter by category" className="bg-transparent text-xs font-semibold text-slate-700 outline-none">
            <option value="all">All products</option><option value="cylinder">Gas</option><option value="water">Water</option><option value="accessory">Accessories</option>
          </select>
        </label>
        <select value={brand} onChange={e => setBrand(e.target.value)} aria-label="Filter by brand" className="h-9 rounded-lg bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 outline-none">
          <option value="all">All brands</option>{brands.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        <button type="button" onClick={() => setLowOnly(v => !v)} aria-pressed={lowOnly}
          className={`h-9 rounded-lg px-3 text-xs font-semibold ring-1 transition ${lowOnly ? 'bg-amber-50 text-amber-800 ring-amber-300' : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'}`}>
          Low / out of stock
        </button>
        <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort stock" className="h-9 rounded-lg bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 outline-none">
          <option value="name">Name A–Z</option><option value="stock-low">Lowest stock</option><option value="stock-high">Highest stock</option>
        </select>
        {(search || category !== 'all' || brand !== 'all' || lowOnly || sort !== 'name') && <button type="button" onClick={clearFilters} className="h-9 px-2 text-xs font-semibold text-orange-700 hover:underline">Clear filters</button>}
      </div>
    </section>

    {branchId === 'all' && <p className="text-xs text-slate-500">Showing combined stock across all branches. Select a branch to make stock adjustments.</p>}
    {branchId !== 'all' && activeBranch && <p className="text-xs text-slate-500">Showing stock at <strong className="text-slate-700">{activeBranch.name}</strong>{canEdit ? ' · Tap a quantity to edit it.' : ' · View only.'}</p>}

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[850px] border-collapse text-left text-sm">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              <th className="px-4 py-3">Product</th>
              <th className="px-3 py-3 text-right">Cost</th>
              <th className="px-3 py-3">Selling price</th>
              <th className="px-3 py-3">Remaining stock</th>
              <th className="px-3 py-3">Branch</th>
              <th className="px-4 py-3 text-right">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(({ product: p, stock }) => {
              const returnable = hasEmptyState(p);
              const meta = p.category === 'cylinder' ? { Icon: Flame, color: 'bg-orange-50 text-orange-700' } : p.category === 'water' ? { Icon: Droplets, color: 'bg-sky-50 text-sky-700' } : { Icon: Package, color: 'bg-violet-50 text-violet-700' };
              const Icon = meta.Icon;
              const current = branchId === 'all' ? ZERO : stockMap.get(keyOf(branchId, p.id)) ?? ZERO;
              const editable = branchId !== 'all' && canEdit;
              const total = stock.full + (returnable ? stock.empty : 0);
              const selling = p.category === 'cylinder'
                ? <div className="space-y-0.5"><div>Refill <strong className="text-slate-900">{formatKES(p.refill_price_kes)}</strong></div><div>New <strong className="text-slate-900">{formatKES(p.complete_price_kes)}</strong></div></div>
                : <strong className="text-slate-900">{formatKES(p.accessory_price_kes || p.complete_price_kes)}</strong>;
              return <tr key={p.id} className="transition-colors hover:bg-slate-50/70">
                <td className="px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.color}`}><Icon className="h-4 w-4" /></span>
                    <span className="min-w-0"><span className="block truncate font-semibold text-slate-900">{p.name}</span><span className="block truncate text-xs text-slate-500">{p.brand}{p.size_kg ? ` · ${p.size_kg}kg` : ''}</span></span>
                  </div>
                </td>
                <td className="px-3 py-3 text-right text-xs text-slate-400" title="Cost price is not currently stored in the product catalogue">—</td>
                <td className="px-3 py-3 text-xs text-slate-600">{selling}</td>
                <td className="px-3 py-3">
                  <div className="flex items-center gap-3 whitespace-nowrap">
                    <span className="inline-flex items-center gap-1 text-xs text-slate-500"><span className="w-9">Filled</span><CountControl value={stock.full} disabled={!editable} label={`${p.name} filled stock`} onSave={n => updateCount(p.id, 'full', n)} /></span>
                    {returnable && <span className="inline-flex items-center gap-1 text-xs text-slate-500"><span>Empty</span><CountControl value={stock.empty} disabled={!editable} label={`${p.name} empty stock`} onSave={n => updateCount(p.id, 'empty', n)} /></span>}
                  </div>
                </td>
                <td className="px-3 py-3 text-xs font-medium text-slate-600">{activeBranch?.name ?? 'All branches'}</td>
                <td className="px-4 py-3 text-right font-bold tabular-nums text-slate-900">{total.toLocaleString()}</td>
              </tr>;
            })}
            {rows.length === 0 && <tr><td colSpan={6} className="px-4 py-14 text-center"><p className="font-semibold text-slate-800">No matching products</p><p className="mt-1 text-xs text-slate-500">Try changing your search or filters.</p></td></tr>}
          </tbody>
          {rows.length > 0 && <tfoot><tr className="border-t-2 border-slate-200 bg-slate-50 text-sm font-bold text-slate-900">
            <td colSpan={5} className="px-4 py-3 text-right">Total stock</td>
            <td className="px-4 py-3 text-right tabular-nums">{rows.reduce((sum, row) => sum + row.stock.full + (hasEmptyState(row.product) ? row.stock.empty : 0), 0).toLocaleString()}</td>
          </tr></tfoot>}
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-slate-100 px-4 py-2.5 text-xs text-slate-500">
        <span>{rows.length} products</span><span>{branchId === 'all' ? 'All branches combined' : activeBranch?.code}</span>
      </div>
    </section>
  </main>;
}
