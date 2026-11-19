'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowLeftRight, Building2, Search, SlidersHorizontal, X, Minus, Plus, Package, Flame, Droplets } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';
import type { Product } from '@/types';
import { StockSheet } from './stock-sheet';
import { StockAudit } from './stock-audit';

type Tab = 'stock' | 'daily' | 'adjustment' | 'initial' | 'audit';
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


type ProductCost = {
  product_id: string;
  refill_cost_kes: number | null;
  complete_cost_kes: number | null;
  unit_cost_kes: number | null;
};

function CostControl({ value, label, onSave }: {
  value: number | null; label: string; onSave: (value: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value === null ? '' : String(value));
  if (editing) {
    return <input autoFocus type="number" min="0" step="0.01" value={draft} aria-label={label}
      placeholder="0.00"
      onChange={e => setDraft(e.target.value)}
      onBlur={() => {
        const n = Number(draft);
        if (draft.trim() !== '' && Number.isFinite(n) && n >= 0 && n !== value) onSave(n);
        setEditing(false);
      }}
      onKeyDown={e => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') { setDraft(value === null ? '' : String(value)); setEditing(false); }
      }}
      className="h-8 w-24 rounded-lg border border-orange-300 bg-white px-2 text-right text-xs font-semibold tabular-nums text-slate-900 outline-none focus:ring-2 focus:ring-orange-100" />;
  }
  return <button type="button" onClick={() => { setDraft(value === null ? '' : String(value)); setEditing(true); }}
    title={'Set ' + label}
    className="rounded-md px-1.5 py-1 text-xs font-semibold tabular-nums text-slate-800 hover:bg-orange-50">
    {value === null ? <span className="text-orange-700">Set cost</span> : formatKES(value)}
  </button>;
}

function stockStatus(product: Product, stock: Stock) {
  if (stock.full <= 0) return 'Out of stock';
  if (product.category === 'cylinder' && stock.full <= 5) return 'Low stock';
  return 'In stock';
}

