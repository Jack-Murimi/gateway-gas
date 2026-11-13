'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '@/context/store-context';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  ArrowUpDown,
  Building2,
  CheckCircle2,
  Droplets,
  Flame,
  Layers,
  LayoutGrid,
  List,
  Lock,
  MapPin,
  Minus,
  Package,
  Phone,
  Plus,
  Search,
  Undo2,
  X,
  type LucideIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/toast';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import { Product } from '@/types';

/* -------------------------------------------------------------------------- */
/* Types & constants                                                          */
/* -------------------------------------------------------------------------- */

type StoreShape = ReturnType<typeof useStore>;
type Branch = StoreShape['branches'][number];

type Stock = { full: number; empty: number };
type UnitType = 'full' | 'empty';
type StockStatus = 'out' | 'low' | 'healthy';
type Category = 'cylinder' | 'water' | 'accessory';
type CategoryFilter = 'all' | Category;
type SortKey = 'attention' | 'name' | 'low' | 'high';
type ViewMode = 'grid' | 'table';
type Row = { product: Product; stock: Stock; status: StockStatus };

interface TransferDraft {
  from: string;
  to: string;
  productId: string;
  type: UnitType;
  units: number;
}

interface LastChange {
  branchId: string;
  branchCode: string;
  productId: string;
  unit: UnitType;
  delta: number;
  name: string;
  label: string;
}

const LOW_STOCK_THRESHOLD = 5;
const STOCK_TARGET = 20; // full-scale of the stock meter
const MAX_COUNT = 9999;
const UNDO_WINDOW_MS = 6000;
const EDIT_ROLES = ['admin', 'director', 'operator'];
const VIEW_STORAGE_KEY = 'inventory:view';
const NO_STOCK: Stock = { full: 0, empty: 0 };
const CATEGORY_ORDER: Category[] = ['cylinder', 'water', 'accessory'];

const STATUS_RANK: Record<StockStatus, number> = { out: 0, low: 1, healthy: 2 };

const STATUS_META: Record<StockStatus, { label: string; dot: string; pill: string; bar: string; ring: string }> = {
  out: {
    label: 'Out of stock',
    dot: 'bg-rose-500',
    pill: 'bg-rose-50 text-rose-700 ring-rose-200',
    bar: 'bg-rose-500',
    ring: 'ring-rose-300',
  },
  low: {
    label: 'Low stock',
    dot: 'bg-amber-500',
    pill: 'bg-amber-50 text-amber-800 ring-amber-200',
    bar: 'bg-amber-500',
    ring: 'ring-amber-300',
  },
  healthy: {
    label: 'In stock',
    dot: 'bg-emerald-500',
    pill: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    bar: 'bg-emerald-500',
    ring: 'ring-slate-200',
  },
};

const CATEGORY_META: Record<Category, { label: string; icon: LucideIcon; tile: string }> = {
  cylinder: { label: 'Gas Cylinders', icon: Flame, tile: 'bg-orange-100 text-orange-700' },
  water: { label: 'Drinking Water', icon: Droplets, tile: 'bg-sky-100 text-sky-700' },
  accessory: { label: 'Accessories', icon: Package, tile: 'bg-violet-100 text-violet-700' },
};

const CATEGORY_TABS: { key: CategoryFilter; label: string; icon?: LucideIcon; active: string }[] = [
  { key: 'all', label: 'All', active: 'bg-slate-900 text-white' },
  { key: 'cylinder', label: 'Gas', icon: Flame, active: 'bg-orange-600 text-white' },
  { key: 'water', label: 'Water', icon: Droplets, active: 'bg-sky-600 text-white' },
  { key: 'accessory', label: 'Accessories', icon: Package, active: 'bg-violet-600 text-white' },
];

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'attention', label: 'Needs attention first' },
  { key: 'name', label: 'Name A–Z' },
  { key: 'low', label: 'Stock: low → high' },
  { key: 'high', label: 'Stock: high → low' },
];

const NO_SCROLLBAR = '[scrollbar-width:none] [&::-webkit-scrollbar]:hidden';
const NO_SPINNER =
  '[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none';
const SELECT_CLASS =
  'h-9 shrink-0 rounded-lg bg-slate-50 px-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 outline-none transition focus:ring-2 focus:ring-orange-500';

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

const stockKey = (branchId: string, productId: string) => `${branchId}:${productId}`;

function getStockStatus(p: Product, full: number): StockStatus {
  if (full <= 0) return 'out';
  if (p.category === 'cylinder' && full <= LOW_STOCK_THRESHOLD) return 'low';
  return 'healthy';
}

function categoryMeta(category: string) {
  return CATEGORY_META[category as Category] ?? CATEGORY_META.accessory;
}

function unitLabel(p: Product, unit: UnitType) {
  if (!hasEmptyState(p)) return 'Stock';
  return unit === 'full' ? 'Filled' : 'Empty';
}

function productSubtitle(p: Product) {
  return `${p.brand}${p.size_kg ? ` · ${p.size_kg}kg` : ''}`;
}

function haptic() {
  try {
    navigator.vibrate?.(8);
  } catch {
    /* unsupported */
  }
}

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/* -------------------------------------------------------------------------- */
/* Atoms                                                                      */
/* -------------------------------------------------------------------------- */

function StatusPill({ status }: { status: StockStatus }) {
  const s = STATUS_META[status];
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-[11px] font-semibold ring-1 ring-inset ${s.pill}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}

function StockMeter({ value, status, showThreshold }: { value: number; status: StockStatus; showThreshold?: boolean }) {
  const pct = Math.min(100, Math.round((value / STOCK_TARGET) * 100));
  return (
    <div className="relative h-1.5 w-full overflow-hidden rounded-full bg-slate-100" aria-hidden="true">
      <div
        className={`h-full rounded-full transition-[width] duration-300 motion-reduce:transition-none ${STATUS_META[status].bar}`}
        style={{ width: `${pct}%` }}
      />
      {showThreshold && (
        <span
          className="absolute inset-y-0 w-px bg-slate-400/70"
          style={{ left: `${(LOW_STOCK_THRESHOLD / STOCK_TARGET) * 100}%` }}
        />
      )}
    </div>
  );
}

