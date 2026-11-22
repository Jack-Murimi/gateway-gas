'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  Ban,
  CheckCircle2,
  CreditCard,
  Download,
  Printer,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from 'lucide-react';
import type { Branch, MpesaTransaction, Order, PaymentMethod, StaffProfile } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { useToast } from '@/components/ui/toast';
import { formatKES } from '@/lib/formatters';
import { buildSalesCsv } from '@/lib/finance';
import { rankMpesaCandidates } from '@/lib/mpesa';
import { fieldClass, labelClass, PAYMENT_METHODS } from './pos-ui';
import { Skeleton } from '@/components/ui/skeleton';

type DatePreset = 'today' | 'yesterday' | 'last_7' | 'this_month' | 'custom';
type StatusFilter = 'all' | 'paid' | 'unpaid' | 'cancelled';

interface DetailedSalesOrder extends Order {
  branch_ref?: { name: string; code?: string } | { name: string; code?: string }[] | null;
  rep_ref?: { full_name: string } | { full_name: string }[] | null;
}

const pick = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);
const todayISO = () => new Date().toLocaleDateString('en-CA');
const offsetDaysISO = (days: number) => {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA');
};
const monthStartISO = () => `${todayISO().slice(0, 7)}-01`;

interface Props {
  branches: Branch[];
  currentUser: StaffProfile;
  onCancelOrder: (orderId: string, reason?: string) => Promise<void>;
  onMutated: () => Promise<void>;
}

