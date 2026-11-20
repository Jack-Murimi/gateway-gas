'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Ban,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  History,
  MessageCircle,
  Phone,
  Receipt,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
} from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { displayKenyanPhone, formatKES, normalizeKenyanPhone } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';
import { Skeleton } from '@/components/ui/skeleton';
import type { Customer, CustomerLocation, CustomerPhone, Order, PaymentMethod } from '@/types';
import type { CustomerCylinderRow } from './customer-cylinders';
import { CustomerEditPanel } from './customer-edit-panel';

type Tab = 'receipts' | 'audit';
type ReceiptFilter = 'all' | 'unpaid' | 'paid' | 'cancelled';
type AuditFilter = 'all' | 'cylinder' | 'payment' | 'customer';

interface CustomerAuditRow {
  id: string;
  customer_id: string;
  entity_type: 'customer' | 'cylinder' | 'phone' | 'location' | 'payment';
  action: 'created' | 'updated' | 'deleted' | 'payment_recorded';
  summary: string;
  created_at: string;
  actor?: { full_name: string } | { full_name: string }[] | null;
}

interface DetailedOrder extends Order {
  branch_ref?: { name: string } | { name: string }[] | null;
}

const pick = <T,>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);

const AUDIT_BADGE: Record<CustomerAuditRow['entity_type'], { label: string; cls: string }> = {
  cylinder: { label: 'Cylinder', cls: 'bg-orange-50 text-orange-800' },
  payment: { label: 'Payment', cls: 'bg-emerald-50 text-emerald-800' },
  customer: { label: 'Profile', cls: 'bg-sky-50 text-sky-800' },
  phone: { label: 'Phone', cls: 'bg-indigo-50 text-indigo-800' },
  location: { label: 'Location', cls: 'bg-violet-50 text-violet-800' },
};

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank_transfer', label: 'Bank transfer' },
  { value: 'pdq', label: 'PDQ / Card' },
  { value: 'cheque', label: 'Cheque' },
];

function computePaymentHealth(orders: DetailedOrder[]) {
  const valid = orders.filter(o => o.delivery_status !== 'cancelled');
  if (valid.length === 0) {
    return {
      label: 'New',
      cls: 'bg-slate-100 text-slate-700',
      detail: 'No receipts recorded yet',
      paidRate: 100,
      unpaidCount: 0,
      balance: 0,
      oldestUnpaidDays: 0,
    };
  }
  const unpaid = valid.filter(o => o.payment_status !== 'paid');
  const paidCount = valid.length - unpaid.length;
  const paidRate = Math.round((paidCount / valid.length) * 100);
  const balance = unpaid.reduce((sum, o) => sum + Number(o.total_kes || 0), 0);
  const now = Date.now();
  const oldestUnpaidDays = unpaid.length
    ? Math.max(...unpaid.map(o => Math.max(0, Math.floor((now - new Date(o.created_at).getTime()) / 86400000))))
    : 0;

  if (unpaid.length === 0) {
    return { label: 'Excellent', cls: 'bg-emerald-100 text-emerald-800', detail: `100% paid (${paidCount}/${valid.length})`, paidRate, unpaidCount: 0, balance: 0, oldestUnpaidDays: 0 };
  }
  if (oldestUnpaidDays > 30 || unpaid.length >= 3 || paidRate < 60) {
    return { label: 'High Risk', cls: 'bg-rose-100 text-rose-800', detail: `${unpaid.length} unpaid · oldest ${oldestUnpaidDays}d`, paidRate, unpaidCount: unpaid.length, balance, oldestUnpaidDays };
  }
  if (oldestUnpaidDays > 14 || paidRate < 85) {
    return { label: 'Watch', cls: 'bg-amber-100 text-amber-900', detail: `${unpaid.length} unpaid · oldest ${oldestUnpaidDays}d`, paidRate, unpaidCount: unpaid.length, balance, oldestUnpaidDays };
  }
  return { label: 'Good', cls: 'bg-sky-100 text-sky-800', detail: `${paidRate}% paid · ${unpaid.length} pending`, paidRate, unpaidCount: unpaid.length, balance, oldestUnpaidDays };
}

