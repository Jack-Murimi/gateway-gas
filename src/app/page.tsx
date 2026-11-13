'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/context/store-context';
import {
  Flame,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Clock3,
  Package,
  Bike,
  Building2,
  Users,
  ShoppingCart,
  Send,
  Phone,
  Plus,
  TrendingUp,
  ClipboardList,
  Wallet,
  ChevronRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { formatKES } from '@/lib/formatters';

const localDateKey = (value: string | Date) => {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const timeLabel = (value: string) =>
  new Intl.DateTimeFormat('en-KE', { hour: 'numeric', minute: '2-digit' }).format(new Date(value));

const dateLabel = new Intl.DateTimeFormat('en-KE', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
}).format(new Date());

function StatusPill({ status }: { status: string }) {
  const styles: Record<string, string> = {
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    pending: 'bg-amber-50 text-amber-700 ring-amber-600/15',
    assigned: 'bg-blue-50 text-blue-700 ring-blue-600/15',
    in_transit: 'bg-sky-50 text-sky-700 ring-sky-600/15',
    delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-600/15',
    cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/15',
  };
  const labels: Record<string, string> = {
    in_transit: 'In transit',
    paid: 'Paid',
    pending: 'Pending',
    assigned: 'Assigned',
    delivered: 'Delivered',
    cancelled: 'Cancelled',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${styles[status] || 'bg-slate-100 text-slate-600 ring-slate-500/15'}`}>
      {labels[status] || status.replace('_', ' ')}
    </span>
  );
}

function MetricCard({
  label,
  value,
  helper,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ElementType;
  tone: 'orange' | 'green' | 'blue' | 'slate';
  href?: string;
}) {
  const tones = {
    orange: 'bg-orange-50 text-orange-700',
    green: 'bg-emerald-50 text-emerald-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-700',
  };
  const content = (
    <div className="flex min-h-[142px] flex-col justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-slate-300 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-slate-500">{label}</span>
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tones[tone]}`}>
          <Icon className="h-[18px] w-[18px]" aria-hidden="true" />
        </span>
      </div>
      <div>
        <div className="mt-3 text-2xl font-bold tracking-tight text-slate-950 sm:text-[28px]">{value}</div>
        <p className="mt-1 text-xs text-slate-500">{helper}</p>
      </div>
    </div>
  );

  return href ? <Link href={href} className="block rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500">{content}</Link> : content;
}

