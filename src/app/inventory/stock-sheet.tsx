'use client';

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, RotateCcw, Search, X } from 'lucide-react';
import type { Branch, BranchInventory, Product } from '@/types';
import { hasEmptyState } from '@/lib/formatters';
import { groupProducts, sortProducts } from '@/lib/product-order';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';

export type StockTakeMode = 'daily' | 'adjustment' | 'initial';
type Draft = { full: string; empty: string };
type Category = 'all' | 'cylinder' | 'water' | 'accessory';

const COLS = 'md:grid-cols-[minmax(0,1fr)_84px_100px_100px_96px]';
const cell = 'h-8 w-full scroll-mt-40 rounded border border-slate-300 bg-white px-2 text-right text-xs font-semibold tabular-nums text-slate-900 outline-none focus:border-orange-500 focus:ring-2 focus:ring-orange-500/30 disabled:bg-slate-100 disabled:text-slate-400';

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
  const activeBranch = useMemo(() => activeBranches.find(b => b.id === targetBranchId), [activeBranches, targetBranchId]);
  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [note, setNote] = useState('');
  const [stockDate, setStockDate] = useState(() => new Date().toLocaleDateString('en-CA'));
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<Category>('all');
  const [onlyChanged, setOnlyChanged] = useState(false);
  const [saving, setSaving] = useState(false);
  const [initialInfo, setInitialInfo] = useState<{ stockDate?: string | null; takenAt: string; actor?: string } | null>(null);
  const [postDateOrderCount, setPostDateOrderCount] = useState(0);
  const [activeCell, setActiveCell] = useState<{ productId: string; name: string; field: 'full' | 'empty' } | null>(null);
  const today = useMemo(() => new Date().toLocaleDateString('en-CA'), []);

  const activeProducts = useMemo(
    () => sortProducts(products.filter(p => p.is_active)),
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
    const loadInitialInfo = async () => {
      let res = await supabase
        .from('stock_audit_log')
        .select('stock_date, created_at, actor:profiles(full_name)')
        .eq('branch_id', targetBranchId)
        .eq('action', 'initial')
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (res.error && res.error.code === '42703') {
        res = await supabase
          .from('stock_audit_log')
          .select('created_at, actor:profiles(full_name)')
          .eq('branch_id', targetBranchId)
          .eq('action', 'initial')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle() as typeof res;
      }

      if (!live) return;
      const data = res.data as any;
      const actor = data?.actor;
      setInitialInfo(
        data
          ? {
              stockDate: data.stock_date ?? null,
              takenAt: data.created_at,
              actor: Array.isArray(actor) ? actor[0]?.full_name : actor?.full_name,
            }
          : null,
      );
    };
    void loadInitialInfo();
    return () => { live = false; };
  }, [mode, targetBranchId]);

  useEffect(() => {
    if (mode !== 'initial' || !targetBranchId || !stockDate || initialInfo) {
      setPostDateOrderCount(0);
      return;
    }
    let live = true;
    const supabase = createClient();
    void supabase
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .eq('branch_id', targetBranchId)
      .neq('delivery_status', 'cancelled')
      .gt('created_at', `${stockDate}T23:59:59.999`)
      .then(({ count }) => {
        if (!live) return;
        setPostDateOrderCount(count ?? 0);
      });
    return () => { live = false; };
  }, [mode, targetBranchId, stockDate, initialInfo]);

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

  const groupedRows = useMemo(
    () => groupProducts(rows, r => r.product),
    [rows]
  );

  const flatRows = useMemo(
    () => groupedRows.flatMap(g => g.items),
    [groupedRows]
  );

  const focusCell = useCallback((productId: string, field: 'full' | 'empty') => {
    const el = inputRefs.current[`${productId}:${field}`];
    if (!el || el.disabled) return;
    el.focus();
    el.select();
    el.scrollIntoView({ block: 'nearest' });
  }, []);

  const handleCellKeyDown = useCallback((
    e: React.KeyboardEvent<HTMLInputElement>,
    productId: string,
    field: 'full' | 'empty',
  ) => {
    const idx = flatRows.findIndex(r => r.product.id === productId);
    if (idx === -1) return;

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (idx > 0) {
        const target = flatRows[idx - 1];
        focusCell(target.product.id, field === 'empty' && target.returnable ? 'empty' : 'full');
      }
      return;
    }

    if (e.key === 'ArrowDown' || e.key === 'Enter') {
      e.preventDefault();
      if (idx < flatRows.length - 1) {
        const target = flatRows[idx + 1];
        focusCell(target.product.id, field === 'empty' && target.returnable ? 'empty' : 'full');
      }
      return;
    }

    if (e.key === 'ArrowRight' && field === 'full' && flatRows[idx].returnable) {
      e.preventDefault();
      focusCell(productId, 'empty');
      return;
    }

    if (e.key === 'ArrowLeft' && field === 'empty') {
      e.preventDefault();
      focusCell(productId, 'full');
    }
  }, [flatRows, focusCell]);

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
    if (mode === 'initial' && !stockDate) { showError('Select the date the initial stock was taken.'); return; }
    if (needNote && !note.trim()) { showError('Enter a reason for the stock adjustment.'); return; }
    if (mode !== 'initial' && changedCount === 0) { showError('No quantities have changed.'); return; }
    setSaving(true);
    const lines = activeProducts
      .map(p => {
        const sys = systemStock(p.id);
        const returnable = hasEmptyState(p);
        const d = drafts[p.id];
        const full_units = parse(d?.full, sys.full);
        const empty_units = returnable ? parse(d?.empty, sys.empty) : 0;
        const changed = full_units !== sys.full || (returnable && empty_units !== sys.empty);
        return {
          product_id: p.id,
          full_units,
          empty_units,
          ...(mode !== 'initial' ? { expected_full: sys.full, expected_empty: returnable ? sys.empty : 0 } : {}),
          _changed: changed,
        };
      })
      .filter(line => mode === 'initial' || line._changed)
      .map(({ _changed: _, ...rest }) => rest);
    const resolvedNote = note.trim() || (
      mode === 'daily'
        ? `Daily count ${new Date().toLocaleDateString('en-CA')}`
        : mode === 'initial'
          ? `Opening stock (${stockDate})`
          : ''
    );
    const supabase = createClient();
    let { data, error } = mode === 'initial'
      ? await supabase.rpc('apply_branch_stock', {
          p_branch_id: targetBranchId,
          p_action: mode,
          p_note: resolvedNote,
          p_lines: lines,
          p_stock_date: stockDate,
        })
      : await supabase.rpc('apply_branch_stock', {
          p_branch_id: targetBranchId,
          p_action: mode,
          p_note: resolvedNote,
          p_lines: lines,
        });

    if (error && mode === 'initial' && error.code === 'PGRST202') {
      const fallbackNote = note.trim() ? `Stock date ${stockDate} · ${note.trim()}` : `Opening stock (${stockDate})`;
      ({ data, error } = await supabase.rpc('apply_branch_stock', {
        p_branch_id: targetBranchId,
        p_action: mode,
        p_note: fallbackNote,
        p_lines: lines,
      }));
    }

    setSaving(false);
    if (error) { showError(error.message); return; }
    setNote('');
    await onApplied();
    if (mode === 'initial') setInitialInfo({ stockDate, takenAt: new Date().toISOString() });
    showSuccess(`${mode === 'initial' ? 'Initial stock' : mode === 'daily' ? 'Daily count' : 'Stock adjustment'} saved (${(data as any)?.changed ?? changedCount} rows logged).`);
  };

  const title = mode === 'daily' ? 'Daily count' : mode === 'adjustment' ? 'Adjust all products' : 'Initial branch stock';
  const colHeader = mode === 'daily' ? 'Counted' : mode === 'adjustment' ? 'New' : 'Opening';

  return (
    <form onSubmit={submit} className="space-y-2">
      <section className={`grid grid-cols-2 items-end gap-1.5 rounded-md border border-slate-300 bg-white p-2 sm:grid-cols-4 ${mode === 'initial' ? 'lg:grid-cols-[170px_145px_minmax(0,1fr)_115px_minmax(0,1fr)_auto]' : 'lg:grid-cols-[180px_minmax(0,1fr)_120px_minmax(0,1.2fr)_auto]'}`}>
        <div>
          <label className={labelClass}>Branch *</label>
          <select value={targetBranchId} onChange={e => onBranchChange(e.target.value)} className={fieldClass}>
            {activeBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        {mode === 'initial' && (
          <div>
            <label htmlFor="initial-stock-date" className={labelClass}>Stock date *</label>
            <input
              id="initial-stock-date"
              type="date"
              required
              max={today}
              disabled={locked}
              value={stockDate}
              onChange={e => setStockDate(e.target.value)}
              className={fieldClass}
            />
          </div>
        )}
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

      {mode === 'initial' && !initialInfo && postDateOrderCount > 0 && (
        <div className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-950">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
          <span>
            <strong>Heads up:</strong> {postDateOrderCount} order{postDateOrderCount === 1 ? '' : 's'} already exist for this branch after <strong>{stockDate}</strong>. Saving initial stock sets current live branch quantities directly.
          </span>
        </div>
      )}

      {mode === 'initial' && initialInfo && (
        <div className="flex items-center justify-between gap-2 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
          <span className="flex items-center gap-1.5 font-medium">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" />
            Initial stock for this branch was taken{initialInfo.stockDate ? ` on ${new Date(`${initialInfo.stockDate}T00:00:00`).toLocaleDateString('en-KE', { dateStyle: 'medium' })}` : ''} (recorded {new Date(initialInfo.takenAt).toLocaleString('en-KE')}{initialInfo.actor ? ` by ${initialInfo.actor}` : ''}).
          </span>
          <span className="text-emerald-700">Use Daily count or Adjust all for later changes.</span>
        </div>
      )}

      <div className="rounded-md border border-slate-300 bg-white">
        <div className="sticky top-14 z-20 rounded-t-md border-b border-slate-300 bg-slate-100/95 shadow-sm backdrop-blur sm:top-16">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2.5 py-1.5 text-xs">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-bold text-slate-900">{activeBranch?.name || 'Select branch'}</span>
              <span className="rounded bg-orange-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-orange-700">{title}</span>
              {mode === 'initial' && stockDate && (
                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700">
                  Date: {stockDate}
                </span>
              )}
              {activeCell && (
                <span className="hidden truncate rounded bg-slate-900 px-2 py-0.5 text-[11px] font-semibold text-white sm:inline-block">
                  Editing: {activeCell.name} · {activeCell.field === 'full' ? 'Full' : 'Empty'}
                </span>
              )}
            </div>
            <span className="shrink-0 text-[11px] font-medium tabular-nums text-slate-500">
              {rows.length} items{changedCount > 0 ? ` · ${changedCount} changed` : ''}
            </span>
          </div>
          <div className={`hidden gap-x-2 px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600 md:grid ${COLS}`}>
            <span>Product</span>
            <span className="text-right">System (F / E)</span>
            <span className="text-right">{colHeader} full</span>
            <span className="text-right">{colHeader} empty</span>
            <span className="text-right">Diff (F / E)</span>
          </div>
          <div className="grid grid-cols-12 gap-x-2 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-600 md:hidden">
            <span className="col-span-3">Sys (F/E)</span>
            <span className="col-span-3 text-right">{colHeader} full</span>
            <span className="col-span-3 text-right">{colHeader} empty</span>
            <span className="col-span-3 text-right">Diff</span>
          </div>
        </div>
        <ul className="divide-y divide-slate-200">
          {groupedRows.map(group => (
            <Fragment key={group.key}>
              <li className="flex items-center justify-between bg-slate-100/90 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-slate-700">
                <span>{group.label}</span>
                <span className="text-[10px] font-semibold tabular-nums text-slate-500">{group.items.length}</span>
              </li>
              {group.items.map(r => {
                const isActive = activeCell?.productId === r.product.id;
                return (
                <li
                  key={r.product.id}
                  className={`group grid scroll-mt-40 grid-cols-12 items-center gap-x-2 gap-y-1 border-l-4 px-2 py-1.5 transition-colors ${COLS} ${
                    isActive
                      ? 'border-l-orange-600 bg-orange-100/75 ring-1 ring-inset ring-orange-400'
                      : r.changed
                        ? 'border-l-amber-400 bg-amber-50/60'
                        : 'border-l-transparent odd:bg-white even:bg-slate-50/50'
                  }`}
                >
                  <div className="col-span-12 flex min-w-0 items-center md:col-span-1">
                    <p className={`truncate text-sm ${isActive ? 'font-bold text-orange-950' : 'font-semibold text-slate-900'}`}>{r.product.name}</p>
                  </div>
                  <div className="col-span-3 text-xs tabular-nums text-slate-500 md:col-span-1 md:text-right">
                    <span className="text-[9px] uppercase text-slate-400 md:hidden">Sys </span>
                    {r.sys.full} / {r.returnable ? r.sys.empty : '—'}
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    <input
                      ref={el => { inputRefs.current[`${r.product.id}:full`] = el; }}
                      aria-label={`${colHeader} full for ${r.product.name}`}
                      type="number" min="0" step="1" inputMode="numeric" disabled={locked}
                      value={r.d?.full ?? String(r.sys.full)}
                      onFocus={e => { e.currentTarget.select(); setActiveCell({ productId: r.product.id, name: r.product.name, field: 'full' }); }}
                      onBlur={() => setActiveCell(prev => (prev?.productId === r.product.id && prev.field === 'full' ? null : prev))}
                      onWheel={e => e.currentTarget.blur()}
                      onKeyDown={e => handleCellKeyDown(e, r.product.id, 'full')}
                      onChange={e => patch(r.product.id, { full: e.target.value })}
                      className={cell}
                    />
                  </div>
                  <div className="col-span-3 md:col-span-1">
                    {r.returnable ? (
                      <input
                        ref={el => { inputRefs.current[`${r.product.id}:empty`] = el; }}
                        aria-label={`${colHeader} empty for ${r.product.name}`}
                        type="number" min="0" step="1" inputMode="numeric" disabled={locked}
                        value={r.d?.empty ?? String(r.sys.empty)}
                        onFocus={e => { e.currentTarget.select(); setActiveCell({ productId: r.product.id, name: r.product.name, field: 'empty' }); }}
                        onBlur={() => setActiveCell(prev => (prev?.productId === r.product.id && prev.field === 'empty' ? null : prev))}
                        onWheel={e => e.currentTarget.blur()}
                        onKeyDown={e => handleCellKeyDown(e, r.product.id, 'empty')}
                        onChange={e => patch(r.product.id, { empty: e.target.value })}
                        className={cell}
                      />
                    ) : <span className="block text-right text-xs text-slate-300">—</span>}
                  </div>
                  <div className="col-span-3 text-right text-xs tabular-nums md:col-span-1">
                    {diffBadge(r.dFull)} <span className="text-slate-300">/</span> {r.returnable ? diffBadge(r.dEmpty) : <span className="text-slate-300">—</span>}
                  </div>
                </li>
                );
              })}
            </Fragment>
          ))}
          {rows.length === 0 && <li className="px-3 py-8 text-center text-xs text-slate-500">No matching products.</li>}
        </ul>
      </div>
    </form>
  );
}
