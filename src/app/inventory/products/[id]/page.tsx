'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowLeft,
  Building2,
  Droplets,
  Flame,
  Package,
  Pencil,
  RefreshCw,
  Save,
  X,
} from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';
import { Skeleton } from '@/components/ui/skeleton';
import type { Product } from '@/types';

type AuditAction = 'all' | 'initial' | 'daily' | 'adjustment' | 'sale' | 'cancel' | 'purchase' | 'transfer' | 'edit';

interface MovementRow {
  id: string;
  batch_id: string;
  action: Exclude<AuditAction, 'all'>;
  branch_id: string;
  prev_full: number;
  prev_empty: number;
  new_full: number;
  new_empty: number;
  note: string | null;
  stock_date?: string | null;
  created_at: string;
  branch?: { name: string } | { name: string }[] | null;
  actor?: { full_name: string } | { full_name: string }[] | null;
}

interface ProductCost {
  refill_cost_kes: number | null;
  complete_cost_kes: number | null;
  unit_cost_kes: number | null;
}

const ACTION_STYLE: Record<Exclude<AuditAction, 'all'>, { label: string; cls: string }> = {
  initial: { label: 'Initial', cls: 'bg-purple-50 text-purple-800' },
  daily: { label: 'Daily count', cls: 'bg-sky-50 text-sky-800' },
  adjustment: { label: 'Adjustment', cls: 'bg-amber-50 text-amber-800' },
  sale: { label: 'Sale', cls: 'bg-emerald-50 text-emerald-800' },
  cancel: { label: 'Cancelled', cls: 'bg-rose-50 text-rose-800' },
  purchase: { label: 'Purchase', cls: 'bg-indigo-50 text-indigo-800' },
  transfer: { label: 'Transfer', cls: 'bg-orange-50 text-orange-800' },
  edit: { label: 'Quick edit', cls: 'bg-slate-100 text-slate-700' },
};

const pick = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