export default function HomePage() {
  const { currentUser, branches, orders, inventory, products, staffList } = useStore();

  if (!currentUser) {
    return (
      <div className="flex min-h-[85vh] items-center justify-center px-4 py-12">
        <div className="w-full max-w-lg space-y-6 rounded-3xl border border-slate-200 bg-white p-6 text-center shadow-xl sm:p-8">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-sm">
            <Flame className="h-8 w-8" />
          </div>
          <div>
            <span className="text-xs font-bold uppercase tracking-[0.16em] text-orange-700">Internal operations portal</span>
            <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Gateway Gas Nairobi</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Multi-branch LPG sales, inventory, dispatch and delivery operations.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-2 text-xs font-medium text-slate-600">
            {['Nextgen', 'Lavington', 'Jamhuri', 'Kileleshwa'].map((name) => (
              <span key={name} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5">{name}</span>
            ))}
          </div>
          <div className="space-y-3 pt-1">
            <Link href="/login" className="block">
              <Button size="lg" className="w-full font-semibold">Sign in to Gateway <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
            <Link href="/signup" className="block">
              <Button variant="outline" size="md" className="w-full">Request staff access</Button>
            </Link>
          </div>
          <p className="text-xs text-slate-400">For authorised Gateway staff only.</p>
        </div>
      </div>
    );
  }

  const todayKey = localDateKey(new Date());
  const todayOrders = orders.filter((order) => localDateKey(order.created_at) === todayKey);
  const myOrdersToday = todayOrders.filter((order) => order.sales_rep_id === currentUser.id);
  const recentMyOrders = [...myOrdersToday].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);

  if (currentUser.role === 'sales_rep') {
    const mySalesToday = myOrdersToday
      .filter((order) => order.payment_status === 'paid')
      .reduce((sum, order) => sum + order.total_kes, 0);

    return (
      <main className="mx-auto max-w-5xl space-y-5 px-4 py-6 pb-24 sm:px-6 lg:px-8">
        <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm sm:p-7">
          <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
            <div>
              <Badge variant="default">Sales desk</Badge>
              <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">Good day, {currentUser.full_name.split(' ')[0]}</h1>
              <p className="mt-1 text-sm text-slate-300">Your counter activity for today.</p>
            </div>
            <Link href="/sales" className="shrink-0">
              <Button size="lg" className="min-h-12 w-full bg-orange-600 font-semibold hover:bg-orange-700 sm:w-auto">
                <Plus className="mr-2 h-5 w-5" /> New sale
              </Button>
            </Link>
          </div>
          <div className="mt-6 grid grid-cols-2 gap-3 border-t border-white/10 pt-5">
            <div>
              <p className="text-xs font-medium text-slate-400">My sales today</p>
              <p className="mt-1 text-2xl font-bold">{formatKES(mySalesToday)}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-slate-400">Receipts today</p>
              <p className="mt-1 text-2xl font-bold">{myOrdersToday.length}</p>
            </div>
          </div>
        </section>

        <Link href="/inventory" className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm transition hover:border-orange-200">
          <span className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-orange-50 text-orange-700"><Package className="h-5 w-5" /></span>
            <span><span className="block text-sm font-semibold text-slate-900">Check branch stock</span><span className="mt-0.5 block text-xs text-slate-500">View full and empty cylinders</span></span>
          </span>
          <ChevronRight className="h-5 w-5 text-slate-400" />
        </Link>

        <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
            <div><h2 className="font-semibold text-slate-900">Your recent sales</h2><p className="mt-0.5 text-xs text-slate-500">Transactions recorded today</p></div>
            <Link href="/reports" className="text-xs font-semibold text-orange-700 hover:text-orange-800">View reports</Link>
          </div>
          {recentMyOrders.length === 0 ? (
            <div className="px-5 py-10 text-center"><ShoppingCart className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm font-medium text-slate-700">No sales recorded yet</p><p className="mt-1 text-xs text-slate-500">Your completed sales will appear here.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {recentMyOrders.map((order) => (
                <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{order.customer_name}</p><p className="mt-0.5 text-xs text-slate-500">{order.order_number} · {timeLabel(order.created_at)}</p></div>
                  <div className="shrink-0 text-right"><p className="text-sm font-semibold text-slate-900">{formatKES(order.total_kes)}</p><div className="mt-1"><StatusPill status={order.payment_status} /></div></div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    );
  }

  if (currentUser.role === 'rider') {
    const myDeliveries = orders.filter((order) => order.rider_id === currentUser.id);
    const activeJobs = myDeliveries
      .filter((order) => order.delivery_status === 'assigned' || order.delivery_status === 'in_transit')
      .sort((a, b) => (a.assigned_at || a.created_at).localeCompare(b.assigned_at || b.created_at));
    const currentJob = activeJobs[0];
    const completedToday = myDeliveries.filter((order) => order.delivery_status === 'delivered' && order.delivered_at && localDateKey(order.delivered_at) === todayKey).length;

    return (
      <main className="mx-auto max-w-3xl space-y-5 px-4 py-6 pb-24 sm:px-6">
        <section className="rounded-2xl bg-slate-950 p-5 text-white shadow-sm">
          <Badge variant="warning">Rider console</Badge>
          <h1 className="mt-3 text-2xl font-bold">{currentUser.full_name}</h1>
          <p className="mt-1 text-sm text-slate-300">{currentUser.vehicle_plate || 'Delivery rider'} · Your delivery run-sheet</p>
          <div className="mt-5 grid grid-cols-2 gap-3 border-t border-white/10 pt-4">
            <div><p className="text-xs text-slate-400">Active deliveries</p><p className="mt-1 text-2xl font-bold">{activeJobs.length}</p></div>
            <div><p className="text-xs text-slate-400">Completed today</p><p className="mt-1 text-2xl font-bold">{completedToday}</p></div>
          </div>
        </section>
        {currentJob ? (
          <section className="rounded-2xl border border-orange-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3"><p className="text-xs font-bold uppercase tracking-wide text-orange-700">Next delivery</p><StatusPill status={currentJob.delivery_status} /></div>
            <h2 className="mt-3 text-xl font-bold text-slate-950">{currentJob.customer_name}</h2>
            <p className="mt-1 text-sm text-slate-600">{currentJob.delivery_estate || 'Location not provided'} · {currentJob.delivery_address || 'Confirm address with customer'}</p>
            {currentJob.customer_phone && <a href={`tel:${currentJob.customer_phone}`} className="mt-4 inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-700"><Phone className="h-4 w-4" /> Call customer</a>}
            <Link href="/rider" className="mt-3 block"><Button className="w-full">Open delivery run-sheet <ArrowRight className="ml-2 h-4 w-4" /></Button></Link>
          </section>
        ) : (
          <section className="rounded-2xl border border-dashed border-slate-300 bg-white px-5 py-10 text-center"><CheckCircle2 className="mx-auto h-9 w-9 text-emerald-600" /><h2 className="mt-3 font-semibold text-slate-900">You're all caught up</h2><p className="mt-1 text-sm text-slate-500">No active deliveries assigned to you.</p></section>
        )}
      </main>
    );
  }

  if (currentUser.approval_status !== 'approved') {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center"><Clock3 className="mx-auto h-10 w-10 text-amber-500" /><h1 className="mt-4 text-xl font-bold text-slate-900">Account awaiting approval</h1><p className="mt-2 text-sm text-slate-500">Your account is not approved for operational access yet.</p></main>;
  }

  const paidSalesToday = todayOrders.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + order.total_kes, 0);
  const awaitingDispatch = orders.filter((order) => !order.is_pos_walkin && order.delivery_status === 'pending');
  const activeDeliveries = orders.filter((order) => order.delivery_status === 'assigned' || order.delivery_status === 'in_transit');
  const deliveredToday = orders.filter((order) => order.delivery_status === 'delivered' && order.delivered_at && localDateKey(order.delivered_at) === todayKey).length;
  const unpaidOrdersToday = todayOrders.filter((order) => order.payment_status === 'pending');
  const pendingApprovals = staffList.filter((staff) => staff.approval_status === 'pending');
  const isManager = currentUser.role === 'admin' || currentUser.role === 'director';

  const lowStock = inventory
    .map((item) => {
      const product = products.find((candidate) => candidate.id === item.product_id);
      const branch = branches.find((candidate) => candidate.id === item.branch_id);
      return { ...item, product, branch };
    })
    .filter((item) => item.product?.category === 'cylinder' && item.full_units <= 5)
    .sort((a, b) => a.full_units - b.full_units);

  const activeBranches = branches.filter((branch) => branch.is_active);
  const recentOrders = [...orders].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, 6);
  const firstName = currentUser.full_name.trim().split(/\s+/)[0] || 'there';

  return (
    <main className="mx-auto max-w-[1440px] space-y-6 px-4 py-6 pb-24 sm:px-6 lg:px-8">
      <section className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <p className="text-sm font-medium text-slate-500">{dateLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight text-slate-950 sm:text-3xl">Good morning, {firstName}</h1>
            <Badge variant={currentUser.role === 'admin' ? 'purple' : 'info'}>{currentUser.role.replace('_', ' ')}</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">Here's what's happening across your branches today.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sales"><Button className="min-h-10"><Plus className="mr-1.5 h-4 w-4" /> New sale</Button></Link>
          <Link href="/operations"><Button variant="outline" className="min-h-10"><Send className="mr-1.5 h-4 w-4" /> Dispatch desk</Button></Link>
        </div>
      </section>

      {(lowStock.length > 0 || (isManager && pendingApprovals.length > 0) || unpaidOrdersToday.length > 0) && (
        <section aria-label="Items needing attention" className="space-y-2">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-600" /><h2 className="text-sm font-semibold text-slate-900">Needs attention</h2></div>
          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
            {lowStock.length > 0 && (
              <Link href="/inventory" className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50/70 p-3.5 transition hover:bg-rose-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-rose-700"><Package className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-rose-950">{lowStock.length} low-stock cylinder SKUs</span><span className="mt-0.5 block text-xs text-rose-800">Five or fewer full units · Review inventory</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-rose-500" />
              </Link>
            )}
            {isManager && pendingApprovals.length > 0 && (
              <Link href="/staff" className="flex items-center gap-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 transition hover:bg-amber-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-amber-700"><Users className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-amber-950">{pendingApprovals.length} staff approval{pendingApprovals.length === 1 ? '' : 's'} pending</span><span className="mt-0.5 block text-xs text-amber-800">Review staff access requests</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-amber-600" />
              </Link>
            )}
            {unpaidOrdersToday.length > 0 && (
              <Link href="/reports" className="flex items-center gap-3 rounded-xl border border-orange-200 bg-orange-50/70 p-3.5 transition hover:bg-orange-50">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white text-orange-700"><Wallet className="h-4 w-4" /></span>
                <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-orange-950">{unpaidOrdersToday.length} unpaid order{unpaidOrdersToday.length === 1 ? '' : 's'} today</span><span className="mt-0.5 block text-xs text-orange-800">Check payment status before closing</span></span>
                <ChevronRight className="h-4 w-4 shrink-0 text-orange-600" />
              </Link>
            )}
          </div>
        </section>
      )}

      <section>
        <div className="mb-3 flex items-center justify-between"><h2 className="text-sm font-semibold text-slate-900">Today's overview</h2><span className="text-xs text-slate-400">All branches · {todayOrders.length} orders</span></div>
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <MetricCard label="Paid sales today" value={formatKES(paidSalesToday)} helper="Confirmed payments only" icon={TrendingUp} tone="green" href="/reports" />
          <MetricCard label="Orders today" value={todayOrders.length} helper="All sales channels" icon={ClipboardList} tone="slate" href="/reports" />
          <MetricCard label="Awaiting dispatch" value={awaitingDispatch.length} helper="Waiting for rider assignment" icon={Clock3} tone="orange" href="/operations" />
          <MetricCard label="Active deliveries" value={activeDeliveries.length} helper="Assigned or on the way" icon={Bike} tone="blue" href="/operations" />
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,0.85fr)]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
            <div><h2 className="font-semibold text-slate-900">Branch performance</h2><p className="mt-0.5 text-xs text-slate-500">Sales and cylinder position today</p></div>
            <Link href="/inventory" className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 hover:text-orange-800">View stock <ChevronRight className="h-4 w-4" /></Link>
          </div>
          {activeBranches.length === 0 ? (
            <div className="px-5 py-10 text-center text-sm text-slate-500">No active branches found.</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {activeBranches.map((branch) => {
                const branchTodayOrders = todayOrders.filter((order) => order.branch_id === branch.id);
                const branchPaidSales = branchTodayOrders.filter((order) => order.payment_status === 'paid').reduce((sum, order) => sum + order.total_kes, 0);
                const branchInventory = inventory.filter((item) => item.branch_id === branch.id);
                const fullUnits = branchInventory.reduce((sum, item) => sum + item.full_units, 0);
                const emptyUnits = branchInventory.reduce((sum, item) => sum + item.empty_units, 0);
                const branchLowStock = branchInventory.filter((item) => {
                  const product = products.find((candidate) => candidate.id === item.product_id);
                  return product?.category === 'cylinder' && item.full_units <= 5;
                }).length;

                return (
                  <div key={branch.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex min-w-0 items-center gap-3">
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-600"><Building2 className="h-5 w-5" /></span>
                      <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{branch.name}</p><p className="mt-0.5 text-xs text-slate-500">{branch.location_estate} · {branch.code}</p></div>
                    </div>
                    <div className="grid grid-cols-3 gap-3 sm:min-w-[340px] sm:text-right">
                      <div><p className="text-[11px] text-slate-500">Paid sales</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{formatKES(branchPaidSales)}</p></div>
                      <div><p className="text-[11px] text-slate-500">Full / empty</p><p className="mt-0.5 text-sm font-semibold text-slate-900">{fullUnits} / {emptyUnits}</p></div>
                      <div><p className="text-[11px] text-slate-500">Low stock</p><p className={`mt-0.5 text-sm font-semibold ${branchLowStock > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>{branchLowStock || 'Clear'}</p></div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
            <div><h2 className="font-semibold text-slate-900">Stock alerts</h2><p className="mt-0.5 text-xs text-slate-500">Cylinder SKUs with five or fewer full units</p></div>
            <Package className="h-5 w-5 text-slate-400" />
          </div>
          {lowStock.length === 0 ? (
            <div className="px-5 py-9 text-center"><CheckCircle2 className="mx-auto h-8 w-8 text-emerald-600" /><p className="mt-2 text-sm font-medium text-slate-800">No low-stock alerts</p><p className="mt-1 text-xs text-slate-500">All tracked cylinder SKUs are above the alert threshold.</p></div>
          ) : (
            <div className="divide-y divide-slate-100">
              {lowStock.slice(0, 5).map((item) => (
                <div key={item.id} className="flex items-center justify-between gap-3 px-4 py-3 sm:px-5">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{item.product?.brand} {item.product?.size_kg ? `${item.product.size_kg}kg` : item.product?.name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{item.branch?.name || 'Unknown branch'}</p></div>
                  <span className="shrink-0 rounded-lg bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-700">{item.full_units} full</span>
                </div>
              ))}
              {lowStock.length > 5 && <p className="px-5 py-3 text-xs text-slate-500">And {lowStock.length - 5} more low-stock SKUs.</p>}
            </div>
          )}
          <Link href="/inventory" className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-sm font-semibold text-orange-700 hover:bg-slate-50 sm:px-5">Open inventory <ArrowRight className="h-4 w-4" /></Link>
        </div>
      </section>

      <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-4 sm:px-5">
          <div><h2 className="font-semibold text-slate-900">Recent activity</h2><p className="mt-0.5 text-xs text-slate-500">Latest orders recorded across branches</p></div>
          <Link href="/reports" className="text-xs font-semibold text-orange-700 hover:text-orange-800">View reports</Link>
        </div>
        {recentOrders.length === 0 ? (
          <div className="px-5 py-10 text-center"><ClipboardList className="mx-auto h-8 w-8 text-slate-300" /><p className="mt-2 text-sm text-slate-500">No orders have been recorded yet.</p></div>
        ) : (
          <div className="divide-y divide-slate-100">
            {recentOrders.map((order) => {
              const branchName = branches.find((branch) => branch.id === order.branch_id)?.name || 'Unknown branch';
              return (
                <div key={order.id} className="flex items-center justify-between gap-3 px-4 py-3.5 sm:px-5">
                  <div className="min-w-0"><p className="truncate text-sm font-semibold text-slate-900">{order.customer_name}</p><p className="mt-0.5 truncate text-xs text-slate-500">{order.order_number} · {branchName} · {timeLabel(order.created_at)}</p></div>
                  <div className="shrink-0 text-right"><p className="text-sm font-semibold text-slate-900">{formatKES(order.total_kes)}</p><div className="mt-1 flex justify-end gap-1.5"><StatusPill status={order.payment_status} /><StatusPill status={order.delivery_status} /></div></div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <div className="grid gap-3 sm:grid-cols-3">
        <Link href="/sales" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-orange-200 hover:bg-orange-50/30"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-50 text-orange-700"><ShoppingCart className="h-4 w-4" /></span><span className="flex-1"><span className="block text-sm font-semibold text-slate-900">Record a sale</span><span className="block text-xs text-slate-500">Open the POS</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></Link>
        <Link href="/operations" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-orange-200 hover:bg-orange-50/30"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-50 text-blue-700"><Send className="h-4 w-4" /></span><span className="flex-1"><span className="block text-sm font-semibold text-slate-900">Manage dispatch</span><span className="block text-xs text-slate-500">Assign and track riders</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></Link>
        <Link href="/inventory" className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white p-4 transition hover:border-orange-200 hover:bg-orange-50/30"><span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><Package className="h-4 w-4" /></span><span className="flex-1"><span className="block text-sm font-semibold text-slate-900">Check inventory</span><span className="block text-xs text-slate-500">Full and empty stock</span></span><ChevronRight className="h-4 w-4 text-slate-400" /></Link>
      </div>

      <p className="text-center text-[11px] text-slate-400">Delivered today: {deliveredToday} · Data reflects records currently available in the portal.</p>
    </main>
  );
}