export default function CustomerDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const customerId = typeof params?.id === 'string' ? params.id : '';

  const {
    currentUser,
    products,
    customers,
    updateCustomer,
    setCustomerActive,
    addCustomerPhone,
    updateCustomerPhone,
    removeCustomerPhone,
    addCustomerLocation,
    updateCustomerLocation,
    removeCustomerLocation,
    cancelOrder,
    refreshLiveData,
  } = useStore();
  const { showError, showSuccess } = useToast();

  const approved = currentUser?.approval_status === 'approved';
  const canView = approved && !!currentUser && ['admin', 'director', 'operator', 'sales_rep'].includes(currentUser.role);
  const canManage = approved && !!currentUser && ['admin', 'director', 'operator'].includes(currentUser.role);

  const [tab, setTab] = useState<Tab>('receipts');
  const [directCustomer, setDirectCustomer] = useState<Customer | null>(null);
  const [loadingCustomer, setLoadingCustomer] = useState(true);

  const [cylinders, setCylinders] = useState<CustomerCylinderRow[]>([]);
  const [loadingCylinders, setLoadingCylinders] = useState(true);

  const [orders, setOrders] = useState<DetailedOrder[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [receiptFilter, setReceiptFilter] = useState<ReceiptFilter>('all');

  const [auditRows, setAuditRows] = useState<CustomerAuditRow[]>([]);
  const [loadingAudit, setLoadingAudit] = useState(true);
  const [auditFilter, setAuditFilter] = useState<AuditFilter>('all');

  const [settlingOrderId, setSettlingOrderId] = useState<string | null>(null);
  const [settleMethod, setSettleMethod] = useState<PaymentMethod>('mpesa');
  const [settleRef, setSettleRef] = useState('');
  const [busyOrderId, setBusyOrderId] = useState<string | null>(null);

  const storeCustomer = useMemo(() => customers.find(c => c.id === customerId) ?? null, [customers, customerId]);
  const customer = directCustomer ?? storeCustomer;

  const loadCustomer = useCallback(async () => {
    if (!canView || !customerId) return;
    setLoadingCustomer(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('customers')
      .select('id, name, created_at, updated_at, is_active, phones:customer_phones(*), locations:customer_locations(*)')
      .eq('id', customerId)
      .maybeSingle();
    if (data) {
      setDirectCustomer({
        id: data.id,
        name: data.name ?? '',
        created_at: data.created_at,
        updated_at: data.updated_at,
        is_active: data.is_active,
        phones: ((data as any).phones || []) as CustomerPhone[],
        locations: ((data as any).locations || []) as CustomerLocation[],
      });
    }
    setLoadingCustomer(false);
  }, [canView, customerId]);

  const loadCylinders = useCallback(async () => {
    if (!canView || !customerId) return;
    setLoadingCylinders(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('customer_cylinders')
      .select('id, customer_id, product_id, quantity, serial_number, notes, created_at, updated_at, product:products(id, name, brand, size_kg, category)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: true });
    setCylinders((data as unknown as CustomerCylinderRow[]) || []);
    setLoadingCylinders(false);
  }, [canView, customerId]);

  const loadOrders = useCallback(async (phonesList?: CustomerPhone[]) => {
    if (!canView || !customerId) return;
    setLoadingOrders(true);
    const supabase = createClient();
    const { data: byId } = await supabase
      .from('orders')
      .select('*, items:order_items(*), branch_ref:branches(name)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(300);

    const merged = new Map<string, DetailedOrder>();
    ((byId as unknown as DetailedOrder[]) || []).forEach(o => merged.set(o.id, o));

    const phoneNumbers = Array.from(
      new Set(
        (phonesList || []).flatMap(p => {
          const raw = p.phone_number?.trim();
          const norm = raw ? normalizeKenyanPhone(raw) : '';
          return [raw, norm].filter(Boolean);
        }),
      ),
    );
    if (phoneNumbers.length > 0) {
      const { data: byPhone } = await supabase
        .from('orders')
        .select('*, items:order_items(*), branch_ref:branches(name)')
        .is('customer_id', null)
        .in('customer_phone', phoneNumbers)
        .order('created_at', { ascending: false })
        .limit(100);
      ((byPhone as unknown as DetailedOrder[]) || []).forEach(o => {
        if (!merged.has(o.id)) merged.set(o.id, o);
      });
    }

    const sorted = Array.from(merged.values()).sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    setOrders(sorted);
    setLoadingOrders(false);
  }, [canView, customerId]);

  const loadAudit = useCallback(async () => {
    if (!canView || !customerId) return;
    setLoadingAudit(true);
    const supabase = createClient();
    const { data } = await supabase
      .from('customer_audit_log')
      .select('id, customer_id, entity_type, action, summary, created_at, actor:profiles(full_name)')
      .eq('customer_id', customerId)
      .order('created_at', { ascending: false })
      .limit(200);
    setAuditRows((data as unknown as CustomerAuditRow[]) || []);
    setLoadingAudit(false);
  }, [canView, customerId]);

  useEffect(() => {
    void loadCustomer();
    void loadCylinders();
    void loadAudit();
  }, [loadCustomer, loadCylinders, loadAudit]);

  useEffect(() => {
    if (customer) {
      void loadOrders(customer.phones);
    } else if (!loadingCustomer) {
      void loadOrders([]);
    }
  }, [customer?.id, customer?.phones?.length, loadingCustomer, loadOrders]);

  const refreshAll = async () => {
    await Promise.all([loadCustomer(), loadCylinders(), loadOrders(customer?.phones), loadAudit()]);
  };

  const health = useMemo(() => computePaymentHealth(orders), [orders]);

  const spendStats = useMemo(() => {
    const valid = orders.filter(o => o.delivery_status !== 'cancelled');
    const lifetime = valid.reduce((sum, o) => sum + Number(o.total_kes || 0), 0);
    const avgOrder = valid.length ? lifetime / valid.length : 0;
    const lastOrder = valid[0]?.created_at ?? null;
    const daysSinceLast = lastOrder ? Math.max(0, Math.floor((Date.now() - new Date(lastOrder).getTime()) / 86400000)) : null;

    let avgCycleDays: number | null = null;
    if (valid.length >= 2) {
      const oldest = new Date(valid[valid.length - 1].created_at).getTime();
      const newest = new Date(valid[0].created_at).getTime();
      const spanDays = Math.max(0, (newest - oldest) / 86400000);
      avgCycleDays = Math.round(spanDays / (valid.length - 1));
    }
    return { lifetime, count: valid.length, avgOrder, lastOrder, daysSinceLast, avgCycleDays };
  }, [orders]);

  const filteredOrders = useMemo(() => {
    return orders.filter(o => {
      if (receiptFilter === 'cancelled') return o.delivery_status === 'cancelled';
      if (receiptFilter === 'unpaid') return o.delivery_status !== 'cancelled' && o.payment_status !== 'paid';
      if (receiptFilter === 'paid') return o.delivery_status !== 'cancelled' && o.payment_status === 'paid';
      return true;
    });
  }, [orders, receiptFilter]);

  const filteredAudit = useMemo(() => {
    if (auditFilter === 'all') return auditRows;
    return auditRows.filter(r => r.entity_type === auditFilter);
  }, [auditRows, auditFilter]);

  const handleSettleOrder = async (orderId: string) => {
    if (!canManage) return;
    setBusyOrderId(orderId);
    const supabase = createClient();
    const { error } = await supabase.rpc('settle_customer_order', {
      p_order_id: orderId,
      p_payment_method: settleMethod,
      p_payment_reference: settleRef.trim() || null,
    });
    setBusyOrderId(null);
    if (error) return showError(error.message);
    showSuccess('Receipt marked as paid.');
    setSettlingOrderId(null);
    setSettleRef('');
    await Promise.all([loadOrders(customer?.phones), loadAudit(), refreshLiveData()]);
  };

  const handleCancelOrder = async (order: DetailedOrder) => {
    if (!canManage) return;
    const reason = window.prompt(`Reason for cancelling ${order.receipt_number || order.order_number}? (Stock will be restored)`);
    if (reason === null) return;
    setBusyOrderId(order.id);
    try {
      await cancelOrder(order.id, reason);
      showSuccess('Receipt cancelled and stock restored.');
      await Promise.all([loadOrders(customer?.phones), loadAudit()]);
    } catch (e) {
      showError(e instanceof Error ? e.message : 'Could not cancel receipt.');
    } finally {
      setBusyOrderId(null);
    }
  };

  if (!canView) {
    return (
      <main className="mx-auto max-w-md px-4 py-20 text-center">
        <h1 className="text-lg font-bold text-slate-900">Restricted access</h1>
        <p className="mt-1 text-sm text-slate-500">Approved staff access is required to view customer profiles.</p>
      </main>
    );
  }

  if (!customer && loadingCustomer) {
    return (
      <main className="mx-auto max-w-[1440px] space-y-3 px-2 pb-24 pt-2 sm:px-4 lg:px-5">
        <div className="flex items-center justify-between rounded-md border border-slate-300 bg-white px-3 py-2.5">
          <div className="flex items-center gap-3">
            <Skeleton className="h-8 w-8 rounded" />
            <div className="space-y-1.5">
              <Skeleton className="h-4 w-44 rounded" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
          </div>
          <Skeleton className="h-8 w-28 rounded" />
        </div>
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-2 rounded-md border border-slate-300 bg-white p-3">
              <Skeleton className="h-3 w-24 rounded" />
              <Skeleton className="h-6 w-28 rounded" />
              <Skeleton className="h-3 w-32 rounded" />
            </div>
          ))}
        </div>
        <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-2 rounded-md border border-slate-300 bg-white p-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-28 w-full rounded-md" />
            <Skeleton className="h-36 w-full rounded-md" />
            <Skeleton className="h-32 w-full rounded-md" />
          </div>
        </div>
      </main>
    );
  }

  if (!customer) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <h1 className="text-lg font-bold text-slate-900">Customer not found</h1>
        <Link href="/customers" className="inline-flex items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to Customers
        </Link>
      </main>
    );
  }

  const primaryPhone = customer.phones.find(p => p.is_primary)?.phone_number || customer.phones[0]?.phone_number || '';
  const whatsappDigits = primaryPhone ? normalizeKenyanPhone(primaryPhone).replace(/\D/g, '') : '';
  const displayName = customer.name?.trim() || (primaryPhone ? displayKenyanPhone(primaryPhone) : 'Unnamed customer');
  const inactive = customer.is_active === false;

  return (
    <main className="mx-auto max-w-[1440px] space-y-3 px-2 pb-24 pt-2 sm:px-4 lg:px-5">
      {/* Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <Link
            href="/customers"
            aria-label="Back to Customers"
            className="grid h-8 w-8 shrink-0 place-items-center rounded border border-slate-300 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-base font-bold text-slate-950">{displayName}</h1>
              {inactive ? (
                <span className="rounded bg-rose-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-700">Inactive</span>
              ) : (
                <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-700">Active</span>
              )}
              <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${health.cls}`}>
                {health.label}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {primaryPhone ? displayKenyanPhone(primaryPhone) : 'No phone'}
              {customer.created_at ? ` · Customer since ${new Date(customer.created_at).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}` : ''}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {primaryPhone && (
            <a
              href={`tel:${primaryPhone}`}
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Phone className="h-3.5 w-3.5 text-emerald-600" /> Call
            </a>
          )}
          {whatsappDigits && (
            <a
              href={`https://wa.me/${whatsappDigits}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-8 items-center gap-1.5 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              <MessageCircle className="h-3.5 w-3.5 text-emerald-600" /> WhatsApp
            </a>
          )}
          <button
            type="button"
            onClick={() => void refreshAll()}
            className="inline-flex h-8 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loadingOrders || loadingCylinders ? 'animate-spin' : ''}`} /> Refresh
          </button>
          <button
            type="button"
            onClick={() => router.push(`/sales?customerId=${encodeURIComponent(customer.id)}`)}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700"
          >
            <ShoppingCart className="h-3.5 w-3.5" /> New sale
          </button>
        </div>
      </header>

      {/* KPI & Payment Health Strip */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className={`rounded-md border p-3 ${health.balance > 0 ? 'border-rose-300 bg-rose-50/40' : 'border-slate-300 bg-white'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Outstanding balance</p>
          {loadingOrders ? (
            <Skeleton className="mt-1.5 h-6 w-28 rounded" />
          ) : (
            <p className={`mt-1 text-lg font-bold tabular-nums ${health.balance > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
              {health.balance > 0 ? formatKES(health.balance) : 'Settled (KES 0)'}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {health.unpaidCount > 0 ? `${health.unpaidCount} unpaid receipt${health.unpaidCount === 1 ? '' : 's'}` : 'No unpaid invoices'}
          </p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-slate-400" /> Payment health
          </p>
          {loadingOrders ? (
            <Skeleton className="mt-1.5 h-6 w-24 rounded" />
          ) : (
            <div className="mt-1 flex items-center gap-2">
              <span className={`rounded px-2 py-0.5 text-xs font-bold ${health.cls}`}>{health.label}</span>
              <span className="text-xs font-semibold tabular-nums text-slate-700">{health.paidRate}% paid</span>
            </div>
          )}
          <p className="mt-1 text-[11px] text-slate-500">{health.detail}</p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Lifetime spend</p>
          {loadingOrders ? (
            <Skeleton className="mt-1.5 h-6 w-28 rounded" />
          ) : (
            <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{formatKES(spendStats.lifetime)}</p>
          )}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {spendStats.count} receipt{spendStats.count === 1 ? '' : 's'}
            {spendStats.count > 0 ? ` · Avg ${formatKES(spendStats.avgOrder)}` : ''}
          </p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            <CalendarClock className="h-3.5 w-3.5 text-slate-400" /> Refill cadence
          </p>
          {loadingOrders ? (
            <Skeleton className="mt-1.5 h-6 w-24 rounded" />
          ) : (
            <p className="mt-1 text-base font-bold tabular-nums text-slate-950">
              {spendStats.lastOrder
                ? new Date(spendStats.lastOrder).toLocaleDateString('en-KE', { day: '2-digit', month: 'short', year: 'numeric' })
                : 'No orders yet'}
            </p>
          )}
          <p className="mt-0.5 text-[11px] text-slate-500">
            {spendStats.daysSinceLast !== null ? `${spendStats.daysSinceLast}d ago` : '—'}
            {spendStats.avgCycleDays !== null ? ` · Every ~${spendStats.avgCycleDays}d` : ''}
          </p>
        </div>
      </section>

      {/* Main 2-column layout: Left = Receipts & Audit Trail, Right = Editable Customer Panel */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_390px]">
        <div className="min-w-0 space-y-2.5">
          <nav className="flex gap-1 overflow-x-auto rounded-md border border-slate-300 bg-white p-1">
            {[
              { id: 'receipts' as Tab, label: `Receipts & Invoices (${orders.length})` },
              { id: 'audit' as Tab, label: `Audit Trail (${auditRows.length})` },
            ].map(item => (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={`h-8 shrink-0 rounded px-3 text-xs font-semibold transition ${
                  tab === item.id ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {item.label}
              </button>
            ))}
          </nav>

          {tab === 'receipts' && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <Receipt className="h-4 w-4 text-orange-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Receipts & Invoices</h2>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(['all', 'unpaid', 'paid', 'cancelled'] as ReceiptFilter[]).map(f => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setReceiptFilter(f)}
                      className={`h-7 rounded px-2.5 text-xs font-semibold capitalize transition ${
                        receiptFilter === f ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-2.5 py-1.5">Date</th>
                        <th className="px-2 py-1.5">Receipt</th>
                        <th className="px-2 py-1.5">Branch</th>
                        <th className="px-2 py-1.5">Items</th>
                        <th className="px-2 py-1.5">Payment</th>
                        <th className="px-2 py-1.5 text-right">Total</th>
                        {canManage && <th className="px-2.5 py-1.5 text-right">Actions</th>}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {loadingOrders && Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`sk-${i}`}>
                          <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                          <td className="px-2 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                          <td className="px-2 py-2"><Skeleton className="h-3.5 w-20 rounded" /></td>
                          <td className="px-2 py-2"><Skeleton className="h-3.5 w-40 rounded" /></td>
                          <td className="px-2 py-2"><Skeleton className="h-4 w-20 rounded" /></td>
                          <td className="px-2 py-2"><Skeleton className="ml-auto h-3.5 w-16 rounded" /></td>
                          {canManage && <td className="px-2.5 py-2"><Skeleton className="ml-auto h-6 w-20 rounded" /></td>}
                        </tr>
                      ))}

                      {!loadingOrders && filteredOrders.map(order => {
                        const branchName = pick(order.branch_ref)?.name || '—';
                        const cancelled = order.delivery_status === 'cancelled';
                        const unpaid = !cancelled && order.payment_status !== 'paid';
                        const isSettling = settlingOrderId === order.id;

                        return (
                          <React.Fragment key={order.id}>
                            <tr className={`${cancelled ? 'bg-slate-50/80 text-slate-400 line-through' : unpaid ? 'bg-rose-50/35' : 'odd:bg-white even:bg-slate-50/50'}`}>
                              <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-slate-600">
                                {new Date(order.created_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2">
                                <div className="font-mono font-bold text-slate-900">{order.receipt_number || order.order_number}</div>
                                {order.receipt_number && <div className="text-[10px] text-slate-400">{order.order_number}</div>}
                                {order.lpo_number && <div className="text-[10px] font-medium text-indigo-700">LPO: {order.lpo_number}</div>}
                              </td>
                              <td className="px-2 py-2 font-medium text-slate-700">{branchName}</td>
                              <td className="px-2 py-2">
                                <div className="space-y-0.5">
                                  {(order.items || []).map(it => (
                                    <div key={it.id} className="text-slate-800">
                                      <strong>{it.quantity}×</strong> {it.outgoing_brand}{it.cylinder_size_kg ? ` ${it.cylinder_size_kg}kg` : ''}
                                      <span className="ml-1 text-[10px] uppercase text-slate-500">({it.order_type})</span>
                                      {it.order_type === 'refill' && it.incoming_brand && it.incoming_brand.toLowerCase() !== it.outgoing_brand.toLowerCase() && (
                                        <span className="ml-1 rounded bg-amber-100 px-1 text-[10px] font-semibold text-amber-900">
                                          ret: {it.incoming_brand}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                  {order.sale_comment && <div className="text-[10px] text-slate-500">{order.sale_comment}</div>}
                                </div>
                              </td>
                              <td className="whitespace-nowrap px-2 py-2">
                                {cancelled ? (
                                  <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">Cancelled</span>
                                ) : unpaid ? (
                                  <span className="rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-800">Unpaid</span>
                                ) : (
                                  <div>
                                    <span className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-emerald-800">
                                      Paid · {order.payment_method}
                                    </span>
                                    {order.payment_reference && <div className="mt-0.5 font-mono text-[10px] text-slate-500">{order.payment_reference}</div>}
                                  </div>
                                )}
                              </td>
                              <td className="whitespace-nowrap px-2 py-2 text-right font-bold tabular-nums text-slate-900">
                                {formatKES(order.total_kes)}
                              </td>
                              {canManage && (
                                <td className="whitespace-nowrap px-2.5 py-2 text-right">
                                  <div className="inline-flex items-center gap-1">
                                    {unpaid && (
                                      <button
                                        type="button"
                                        disabled={busyOrderId === order.id}
                                        onClick={() => {
                                          setSettlingOrderId(isSettling ? null : order.id);
                                          setSettleMethod('mpesa');
                                          setSettleRef('');
                                        }}
                                        className="inline-flex h-7 items-center gap-1 rounded bg-emerald-600 px-2 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                      >
                                        <CreditCard className="h-3 w-3" /> Settle
                                      </button>
                                    )}
                                    {!cancelled && (
                                      <button
                                        type="button"
                                        disabled={busyOrderId === order.id}
                                        onClick={() => void handleCancelOrder(order)}
                                        title="Cancel receipt & restore stock"
                                        className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2 text-[11px] font-semibold text-slate-600 hover:border-rose-300 hover:bg-rose-50 hover:text-rose-700 disabled:opacity-50"
                                      >
                                        <Ban className="h-3 w-3" /> Void
                                      </button>
                                    )}
                                  </div>
                                </td>
                              )}
                            </tr>
                            {isSettling && (
                              <tr className="bg-emerald-50/70">
                                <td colSpan={canManage ? 7 : 6} className="px-3 py-2">
                                  <div className="flex flex-wrap items-end justify-end gap-2">
                                    <div>
                                      <label className={labelClass}>Method</label>
                                      <select value={settleMethod} onChange={e => setSettleMethod(e.target.value as PaymentMethod)} className={fieldClass}>
                                        {PAYMENT_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                                      </select>
                                    </div>
                                    <div className="min-w-[180px]">
                                      <label className={labelClass}>Reference (M-Pesa / Bank / Cheque)</label>
                                      <input
                                        value={settleRef}
                                        onChange={e => setSettleRef(e.target.value.toUpperCase())}
                                        placeholder="Optional reference"
                                        className={fieldClass}
                                      />
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => setSettlingOrderId(null)}
                                      className="h-8 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-600"
                                    >
                                      Cancel
                                    </button>
                                    <button
                                      type="button"
                                      disabled={busyOrderId === order.id}
                                      onClick={() => void handleSettleOrder(order.id)}
                                      className="inline-flex h-8 items-center gap-1 rounded bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
                                    >
                                      <CheckCircle2 className="h-3.5 w-3.5" /> Confirm paid ({formatKES(order.total_kes)})
                                    </button>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}

                      {!loadingOrders && filteredOrders.length === 0 && (
                        <tr>
                          <td colSpan={canManage ? 7 : 6} className="px-3 py-8 text-center text-slate-500">
                            No receipts match this filter.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}

          {tab === 'audit' && (
            <section className="space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
                <div className="flex items-center gap-2">
                  <History className="h-4 w-4 text-orange-600" />
                  <h2 className="text-xs font-bold uppercase tracking-wide text-slate-800">Customer Audit Trail</h2>
                </div>
                <div className="flex flex-wrap gap-1">
                  {([
                    { id: 'all', label: 'All' },
                    { id: 'cylinder', label: 'Cylinders' },
                    { id: 'payment', label: 'Payments' },
                    { id: 'customer', label: 'Profile' },
                  ] as Array<{ id: AuditFilter; label: string }>).map(f => (
                    <button
                      key={f.id}
                      type="button"
                      onClick={() => setAuditFilter(f.id)}
                      className={`h-7 rounded px-2.5 text-xs font-semibold transition ${
                        auditFilter === f.id ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px] border-collapse text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-2.5 py-1.5">When</th>
                        <th className="px-2 py-1.5">Type</th>
                        <th className="px-2 py-1.5">Change</th>
                        <th className="px-2.5 py-1.5">By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200">
                      {loadingAudit && Array.from({ length: 5 }).map((_, i) => (
                        <tr key={`sk-${i}`}>
                          <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                          <td className="px-2 py-2"><Skeleton className="h-4 w-16 rounded" /></td>
                          <td className="px-2 py-2"><Skeleton className="h-3.5 w-64 rounded" /></td>
                          <td className="px-2.5 py-2"><Skeleton className="h-3.5 w-24 rounded" /></td>
                        </tr>
                      ))}
                      {!loadingAudit && filteredAudit.map(row => {
                        const badge = AUDIT_BADGE[row.entity_type] ?? AUDIT_BADGE.customer;
                        const actor = pick(row.actor);
                        return (
                          <tr key={row.id} className="odd:bg-white even:bg-slate-50/50">
                            <td className="whitespace-nowrap px-2.5 py-2 tabular-nums text-slate-600">
                              {new Date(row.created_at).toLocaleString('en-KE', { dateStyle: 'short', timeStyle: 'short' })}
                            </td>
                            <td className="px-2 py-2">
                              <span className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold ${badge.cls}`}>{badge.label}</span>
                            </td>
                            <td className="px-2 py-2 font-medium text-slate-900">{row.summary}</td>
                            <td className="whitespace-nowrap px-2.5 py-2 text-slate-600">{actor?.full_name ?? '—'}</td>
                          </tr>
                        );
                      })}
                      {!loadingAudit && filteredAudit.length === 0 && (
                        <tr>
                          <td colSpan={4} className="px-3 py-8 text-center text-slate-500">
                            No audit events recorded yet.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </section>
          )}
        </div>

        {/* Right Side Panel: All Editable Customer Details */}
        <CustomerEditPanel
          customer={customer}
          cylinders={cylinders}
          loadingCylinders={loadingCylinders}
          products={products}
          canManage={canManage}
          canEditCylinders={canView}
          onUpdateCustomer={updateCustomer}
          onSetCustomerActive={setCustomerActive}
          onAddPhone={addCustomerPhone}
          onUpdatePhone={updateCustomerPhone}
          onRemovePhone={removeCustomerPhone}
          onAddLocation={addCustomerLocation}
          onUpdateLocation={updateCustomerLocation}
          onRemoveLocation={removeCustomerLocation}
          onRefresh={async () => {
            await Promise.all([loadCustomer(), loadCylinders(), loadAudit()]);
          }}
        />
      </div>
    </main>
  );
}
