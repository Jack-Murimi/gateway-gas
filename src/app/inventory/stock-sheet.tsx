'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RotateCcw, Search, X } from 'lucide-react';
import type { Branch, BranchInventory, Product } from '@/types';
import { hasEmptyState } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';

export type StockTakeMode = 'daily' | 'adjustment' | 'initial';
type Draft = { full: string; empty: string };
type Category = 'all' | 'cylinder' | 'water' | 'accessory';

const COLS = 'md:grid-cols-[minmax(0,1fr)_84px_100px_100px_96px]';
const cell = 'h-7 w-full rounded border border-slate-300 bg-white px-1.5 text-right text-xs font-semibold tabular-nums text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 disabled:bg-slate-100 disabled:text-slate-400';

const diffBadge = (d: number) =>
  d === 0 ? <span className="text-slate-300">0</span>
    : <span className={d > 0 ? 'font-semibold text-emerald-700' : 'font-semibold text-rose-700'}>{d > 0 ? `+${d}` : d}</span>;

interface Props {
  mode: StockTakeMode;
  branches: Branch[];
  branchId: string;
  onBranchChange: (branchId: string) => void;
  products: Product[];
  inventory: BranchInventory[];
  canEdit: boolean;
  onApplied: () => Promise<void>;
}

export function StockSheet({
  mode, branches, branchId, onBranchChange, products, inventory, canEdit, onApplied,
}: Props) {
  const { showError, showSuccess } = useToast();
  const activeBranches = useMemo(() => branches.filter(b => b.is_active), [branches]);
  const targetBranchId = branchId !== 'all' && activeBranches.some(b => b.id === branchId) ? branchId : activeBranches[0]?.id || '';

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [note, setNote] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialInfo, setInitialInfo] = useState<{ takenAt: string; actor?: string } | null>(null);

  const activeProducts = useMemo(
    () => [...products].filter(p => p.is_active).sort((a, b) => a.brand.localeCompare(b.brand) || (a.size_kg ?? 0) - (b.size_kg ?? 0) || a.name.localeCompare(b.name)),
    [products]
  );

  const systemStock = useCallback((productId: string) => {
    const row = inventory.find(r => r.branch_id === targetBranchId && r.product_id === productId);
    return { full: row?.full_units ?? 0, empty: row?.empty_units ?? 0 };
  }, [inventory, targetBranchId]);

  const loadDrafts = useCallback((zero = false) => {
    const next: Record<string, Draft> = {};
    for (const p of activeProducts) {
      const s = zero ? { full: 0, empty: 0 } : systemStock(p.id);
      next[p.id] = { full: String(s.full), empty: String(hasEmptyState(p) ? s.empty : 0) };
    }
    setDrafts(next);
  }, [activeProducts, systemStock]);

  useEffect(() => { loadDrafts(false); }, [loadDrafts, targetBranchId, mode]);

  useEffect(() => {
    if (mode !== 'initial' || !targetBranchId) { setInitialInfo(null); return; }
    let live = true;
    const supabase = createClient();
    void supabase
      .from('stock_audit_log')
      .select('created_at, actor:profiles(full_name)')
      .eq('branch_id', targetBranchId)
      .eq('action', 'initial')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (!live) return;
        const actor = (data as any)?.actor;
        setInitialInfo(data ? { takenAt: data.created_at, actor: Array.isArray(actor) ? actor[0]?.full_name : actor?.full_name } : null);
      });
    return () => { live = false; };
  }, [mode, targetBranchId]);

  const parse = (v: string | undefined, fallback: number) => {
    if (v === undefined || v.trim() === '') return fallback;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : fallback;
  };

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    return activeProducts.map(p => {
      const sys = systemStock(p.id);
      const returnable = hasEmptyState(p);
      const d = drafts[p.id];
      const nextFull = parse(d?.full, sys.full);
      const nextEmpty = returnable ? parse(d?.empty, sys.empty) : 0;
      const dFull = nextFull - sys.full;
      const dEmpty = returnable ? nextEmpty - sys.empty : 0;
      const changed = dFull !== 0 || dEmpty !== 0;
      return { product: p, returnable, sys, d, nextFull, nextEmpty, dFull, dEmpty, changed };
    }).filter(r => {
      if (category !== 'all' && r.product.category !== category) return false;
      if (onlyChanged && !r.changed) return false;
      return !q || `${r.product.name} ${r.product.brand} ${r.product.size_kg ?? ''}`.toLowerCase().includes(q);
    });
  }, [activeProducts, systemStock, drafts, search, category, onlyChanged]);

  const changedCount = useMemo(() => {
    return activeProducts.filter(p => {
      const sys = systemStock(p.id);
      const d = drafts[p.id];
      const returnable = hasEmptyState(p);
      return parse(d?.full, sys.full) !== sys.full || (returnable && parse(d?.empty, sys.empty) !== sys.empty);
    }).length;
  }, [activeProducts, systemStock, drafts]);

  const patch = (productId: string, part: Partial<Draft>) =>
    setDrafts(prev => ({ ...prev, [productId]: { ...(prev[productId] || { full: '0', empty: '0' }), ...part } }));

  const locked = !canEdit || (mode === 'initial' && Boolean(initialInfo));
  const needNote = mode === 'adjustment';

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (locked || !targetBranchId) return;
    if (needNote && !note.trim()) { showError('Enter a reason for the stock adjustment.'); return; }
    if (mode !== 'initial' && changedCount === 0) { showError('No quantities have changed.'); return; }
    setSaving(true);
    const lines = activeProducts.map(p => {
      const sys = systemStock(p.id);
      const d = drafts[p.id];
      return {
        product_id: p.id,
        full_units: parse(d?.full, sys.full),
        empty_units: hasEmptyState(p) ? parse(d?.empty, sys.empty) : 0,
      };
    });
    const supabase = createClient();
    const { data, error } = await supabase.rpc('apply_branch_stock', {
      p_branch_id: targetBranchId,
      p_action: mode,
      p_note: note.trim() || (mode === 'daily' ? `Daily count ${new Date().toLocaleDateString('en-CA')}` : mode === 'initial' ? 'Opening stock' : ''),
      p_lines: lines,
    });
    setSaving(false);
    if (error) { showError(error.message); return; }
    setNote('');
    await onApplied();
    if (mode === 'initial') setInitialInfo({ takenAt: new Date().toISOString() });
    showSuccess(`${mode === 'initial' ? 'Initial stock' : mode === 'daily' ? 'Daily count' : 'Stock adjustment'} saved (${(data as any)?.changed ?? changedCount} rows logged).`);
  };

  const title = mode === 'daily' ? 'Daily count' : mode === 'adjustment' ? 'Adjust all products' : 'Initial branch stock';
  const colHeader = mode === 'daily' ? 'Counted' : mode === 'adjustment' ? 'New' : 'Opening';

  return (
    <form onSubmit={submit} className="space-y-2">
      <section className="grid grid-cols-2 items-end gap-1.5 rounded-md border border-slate-300 bg-white p-2 sm:grid-cols-4 lg:grid-cols-[180px_minmax(0,1fr)_120px_minmax(0,1.2fr)_auto]">
        <div>
          <label className={labelClass}>Branch *</label>
          <select value={targetBranchId} onChange={e => onBranchChange(e.target.value)} className={fieldClass}>
            {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div className="relative">
          <label className={labelClass}>Filter products</label>
          <Search className="pointer-events-none absolute bottom-2 left-2 h-3.5 w-3.5 text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Brand, size or name" className={`${fieldClass} pl-7 pr-7`} />
          {search && <button type="button" onClick={() => setSearch('')} className="absolute bottom-1 right-1 flex h-6 w-6 items-center justify-center rounded text-slate-400 hover:bg-slate-100"><X className="h-3.5 w-3.5" /></button>}
        </div>
        <div>
          <label className={labelClass}>Category</label>
          <select value={category} onChange={e => setCategory(e.target.value as Category)} className={fieldClass}>
            <option value="all">All ({activeProducts.length})</option>
            <option value="cylinder">Gas</option>
            <option value="water">Water</option>
            <option value="accessory">Accessories</option>
          </select>
        </div>
        <div className="col-span-2 sm:col-span-1">
          <label className={labelClass}>{needNote ? 'Reason *' : 'Note'}</label>
          <input value={note} onChange={e => setNote(e.target.value)} required={needNote} disabled={locked} placeholder={needNote ? 'Reason for adjustment' : 'Optional note'} className={fieldClass} />
        </div>
        <div className="col-span-2 flex flex-wrap items-center justify-end gap-1.5 sm:col-span-4 lg:col-span-1">
          <button type="button" onClick={() => setOnlyChanged(v => !v)} aria-pressed={onlyChanged} className={`h-8 rounded border px-2 text-xs font-semibold ${onlyChanged ? 'border-orange-400 bg-orange-50 text-orange-800' : 'border-slate-300 bg-white text-slate-600'}`}>
            Changed ({changedCount})
          </button>
          {mode === 'initial' && !locked && (
            <button type="button" onClick={() => loadDrafts(true)} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              Zero all
            </button>
          )}
          {!locked && (
            <button type="button" onClick={() => loadDrafts(false)} title="Reset to current stock" className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <RotateCcw className="h-3.5 w-3.5" />Reset
            </button>
          )}
          <button
            type="submit"
            disabled={locked || saving || (mode !== 'initial' && changedCount === 0)}
            className="inline-flex h-8 items-center rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-40"
          >
            {saving ? 'Saving…' : `Save ${title.toLowerCase()}`}
          </button>
        </div>
      </section>

      {mode === 'initial' && initialInfo && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            Initial stock for this branch was recorded on {new Date(initialInfo.takenAt).toLocaleString('en-KE')}{initialInfo.actor ? ` by ${initialInfo.actor}` : ''}.
          </span>
          <span className="text-emerald-700">Use Daily count or Adjust all for later changes.</span>
        </div>
      )}

      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className={`hidden gap-x-2 border-b border-slate-300 bg-slate-100 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:grid ${COLS}`}>
          <span>Product</span>
          <span className="text-right">System (F / E)</span>
          <span className="text-right">{colHeader} full</span>
          <span className="text-right">{colHeader} empty</span>
          <span className="text-right">Diff (F / E)</span>
        </div>
        <ul className="divide-y divide-slate-200">
          {rows.map(r => (
            <li key={r.product.id} className={`grid grid-cols-12 items-center gap-x-2 gap-y-1 px-2.5 py-1.5 ${COLS} ${r.changed ? 'bg-amber-50/60' : 'odd:bg-white even:bg-slate-50/50'}`}>
              <div className="col-span-12 min-w-0 md:col-span-1">
                <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">{r.product.name}</p>
                <p className="truncate text-[11px] leading-tight text-slate-500">{r.product.brand}{r.product.size_kg ? ` · ${r.product.size_kg}kg` : ''} · {r.product.category}</p>
              </div>
              <div className="col-span-3 text-xs tabular-nums text-slate-500 md:col-span-1 md:text-right">
                <span className="text-[9px] uppercase text-slate-400 md:hidden">Sys </span>
                {r.sys.full} / {r.returnable ? r.sys.empty : '—'}
              </div>
              <div className="col-span-3 md:col-span-1">
                <input
                  aria-label={`${colHeader} full for ${r.product.name}`}
                  type="number" min="0" step="1" inputMode="numeric" disabled={locked}
                  value={r.d?.full ?? String(r.sys.full)}
                  onFocus={e => e.currentTarget.select()}
                  onChange={e => patch(r.product.id, { full: e.target.value })}
                  className={cell}
                />
              </div>
              <div className="col-span-3 md:col-span-1">
                {r.returnable ? (
                  <input
                    aria-label={`${colHeader} empty for ${r.product.name}`}
                    type="number" min="0" step="1" inputMode="numeric" disabled={locked}
                    value={r.d?.empty ?? String(r.sys.empty)}
                    onFocus={e => e.currentTarget.select()}
                    onChange={e => patch(r.product.id, { empty: e.target.value })}
                    className={cell}
                  />
                ) : <span className="block text-right text-xs text-slate-300">—</span>}
              </div>
              <div className="col-span-3 text-right text-xs tabular-nums md:col-span-1">
                {diffBadge(r.dFull)} <span className="text-slate-300">/</span> {r.returnable ? diffBadge(r.dEmpty) : <span className="text-slate-300">—</span>}
              </div>
            </li>
          ))}
          {rows.length === 0 && <li className="px-3 py-8 text-center text-xs text-slate-500">No matching products.</li>}
        </ul>
      </div>
    </form>
  );
}