/** A number you can read at a glance, and tap to type an exact count (stock-take). */
function StockCount({
  label,
  value,
  canEdit,
  compact,
  onSet,
}: {
  label: string;
  value: number;
  canEdit: boolean;
  compact?: boolean;
  onSet: (next: number) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelled = useRef(false);

  useEffect(() => {
    if (editing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [editing]);

  const size = compact ? 'h-8 min-w-[2.5rem] text-base' : 'h-10 text-2xl';
  const base = `flex-1 min-w-0 rounded-lg text-center font-bold tabular-nums ${size}`;

  const commit = () => {
    if (!cancelled.current) {
      const n = Number.parseInt(draft, 10);
      if (Number.isInteger(n) && n >= 0 && n !== value) onSet(Math.min(n, MAX_COUNT));
    }
    cancelled.current = false;
    setEditing(false);
  };

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="number"
        inputMode="numeric"
        min={0}
        max={MAX_COUNT}
        value={draft}
        aria-label={`Set ${label}`}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            cancelled.current = true;
            e.currentTarget.blur();
          }
        }}
        className={`${base} ${NO_SPINNER} bg-white text-slate-900 outline-none ring-2 ring-orange-500`}
      />
    );
  }

  if (!canEdit) {
    return <span className={`${base} grid place-items-center text-slate-900`}>{value}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(String(value));
        setEditing(true);
      }}
      title="Tap to type an exact count"
      aria-label={`${label}: ${value}. Tap to type an exact count`}
      className={`${base} text-slate-900 transition hover:bg-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500`}
    >
      {value}
    </button>
  );
}

