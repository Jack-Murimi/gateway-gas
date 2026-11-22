'use client';

import { useCallback, useEffect, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import type { Branch } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';
import { Skeleton } from '@/components/ui/skeleton';

type AuditAction = 'all' | 'initial' | 'daily' | 'adjustment' | 'sale' | 'cancel' | 'purchase' | 'transfer' | 'edit';

interface AuditRow {
  id: string;
  batch_id: string;
  action: Exclude<AuditAction, 'all'>;
  branch_id: string;
  product_id: string;
  prev_full: number;
  prev_empty: number;
  new_full: number;
  new_empty: number;
  note: string | null;
  stock_date?: string | null;
  created_at: string;
  branch?: { name: string } | { name: string }[] | null;
  product?: { name: string; brand: string; size_kg: number | null } | { name: string; brand: string; size_kg: number | null }[] | null;
  actor?: { full_name: string } | { full_name: string }[] | null;
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

const delta = (prev: number, next: number) => {
  const d = next - prev;
  if (d === 0) return null;
  return <span className={`ml-1 text-[11px] font-semibold ${d > 0 ? 'text-emerald-700' : 'text-rose-700'}`}>({d > 0 ? `+${d}` : d})</span>;
};

export function StockAudit({ branches, branchId, onBranchChange }: { branches: Branch[]; branchId: string; onBranchChange: (id: string) => void }) {
  const [action, setAction] = useState<AuditAction>('all');
  const [day, setDay] = useState('');
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const runQuery = (includeStockDate: boolean) => {
      const cols = includeStockDate
        ? 'id,batch_id,action,branch_id,product_id,prev_full,prev_empty,new_full,new_empty,note,stock_date,created_at,branch:branches(name),product:products(name,brand,size_kg),actor:profiles(full_name)'
        : 'id,batch_id,action,branch_id,product_id,prev_full,prev_empty,new_full,new_empty,note,created_at,branch:branches(name),product:products(name,brand,size_kg),actor:profiles(full_name)';
      let q = supabase
        .from('stock_audit_log')
        .select(cols)
        .order('created_at', { ascending: false })
        .limit(250);
      if (branchId !== 'all') q = q.eq('branch_id', branchId);
      if (action !== 'all') q = q.eq('action', action);
      if (day) q = q.gte('created_at', `${day}T00:00:00+03:00`).lte('created_at', `${day}T23:59:59.999+03:00`);
      return q;
    };
    let { data, error } = await runQuery(true);
    if (error && error.code === '42703') {
      ({ data } = await runQuery(false));
    }
    setRows((data as unknown as AuditRow[]) || []);
    setLoading(false);
  }, [branchId, action, day]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-2">
      <section className="grid grid-cols-2 items-end gap-1.5 rounded-md border border-slate-300 bg-white p-2 sm:grid-cols-4 lg:grid-cols-[180px_160px_150px_auto]">
        <div>
          <label className={labelClass}>Branch</label>
          <select value={branchId} onChange={e => onBranchChange(e.target.value)} className={fieldClass}>
            <option value="all">All branches</option>
            {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Action</label>
          <select value={action} onChange={e => setAction(e.target.value as AuditAction)} className={fieldClass}>
            <option value="all">All actions</option>
            {Object.entries(ACTION_STYLE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div>
          <label className={labelClass}>Date</label>
          <input type="date" value={day} onChange={e => setDay(e.target.value)} className={fieldClass} />
        </div>
        <div className="flex items-center justify-end gap-1.5">
          {day && <button type="button" onClick={() => setDay('')} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-600">All dates</button>}
          <button type="button" onClick={() => void load()} className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh
          </button>
        </div>
      </section>

      <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2.5 py-1.5">When</th>
                <th className="px-2 py-1.5">Action</th>
                <th className="px-2 py-1.5">Branch</th>
                <th className="px-2 py-1.5">Product</th>
                <th className="px-2 py-1.5 text-right">Full</th>
                <th className="px-2 py-1.5 text-right">Empty</th>
                <th className="px-2 py-1.5">By</th>
                <th className="px-2.5 py-1.5">Note</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading && Array.from({ length: 8 }).map((_, i) => (
                <tr key={`sk-${i}`} className="odd:bg-white even:bg-slate-50/50">
                  <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                  <td className="px-2 py-2"><Skeleton className="h-4 w-16 rounded" /></td>
                  <td className="px-2 py-2"><Skeleton className="h-3.5 w-20 rounded" /></td>
                  <td className="px-2 py-2"><Skeleton className="h-3.5 w-36 rounded" /></td>
                  <td className="px-2 py-2"><Skeleton className="ml-auto h-3.5 w-16 rounded" /></td>
                  <td className="px-2 py-2"><Skeleton className="ml-auto h-3.5 w-16 rounded" /></td>
                  <td className="px-2 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                  <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-32 rounded" /></td>
                </tr>
              ))}
              {!loading && rows.map(r => {
                const p = pick(r.product);
                const b = pick(r.branch);
                const a = pick(r.actor);
                const meta = ACTION_STYLE[r.action] ?? ACTION_STYLE.edit;
                return (
                  <tr key={r.id} className="odd:bg-white even:bg-slate-50/50">
                    <td className="whitespace-nowrap px-2.5 py-1.5 tabular-nums text-slate-600">
                      <div>{new Date(r.created_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}</div>
                      {r.stock_date && r.action === 'initial' && (
                        <div className="text-[10px] font-medium text-purple-700">Stock date: {r.stock_date}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5"><span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${meta.cls}`}>{meta.label}</span></td>
                    <td className="px-2 py-1.5 font-medium text-slate-700">{b?.name ?? '—'}</td>
                    <td className="px-2 py-1.5 font-semibold text-slate-900">{p ? `${p.name} (${p.brand}${p.size_kg ? ` ${p.size_kg}kg` : ''})` : '—'}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-800">{r.prev_full} → <strong>{r.new_full}</strong>{delta(r.prev_full, r.new_full)}</td>
                    <td className="whitespace-nowrap px-2 py-1.5 text-right tabular-nums text-slate-800">{r.prev_empty} → <strong>{r.new_empty}</strong>{delta(r.prev_empty, r.new_empty)}</td>
                    <td className="px-2 py-1.5 text-slate-600">{a?.full_name ?? '—'}</td>
                    <td className="max-w-[240px] truncate px-2.5 py-1.5 text-slate-500" title={r.note ?? ''}>{r.note || '—'}</td>
                  </tr>
                );
              })}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={8} className="px-3 py-8 text-center text-slate-500">No stock changes recorded yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