const deltaBadge = (prev: number, next: number) => {
  const d = next - prev;
  if (d === 0) return null;
  return (
    <span className={`ml-1 text-[11px] font-semibold ${d > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
      ({d > 0 ? `+${d}` : d})
    </span>
  );
};

export default function ProductDetailPage() {
  const params = useParams<{ id: string }>();
  const productId = typeof params?.id === 'string' ? params.id : '';
  const { currentUser, branches, products, inventory, refreshLiveData } = useStore();
  const { showError, showSuccess } = useToast();

  const approved = currentUser?.approval_status === 'approved';
  const canEditProduct = approved && !!currentUser && ['admin', 'director'].includes(currentUser.role);

  const [directProduct, setDirectProduct] = useState<Product | null>(null);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [cost, setCost] = useState<ProductCost | null>(null);
  const [loadingCost, setLoadingCost] = useState(false);

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: '',
    brand: '',
    category: 'cylinder' as Product['category'],
    size_kg: '',
    refill_price_kes: '0',
    complete_price_kes: '0',
    accessory_price_kes: '0',
    refill_cost_kes: '',
    complete_cost_kes: '',
    unit_cost_kes: '',
    is_active: true,
  });

  const [branchFilter, setBranchFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState<AuditAction>('all');
  const [dayFilter, setDayFilter] = useState('');
  const [movements, setMovements] = useState<MovementRow[]>([]);
  const [loadingMovements, setLoadingMovements] = useState(true);

  const storeProduct = useMemo(
    () => products.find(p => p.id === productId) ?? null,
    [products, productId],
  );
  const product = directProduct ?? storeProduct;

  // Fetch directly from DB so inactive products or fresh edits always show accurately
  useEffect(() => {
    if (!approved || !productId) return;
    let active = true;
    setLoadingProduct(true);
    const supabase = createClient();
    void supabase
      .from('products')
      .select('*')
      .eq('id', productId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        if (data) setDirectProduct(data as Product);
        setLoadingProduct(false);
      });
    return () => { active = false; };
  }, [approved, productId]);

  useEffect(() => {
    if (!canEditProduct || !productId) {
      setCost(null);
      setLoadingCost(false);
      return;
    }
    let active = true;
    setLoadingCost(true);
    const supabase = createClient();
    void supabase
      .from('product_costs')
      .select('refill_cost_kes, complete_cost_kes, unit_cost_kes')
      .eq('product_id', productId)
      .maybeSingle()
      .then(({ data }) => {
        if (!active) return;
        setCost(
          data
            ? {
                refill_cost_kes: data.refill_cost_kes === null ? null : Number(data.refill_cost_kes),
                complete_cost_kes: data.complete_cost_kes === null ? null : Number(data.complete_cost_kes),
                unit_cost_kes: data.unit_cost_kes === null ? null : Number(data.unit_cost_kes),
              }
            : null,
        );
        setLoadingCost(false);
      });
    return () => { active = false; };
  }, [canEditProduct, productId]);

  const startEdit = () => {
    if (!product) return;
    setForm({
      name: product.name,
      brand: product.brand,
      category: product.category,
      size_kg: product.size_kg === null || product.size_kg === undefined ? '' : String(product.size_kg),
      refill_price_kes: String(product.refill_price_kes ?? 0),
      complete_price_kes: String(product.complete_price_kes ?? 0),
      accessory_price_kes: String(product.accessory_price_kes ?? 0),
      refill_cost_kes: cost?.refill_cost_kes === null || cost?.refill_cost_kes === undefined ? '' : String(cost.refill_cost_kes),
      complete_cost_kes: cost?.complete_cost_kes === null || cost?.complete_cost_kes === undefined ? '' : String(cost.complete_cost_kes),
      unit_cost_kes: cost?.unit_cost_kes === null || cost?.unit_cost_kes === undefined ? '' : String(cost.unit_cost_kes),
      is_active: product.is_active,
    });
    setEditing(true);
  };

  const saveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEditProduct || !product || !currentUser) return;
    const trimmedName = form.name.trim();
    const trimmedBrand = form.brand.trim();
    if (!trimmedName || !trimmedBrand) {
      showError('Product name and brand are required.');
      return;
    }

    const sizeKg = form.size_kg.trim() === '' ? null : Number(form.size_kg);
    if (sizeKg !== null && (!Number.isFinite(sizeKg) || sizeKg <= 0)) {
      showError('Enter a valid positive size or leave it blank.');
      return;
    }

    const refillPrice = Number(form.refill_price_kes || 0);
    const completePrice = Number(form.complete_price_kes || 0);
    const accessoryPrice = Number(form.accessory_price_kes || 0);
    if ([refillPrice, completePrice, accessoryPrice].some(n => !Number.isFinite(n) || n < 0)) {
      showError('Selling prices must be zero or more.');
      return;
    }

    const parseCost = (val: string) => (val.trim() === '' ? null : Number(val));
    const refillCost = parseCost(form.refill_cost_kes);
    const completeCost = parseCost(form.complete_cost_kes);
    const unitCost = parseCost(form.unit_cost_kes);
    if ([refillCost, completeCost, unitCost].some(n => n !== null && (!Number.isFinite(n) || n < 0))) {
      showError('Cost prices must be zero or more.');
      return;
    }

    setSaving(true);
    const supabase = createClient();

    const { data: updated, error: prodErr } = await supabase
      .from('products')
      .update({
        name: trimmedName,
        brand: trimmedBrand,
        category: form.category,
        size_kg: sizeKg,
        refill_price_kes: refillPrice,
        complete_price_kes: completePrice,
        accessory_price_kes: accessoryPrice,
        is_active: form.is_active,
      })
      .eq('id', product.id)
      .select('*')
      .single();

    if (prodErr || !updated) {
      setSaving(false);
      showError(prodErr?.message || 'Could not update product.');
      return;
    }

    if (refillCost !== null || completeCost !== null || unitCost !== null || cost !== null) {
      const { data: savedCost, error: costErr } = await supabase
        .from('product_costs')
        .upsert(
          {
            product_id: product.id,
            refill_cost_kes: refillCost,
            complete_cost_kes: completeCost,
            unit_cost_kes: unitCost,
            updated_by: currentUser.id,
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'product_id' },
        )
        .select('refill_cost_kes, complete_cost_kes, unit_cost_kes')
        .single();

      if (costErr) {
        setSaving(false);
        showError(costErr.message || 'Product saved, but cost update failed.');
        return;
      }

      if (savedCost) {
        setCost({
          refill_cost_kes: savedCost.refill_cost_kes === null ? null : Number(savedCost.refill_cost_kes),
          complete_cost_kes: savedCost.complete_cost_kes === null ? null : Number(savedCost.complete_cost_kes),
          unit_cost_kes: savedCost.unit_cost_kes === null ? null : Number(savedCost.unit_cost_kes),
        });
      }
    }

    setDirectProduct(updated as Product);
    setSaving(false);
    setEditing(false);
    await refreshLiveData();
    showSuccess('Product updated.');
  };

  const loadMovements = useCallback(async () => {
    if (!approved || !productId) return;
    setLoadingMovements(true);
    const supabase = createClient();
    const runQuery = (withStockDate: boolean) => {
      const cols = withStockDate
        ? 'id,batch_id,action,branch_id,prev_full,prev_empty,new_full,new_empty,note,stock_date,created_at,branch:branches(name),actor:profiles(full_name)'
        : 'id,batch_id,action,branch_id,prev_full,prev_empty,new_full,new_empty,note,created_at,branch:branches(name),actor:profiles(full_name)';
      let q = supabase
        .from('stock_audit_log')
        .select(cols)
        .eq('product_id', productId)
        .order('created_at', { ascending: false })
        .limit(300);
      if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
      if (actionFilter !== 'all') q = q.eq('action', actionFilter);
      if (dayFilter) q = q.gte('created_at', `${dayFilter}T00:00:00`).lte('created_at', `${dayFilter}T23:59:59.999`);
      return q;
    };

    let { data, error } = await runQuery(true);
    if (error && error.code === '42703') {
      ({ data } = await runQuery(false));
    }
    setMovements((data as unknown as MovementRow[]) || []);
    setLoadingMovements(false);
  }, [approved, productId, branchFilter, actionFilter, dayFilter]);

  useEffect(() => {
    void loadMovements();
  }, [loadMovements]);

  const branchStocks = useMemo(() => {
    return branches
      .filter(b => b.is_active)
      .map(b => {
        const row = inventory.find(r => r.branch_id === b.id && r.product_id === productId);
        return {
          branch: b,
          full: row?.full_units ?? 0,
          empty: row?.empty_units ?? 0,
        };
      });
  }, [branches, inventory, productId]);

  const totals = useMemo(
    () => branchStocks.reduce((acc, s) => ({ full: acc.full + s.full, empty: acc.empty + s.empty }), { full: 0, empty: 0 }),
    [branchStocks],
  );

  const movementSummary = useMemo(() => {
    let fullIn = 0;
    let fullOut = 0;
    let emptyIn = 0;
    let emptyOut = 0;
    for (const m of movements) {
      const df = m.new_full - m.prev_full;
      const de = m.new_empty - m.prev_empty;
      if (df > 0) fullIn += df;
      else fullOut += Math.abs(df);
      if (de > 0) emptyIn += de;
      else emptyOut += Math.abs(de);
    }
    return { fullIn, fullOut, emptyIn, emptyOut };
  }, [movements]);

  if (!approved) {
    return (
      <div className="mx-auto max-w-md px-4 py-20 text-center">
        <h2 className="text-xl font-bold text-slate-900">Restricted inventory</h2>
        <p className="mt-1 text-sm text-slate-500">Sign in with an approved staff profile to view products.</p>
      </div>
    );
  }

  if (!product && loadingProduct) {
    return (
      <main className="mx-auto max-w-[1440px] space-y-3 px-2 pb-24 pt-2 sm:px-4 lg:px-5">
        <div className="flex items-center justify-between gap-3 rounded-md border border-slate-300 bg-white px-3 py-2">
          <div className="flex items-center gap-2.5">
            <Skeleton className="h-8 w-8 rounded" />
            <Skeleton className="h-9 w-9 rounded-lg" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-44 rounded" />
              <Skeleton className="h-3 w-28 rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-28 rounded" />
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-md border border-slate-300 bg-white p-3">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-6 w-28 rounded" />
            </div>
          ))}
        </div>
        <div className="rounded-md border border-slate-300 bg-white p-2.5">
          <Skeleton className="mb-2 h-3.5 w-28 rounded" />
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full rounded-md" />
            ))}
          </div>
        </div>
        <div className="rounded-md border border-slate-300 bg-white p-3 space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-8 w-full rounded" />
          ))}
        </div>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-slate-900">Product not found</h1>
        <Link href="/inventory" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Inventory
        </Link>
      </main>
    );
  }

  const returnable = hasEmptyState(product);
  const meta =
    product.category === 'cylinder'
      ? { Icon: Flame, color: 'bg-orange-50 text-orange-700', label: 'Gas' }
      : product.category === 'water'
        ? { Icon: Droplets, color: 'bg-sky-50 text-sky-700', label: 'Water' }
        : { Icon: Package, color: 'bg-violet-50 text-violet-700', label: 'Accessory' };
  const Icon = meta.Icon;
  const isReturnableForm =
    form.category === 'cylinder' ||
    (form.category === 'water' && Number(form.refill_price_kes || 0) > 0 && form.brand.trim().toLowerCase() !== 'japeli');

  return (
    <main className="mx-auto max-w-[1440px] space-y-3 px-2 pb-24 pt-2 sm:px-4 lg:px-5">
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/inventory"
            aria-label="Back to Inventory"
            className="grid h-8 w-8 shrink-0 place-items-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${meta.color}`}>
            <Icon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-bold text-slate-950">{product.name}</h1>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-600">{meta.label}</span>
              {!product.is_active && (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">Inactive</span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              {product.brand}
              {product.size_kg ? ` · ${product.size_kg}kg` : ''}
            </p>
          </div>
        </div>
        {canEditProduct && !editing && (
          <button
            type="button"
            onClick={startEdit}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700"
          >
            <Pencil className="h-3.5 w-3.5" /> Edit product
          </button>
        )}
      </header>

      {/* Pricing & Cost Summary or Edit Form */}
      {editing ? (
        <form onSubmit={saveProduct} className="space-y-3 rounded-md border border-orange-300 bg-white p-3 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Edit product details</h2>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 px-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            <div className="col-span-2">
              <label className={labelClass}>Product name *</label>
              <input
                required
                value={form.name}
                onChange={e => setForm(prev => ({ ...prev, name: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Brand *</label>
              <input
                required
                value={form.brand}
                onChange={e => setForm(prev => ({ ...prev, brand: e.target.value }))}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>Category</label>
              <select
                value={form.category}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value as Product['category'] }))}
                className={fieldClass}
              >
                <option value="cylinder">Gas cylinder</option>
                <option value="water">Water</option>
                <option value="accessory">Accessory</option>
              </select>
            </div>
            <div>
              <label className={labelClass}>Size (kg / L)</label>
              <input
                type="number"
                step="any"
                min="0"
                placeholder="Optional"
                value={form.size_kg}
                onChange={e => setForm(prev => ({ ...prev, size_kg: e.target.value }))}
                className={fieldClass}
              />
            </div>

            {isReturnableForm || form.category === 'cylinder' ? (
              <>
                <div>
                  <label className={labelClass}>Refill selling (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.refill_price_kes}
                    onChange={e => setForm(prev => ({ ...prev, refill_price_kes: e.target.value }))}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>New / complete selling (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.complete_price_kes}
                    onChange={e => setForm(prev => ({ ...prev, complete_price_kes: e.target.value }))}
                    className={fieldClass}
                  />
                </div>
              </>
            ) : (
              <div>
                <label className={labelClass}>Selling price (KES)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.accessory_price_kes}
                  onChange={e => setForm(prev => ({ ...prev, accessory_price_kes: e.target.value }))}
                  className={fieldClass}
                />
              </div>
            )}

            {form.category === 'cylinder' ? (
              <>
                <div>
                  <label className={labelClass}>Refill cost (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Not set"
                    value={form.refill_cost_kes}
                    onChange={e => setForm(prev => ({ ...prev, refill_cost_kes: e.target.value }))}
                    className={fieldClass}
                  />
                </div>
                <div>
                  <label className={labelClass}>New / complete cost (KES)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="Not set"
                    value={form.complete_cost_kes}
                    onChange={e => setForm(prev => ({ ...prev, complete_cost_kes: e.target.value }))}
                    className={fieldClass}
                  />
                </div>
              </>
            ) : (
              <div>
                <label className={labelClass}>Unit cost (KES)</label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  placeholder="Not set"
                  value={form.unit_cost_kes}
                  onChange={e => setForm(prev => ({ ...prev, unit_cost_kes: e.target.value }))}
                  className={fieldClass}
                />
              </div>
            )}

            <div className="flex items-end">
              <label className="flex h-8 cursor-pointer items-center gap-2 rounded border border-slate-300 bg-slate-50 px-2.5 text-xs font-semibold text-slate-700">
                <input
                  type="checkbox"
                  checked={form.is_active}
                  onChange={e => setForm(prev => ({ ...prev, is_active: e.target.checked }))}
                />
                Active product
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </form>
      ) : (
        <section className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-md border border-slate-300 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Selling price</p>
            {product.category === 'cylinder' || returnable ? (
              <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                <div className="flex justify-between"><span>Refill</span><strong className="tabular-nums text-slate-900">{formatKES(product.refill_price_kes)}</strong></div>
                <div className="flex justify-between"><span>New / Complete</span><strong className="tabular-nums text-slate-900">{formatKES(product.complete_price_kes)}</strong></div>
              </div>
            ) : (
              <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{formatKES(product.accessory_price_kes || product.complete_price_kes)}</p>
            )}
          </div>

          {canEditProduct && (
            <div className="rounded-md border border-slate-300 bg-white p-3">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Cost price</p>
              {loadingCost ? (
                <div className="mt-1.5 space-y-1.5">
                  <Skeleton className="h-3.5 w-28 rounded" />
                  {product.category === 'cylinder' && <Skeleton className="h-3.5 w-24 rounded" />}
                </div>
              ) : product.category === 'cylinder' ? (
                <div className="mt-1 space-y-0.5 text-xs text-slate-600">
                  <div className="flex justify-between"><span>Refill</span><strong className="tabular-nums text-slate-900">{cost?.refill_cost_kes != null ? formatKES(cost.refill_cost_kes) : '—'}</strong></div>
                  <div className="flex justify-between"><span>New / Complete</span><strong className="tabular-nums text-slate-900">{cost?.complete_cost_kes != null ? formatKES(cost.complete_cost_kes) : '—'}</strong></div>
                </div>
              ) : (
                <p className="mt-1 text-base font-bold tabular-nums text-slate-900">{cost?.unit_cost_kes != null ? formatKES(cost.unit_cost_kes) : '—'}</p>
              )}
            </div>
          )}

          <div className="rounded-md border border-slate-300 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total filled (all branches)</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{totals.full.toLocaleString()}</p>
          </div>

          <div className="rounded-md border border-slate-300 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{returnable ? 'Total empty (all branches)' : 'Total units'}</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{(returnable ? totals.empty : totals.full).toLocaleString()}</p>
          </div>
        </section>
      )}

      {/* Stock by branch (clickable to filter movements) */}
      <section className="rounded-md border border-slate-300 bg-white p-2.5">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-slate-700">
            <Building2 className="h-3.5 w-3.5 text-orange-600" /> Branch stock
          </h2>
          {branchFilter !== 'all' && (
            <button type="button" onClick={() => setBranchFilter('all')} className="text-xs font-semibold text-orange-700 hover:underline">
              Show all branches
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {branchStocks.map(({ branch, full, empty }) => {
            const selected = branchFilter === branch.id;
            return (
              <button
                key={branch.id}
                type="button"
                onClick={() => setBranchFilter(selected ? 'all' : branch.id)}
                className={`rounded-md border p-2 text-left transition ${
                  selected ? 'border-orange-500 bg-orange-50/70 ring-1 ring-orange-400' : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100/70'
                }`}
              >
                <p className="truncate text-xs font-bold text-slate-900">{branch.name}</p>
                <div className="mt-1 flex items-baseline justify-between text-xs tabular-nums">
                  <span className="text-slate-500">Full <strong className="text-slate-900">{full}</strong></span>
                  {returnable && <span className="text-slate-500">Empty <strong className="text-slate-900">{empty}</strong></span>}
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Movement history */}
      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white p-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <h2 className="mr-2 text-xs font-bold uppercase tracking-wide text-slate-800">Stock movement</h2>
            <select value={branchFilter} onChange={e => setBranchFilter(e.target.value)} aria-label="Filter movement by branch" className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none">
              <option value="all">All branches</option>
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
            <select value={actionFilter} onChange={e => setActionFilter(e.target.value as AuditAction)} aria-label="Filter movement by action" className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none">
              <option value="all">All actions</option>
              {Object.entries(ACTION_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <input type="date" value={dayFilter} onChange={e => setDayFilter(e.target.value)} aria-label="Filter movement by date" className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none" />
            {(branchFilter !== 'all' || actionFilter !== 'all' || dayFilter) && (
              <button type="button" onClick={() => { setBranchFilter('all'); setActionFilter('all'); setDayFilter(''); }} className="h-8 px-1.5 text-xs font-semibold text-orange-700 hover:underline">
                Clear
              </button>
            )}
          </div>
          <div className="flex items-center gap-3 text-xs tabular-nums text-slate-600">
            <span>Full: <strong className="text-emerald-700">+{movementSummary.fullIn}</strong> / <strong className="text-rose-700">-{movementSummary.fullOut}</strong></span>
            {returnable && <span>Empty: <strong className="text-emerald-700">+{movementSummary.emptyIn}</strong> / <strong className="text-rose-700">-{movementSummary.emptyOut}</strong></span>}
            <button type="button" onClick={() => void loadMovements()} className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
              <RefreshCw className={`h-3.5 w-3.5 ${loadingMovements ? 'animate-spin' : ''}`} /> Refresh
            </button>
          </div>
        </div>

        <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2.5 py-1.5">When</th>
                  <th className="px-2 py-1.5">Action</th>
                  <th className="px-2 py-1.5">Branch</th>
                  <th className="px-2 py-1.5 text-right">Full</th>
                  {returnable && <th className="px-2 py-1.5 text-right">Empty</th>}
                  <th className="px-2 py-1.5">By</th>
                  <th className="px-2.5 py-1.5">Note</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loadingMovements && Array.from({ length: 6 }).map((_, i) => (
                  <tr key={`sk-${i}`} className="odd:bg-white even:bg-slate-50/50">
                    <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="h-4 w-16 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="h-3.5 w-20 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="ml-auto h-3.5 w-16 rounded" /></td>
                    {returnable && <td className="px-2 py-2"><Skeleton className="ml-auto h-3.5 w-16 rounded" /></td>}
                    <td className="px-2 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                    <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-36 rounded" /></td>
                  </tr>
                ))}
                {!loadingMovements && movements.map(m => {
                  const b = pick(m.branch);
                  const a = pick(m.actor);
                  const style = ACTION_STYLE[m.action] ?? ACTION_STYLE.edit;
                  return (
                    <tr key={m.id} className="odd:bg-white even:bg-slate-50/50">
                      <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-slate-600">
                        <div>{new Date(m.created_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}</div>
                        {m.stock_date && m.action === 'initial' && (
                          <div className="text-[10px] font-medium text-purple-700">Stock date: {m.stock_date}</div>
                        )}
                      </td>
                      <td className="px-2 py-1.5">
                        <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${style.cls}`}>{style.label}</span>
                      </td>
                      <td className="px-2 py-1.5 font-medium text-slate-700">{b?.name ?? '—'}</td>
                      <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-800">
                        {m.prev_full} → <strong>{m.new_full}</strong>{deltaBadge(m.prev_full, m.new_full)}
                      </td>
                      {returnable && (
                        <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-800">
                          {m.prev_empty} → <strong>{m.new_empty}</strong>{deltaBadge(m.prev_empty, m.new_empty)}
                        </td>
                      )}
                      <td className="px-2 py-1.5 text-slate-600">{a?.full_name ?? '—'}</td>
                      <td className="max-w-[260px] truncate px-2.5 py-1.5 text-slate-500" title={m.note ?? ''}>{m.note || '—'}</td>
                    </tr>
                  );
                })}
                {!loadingMovements && movements.length === 0 && (
                  <tr>
                    <td colSpan={returnable ? 7 : 6} className="px-3 py-8 text-center text-slate-500">
                      No stock movement recorded for this product yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