function Stepper({
  label,
  value,
  canEdit,
  compact,
  onSet,
}: {
  label: string;
  value: number;
  canEdit: boolean;
  compact?: boolean;
  onSet: (next: number) => void;
}) {
  const btn = `grid shrink-0 place-items-center rounded-lg bg-white text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-100 active:scale-95 disabled:cursor-not-allowed disabled:opacity-35 motion-reduce:transition-none ${
    compact ? 'h-8 w-8' : 'h-10 w-10'
  }`;

  const body = (
    <div className="flex items-center gap-1">
      {canEdit && (
        <button type="button" className={btn} disabled={value <= 0} onClick={() => onSet(value - 1)} aria-label={`Decrease ${label}`}>
          <Minus className="h-4 w-4" />
        </button>
      )}
      <StockCount label={label} value={value} canEdit={canEdit} compact={compact} onSet={onSet} />
      {canEdit && (
        <button type="button" className={btn} onClick={() => onSet(value + 1)} aria-label={`Increase ${label}`}>
          <Plus className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (compact) return body;

  return (
    <div className="min-w-0 rounded-xl bg-slate-50 p-2.5">
      <div className="mb-1.5 truncate text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      {body}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Station overview                                                           */
/* -------------------------------------------------------------------------- */

function Metric({ icon: Icon, label, value, hint }: { icon: LucideIcon; label: string; value: number; hint: string }) {
  return (
    <div className="rounded-2xl bg-white/5 p-3.5 ring-1 ring-white/10">
      <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
        <Icon className="h-4 w-4 text-orange-300" />
        {label}
      </div>
      <div className="mt-1.5 text-3xl font-bold tabular-nums">{value}</div>
      <div className="text-xs text-slate-400">{hint}</div>
    </div>
  );
}

function StationOverview({
  branch,
  totals,
  skuCount,
}: {
  branch: Branch;
  totals: { filled: number; empties: number; water: number; healthy: number; low: number; out: number };
  skuCount: number;
}) {
  const total = skuCount || 1;
  const pct = (n: number) => `${(n / total) * 100}%`;
  const healthPct = skuCount ? Math.round((totals.healthy / skuCount) * 100) : 100;
  const attention = totals.low + totals.out;

  return (
    <section
      aria-label="Station overview"
      className="relative overflow-hidden rounded-3xl bg-slate-900 p-5 text-white shadow-lg sm:p-6"
    >
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-24 h-64 w-64 rounded-full bg-orange-500/25 blur-3xl" />

      <div className="relative flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-300">
            <span className="rounded-md bg-orange-500 px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-white">
              {branch.code}
            </span>
            {branch.location_estate && (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" />
                {branch.location_estate}
              </span>
            )}
          </div>
          <h2 className="mt-2 truncate text-2xl font-bold tracking-tight sm:text-3xl">{branch.name}</h2>
          {branch.contact_phone && (
            <a
              href={`tel:${branch.contact_phone.replace(/\s+/g, '')}`}
              className="mt-1 inline-flex items-center gap-1.5 text-sm text-slate-300 transition hover:text-white"
            >
              <Phone className="h-3.5 w-3.5" />
              {branch.contact_phone}
            </a>
          )}
        </div>

        <div className="w-full lg:max-w-sm">
          <div>
            <span className="text-3xl font-bold tabular-nums">{healthPct}%</span>
            <span className="ml-1.5 text-sm text-slate-300">of products healthy</span>
          </div>
          <div
            className="mt-2 flex h-2 w-full overflow-hidden rounded-full bg-white/10"
            role="img"
            aria-label={`${totals.healthy} healthy, ${totals.low} low, ${totals.out} out of stock`}
          >
            <span className="bg-emerald-400 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: pct(totals.healthy) }} />
            <span className="bg-amber-400 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: pct(totals.low) }} />
            <span className="bg-rose-400 transition-[width] duration-500 motion-reduce:transition-none" style={{ width: pct(totals.out) }} />
          </div>
          <div className="mt-2 flex gap-4 text-xs text-slate-300">
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-emerald-400" />{totals.healthy} healthy</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-amber-400" />{totals.low} low</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-rose-400" />{totals.out} out</span>
          </div>
        </div>
      </div>

      <div className="relative mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric icon={Flame} label="Filled cylinders" value={totals.filled} hint="Ready to dispense" />
        <Metric icon={Layers} label="Empty tares" value={totals.empties} hint="Awaiting depot refill" />
        <Metric icon={Droplets} label="Water units" value={totals.water} hint="Returnable + disposable" />
        <Metric icon={AlertTriangle} label="Need attention" value={attention} hint={attention ? 'Low or out of stock' : 'Nothing to chase'} />
      </div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/* Product card                                                               */
/* -------------------------------------------------------------------------- */

function ProductCard({
  row,
  canEdit,
  onSet,
  onTransfer,
  restock,
  onRestock,
}: {
  row: Row;
  canEdit: boolean;
  onSet: (unit: UnitType, target: number) => void;
  onTransfer?: () => void;
  restock?: { from: Branch; qty: number } | null;
  onRestock?: () => void;
}) {
  const { product: p, stock, status } = row;
  const meta = categoryMeta(p.category);
  const Icon = meta.icon;
  const returnable = hasEmptyState(p);

  return (
    <article
      className={`relative overflow-hidden rounded-2xl bg-white p-4 shadow-sm ring-1 transition hover:shadow-md motion-reduce:transition-none ${STATUS_META[status].ring}`}
    >
      {status !== 'healthy' && <span aria-hidden className={`absolute inset-y-0 left-0 w-1 ${STATUS_META[status].bar}`} />}

      <header className="flex items-start gap-3">
        <div className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${meta.tile}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[15px] font-bold leading-tight text-slate-900" title={p.name}>
            {p.name}
          </h3>
          <p className="mt-0.5 truncate text-xs font-medium text-slate-500">{productSubtitle(p)}</p>
        </div>
        <StatusPill status={status} />
      </header>

      <div className={`mt-4 grid gap-2.5 ${returnable ? 'grid-cols-2' : 'grid-cols-1'}`}>
        <Stepper
          label={returnable ? 'Filled' : p.category === 'water' ? 'In stock · disposable' : 'In stock'}
          value={stock.full}
          canEdit={canEdit}
          onSet={(n) => onSet('full', n)}
        />
        {returnable && (
          <Stepper label="Empty tares" value={stock.empty} canEdit={canEdit} onSet={(n) => onSet('empty', n)} />
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        <StockMeter value={stock.full} status={status} showThreshold={p.category === 'cylinder'} />
        <div className="flex justify-between text-[11px] font-medium text-slate-500">
          <span>{returnable ? `Fleet on site: ${stock.full + stock.empty}` : ' '}</span>
          <span>Target {STOCK_TARGET}</span>
        </div>
      </div>

      {restock && onRestock && (
        <button
          type="button"
          onClick={onRestock}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-amber-50 px-3 py-2.5 text-sm font-semibold text-amber-900 ring-1 ring-amber-200 transition hover:bg-amber-100 active:scale-[0.99]"
        >
          <ArrowRightLeft className="h-4 w-4" />
          Restock {restock.qty} from {restock.from.code}
        </button>
      )}

      <footer className="mt-4 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
        <div className="min-w-0 space-y-0.5 font-medium">
          {returnable ? (
            <>
              <div>Refill <strong className="text-slate-900">{formatKES(p.refill_price_kes)}</strong></div>
              <div>New <strong className="text-slate-900">{formatKES(p.complete_price_kes)}</strong></div>
            </>
          ) : (
            <div>Price <strong className="text-slate-900">{formatKES(p.accessory_price_kes || p.complete_price_kes)}</strong></div>
          )}
        </div>
        {onTransfer && (
          <button
            type="button"
            onClick={onTransfer}
            className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
          >
            <ArrowRightLeft className="h-3.5 w-3.5 text-orange-600" />
            Transfer
          </button>
        )}
      </footer>
    </article>
  );
}

/* -------------------------------------------------------------------------- */
/* Transfer sheet (bottom sheet on mobile, dialog on desktop)                 */
/* -------------------------------------------------------------------------- */

function TransferSheet({
  branches,
  products,
  getStock,
  initial,
  onClose,
  onConfirm,
}: {
  branches: Branch[];
  products: Product[];
  getStock: (branchId: string, productId: string) => Stock;
  initial: TransferDraft;
  onClose: () => void;
  onConfirm: (t: TransferDraft) => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const [entered, setEntered] = useState(false);
  const [fromId, setFromId] = useState(initial.from);
  const [toId, setToId] = useState(initial.to);
  const [productId, setProductId] = useState(initial.productId);
  const [typeChoice, setTypeChoice] = useState<UnitType>(initial.type);
  const [unitsInput, setUnitsInput] = useState(String(initial.units));

  // Enter animation
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Focus the dialog (not an input, so mobile keyboards don't pop up), restore on close
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus?.();
  }, []);

  // Scroll lock, Escape, focus trap
  useEffect(() => {
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key !== 'Tab' || !dialogRef.current) return;
      const focusables = dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );
      if (!focusables.length) return;
      const first = focusables[0];
      const last = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prevOverflow;
      window.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  const product = products.find((p) => p.id === productId) ?? products[0];
  if (!product) return null;

  const fromBranch = branches.find((b) => b.id === fromId);
  const toBranch = branches.find((b) => b.id === toId);
  const returnable = hasEmptyState(product);
  const type: UnitType = returnable ? typeChoice : 'full';
  const unitNoun = type === 'empty' ? 'empty tares' : returnable ? 'filled' : 'units';

  const available = getStock(fromId, product.id)[type];
  const destNow = getStock(toId, product.id)[type];
  const parsed = Number.parseInt(unitsInput, 10);
  const units = Number.isInteger(parsed) ? parsed : 0;
  const valid = fromId !== toId && units >= 1 && units <= available;
  const sourceAfter = available - (valid ? units : 0);
  const destAfter = destNow + (valid ? units : 0);
  const leavesLow =
    valid && product.category === 'cylinder' && type === 'full' && sourceAfter <= LOW_STOCK_THRESHOLD;

  const setUnits = (n: number) => setUnitsInput(String(Math.max(1, Math.min(n, Math.max(available, 1)))));
  const changeFrom = (id: string) => {
    if (id === toId) setToId(fromId);
    setFromId(id);
  };
  const changeTo = (id: string) => {
    if (id === fromId) setFromId(toId);
    setToId(id);
  };
  const swap = () => {
    setFromId(toId);
    setToId(fromId);
  };

  const fieldLabel = 'mb-1.5 block text-xs font-semibold text-slate-600';
  const fieldSelect =
    'h-11 w-full rounded-xl bg-white px-3 text-sm font-semibold text-slate-900 ring-1 ring-slate-300 outline-none transition focus:ring-2 focus:ring-orange-500';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div
        aria-hidden="true"
        onClick={onClose}
        className={`absolute inset-0 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-200 motion-reduce:transition-none ${
          entered ? 'opacity-100' : 'opacity-0'
        }`}
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="transfer-title"
        tabIndex={-1}
        className={`relative flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-3xl bg-white text-left shadow-2xl outline-none transition duration-200 motion-reduce:transition-none sm:max-w-lg sm:rounded-3xl ${
          entered ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
        }`}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-300 sm:hidden" aria-hidden />
        <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-3 sm:pt-5">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-xl bg-orange-100 text-orange-700">
              <ArrowRightLeft className="h-5 w-5" />
            </div>
            <div>
              <h2 id="transfer-title" className="text-lg font-bold leading-tight text-slate-900">Transfer stock</h2>
              <p className="text-xs text-slate-500">Move units between stations</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close transfer dialog"
            className="grid h-9 w-9 place-items-center rounded-full bg-slate-100 text-slate-500 transition hover:text-slate-900"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form
          className="flex min-h-0 flex-1 flex-col"
          onSubmit={(e) => {
            e.preventDefault();
            if (valid) onConfirm({ from: fromId, to: toId, productId: product.id, type, units });
          }}
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-3">
            {/* Route */}
            <div className="grid grid-cols-[1fr_auto_1fr] items-end gap-2">
              <div className="min-w-0">
                <label htmlFor="tf-from" className={fieldLabel}>From</label>
                <select id="tf-from" value={fromId} onChange={(e) => changeFrom(e.target.value)} className={fieldSelect}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                onClick={swap}
                aria-label="Swap source and destination"
                className="grid h-11 w-11 place-items-center rounded-xl text-slate-500 ring-1 ring-slate-200 transition hover:bg-slate-50 hover:text-slate-900"
              >
                <ArrowUpDown className="h-4 w-4 rotate-90" />
              </button>
              <div className="min-w-0">
                <label htmlFor="tf-to" className={fieldLabel}>To</label>
                <select id="tf-to" value={toId} onChange={(e) => changeTo(e.target.value)} className={fieldSelect}>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Product */}
            <div>
              <label htmlFor="tf-product" className={fieldLabel}>Product</label>
              <select
                id="tf-product"
                value={product.id}
                onChange={(e) => setProductId(e.target.value)}
                className={fieldSelect}
              >
                {CATEGORY_ORDER.map((c) => {
                  const list = products.filter((p) => p.category === c);
                  if (!list.length) return null;
                  return (
                    <optgroup key={c} label={CATEGORY_META[c].label}>
                      {list.map((p) => (
                        <option key={p.id} value={p.id}>{p.name} ({p.brand})</option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            </div>

            {/* Unit type */}
            <div>
              <span className={fieldLabel}>What are you moving?</span>
              {returnable ? (
                <div className="grid grid-cols-2 gap-1 rounded-xl bg-slate-100 p-1" role="group" aria-label="Unit type">
                  {(['full', 'empty'] as const).map((t) => (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={type === t}
                      onClick={() => setTypeChoice(t)}
                      className={`h-10 rounded-lg text-sm font-semibold transition ${
                        type === t ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                      }`}
                    >
                      {t === 'full' ? 'Filled' : 'Empty tares'}
                      <span className="ml-1.5 text-xs font-medium text-slate-400 tabular-nums">
                        {getStock(fromId, product.id)[t]}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-600">
                  Stock units <span className="font-medium text-slate-400">(disposable, no empties)</span>
                </div>
              )}
            </div>

            {/* Quantity */}
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <label htmlFor="tf-qty" className="text-xs font-semibold text-slate-600">Quantity</label>
                <span className="text-xs font-medium text-slate-500">
                  Available at {fromBranch?.code}: <strong className="tabular-nums text-slate-900">{available}</strong>
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  aria-label="Decrease quantity"
                  onClick={() => setUnits(units - 1)}
                  disabled={units <= 1}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-300 transition hover:bg-slate-50 active:scale-95 disabled:opacity-35"
                >
                  <Minus className="h-5 w-5" />
                </button>
                <input
                  id="tf-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={available}
                  value={unitsInput}
                  onChange={(e) => setUnitsInput(e.target.value)}
                  aria-invalid={unitsInput !== '' && !valid}
                  className={`${NO_SPINNER} h-12 min-w-0 flex-1 rounded-xl bg-white text-center text-2xl font-bold tabular-nums text-slate-900 ring-1 ring-slate-300 outline-none transition focus:ring-2 focus:ring-orange-500 aria-[invalid=true]:ring-rose-400`}
                />
                <button
                  type="button"
                  aria-label="Increase quantity"
                  onClick={() => setUnits(units + 1)}
                  disabled={units >= available}
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-white ring-1 ring-slate-300 transition hover:bg-slate-50 active:scale-95 disabled:opacity-35"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {[5, 10, 20]
                  .filter((q) => q < available)
                  .map((q) => (
                    <button
                      key={q}
                      type="button"
                      onClick={() => setUnitsInput(String(q))}
                      className="h-8 rounded-lg bg-slate-100 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-200 active:scale-95"
                    >
                      {q}
                    </button>
                  ))}
                <button
                  type="button"
                  disabled={available === 0}
                  onClick={() => setUnitsInput(String(available))}
                  className="ml-auto h-8 rounded-lg bg-orange-50 px-3 text-xs font-semibold text-orange-700 ring-1 ring-orange-200 transition hover:bg-orange-100 active:scale-95 disabled:opacity-40"
                >
                  All ({available})
                </button>
              </div>
            </div>

            {/* Before → after preview */}
            <div className="grid grid-cols-2 gap-2.5" aria-live="polite">
              <div className="rounded-2xl bg-slate-50 p-3">
                <p className="truncate text-xs font-semibold text-slate-500">{fromBranch?.code} sends</p>
                <p className="mt-1 flex items-center gap-1.5 tabular-nums">
                  <span className="text-base text-slate-400">{available}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
                  <span className={`text-2xl font-bold ${leavesLow ? 'text-amber-700' : 'text-slate-900'}`}>{sourceAfter}</span>
                </p>
                <p className="text-[11px] text-slate-500">{unitNoun}</p>
              </div>
              <div className="rounded-2xl bg-emerald-50 p-3">
                <p className="truncate text-xs font-semibold text-emerald-800">{toBranch?.code} receives</p>
                <p className="mt-1 flex items-center gap-1.5 tabular-nums">
                  <span className="text-base text-emerald-700/60">{destNow}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-emerald-700/60" />
                  <span className="text-2xl font-bold text-emerald-950">{destAfter}</span>
                </p>
                <p className="text-[11px] text-emerald-800">{unitNoun}</p>
              </div>
            </div>

            {unitsInput !== '' && !valid && (
              <p role="alert" className="text-xs font-semibold text-rose-700">
                {available === 0
                  ? `Nothing to send: ${fromBranch?.name} has no ${unitNoun} of this product.`
                  : units > available
                  ? `Only ${available} available at ${fromBranch?.name}.`
                  : 'Enter a whole number of 1 or more.'}
              </p>
            )}
            {leavesLow && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-medium text-amber-900 ring-1 ring-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                This leaves {fromBranch?.name} with {sourceAfter}, at or below the low-stock level of {LOW_STOCK_THRESHOLD}.
              </p>
            )}
          </div>

          <div className="flex gap-2 border-t border-slate-100 bg-white px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <Button type="button" variant="ghost" onClick={onClose} className="flex-1 sm:flex-none">
              Cancel
            </Button>
            <Button type="submit" variant="primary" disabled={!valid} className="flex-[2] font-semibold sm:flex-none sm:px-6">
              {valid ? `Transfer ${units} ${unitNoun}` : 'Confirm transfer'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/* Page                                                                       */
/* -------------------------------------------------------------------------- */

export default function InventoryPage() {
  const { currentUser, branches, products, inventory, updateBranchStock } = useStore();
  const { showError, showSuccess } = useToast();

  const [branchChoice, setBranchChoice] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState('all');
  const [filterCategory, setFilterCategory] = useState<CategoryFilter>('all');
  const [lowOnly, setLowOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('attention');
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [transfer, setTransfer] = useState<TransferDraft | null>(null);
  const [lastChange, setLastChange] = useState<LastChange | null>(null);

  const searchRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  /* ------------------------------ Derived basics ----------------------------- */

  const selectedBranchId = branches.some((b) => b.id === branchChoice) ? branchChoice : branches[0]?.id ?? '';
  const activeBranch = branches.find((b) => b.id === selectedBranchId);

  const isApproved = currentUser?.approval_status === 'approved';
  const canEditStock = isApproved && !!currentUser && EDIT_ROLES.includes(currentUser.role);
  const canTransfer = canEditStock && branches.length > 1 && products.length > 0;

  /* -------------------------------- Stock data ------------------------------- */

  // One pass over every branch → O(1) lookups everywhere
  const stockMap = useMemo(() => {
    const m = new Map<string, Stock>();
    inventory.forEach((r) => m.set(stockKey(r.branch_id, r.product_id), { full: r.full_units ?? 0, empty: r.empty_units ?? 0 }));
    return m;
  }, [inventory]);

  const getStock = useCallback(
    (branchId: string, productId: string) => stockMap.get(stockKey(branchId, productId)) ?? NO_STOCK,
    [stockMap]
  );

  const attentionByBranch = useMemo(() => {
    const out: Record<string, number> = {};
    branches.forEach((b) => {
      out[b.id] = products.reduce(
        (n, p) => n + (getStockStatus(p, getStock(b.id, p.id).full) !== 'healthy' ? 1 : 0),
        0
      );
    });
    return out;
  }, [branches, products, getStock]);

  const brandsList = useMemo(() => Array.from(new Set(products.map((p) => p.brand))).sort(), [products]);

  const categoryCounts = useMemo(
    () => ({
      all: products.length,
      cylinder: products.filter((p) => p.category === 'cylinder').length,
      water: products.filter((p) => p.category === 'water').length,
      accessory: products.filter((p) => p.category === 'accessory').length,
    }),
    [products]
  );

  const station = useMemo(() => {
    let filled = 0, empties = 0, water = 0, healthy = 0, low = 0, out = 0;
    const attention: Row[] = [];
    products.forEach((p) => {
      const stock = getStock(selectedBranchId, p.id);
      const status = getStockStatus(p, stock.full);
      if (status === 'healthy') healthy++;
      else {
        if (status === 'low') low++;
        else out++;
        attention.push({ product: p, stock, status });
      }
      if (p.category === 'cylinder') {
        filled += stock.full;
        empties += stock.empty;
      } else if (p.category === 'water') {
        water += stock.full;
        if (hasEmptyState(p)) empties += stock.empty;
      }
    });
    attention.sort((a, b) => STATUS_RANK[a.status] - STATUS_RANK[b.status]);
    return { filled, empties, water, healthy, low, out, attention };
  }, [products, getStock, selectedBranchId]);

  const visibleRows = useMemo(() => {
    const tokens = searchQuery.toLowerCase().split(/\s+/).filter(Boolean);
    const byName = (a: Row, b: Row) => a.product.name.localeCompare(b.product.name);

    const rows: Row[] = [];
    products.forEach((p) => {
      if (filterCategory !== 'all' && p.category !== filterCategory) return;
      if (filterBrand !== 'all' && p.brand.toLowerCase() !== filterBrand.toLowerCase()) return;
      if (tokens.length) {
        const hay = `${p.name} ${p.brand} ${p.size_kg ? `${p.size_kg}kg` : ''} ${p.category}`.toLowerCase();
        if (!tokens.every((t) => hay.includes(t))) return;
      }
      const stock = getStock(selectedBranchId, p.id);
      const status = getStockStatus(p, stock.full);
      if (lowOnly && status === 'healthy') return;
      rows.push({ product: p, stock, status });
    });

    rows.sort((a, b) => {
      switch (sort) {
        case 'name':
          return byName(a, b);
        case 'low':
          return a.stock.full - b.stock.full || byName(a, b);
        case 'high':
          return b.stock.full - a.stock.full || byName(a, b);
        default:
          return STATUS_RANK[a.status] - STATUS_RANK[b.status] || byName(a, b);
      }
    });
    return rows;
  }, [products, getStock, selectedBranchId, searchQuery, filterCategory, filterBrand, lowOnly, sort]);

  const groups = useMemo(
    () =>
      CATEGORY_ORDER.map((category) => ({
        category,
        rows: visibleRows.filter((r) => r.product.category === category),
      })).filter((g) => g.rows.length > 0),
    [visibleRows]
  );

  /* --------------------------------- Effects -------------------------------- */

  // Restore preferred view (desktop auditors tend to pick table)
  useEffect(() => {
    try {
      const v = localStorage.getItem(VIEW_STORAGE_KEY);
      if (v === 'grid' || v === 'table') setViewMode(v);
    } catch {
      /* storage unavailable */
    }
  }, []);

  // Undo snackbar auto-dismiss (each change resets the timer)
  useEffect(() => {
    if (!lastChange) return;
    const t = setTimeout(() => setLastChange(null), UNDO_WINDOW_MS);
    return () => clearTimeout(t);
  }, [lastChange]);

  // "/" focuses search
  const sheetOpen = !!transfer;
  useEffect(() => {
    if (sheetOpen) return;
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== '/' || el.isContentEditable || ['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [sheetOpen]);

  /* -------------------------------- Handlers -------------------------------- */

  const hasActiveFilters = !!searchQuery || filterBrand !== 'all' || filterCategory !== 'all' || lowOnly;

  const resetFilters = () => {
    setSearchQuery('');
    setFilterBrand('all');
    setFilterCategory('all');
    setLowOnly(false);
  };

  const changeView = (v: ViewMode) => {
    setViewMode(v);
    try {
      localStorage.setItem(VIEW_STORAGE_KEY, v);
    } catch {
      /* storage unavailable */
    }
  };

  const reviewAttention = () => {
    setLowOnly(true);
    requestAnimationFrame(() =>
      listRef.current?.scrollIntoView({ behavior: prefersReducedMotion() ? 'auto' : 'smooth', block: 'start' })
    );
  };

  const recordChange = (p: Product, unit: UnitType, delta: number) => {
    setLastChange((prev) => {
      if (prev && prev.branchId === selectedBranchId && prev.productId === p.id && prev.unit === unit) {
        const total = prev.delta + delta; // coalesce rapid taps: "+1 +1 +1" → "+3"
        return total === 0 ? null : { ...prev, delta: total };
      }
      return {
        branchId: selectedBranchId,
        branchCode: activeBranch?.code ?? '',
        productId: p.id,
        unit,
        delta,
        name: p.name,
        label: unitLabel(p, unit),
      };
    });
  };

  /** Every stock change, whether +/-, typed count or undo, funnels through here. */
  const setStockTo = (p: Product, unit: UnitType, target: number) => {
    if (!canEditStock) {
      showError('Stock adjustments require Operator or Admin credentials.');
      return;
    }
    const next = Math.max(0, Math.min(target, MAX_COUNT));
    const delta = next - getStock(selectedBranchId, p.id)[unit];
    if (delta === 0) return;
    updateBranchStock(selectedBranchId, p.id, unit === 'full' ? delta : 0, unit === 'empty' ? delta : 0);
    haptic();
    recordChange(p, unit, delta);
  };

  const undoLast = () => {
    if (!lastChange) return;
    const { branchId, productId, unit, delta } = lastChange;
    if (getStock(branchId, productId)[unit] - delta < 0) {
      showError('Cannot undo: stock has changed since.');
      setLastChange(null);
      return;
    }
    updateBranchStock(branchId, productId, unit === 'full' ? -delta : 0, unit === 'empty' ? -delta : 0);
    setLastChange(null);
  };

  const getRestock = (p: Product, full: number) => {
    let best: { branch: Branch; units: number } | null = null;
    for (const b of branches) {
      if (b.id === selectedBranchId) continue;
      const units = getStock(b.id, p.id).full;
      if (!best || units > best.units) best = { branch: b, units };
    }
    if (!best) return null;
    const qty = Math.min(best.units - LOW_STOCK_THRESHOLD, STOCK_TARGET - full);
    return qty > 0 ? { from: best.branch, qty } : null;
  };

  const openTransfer = (preset?: Partial<TransferDraft>) => {
    const otherBranch = branches.find((b) => b.id !== selectedBranchId);
    setTransfer({
      from: selectedBranchId,
      to: otherBranch?.id ?? selectedBranchId,
      productId: station.attention[0]?.product.id ?? products[0]?.id ?? '',
      type: 'full',
      units: 1,
      ...preset,
    });
  };

  const closeTransfer = useCallback(() => setTransfer(null), []);

  const handleTransfer = ({ from, to, productId, type, units }: TransferDraft) => {
    const available = getStock(from, productId)[type];
    if (from === to) {
      showError('Source and destination must be different.');
      return;
    }
    if (units < 1 || units > available) {
      showError(`Only ${available} available to transfer.`);
      return;
    }
    // Ideally ONE atomic `transferStock(...)` in the store/backend.
    updateBranchStock(from, productId, type === 'full' ? -units : 0, type === 'empty' ? -units : 0);
    updateBranchStock(to, productId, type === 'full' ? units : 0, type === 'empty' ? units : 0);

    const fromName = branches.find((b) => b.id === from)?.name ?? 'source';
    const toName = branches.find((b) => b.id === to)?.name ?? 'destination';
    const productName = products.find((p) => p.id === productId)?.name ?? 'item';
    showSuccess(`Moved ${units} × ${productName} from ${fromName} to ${toName}`);
    setTransfer(null);
  };

  /* ------------------------------ Early returns ----------------------------- */
  // All hooks are above this line.

  if (!isApproved) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-slate-100 text-slate-400">
          <Lock className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">Restricted inventory</h2>
        <p className="mt-1 text-sm text-slate-500">Sign in with an approved station staff profile to view stock.</p>
      </div>
    );
  }

  if (!activeBranch) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-3xl bg-slate-100 text-slate-400">
          <Building2 className="h-7 w-7" />
        </div>
        <h2 className="text-xl font-bold text-slate-900">No stations yet</h2>
        <p className="mt-1 text-sm text-slate-500">Add a branch before managing inventory.</p>
      </div>
    );
  }

  const lastCurrent = lastChange ? getStock(lastChange.branchId, lastChange.productId)[lastChange.unit] : 0;
  const attentionCount = station.low + station.out;

  /* --------------------------------- Render --------------------------------- */

  return (
    <div className="mx-auto max-w-7xl space-y-5 px-4 pb-32 pt-5 text-left sm:px-6 md:pb-14 lg:px-8">
      {/* Header */}
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">Inventory</h1>
          <p className="mt-1 text-sm text-slate-500">
            {canEditStock ? (
              <>Live stock across {branches.length} stations. Tap any number to type an exact count.</>
            ) : (
              <>Live stock across {branches.length} stations · View only</>
            )}
          </p>
        </div>
        {canTransfer && (
          <Button variant="primary" size="md" onClick={() => openTransfer()} className="shrink-0 gap-2 font-semibold">
            <ArrowRightLeft className="h-4 w-4" />
            <span>Transfer</span>
          </Button>
        )}
      </header>

      {/* Station switcher */}
      <nav aria-label="Stations">
        <div
          className={`-mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 py-1.5 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-4 ${NO_SCROLLBAR}`}
        >
          {branches.map((b) => {
            const selected = b.id === selectedBranchId;
            const alerts = attentionByBranch[b.id] ?? 0;
            return (
              <button
                key={b.id}
                type="button"
                aria-pressed={selected}
                onClick={() => setBranchChoice(b.id)}
                className={`flex min-w-[10.5rem] shrink-0 snap-start flex-col gap-2 rounded-2xl p-3 text-left transition active:scale-[0.98] motion-reduce:transition-none sm:min-w-0 ${
                  selected
                    ? 'bg-white shadow-md ring-2 ring-orange-500'
                    : 'bg-white/60 ring-1 ring-slate-200 hover:bg-white hover:ring-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`rounded-md px-1.5 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                      selected ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {b.code}
                  </span>
                  {alerts > 0 && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-[11px] font-bold text-amber-800"
                      aria-label={`${alerts} items need attention`}
                    >
                      <AlertTriangle className="h-3 w-3" />
                      {alerts}
                    </span>
                  )}
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-slate-900">{b.name}</p>
                  <p className="truncate text-xs text-slate-500">{b.location_estate}</p>
                </div>
              </button>
            );
          })}
        </div>
      </nav>

      {/* Overview */}
      <StationOverview branch={activeBranch} totals={station} skuCount={products.length} />

      {/* Attention banner */}
      {attentionCount > 0 && !lowOnly && (
        <div className="flex flex-col gap-3 rounded-2xl bg-amber-50 p-3.5 ring-1 ring-amber-200 sm:flex-row sm:items-center">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-100 text-amber-800">
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-bold text-amber-950">
                {attentionCount} {attentionCount === 1 ? 'product needs' : 'products need'} attention
              </p>
              <p className="text-xs text-amber-800">Low or out of stock at {activeBranch.name}</p>
            </div>
          </div>
          <div className="flex flex-1 flex-wrap gap-1.5 sm:justify-end">
            {station.attention.slice(0, 3).map(({ product, stock, status }) => (
              <span
                key={product.id}
                className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-slate-700 ring-1 ring-amber-200"
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${STATUS_META[status].dot}`} />
                <span className="truncate">{product.name}</span>
                <span className="tabular-nums text-slate-400">{stock.full}</span>
              </span>
            ))}
            {station.attention.length > 3 && (
              <span className="inline-flex items-center px-1 text-xs font-semibold text-amber-800">
                +{station.attention.length - 3} more
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={reviewAttention}
            className="h-10 shrink-0 rounded-xl bg-amber-900 px-4 text-sm font-semibold text-white transition hover:bg-amber-950 active:scale-95"
          >
            Review
          </button>
        </div>
      )}

      {/* Sticky toolbar. Set --app-header-h to your navbar height and match bg-slate-50 to your page background. */}
      <div className="sticky top-[var(--app-header-h,0px)] z-20 -mx-4 bg-slate-50/90 px-4 py-2 backdrop-blur sm:mx-0 sm:px-0">
        <div className="space-y-2.5 rounded-2xl bg-white p-2.5 shadow-sm ring-1 ring-slate-200">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                enterKeyHint="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                aria-label="Search inventory"
                placeholder="Search 13kg, Pro Gas, 20L…"
                className="h-11 w-full rounded-xl bg-slate-50 pl-10 pr-10 text-sm font-medium text-slate-900 ring-1 ring-slate-200 outline-none transition placeholder:text-slate-400 focus:bg-white focus:ring-2 focus:ring-orange-500"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 grid h-7 w-7 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md bg-slate-100 px-1.5 py-0.5 text-[11px] font-semibold text-slate-500 sm:block">
                  /
                </kbd>
              )}
            </div>

            <div className="flex shrink-0 items-center rounded-xl bg-slate-100 p-1" role="group" aria-label="View mode">
              {([
                ['grid', LayoutGrid, 'Cards'],
                ['table', List, 'Table'],
              ] as const).map(([mode, Icon, title]) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => changeView(mode)}
                  aria-label={`${title} view`}
                  aria-pressed={viewMode === mode}
                  title={`${title} view`}
                  className={`grid h-9 w-9 place-items-center rounded-lg transition ${
                    viewMode === mode ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                </button>
              ))}
            </div>
          </div>

          <div className={`flex items-center gap-1.5 overflow-x-auto pb-0.5 ${NO_SCROLLBAR}`}>
            {CATEGORY_TABS.map(({ key, label, icon: Icon, active }) => {
              const on = filterCategory === key;
              return (
                <button
                  key={key}
                  type="button"
                  aria-pressed={on}
                  onClick={() => setFilterCategory(key)}
                  className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold transition ${
                    on ? active : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {Icon && <Icon className="h-3.5 w-3.5" />}
                  {label}
                  <span className={`rounded-full px-1.5 text-[10px] tabular-nums ${on ? 'bg-white/20' : 'bg-white text-slate-500'}`}>
                    {categoryCounts[key]}
                  </span>
                </button>
              );
            })}

            <span className="mx-1 h-5 w-px shrink-0 bg-slate-200" aria-hidden />

            <button
              type="button"
              aria-pressed={lowOnly}
              onClick={() => setLowOnly((v) => !v)}
              className={`inline-flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold ring-1 transition ${
                lowOnly
                  ? 'bg-amber-50 text-amber-900 ring-amber-300'
                  : 'bg-white text-slate-600 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="h-3.5 w-3.5 text-amber-600" />
              Low / out
            </button>

            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              aria-label="Filter by brand"
              className={SELECT_CLASS}
            >
              <option value="all">All brands</option>
              {brandsList.map((b) => (
                <option key={b} value={b}>{b}</option>
              ))}
            </select>

            <div className="relative shrink-0">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                aria-label="Sort products"
                className={`${SELECT_CLASS} pl-8`}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.key} value={o.key}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>

          {hasActiveFilters && (
            <div className="flex items-center justify-between px-1 text-xs font-medium text-slate-500">
              <span aria-live="polite">
                Showing <strong className="text-slate-900">{visibleRows.length}</strong> of {products.length} at {activeBranch.name}
              </span>
              <button type="button" onClick={resetFilters} className="inline-flex items-center gap-1 font-semibold text-orange-600 hover:underline">
                <X className="h-3.5 w-3.5" /> Reset
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Results */}
      <div ref={listRef} className="scroll-mt-32 space-y-8">
        {visibleRows.length === 0 ? (
          lowOnly && !searchQuery && filterBrand === 'all' && filterCategory === 'all' ? (
            <div className="rounded-3xl bg-emerald-50 p-10 text-center ring-1 ring-emerald-200">
              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" />
              <p className="mt-3 text-base font-bold text-emerald-950">All stocked up</p>
              <p className="mt-1 text-sm text-emerald-800">Nothing is low or out of stock at {activeBranch.name}.</p>
              <Button size="sm" variant="outline" onClick={resetFilters} className="mt-4">Show all products</Button>
            </div>
          ) : (
            <div className="rounded-3xl border-2 border-dashed border-slate-300 bg-white p-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
                <Search className="h-6 w-6" />
              </div>
              <p className="mt-3 text-base font-bold text-slate-900">
                {products.length === 0 ? 'No products in the catalogue' : 'No matching products'}
              </p>
              <p className="mx-auto mt-1 max-w-sm text-sm text-slate-500">
                {products.length === 0 ? 'Add products to start tracking stock.' : 'Try a different search, brand or category.'}
              </p>
              {hasActiveFilters && (
                <Button size="sm" variant="outline" onClick={resetFilters} className="mt-4">Clear all filters</Button>
              )}
            </div>
          )
        ) : viewMode === 'grid' ? (
          groups.map((g) => {
            const meta = CATEGORY_META[g.category];
            const Icon = meta.icon;
            return (
              <section key={g.category} aria-labelledby={`group-${g.category}`}>
                {groups.length > 1 && (
                  <div className="mb-3 flex items-center gap-2.5">
                    <div className={`grid h-7 w-7 place-items-center rounded-lg ${meta.tile}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <h2 id={`group-${g.category}`} className="text-sm font-bold text-slate-900">{meta.label}</h2>
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold tabular-nums text-slate-600">
                      {g.rows.length}
                    </span>
                    <span className="h-px flex-1 bg-slate-200" aria-hidden />
                  </div>
                )}
                <div className="grid grid-cols-1 gap-3.5 md:grid-cols-2 xl:grid-cols-3">
                  {g.rows.map((row) => {
                    const restock =
                      canTransfer && row.status !== 'healthy' ? getRestock(row.product, row.stock.full) : null;
                    return (
                      <ProductCard
                        key={row.product.id}
                        row={row}
                        canEdit={canEditStock}
                        onSet={(unit, target) => setStockTo(row.product, unit, target)}
                        onTransfer={canTransfer ? () => openTransfer({ productId: row.product.id }) : undefined}
                        restock={restock}
                        onRestock={
                          restock
                            ? () =>
                                openTransfer({
                                  from: restock.from.id,
                                  to: selectedBranchId,
                                  productId: row.product.id,
                                  type: 'full',
                                  units: restock.qty,
                                })
                            : undefined
                        }
                      />
                    );
                  })}
                </div>
              </section>
            );
          })
        ) : (
          <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-slate-200">
            <table className="w-full min-w-[820px] text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th scope="col" className="py-3 pl-4 pr-3">Product</th>
                  <th scope="col" className="px-3 py-3">Status</th>
                  <th scope="col" className="px-3 py-3">Filled / Stock</th>
                  <th scope="col" className="px-3 py-3">Empty tares</th>
                  <th scope="col" className="px-3 py-3">Pricing</th>
                  {canTransfer && <th scope="col" className="py-3 pl-3 pr-4 text-right"><span className="sr-only">Actions</span></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {visibleRows.map(({ product: p, stock, status }) => {
                  const meta = categoryMeta(p.category);
                  const Icon = meta.icon;
                  const returnable = hasEmptyState(p);
                  return (
                    <tr key={p.id} className="transition hover:bg-slate-50/70">
                      <td className="py-3 pl-4 pr-3">
                        <div className="flex items-center gap-3">
                          <div className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.tile}`}>
                            <Icon className="h-4 w-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-semibold text-slate-900">{p.name}</div>
                            <div className="truncate text-xs text-slate-500">{productSubtitle(p)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-3 py-3"><StatusPill status={status} /></td>
                      <td className="px-3 py-3">
                        <Stepper
                          compact
                          label={`${p.name} ${unitLabel(p, 'full')}`}
                          value={stock.full}
                          canEdit={canEditStock}
                          onSet={(n) => setStockTo(p, 'full', n)}
                        />
                      </td>
                      <td className="px-3 py-3">
                        {returnable ? (
                          <Stepper
                            compact
                            label={`${p.name} empty tares`}
                            value={stock.empty}
                            canEdit={canEditStock}
                            onSet={(n) => setStockTo(p, 'empty', n)}
                          />
                        ) : (
                          <span className="text-xs font-medium text-slate-400">Disposable</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-slate-600">
                        {returnable ? (
                          <>
                            <div>Refill <strong className="text-slate-900">{formatKES(p.refill_price_kes)}</strong></div>
                            <div>New {formatKES(p.complete_price_kes)}</div>
                          </>
                        ) : (
                          <strong className="text-slate-900">{formatKES(p.accessory_price_kes || p.complete_price_kes)}</strong>
                        )}
                      </td>
                      {canTransfer && (
                        <td className="py-3 pl-3 pr-4 text-right">
                          <button
                            type="button"
                            onClick={() => openTransfer({ productId: p.id })}
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50"
                          >
                            <ArrowRightLeft className="h-3.5 w-3.5 text-orange-600" />
                            Transfer
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Undo snackbar (live region always mounted so screen readers announce changes) */}
      <div className="pointer-events-none fixed inset-x-0 bottom-24 z-40 flex justify-center px-4 md:bottom-6" role="status" aria-live="polite">
        {lastChange && (
          <div className="pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-2xl bg-slate-900 py-2.5 pl-4 pr-2.5 text-white shadow-xl ring-1 ring-white/10">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold">{lastChange.name}</p>
              <p className="text-xs text-slate-300">
                {lastChange.branchCode} · {lastChange.label} {lastChange.delta > 0 ? '+' : ''}
                {lastChange.delta} → <span className="font-semibold tabular-nums text-white">{lastCurrent}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={undoLast}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-white/10 px-3 text-sm font-semibold transition hover:bg-white/20 active:scale-95"
            >
              <Undo2 className="h-4 w-4" />
              Undo
            </button>
          </div>
        )}
      </div>

      {/* Transfer sheet (mounted only when open, so its state is always fresh) */}
      {transfer && (
        <TransferSheet
          branches={branches}
          products={products}
          getStock={getStock}
          initial={transfer}
          onClose={closeTransfer}
          onConfirm={handleTransfer}
        />
      )}
    </div>
  );
}