export function SalesHistoryPanel({ branches, currentUser, onCancelOrder, onMutated }: Props) {
  const { showError, showSuccess } = useToast();
  const canVoid = ['admin', 'director', 'operator'].includes(currentUser.role);

  const [preset, setPreset] = useState<DatePreset>('today');
  const [customStart, setCustomStart] = useState(todayISO);
  const [customEnd, setCustomEnd] = useState(todayISO);
  const [branchFilter, setBranchFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [search, setSearch] = useState('');

  const [orders, setOrders] = useState<DetailedSalesOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [settlingOrder, setSettlingOrder] = useState<DetailedSalesOrder | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('mpesa');
  const [settleRef, setSettleRef] = useState('');
  const [settleMpesaId, setSettleMpesaId] = useState<string | null>(null);
  const [unmatchedMpesa, setUnmatchedMpesa] = useState<MpesaTransaction[]>([]);
  const [printOrder, setPrintOrder] = useState<DetailedSalesOrder | null>(null);

  const dateRange = useMemo(() => {
    const today = todayISO();
    if (preset === 'today') return { start: today, end: today };
    if (preset === 'yesterday') {
      const y = offsetDaysISO(1);
      return { start: y, end: y };
    }
    if (preset === 'last_7') return { start: offsetDaysISO(6), end: today };
    if (preset === 'this_month') return { start: monthStartISO(), end: today };
    return { start: customStart || today, end: customEnd || today };
  }, [preset, customStart, customEnd]);

  const loadOrders = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    let q = supabase
      .from('orders')
      .select('*, items:order_items(*), branch_ref:branches(name,code), rep_ref:profiles!orders_sales_rep_id_fkey(full_name)')
      .gte('created_at', `${dateRange.start}T00:00:00+03:00`)
      .lte('created_at', `${dateRange.end}T23:59:59.999+03:00`)
      .order('created_at', { ascending: false })
      .limit(500);

    if (branchFilter !== 'all') q = q.eq('branch_id', branchFilter);
    if (methodFilter !== 'all') q = q.eq('payment_method', methodFilter);
    if (statusFilter === 'cancelled') q = q.eq('delivery_status', 'cancelled');
    else if (statusFilter === 'paid') q = q.neq('delivery_status', 'cancelled').eq('payment_status', 'paid');
    else if (statusFilter === 'unpaid') q = q.neq('delivery_status', 'cancelled').neq('payment_status', 'paid');

    const { data, error } = await q;
    if (error) {
      showError(`Could not load sales history: ${error.message}`);
      setOrders([]);
    } else {
      setOrders((data as unknown as DetailedSalesOrder[]) || []);
    }
    setLoading(false);
  }, [dateRange.start, dateRange.end, branchFilter, methodFilter, statusFilter, showError]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  const loadUnmatchedMpesa = useCallback(async () => {
    const supabase = createClient();
    const { data } = await supabase
      .from('mpesa_transactions')
      .select('id, trans_id, trans_time, trans_amount, business_short_code, bill_ref_number, msisdn, payer_name, branch_id, status, created_at')
      .eq('status', 'unmatched')
      .order('trans_time', { ascending: false })
      .limit(20);
    if (data) {
      setUnmatchedMpesa(
        (data as any[]).map((r) => ({ ...r, trans_amount: Number(r.trans_amount || 0) })) as MpesaTransaction[],
      );
    }
  }, []);

  useEffect(() => {
    if (settlingOrder && settleMethod === 'mpesa') {
      void loadUnmatchedMpesa();
    }
  }, [settlingOrder, settleMethod, loadUnmatchedMpesa]);

  const filteredOrders = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const branchName = pick(o.branch_ref)?.name || '';
      const repName = pick(o.rep_ref)?.full_name || '';
      return [
        o.receipt_number,
        o.order_number,
        o.customer_name,
        o.customer_phone,
        o.lpo_number,
        o.payment_reference,
        o.sale_comment,
        branchName,
        repName,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [orders, search]);

  const stats = useMemo(() => {
    let billed = 0;
    let collected = 0;
    let unpaid = 0;
    let activeCount = 0;
    for (const o of filteredOrders) {
      if (o.delivery_status === 'cancelled') continue;
      activeCount += 1;
      const amt = Number(o.total_kes || 0);
      billed += amt;
      if (o.payment_status === 'paid') collected += amt;
      else unpaid += amt;
    }
    return { billed, collected, unpaid, activeCount };
  }, [filteredOrders]);

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
    showSuccess('Receipt marked as paid.');
    setSettlingOrder(null);
    setSettleRef('');
    setSettleMpesaId(null);
    await Promise.all([loadOrders(), onMutated()]);
  };

  const handleVoid = async (order: DetailedSalesOrder) => {
    if (!canVoid) return;
    const reason = window.prompt(
      `Reason for cancelling ${order.receipt_number || order.order_number}? Stock will be restored.`,
    );
    if (reason === null) return;
    setBusyId(order.id);
    try {
      await onCancelOrder(order.id, reason);
      showSuccess('Sale cancelled and stock restored.');
      await loadOrders();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to cancel sale.');
    } finally {
      setBusyId(null);
    }
  };

  const handlePrint = (order: DetailedSalesOrder) => {
    setPrintOrder(order);
    window.setTimeout(() => window.print(), 150);
  };

  const handleExportCsv = () => {
    if (!filteredOrders.length) {
      showError('No sales matching the current filter to export.');
      return;
    }
    const csv = buildSalesCsv(
      filteredOrders.map((o) => ({
        ...o,
        branch_name: pick(o.branch_ref)?.name || '',
        sales_rep_name: pick(o.rep_ref)?.full_name || '',
      })),
    );
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gateway-gas-sales-${dateRange.start}-to-${dateRange.end}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess(`Exported ${filteredOrders.length} sales to CSV.`);
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
    <>
      {printOrder && (
        <div className="fixed inset-0 z-[9999] hidden bg-white p-4 font-mono text-xs text-black print:block">
          <div className="mx-auto max-w-[320px] space-y-2 border-b border-dashed pb-4">
            <div className="text-center">
              <div className="text-sm font-bold">GATEWAY GAS NAIROBI</div>
              <div className="text-[10px]">CUSTOMER SALES RECEIPT</div>
              <div className="text-[10px]">================================</div>
            </div>
            <div>
              <div>Branch: {pick(printOrder.branch_ref)?.name || 'Station'}</div>
              <div>Receipt #: {printOrder.receipt_number || printOrder.order_number}</div>
              <div>Ticket #: {printOrder.order_number}</div>
              <div>Date: {new Date(printOrder.created_at).toLocaleString('en-KE')}</div>
              <div>Customer: {printOrder.customer_name}</div>
              {printOrder.customer_phone && <div>Phone: {printOrder.customer_phone}</div>}
              {printOrder.lpo_number && <div>LPO #: {printOrder.lpo_number}</div>}
            </div>
            <div className="space-y-1 border-t border-dashed pt-2">
              {(printOrder.items || []).map((it) => (
                <div key={it.id} className="flex justify-between gap-2">
                  <span>
                    {it.quantity}x {it.outgoing_brand}
                    {it.cylinder_size_kg ? ` ${it.cylinder_size_kg}kg` : ''} ({it.order_type})
                  </span>
                  <span>{formatKES(it.subtotal_kes)}</span>
                </div>
              ))}
            </div>
            <div className="space-y-1 border-t border-dashed pt-2">
              <div className="flex justify-between font-bold">
                <span>TOTAL:</span>
                <span>{formatKES(printOrder.total_kes)}</span>
              </div>
              <div>
                Status:{' '}
                {printOrder.delivery_status === 'cancelled'
                  ? 'CANCELLED'
                  : printOrder.payment_status === 'paid'
                    ? `PAID (${printOrder.payment_method.toUpperCase()})`
                    : 'UNPAID INVOICE'}
              </div>
              {printOrder.payment_reference && <div>Ref: {printOrder.payment_reference}</div>}
            </div>
            <div className="pt-3 text-center text-[10px]">Thank you for choosing Gateway Gas</div>
          </div>
        </div>
      )}

      <div className="space-y-2.5 print:hidden">
        {/* KPI Strip */}
        <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          <div className="rounded-md border border-slate-300 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Billed Sales</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{formatKES(stats.billed)}</p>
            <p className="text-[11px] text-slate-500">{stats.activeCount} active tickets</p>
          </div>
          <div className="rounded-md border border-slate-300 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Collected (Paid)</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-emerald-700">{formatKES(stats.collected)}</p>
            <p className="text-[11px] text-slate-500">Cash, M-Pesa & Bank</p>
          </div>
          <div className="rounded-md border border-slate-300 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-rose-700">Unpaid in Period</p>
            <p className="mt-1 text-lg font-bold tabular-nums text-rose-700">{formatKES(stats.unpaid)}</p>
            <p className="text-[11px] text-slate-500">Pending settlement</p>
          </div>
          <div className="rounded-md border border-slate-300 bg-white p-3">
            <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Date Window</p>
            <p className="mt-1 text-sm font-bold tabular-nums text-slate-900">
              {dateRange.start === dateRange.end ? dateRange.start : `${dateRange.start} → ${dateRange.end}`}
            </p>
            <p className="text-[11px] text-slate-500">Live database query</p>
          </div>
        </section>

        {/* Filter Bar */}
        <section className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2">
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Receipt #, ticket, customer, phone, LPO, ref…"
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
            value={preset}
            onChange={(e) => setPreset(e.target.value as DatePreset)}
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="last_7">Last 7 days</option>
            <option value="this_month">This month</option>
            <option value="custom">Custom range</option>
          </select>

          {preset === 'custom' && (
            <>
              <input
                type="date"
                value={customStart}
                onChange={(e) => setCustomStart(e.target.value)}
                className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none"
              />
              <input
                type="date"
                value={customEnd}
                onChange={(e) => setCustomEnd(e.target.value)}
                className="h-8 rounded border border-slate-300 bg-white px-2 text-xs text-slate-700 outline-none"
              />
            </>
          )}

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

          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">All statuses</option>
            <option value="paid">Paid</option>
            <option value="unpaid">Unpaid</option>
            <option value="cancelled">Cancelled</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => setMethodFilter(e.target.value as 'all' | PaymentMethod)}
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
          >
            <option value="all">All methods</option>
            {PAYMENT_METHODS.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => void loadOrders()}
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </section>

        {/* Table */}
        <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-2.5 py-2">When</th>
                  <th className="px-2 py-2">Receipt / Ticket</th>
                  <th className="px-2 py-2">Customer</th>
                  <th className="px-2 py-2">Branch</th>
                  <th className="px-2 py-2">Items</th>
                  <th className="px-2 py-2">Payment</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2.5 py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {loading &&
                  Array.from({ length: 6 }).map((_, i) => (
                    <tr key={`sk-${i}`}>
                      <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                      <td className="px-2 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                      <td className="px-2 py-2"><Skeleton className="h-3.5 w-32 rounded" /></td>
                      <td className="px-2 py-2"><Skeleton className="h-3.5 w-16 rounded" /></td>
                      <td className="px-2 py-2"><Skeleton className="h-3.5 w-40 rounded" /></td>
                      <td className="px-2 py-2"><Skeleton className="h-4 w-20 rounded" /></td>
                      <td className="px-2 py-2"><Skeleton className="ml-auto h-3.5 w-16 rounded" /></td>
                      <td className="px-2.5 py-2"><Skeleton className="ml-auto h-6 w-24 rounded" /></td>
                    </tr>
                  ))}

                {!loading &&
                  filteredOrders.map((order) => {
                    const branchName = pick(order.branch_ref)?.name || '—';
                    const cancelled = order.delivery_status === 'cancelled';
                    const unpaid = !cancelled && order.payment_status !== 'paid';
                    const isSettling = settlingOrder?.id === order.id;

                    return (
                      <React.Fragment key={order.id}>
                        <tr
                          className={
                            cancelled
                              ? 'bg-slate-50/80 text-slate-400 line-through'
                              : unpaid
                                ? 'bg-rose-50/35'
                                : 'odd:bg-white even:bg-slate-50/40'
                          }
                        >
                          <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-slate-600">
                            {new Date(order.created_at).toLocaleString('en-KE', {
                              dateStyle: 'short',
                              timeStyle: 'short',
                            })}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2">
                            <div className="font-mono font-bold text-slate-900">
                              {order.receipt_number || order.order_number}
                            </div>
                            {order.receipt_number && (
                              <div className="text-[10px] text-slate-400">{order.order_number}</div>
                            )}
                            {order.lpo_number && (
                              <div className="text-[10px] font-semibold text-indigo-700">
                                LPO: {order.lpo_number}
                              </div>
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
                            <div className="text-[10px] text-slate-500">
                              {order.is_pos_walkin ? 'Walk-in' : `Delivery · ${order.delivery_estate || ''}`}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-medium text-slate-700">{branchName}</td>
                          <td className="px-2 py-2">
                            {(order.items || []).map((it) => (
                              <div key={it.id} className="text-slate-800">
                                <strong>{it.quantity}×</strong> {it.outgoing_brand}
                                {it.cylinder_size_kg ? ` ${it.cylinder_size_kg}kg` : ''}{' '}
                                <span className="text-[10px] uppercase text-slate-500">({it.order_type})</span>
                              </div>
                            ))}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2">
                            {cancelled ? (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                Cancelled
                              </span>
                            ) : unpaid ? (
                              <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">
                                Unpaid
                              </span>
                            ) : (
                              <div>
                                <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                                  Paid · {order.payment_method}
                                </span>
                                {order.payment_reference && (
                                  <div className="mt-0.5 max-w-[140px] truncate font-mono text-[10px] text-slate-500" title={order.payment_reference}>
                                    {order.payment_reference}
                                  </div>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums text-slate-900">
                            {formatKES(order.total_kes)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2 text-right">
                            <div className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handlePrint(order)}
                                title="Print receipt"
                                className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
                              >
                                <Printer className="h-3.5 w-3.5" />
                              </button>
                              {unpaid && (
                                <button
                                  type="button"
                                  disabled={busyId === order.id}
                                  onClick={() => {
                                    setSettlingOrder(isSettling ? null : order);
                                    setSettleMethod('mpesa');
                                    setSettleRef('');
                                    setSettleMpesaId(null);
                                  }}
                                  className="inline-flex h-7 items-center gap-1 rounded bg-emerald-600 px-2 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                >
                                  <CreditCard className="h-3 w-3" /> Settle
                                </button>
                              )}
                              {canVoid && !cancelled && (
                                <button
                                  type="button"
                                  disabled={busyId === order.id}
                                  onClick={() => void handleVoid(order)}
                                  title="Cancel sale & restore stock"
                                  className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                >
                                  <Ban className="h-3 w-3" /> Void
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>

                        {isSettling && (
                          <tr className="bg-emerald-50/70">
                            <td colSpan={8} className="px-3 py-2.5">
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

                {!loading && filteredOrders.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-10 text-center text-slate-500">
                      No sales found for the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </>
  );
}