export default function InventoryPage() {
  const { currentUser, branches, products, inventory, updateBranchStock, refreshLiveData } = useStore();
  const { showError, showSuccess } = useToast();
  const [tab, setTab] = useState<Tab>('stock');
  const [branchId, setBranchId] = useState('all');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [brand, setBrand] = useState('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [sort, setSort] = useState('name');
  const [productCosts, setProductCosts] = useState<Record<string, ProductCost>>({});

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
      return () => { active = false; };
    }
    const supabase = createClient();
    void supabase.from('product_costs')
      .select('product_id, refill_cost_kes, complete_cost_kes, unit_cost_kes')
      .then(({ data, error }) => {
        if (!active) return;
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

  const saveProductCost = async (product: Product, field: 'refill_cost_kes' | 'complete_cost_kes' | 'unit_cost_kes', value: number) => {
    if (!canViewCost || !currentUser) return;
    const current = productCosts[product.id];
    const payload: ProductCost & { updated_by: string; updated_at: string } = {
      product_id: product.id,
      refill_cost_kes: current?.refill_cost_kes ?? null,
      complete_cost_kes: current?.complete_cost_kes ?? null,
      unit_cost_kes: current?.unit_cost_kes ?? null,
      [field]: value,
      updated_by: currentUser.id,
      updated_at: new Date().toISOString(),
    };
    const supabase = createClient();
    const { data, error } = await supabase.from('product_costs')
      .upsert(payload, { onConflict: 'product_id' })
      .select('product_id, refill_cost_kes, complete_cost_kes, unit_cost_kes')
      .single();
    if (error || !data) {
      showError(error?.message || 'Could not save cost price.');
      return;
    }
    setProductCosts(prev => ({
      ...prev,
      [product.id]: {
        product_id: data.product_id,
        refill_cost_kes: data.refill_cost_kes === null ? null : Number(data.refill_cost_kes),
        complete_cost_kes: data.complete_cost_kes === null ? null : Number(data.complete_cost_kes),
        unit_cost_kes: data.unit_cost_kes === null ? null : Number(data.unit_cost_kes),
      },
    }));
    showSuccess('Product cost price saved.');
  };


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
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <details className="group">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 hover:bg-slate-50 [&::-webkit-details-marker]:hidden">
          <span className="flex min-w-0 items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 shrink-0 text-orange-600" />
            <span className="text-sm font-semibold text-slate-800">Filters</span>
            <span className="truncate text-xs text-slate-500">{rows.length} products shown</span>
          </span>
          <span className="flex shrink-0 items-center gap-2 text-xs font-semibold text-slate-500"><span className="group-open:hidden">Show</span><span className="hidden group-open:inline">Hide</span><span className="transition-transform group-open:rotate-180">⌄</span></span>
        </summary>
        <div className="space-y-3 border-t border-slate-100 p-3">
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="relative min-w-0">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or brands…" aria-label="Search products"
                className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-9 pr-9 text-sm outline-none transition focus:border-orange-400 focus:bg-white focus:ring-2 focus:ring-orange-100" />
              {search && <button type="button" onClick={() => setSearch('')} aria-label="Clear search" className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-md text-slate-400 hover:bg-slate-200"><X className="h-4 w-4" /></button>}
            </div>
            <label className="flex h-10 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-500">
              <Building2 className="h-4 w-4" /><span className="sr-only">Branch</span>
              <select value={branchId} onChange={e => setBranchId(e.target.value)} aria-label="Filter by branch" className="w-full bg-transparent text-sm font-semibold text-slate-800 outline-none sm:max-w-[190px]">
                <option value="all">All branches</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </label>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex h-9 items-center gap-2 rounded-lg bg-slate-50 px-2.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200">
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
        </div>
      </details>
    </section>

    {canViewCost && <p className="text-xs text-slate-500">Cost prices are private to Admin and Director. Select a cost to enter or update it.</p>}
    {branchId === 'all' && <p className="text-xs text-slate-500">Showing combined stock across all branches. Select a branch to make stock adjustments.</p>}
    {branchId !== 'all' && activeBranch && <p className="text-xs text-slate-500">Showing stock at <strong className="text-slate-700">{activeBranch.name}</strong>{canEdit ? ' · Tap a quantity to edit it.' : ' · View only.'}</p>}

    <section className="space-y-3 md:hidden">
      {rows.map(({ product: p, stock, status }) => {
        const returnable = hasEmptyState(p);
        const meta = p.category === 'cylinder' ? { Icon: Flame, color: 'bg-orange-50 text-orange-700' } : p.category === 'water' ? { Icon: Droplets, color: 'bg-sky-50 text-sky-700' } : { Icon: Package, color: 'bg-violet-50 text-violet-700' };
        const Icon = meta.Icon;
        const editable = branchId !== 'all' && canEdit;
        const total = stock.full + (returnable ? stock.empty : 0);
        const statusStyle = status === 'In stock' ? 'bg-emerald-50 text-emerald-700' : status === 'Low stock' ? 'bg-amber-50 text-amber-800' : 'bg-rose-50 text-rose-700';
        return <article key={p.id} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
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
          {canViewCost && <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <span className="text-xs font-medium text-slate-500">Cost price</span>
            {p.category === 'cylinder' ? <div className="flex flex-wrap justify-end gap-3"><span className="text-xs text-slate-500">Refill <CostControl value={productCosts[p.id]?.refill_cost_kes ?? null} label={p.name + ' refill cost'} onSave={n => void saveProductCost(p, 'refill_cost_kes', n)} /></span><span className="text-xs text-slate-500">New <CostControl value={productCosts[p.id]?.complete_cost_kes ?? null} label={p.name + ' complete cost'} onSave={n => void saveProductCost(p, 'complete_cost_kes', n)} /></span></div> : <CostControl value={productCosts[p.id]?.unit_cost_kes ?? null} label={p.name + ' unit cost'} onSave={n => void saveProductCost(p, 'unit_cost_kes', n)} />}
          </div>}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500">Remaining stock</span>
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">Filled <CountControl value={stock.full} disabled={!editable} label={`${p.name} filled stock`} onSave={n => updateCount(p.id, 'full', n)} /></span>
              {returnable && <span className="inline-flex items-center gap-1 text-xs text-slate-500">Empty <CountControl value={stock.empty} disabled={!editable} label={`${p.name} empty stock`} onSave={n => updateCount(p.id, 'empty', n)} /></span>}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2 text-xs text-slate-500"><span>{activeBranch?.name ?? 'All branches'}</span><span>{branchId === 'all' ? 'Combined branches' : editable ? 'Tap quantity to edit' : 'View only'}</span></div>
        </article>;
      })}
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
                {canViewCost && <td className="px-3 py-3 text-right">
                  {p.category === 'cylinder' ? <div className="space-y-0.5">
                    <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] text-slate-400">Refill</span><CostControl value={productCosts[p.id]?.refill_cost_kes ?? null} label={p.name + ' refill cost'} onSave={n => void saveProductCost(p, 'refill_cost_kes', n)} /></div>
                    <div className="flex items-center justify-end gap-1.5"><span className="text-[10px] text-slate-400">New</span><CostControl value={productCosts[p.id]?.complete_cost_kes ?? null} label={p.name + ' complete cost'} onSave={n => void saveProductCost(p, 'complete_cost_kes', n)} /></div>
                  </div> : <CostControl value={productCosts[p.id]?.unit_cost_kes ?? null} label={p.name + ' unit cost'} onSave={n => void saveProductCost(p, 'unit_cost_kes', n)} />}
                </td>}
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
