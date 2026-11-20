'use client';

import React, { useMemo, useState } from 'react';
import { Flame, Pencil, Plus, Save, Trash2, X } from 'lucide-react';
import type { Product } from '@/types';
import { hasEmptyState } from '@/lib/formatters';
import { groupProducts } from '@/lib/product-order';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';
import { Skeleton } from '@/components/ui/skeleton';

export interface CustomerCylinderRow {
  id: string;
  customer_id: string;
  product_id: string;
  quantity: number;
  serial_number: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  product?: { id: string; name: string; brand: string; size_kg: number | null; category: string } | { id: string; name: string; brand: string; size_kg: number | null; category: string }[] | null;
}

const pick = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

interface Props {
  customerId: string;
  cylinders: CustomerCylinderRow[];
  loading: boolean;
  products: Product[];
  canEdit: boolean;
  onChanged: () => Promise<void>;
}

export function CustomerCylindersCard({
  customerId,
  cylinders,
  loading,
  products,
  canEdit,
  onChanged,
}: Props) {
  const { showError, showSuccess } = useToast();
  const [adding, setAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [productId, setProductId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [serialNumber, setSerialNumber] = useState('');
  const [notes, setNotes] = useState('');

  const returnableGroups = useMemo(
    () => groupProducts(products.filter(p => p.is_active && hasEmptyState(p)), p => p),
    [products],
  );

  const resetForm = () => {
    setAdding(false);
    setEditingId(null);
    setProductId('');
    setQuantity('1');
    setSerialNumber('');
    setNotes('');
  };

  const beginAdd = () => {
    setEditingId(null);
    setProductId(returnableGroups[0]?.items[0]?.id || '');
    setQuantity('1');
    setSerialNumber('');
    setNotes('');
    setAdding(true);
  };

  const beginEdit = (row: CustomerCylinderRow) => {
    setAdding(false);
    setEditingId(row.id);
    setProductId(row.product_id);
    setQuantity(String(row.quantity));
    setSerialNumber(row.serial_number || '');
    setNotes(row.notes || '');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canEdit) return;
    const qty = Math.floor(Number(quantity));
    if (!productId) return showError('Select a cylinder product.');
    if (!Number.isFinite(qty) || qty < 1) return showError('Quantity must be at least 1.');

    setSaving(true);
    const supabase = createClient();
    const payload = {
      product_id: productId,
      quantity: qty,
      serial_number: serialNumber.trim() || null,
      notes: notes.trim() || null,
      updated_at: new Date().toISOString(),
    };

    const { error } = editingId
      ? await supabase.from('customer_cylinders').update(payload).eq('id', editingId)
      : await supabase.from('customer_cylinders').insert({ ...payload, customer_id: customerId });

    setSaving(false);
    if (error) return showError(error.message);
    showSuccess(editingId ? 'Original cylinder updated.' : 'Original cylinder added.');
    resetForm();
    await onChanged();
  };

  const handleRemove = async (row: CustomerCylinderRow) => {
    if (!canEdit) return;
    const p = pick(row.product);
    if (!window.confirm(`Remove ${row.quantity} × ${p?.name || 'this cylinder'} from customer's original cylinders?`)) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('customer_cylinders').delete().eq('id', row.id);
    setSaving(false);
    if (error) return showError(error.message);
    showSuccess('Original cylinder removed.');
    if (editingId === row.id) resetForm();
    await onChanged();
  };

  return (
    <section className="rounded-md border border-slate-300 bg-white">
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
        <div className="flex items-center gap-2">
          <Flame className="h-4 w-4 text-orange-600" />
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Original Cylinders</h2>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-600">
            {cylinders.reduce((sum, c) => sum + c.quantity, 0)}
          </span>
        </div>
        {canEdit && !adding && !editingId && (
          <button
            type="button"
            onClick={beginAdd}
            className="inline-flex h-7 items-center gap-1 rounded bg-orange-600 px-2.5 text-xs font-semibold text-white hover:bg-orange-700"
          >
            <Plus className="h-3.5 w-3.5" /> Add cylinder
          </button>
        )}
      </div>

      {(adding || editingId) && (
        <form onSubmit={handleSave} className="space-y-2 border-b border-orange-200 bg-orange-50/40 p-3">
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-12">
            <div className="col-span-2 sm:col-span-5">
              <label className={labelClass}>Cylinder / Container *</label>
              <select
                required
                value={productId}
                onChange={e => setProductId(e.target.value)}
                className={fieldClass}
              >
                <option value="">Choose cylinder…</option>
                {returnableGroups.map(group => (
                  <optgroup key={group.key} label={group.label}>
                    {group.items.map(p => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Qty *</label>
              <input
                type="number"
                min="1"
                step="1"
                required
                value={quantity}
                onChange={e => setQuantity(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div className="col-span-1 sm:col-span-2">
              <label className={labelClass}>Serial / Tag</label>
              <input
                value={serialNumber}
                onChange={e => setSerialNumber(e.target.value)}
                placeholder="Optional"
                className={fieldClass}
              />
            </div>
            <div className="col-span-2 sm:col-span-3">
              <label className={labelClass}>Notes</label>
              <input
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="e.g. Kitchen, Original shell"
                className={fieldClass}
              />
            </div>
          </div>
          <div className="flex justify-end gap-1.5">
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-50"
            >
              <X className="h-3.5 w-3.5" /> Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-7 items-center gap-1 rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : editingId ? 'Update' : 'Save cylinder'}
            </button>
          </div>
        </form>
      )}

      <div className="divide-y divide-slate-200">
        {loading && Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between px-3 py-2.5">
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-36 rounded" />
              <Skeleton className="h-3 w-24 rounded" />
            </div>
            <Skeleton className="h-7 w-16 rounded" />
          </div>
        ))}

        {!loading && cylinders.length === 0 && (
          <p className="px-3 py-6 text-center text-xs text-slate-500">
            No original cylinder recorded yet. Click <strong>Add cylinder</strong> to capture what this customer owns.
          </p>
        )}

        {!loading && cylinders.map(row => {
          const p = pick(row.product);
          return (
            <div key={row.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex h-5 min-w-5 items-center justify-center rounded bg-orange-100 px-1.5 text-xs font-bold tabular-nums text-orange-800">
                    {row.quantity}×
                  </span>
                  <span className="text-sm font-semibold text-slate-900">{p?.name || 'Cylinder'}</span>
                  {row.serial_number && (
                    <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-slate-700">
                      #{row.serial_number}
                    </span>
                  )}
                </div>
                {(row.notes || row.updated_at) && (
                  <p className="mt-0.5 text-[11px] text-slate-500">
                    {row.notes ? `${row.notes} · ` : ''}
                    Updated {new Date(row.updated_at).toLocaleDateString('en-KE', { dateStyle: 'medium' })}
                  </p>
                )}
              </div>
              {canEdit && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => beginEdit(row)}
                    className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3 w-3" /> Edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void handleRemove(row)}
                    aria-label="Remove cylinder"
                    className="inline-flex h-7 w-7 items-center justify-center rounded border border-slate-300 bg-white text-slate-500 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
