'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  CheckCircle2,
  CreditCard,
  MessageCircle,
  Phone,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Branch, MpesaTransaction, Order, PaymentMethod } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { formatKES, normalizeKenyanPhone } from '@/lib/formatters';
import {
  getAgingBucket,
  getInvoiceAgeDays,
  summarizeReceivablesAging,
  type AgingBucket,
} from '@/lib/finance';
import { rankMpesaCandidates } from '@/lib/mpesa';
import { fieldClass, labelClass, PAYMENT_METHODS } from './pos-ui';
import { Skeleton } from '@/components/ui/skeleton';

interface UnpaidOrderRow extends Order {
  branch_ref?: { name: string } | { name: string }[] | null;
}

const pick = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

const BUCKET_META: Array<{ id: AgingBucket; label: string; cls: string }> = [
  { id: '0-7', label: '0–7 days', cls: 'text-slate-900' },
  { id: '8-14', label: '8–14 days', cls: 'text-sky-800' },
  { id: '15-30', label: '15–30 days', cls: 'text-amber-800' },
  { id: '30+', label: '30+ days overdue', cls: 'text-rose-700' },
];

interface Props {
  branches: Branch[];
  onMutated: () => Promise<void>;
}

export function UnpaidInvoicesPanel({ branches, onMutated }: Props) {
  const { showError, showSuccess } = useToast();
  const [orders, setOrders] = useState<UnpaidOrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('all');
  const [bucketFilter, setBucketFilter] = useState<'all' | AgingBucket>('all');
  const [search, setSearch] = useState('');

  const [settlingOrder, setSettlingOrder] = useState<UnpaidOrderRow | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('mpesa');
  const [settleRef, setSettleRef] = useState('');
  const [settleMpesaId, setSettleMpesaId] = useState<string | null>(null);
  const [unmatchedMpesa, setUnmatchedMpesa] = useState<MpesaTransaction[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadUnpaid = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let q = supabase
      .from('orders')
      .select('*, items:order_items(*), branch_ref:branches(name)')
      .neq('delivery_status', 'cancelled')
      .neq('payment_status', 'paid')
      .order('created_at', { ascending: true })
      .limit(500);

    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);

    const { data, error } = await q;
    if (error) {
      showError(`Could not load unpaid invoices: ${error.message}`);
      setOrders([]);
    } else {
      setOrders((data as unknown as UnpaidOrderRow[]) || []);
    }
    setLoading(false);
  }, [branchFilter, showError]);

  useEffect(() => {
    void loadUnpaid();
  }, [loadUnpaid]);

  useEffect(() => {
    if (!settlingOrder || settleMethod !== 'mpesa') return;
    const supabase = createClient();
    void supabase
      .from('mpesa_transactions')
      .select('id, trans_id, trans_time, trans_amount, business_short_code, bill_ref_number, msisdn, payer_name, branch_id, status, created_at')
      .eq('status', 'unmatched')
      .order('trans_time', { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (data) {
          setUnmatchedMpesa(
            (data as any[]).map((r) => ({ ...r, trans_amount: Number(r.trans_amount || 0) })) as MpesaTransaction[],
          );
        }
      });
  }, [settlingOrder, settleMethod]);

  const aging = useMemo(() => summarizeReceivablesAging(orders), [orders]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      const days = getInvoiceAgeDays(o.created_at);
      if (bucketFilter !== 'all' && getAgingBucket(days) !== bucketFilter) return false;
      if (!q) return true;
      return [o.customer_name, o.customer_phone, o.receipt_number, o.order_number, o.lpo_number]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [orders, bucketFilter, search]);

  const handleSettle = async () => {
    if (!settlingOrder) return;
    setBusyId(settlingOrder.id);
    const supabase = createClient();
    const { error } = settleMpesaId
      ? await supabase.rpc('settle_customer_order', {
          p_order_id: settlingOrder.id,
          p_payment_method: settleMethod,
          p_payment_reference: settleRef.trim() || null,
          p_mpesa_transaction_id: settleMpesaId,
        })
      : await supabase.rpc('settle_customer_order', {
          p_order_id: settlingOrder.id,
          p_payment_method: settleMethod,
          p_payment_reference: settleRef.trim() || null,
        });
    setBusyId(null);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess('Invoice settled and marked as paid.');
    setSettlingOrder(null);
    setSettleRef('');
    setSettleMpesaId(null);
    await Promise.all([loadUnpaid(), onMutated()]);
  };

  const mpesaCandidates = useMemo(
    () =>
      settlingOrder
        ? rankMpesaCandidates(
            unmatchedMpesa,
            Number(settlingOrder.total_kes || 0),
            settlingOrder.branch_id,
            branches.find((b) => b.id === settlingOrder.branch_id)?.mpesa_shortcode,
          )
        : [],
    [settlingOrder, unmatchedMpesa, branches],
  );

  return (
    <div className="space-y-2.5">
      {/* Aging Summary Cards (clickable filters) */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-5">
        <button
          type="button"
          onClick={() => setBucketFilter('all')}
          className={`rounded-md border p-3 text-left transition ${
            bucketFilter === 'all' ? 'border-orange-500 bg-orange-50/50 ring-1 ring-orange-400' : 'border-slate-300 bg-white hover:bg-slate-50'
          }`}
        >
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Total Receivables</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{formatKES(aging.totalKes)}</p>
          <p className="text-[11px] text-slate-500">{aging.totalCount} open invoices</p>
        </button>

        {BUCKET_META.map((b) => {
          const data = aging.buckets[b.id];
          const active = bucketFilter === b.id;
          return (
            <button
              key={b.id}
              type="button"
              onClick={() => setBucketFilter(active ? 'all' : b.id)}
              className={`rounded-md border p-3 text-left transition ${
                active ? 'border-orange-500 bg-orange-50/50 ring-1 ring-orange-400' : 'border-slate-300 bg-white hover:bg-slate-50'
              }`}
            >
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">{b.label}</p>
              <p className={`mt-1 text-lg font-bold tabular-nums ${b.cls}`}>{formatKES(data.total_kes)}</p>
              <p className="text-[11px] text-slate-500">{data.count} invoice{data.count === 1 ? '' : 's'}</p>
            </button>
          );
        })}
      </section>

      {/* Filter Bar */}
      <section className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search customer, phone, receipt # or LPO…"
            className="h-8 w-full rounded border border-slate-300 bg-white pl-8 pr-7 text-xs text-slate-900 outline-none focus:border-orange-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="all">All branches</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => void loadUnpaid()}
          className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh
        </button>
      </section>

      {/* Unpaid Invoices Table */}
      <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[780px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-2.5 py-2">Age / Date</th>
                <th className="px-2 py-2">Receipt / LPO</th>
                <th className="px-2 py-2">Customer</th>
                <th className="px-2 py-2">Branch</th>
                <th className="px-2 py-2">Items</th>
                <th className="px-2 py-2 text-right">Amount Due</th>
                <th className="px-2.5 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {loading &&
                Array.from({ length: 5 }).map((_, i) => (
                  <tr key={`sk-${i}`}>
                    <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-20 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="h-3.5 w-32 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="h-3.5 w-16 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="h-3.5 w-40 rounded" /></td>
                    <td className="px-2 py-2"><Skeleton className="ml-auto h-3.5 w-16 rounded" /></td>
                    <td className="px-2.5 py-2"><Skeleton className="ml-auto h-6 w-24 rounded" /></td>
                  </tr>
                ))}

              {!loading &&
                filtered.map((order) => {
                  const days = getInvoiceAgeDays(order.created_at);
                  const branchName = pick(order.branch_ref)?.name || '—';
                  const isSettling = settlingOrder?.id === order.id;
                  const waDigits = order.customer_phone
                    ? normalizeKenyanPhone(order.customer_phone).replace(/\D/g, '')
                    : '';
                  const ageBadge =
                    days > 30
                      ? 'bg-rose-100 text-rose-800'
                      : days > 14
                        ? 'bg-amber-100 text-amber-900'
                        : 'bg-slate-100 text-slate-700';

                  return (
                    <React.Fragment key={order.id}>
                      <tr className="odd:bg-white even:bg-slate-50/40">
                        <td className="whitespace-nowrap px-2.5 py-2">
                          <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-bold tabular-nums ${ageBadge}`}>
                            {days}d old
                          </span>
                          <div className="mt-0.5 text-[10px] tabular-nums text-slate-500">
                            {new Date(order.created_at).toLocaleDateString('en-KE', {
                              day: '2-digit',
                              month: 'short',
                              year: 'numeric',
                            })}
                          </div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2">
                          <div className="font-mono font-bold text-slate-900">
                            {order.receipt_number || order.order_number}
                          </div>
                          {order.lpo_number && (
                            <div className="text-[10px] font-semibold text-indigo-700">LPO: {order.lpo_number}</div>
                          )}
                        </td>
                        <td className="px-2 py-2">
                          {order.customer_id ? (
                            <Link
                              href={`/customers/${order.customer_id}`}
                              className="font-semibold text-slate-900 hover:text-orange-700 hover:underline"
                            >
                              {order.customer_name}
                            </Link>
                          ) : (
                            <span className="font-semibold text-slate-900">{order.customer_name}</span>
                          )}
                          <div className="text-[10px] text-slate-500">{order.customer_phone}</div>
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 font-medium text-slate-700">{branchName}</td>
                        <td className="px-2 py-2">
                          {(order.items || []).map((it) => (
                            <div key={it.id} className="text-slate-700">
                              <strong>{it.quantity}×</strong> {it.outgoing_brand}
                              {it.cylinder_size_kg ? ` ${it.cylinder_size_kg}kg` : ''}
                            </div>
                          ))}
                        </td>
                        <td className="whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums text-rose-700">
                          {formatKES(order.total_kes)}
                        </td>
                        <td className="whitespace-nowrap px-2.5 py-2 text-right">
                          <div className="inline-flex items-center gap-1">
                            {order.customer_phone && (
                              <a
                                href={`tel:${order.customer_phone}`}
                                title="Call customer"
                                className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white text-emerald-700 hover:bg-emerald-50"
                              >
                                <Phone className="h-3.5 w-3.5" />
                              </a>
                            )}
                            {waDigits && (
                              <a
                                href={`https://wa.me/${waDigits}`}
                                target="_blank"
                                rel="noreferrer"
                                title="WhatsApp customer"
                                className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white text-emerald-700 hover:bg-emerald-50"
                              >
                                <MessageCircle className="h-3.5 w-3.5" />
                              </a>
                            )}
                            <button
                              type="button"
                              disabled={busyId === order.id}
                              onClick={() => {
                                setSettlingOrder(isSettling ? null : order);
                                setSettleMethod('mpesa');
                                setSettleRef('');
                                setSettleMpesaId(null);
                              }}
                              className="inline-flex h-7 items-center gap-1 rounded bg-emerald-600 px-2.5 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                            >
                              <CreditCard className="h-3 w-3" /> Settle
                            </button>
                          </div>
                        </td>
                      </tr>

                      {isSettling && (
                        <tr className="bg-emerald-50/70">
                          <td colSpan={7} className="px-3 py-2.5">
                            <div className="space-y-2">
                              <div className="flex flex-wrap items-end justify-end gap-2">
                                <div>
                                  <label className={labelClass}>Method</label>
                                  <select
                                    value={settleMethod}
                                    onChange={(e) => {
                                      setSettleMethod(e.target.value as PaymentMethod);
                                      setSettleMpesaId(null);
                                    }}
                                    className={fieldClass}
                                  >
                                    {PAYMENT_METHODS.map((m) => (
                                      <option key={m.value} value={m.value}>
                                        {m.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="min-w-[200px]">
                                  <label className={labelClass}>
                                    Reference {settleMpesaId ? '· Verified Till' : '(optional)'}
                                  </label>
                                  <input
                                    value={settleRef}
                                    onChange={(e) => {
                                      setSettleRef(e.target.value.toUpperCase());
                                      setSettleMpesaId(null);
                                    }}
                                    placeholder="M-Pesa / Bank / Cheque ref"
                                    className={fieldClass}
                                  />
                                </div>
                                <button
                                  type="button"
                                  onClick={() => setSettlingOrder(null)}
                                  className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-600"
                                >
                                  Cancel
                                </button>
                                <button
                                  type="button"
                                  disabled={busyId === order.id}
                                  onClick={() => void handleSettle()}
                                  className="inline-flex h-8 items-center gap-1 rounded bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Confirm paid ({formatKES(order.total_kes)})
                                </button>
                              </div>
                              {settleMethod === 'mpesa' && mpesaCandidates.length > 0 && (
                                <div className="flex flex-wrap items-center justify-end gap-1.5">
                                  <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-900">
                                    <ShieldCheck className="h-3.5 w-3.5" /> Match till receipt:
                                  </span>
                                  {mpesaCandidates.slice(0, 4).map((tx) => (
                                    <button
                                      key={tx.id}
                                      type="button"
                                      onClick={() => {
                                        setSettleMpesaId(tx.id);
                                        setSettleRef(tx.trans_id);
                                      }}
                                      className={`rounded border px-2 py-1 text-[11px] font-semibold ${
                                        settleMpesaId === tx.id
                                          ? 'border-emerald-600 bg-emerald-200 text-emerald-950'
                                          : 'border-emerald-300 bg-white text-slate-800 hover:bg-emerald-50'
                                      }`}
                                    >
                                      <span className="font-mono">{tx.trans_id}</span> · {formatKES(tx.trans_amount)}
                                    </button>
                                  ))}
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}

              {!loading && filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                    No unpaid invoices matching your filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
