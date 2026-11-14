'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowLeftRight, Plus, Trash2, Package, AlertTriangle } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { hasEmptyState } from '@/lib/formatters';
import type { Product } from '@/types';

type DraftLine = { productId: string; filled: string; empty: string };
const numberOrZero = (value: string) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : -1;
};

export default function InventoryTransfersPage() {
  const router = useRouter();
  const { currentUser, branches, products, inventory } = useStore();
  const { showError, showSuccess } = useToast();
  const [fromId, setFromId] = useState('');
  const [toId, setToId] = useState('');
  const [addingId, setAddingId] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [saving, setSaving] = useState(false);

  const approved = currentUser?.approval_status === 'approved';
  const canTransfer = approved && !!currentUser && ['admin', 'director', 'operator'].includes(currentUser.role);
  const source = branches.find(b => b.id === fromId);
  const destination = branches.find(b => b.id === toId);
  const stockMap = useMemo(() => {
    const map = new Map<string, { full: number; empty: number }>();
    inventory.forEach(r => map.set(`${r.branch_id}:${r.product_id}`, { full: r.full_units ?? 0, empty: r.empty_units ?? 0 }));
    return map;
  }, [inventory]);
  const selectedIds = new Set(lines.map(line => line.productId));
  const availableProducts = products.filter(p => !selectedIds.has(p.id));
  const lineErrors = lines.map(line => {
    const p = products.find(item => item.id === line.productId)!;
    const stock = stockMap.get(`${fromId}:${p.id}`) ?? { full: 0, empty: 0 };
    const filled = numberOrZero(line.filled);
    const empty = numberOrZero(line.empty);
    const invalid = filled < 0 || empty < 0 || (filled === 0 && empty === 0) || filled > stock.full || (hasEmptyState(p) && empty > stock.empty) || (!hasEmptyState(p) && empty > 0);
    return { invalid, filled, empty, stock };
  });
  const valid = !!fromId && !!toId && fromId !== toId && lines.length > 0 && lineErrors.every(e => !e.invalid);

  const addProduct = () => {
    if (!addingId || selectedIds.has(addingId)) return;
    setLines(prev => [...prev, { productId: addingId, filled: '', empty: '' }]);
    setAddingId('');
  };
  const updateLine = (productId: string, field: 'filled' | 'empty', value: string) => {
    setLines(prev => prev.map(line => line.productId === productId ? { ...line, [field]: value } : line));
  };
  const removeLine = (productId: string) => setLines(prev => prev.filter(line => line.productId !== productId));

  const submit = async () => {
    if (!canTransfer) return showError('You do not have permission to transfer stock.');
    if (!valid || saving) return;
    setSaving(true);
    try {
      // Build every source and destination row first, then write them in one upsert.
      // Each product can appear only once in this transfer, preventing duplicate row keys.
      const updates: Array<{ branch_id: string; product_id: string; full_units: number; empty_units: number; updated_at: string }> = [];
      const timestamp = new Date().toISOString();
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const p = products.find(item => item.id === line.productId)!;
        const { filled, empty, stock } = lineErrors[i];
        const target = stockMap.get(`${toId}:${p.id}`) ?? { full: 0, empty: 0 };
        updates.push(
          { branch_id: fromId, product_id: p.id, full_units: stock.full - filled, empty_units: stock.empty - empty, updated_at: timestamp },
          { branch_id: toId, product_id: p.id, full_units: target.full + filled, empty_units: target.empty + empty, updated_at: timestamp }
        );
      }
      const supabase = createClient();
      const { error } = await supabase.from('branch_inventory').upsert(updates, { onConflict: 'branch_id,product_id' });
      if (error) throw error;
      showSuccess(`Transfer completed: ${lines.length} product${lines.length === 1 ? '' : 's'} moved.`);
      window.setTimeout(() => { window.location.href = '/inventory'; }, 700);
    } catch (error) {
      showError(error instanceof Error ? error.message : 'Transfer failed. No confirmation was received.');
      setSaving(false);
    }
  };

  if (!approved) return <main className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-xl font-bold">Restricted access</h1><p className="mt-2 text-sm text-slate-500">An approved staff account is required.</p></main>;
  if (!canTransfer) return <main className="mx-auto max-w-xl px-4 py-20 text-center"><h1 className="text-xl font-bold">Transfers unavailable</h1><p className="mt-2 text-sm text-slate-500">Your account does not have permission to transfer stock.</p></main>;

  return <main className="mx-auto max-w-4xl space-y-5 px-4 pb-24 pt-5 sm:px-6">
    <header className="flex items-start gap-3">
      <Link href="/inventory" aria-label="Back to stock" className="mt-1 grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"><ArrowLeft className="h-4 w-4" /></Link>
      <div><h1 className="text-2xl font-bold tracking-tight text-slate-900">Stock transfer</h1><p className="mt-1 text-sm text-slate-500">Move several products and their filled or empty units in one transfer.</p></div>
    </header>

    <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
      <h2 className="text-sm font-bold text-slate-900">Transfer route</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_1fr] sm:items-end">
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">From branch</span>
          <select value={fromId} onChange={e => setFromId(e.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="">Select source branch</option>{branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
        <div className="hidden h-11 w-10 items-center justify-center text-slate-400 sm:flex"><ArrowLeftRight className="h-5 w-5" /></div>
        <label className="block"><span className="mb-1.5 block text-xs font-semibold text-slate-600">To branch</span>
          <select value={toId} onChange={e => setToId(e.target.value)} className="h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-medium outline-none focus:border-orange-400 focus:ring-2 focus:ring-orange-100">
            <option value="">Select destination branch</option>{branches.filter(b => b.id !== fromId).map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </label>
      </div>
      {fromId && toId && fromId === toId && <p className="mt-2 text-xs font-medium text-rose-700">Source and destination must be different.</p>}
    </section>

    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-5">
        <div><h2 className="text-sm font-bold text-slate-900">Products to move</h2><p className="mt-0.5 text-xs text-slate-500">Add each product once, then enter filled and empty quantities.</p></div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600">{lines.length} added</span>
      </div>
      <div className="flex flex-col gap-2 p-4 sm:flex-row sm:px-5">
        <select value={addingId} onChange={e => setAddingId(e.target.value)} className="h-10 min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-orange-400">
          <option value="">Choose a product to add…</option>
          {availableProducts.map(p => <option key={p.id} value={p.id}>{p.name} · {p.brand}</option>)}
        </select>
        <button type="button" onClick={addProduct} disabled={!addingId} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-slate-900 px-4 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40"><Plus className="h-4 w-4" /> Add product</button>
      </div>

      {lines.length === 0 ? <div className="px-5 pb-8 pt-5 text-center"><Package className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-semibold text-slate-700">No products added yet</p><p className="mt-1 text-xs text-slate-500">Choose products above to build this transfer.</p></div> :
        <div className="divide-y divide-slate-100">
          {lines.map((line, index) => {
            const p = products.find(item => item.id === line.productId)!;
            const error = lineErrors[index];
            return <div key={line.productId} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_120px_120px_36px] sm:items-center sm:px-5">
              <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{p.name}</p><p className="mt-0.5 text-xs text-slate-500">{p.brand}{p.size_kg ? ` · ${p.size_kg}kg` : ''} · Available: {error.stock.full} filled{hasEmptyState(p) ? ` / ${error.stock.empty} empty` : ''}</p></div>
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Filled units</span><input type="number" min="0" max={error.stock.full} value={line.filled} onChange={e => updateLine(p.id, 'filled', e.target.value)} placeholder="0" className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-orange-400" /></label>
              <label className="block"><span className="mb-1 block text-[11px] font-semibold text-slate-500">Empty units</span><input type="number" min="0" max={error.stock.empty} value={hasEmptyState(p) ? line.empty : ''} disabled={!hasEmptyState(p)} onChange={e => updateLine(p.id, 'empty', e.target.value)} placeholder="0" className="h-9 w-full rounded-lg border border-slate-200 px-2.5 text-sm outline-none focus:border-orange-400 disabled:bg-slate-50 disabled:text-slate-300" /></label>
              <button type="button" onClick={() => removeLine(p.id)} aria-label={`Remove ${p.name}`} className="grid h-9 w-9 place-items-center rounded-lg text-slate-400 hover:bg-rose-50 hover:text-rose-600"><Trash2 className="h-4 w-4" /></button>
              {error.invalid && <p className="text-xs font-medium text-rose-700 sm:col-span-4">{error.filled < 0 || error.empty < 0 ? 'Enter whole quantities of zero or more.' : error.filled > error.stock.full || error.empty > error.stock.empty ? 'The requested quantity exceeds available stock.' : 'Enter at least one filled or empty unit to move.'}</p>}
            </div>;
          })}
        </div>
      }
    </section>

    {lines.length > 0 && <section className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-2 text-xs text-slate-600"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" /><span>Check the source, destination and quantities carefully. Stock will be updated for both branches when you confirm.</span></div>
      <button type="button" disabled={!valid || saving} onClick={submit} className="h-11 shrink-0 rounded-lg bg-orange-600 px-5 text-sm font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-40">{saving ? 'Processing…' : `Confirm transfer · ${lines.length} product${lines.length === 1 ? '' : 's'}`}</button>
    </section>}
  </main>;
}
