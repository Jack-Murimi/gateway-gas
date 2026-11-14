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
import { DashboardChartsPanel } from '@/components/charts/dashboard-charts-panel';

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
    paid: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    pending: 'bg-amber-50 text-amber-700 ring-amber-600/20',
    assigned: 'bg-sky-50 text-sky-700 ring-sky-600/20',
    in_transit: 'bg-blue-50 text-blue-700 ring-blue-600/20',
    delivered: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
    cancelled: 'bg-slate-100 text-slate-600 ring-slate-500/20',
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
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ring-1 ring-inset ${styles[status] || 'bg-slate-100 text-slate-600 ring-slate-500/20'}`}>
      {labels[status] || status.replace('_', ' ')}
    </span>
  );
}

function Metric({
  label,
  value,
  icon: Icon,
  tone,
  href,
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  tone: 'orange' | 'green' | 'blue' | 'slate';
  href?: string;
}) {
  const tones = {
    orange: 'text-orange-600 bg-orange-50',
    green: 'text-emerald-600 bg-emerald-50',
    blue: 'text-blue-600 bg-blue-50',
    slate: 'text-slate-600 bg-slate-100',
  };
  const body = (
    <div className="group relative overflow-hidden rounded-lg border border-slate-200 bg-white p-3.5 transition-colors hover:border-slate-300">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</span>
        <span className={`flex h-7 w-7 items-center justify-center rounded-md ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <div className="mt-2 text-xl font-semibold tracking-tight text-slate-950 tabular-nums">{value}</div>
    </div>
  );
  return href ? <Link href={href} className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 rounded-lg">{body}</Link> : body;
}

function Panel({ title, action, children, className = '' }: { title: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`overflow-hidden rounded-lg border border-slate-200 bg-white ${className}`}>
      <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
        <h2 className="text-sm font-semibold text-slate-900">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

export default function HomePage() {
  const { currentUser, branches, orders, inventory, products, staffList } = useStore();

  if (!currentUser) {
    return (
      <div className="flex min-h-[85vh] items-center justify-center px-4 py-10">
        <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6">
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-600 text-white">
              <Flame className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-semibold tracking-tight text-slate-950">Gateway Gas</h1>
              <p className="text-xs text-slate-500">Operations portal</p>
            </div>
          </div>
          <div className="space-y-2">
            <Link href="/login" className="block">
              <Button className="w-full">Sign in <ArrowRight className="ml-2 h-4 w-4" /></Button>
            </Link>
            <Link href="/signup" className="block">
              <Button variant="outline" className="w-full">Request access</Button>
            </Link>
          </div>
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
      <main className="mx-auto max-w-5xl space-y-4 px-4 py-5 pb-24 sm:px-6 lg:px-8">
        <section className="relative overflow-hidden rounded-xl border border-slate-800 bg-slate-950 p-5 text-white">
          <div className="absolute inset-y-0 right-0 w-1/2 bg-gradient-to-l from-orange-500/10 to-transparent" />
          <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Sales desk</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight">{currentUser.full_name.split(' ')[0]}</h1>
              <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-slate-300">
                <span>Paid today <strong className="text-white">{formatKES(mySalesToday)}</strong></span>
                <span>Receipts <strong className="text-white">{myOrdersToday.length}</strong></span>
              </div>
            </div>
            <Link href="/sales"><Button className="bg-orange-600 hover:bg-orange-700"><Plus className="mr-1.5 h-4 w-4" /> New sale</Button></Link>
          </div>
        </section>

        <div className="flex gap-2">
          <Link href="/inventory"><Button variant="outline" size="sm"><Package className="mr-1.5 h-4 w-4" />Stock</Button></Link>
          <Link href="/reports"><Button variant="outline" size="sm"><ClipboardList className="mr-1.5 h-4 w-4" />Reports</Button></Link>
        </div>

        <Panel title="Sales today">
          {recentMyOrders.length === 0 ? (
            <div className="px-4 py-10 text-center text-sm text-slate-500">No sales recorded yet.</div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {recentMyOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">{order.customer_name}</p>
                    <p className="text-xs text-slate-500">{order.order_number} · {timeLabel(order.created_at)}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm font-medium text-slate-900 tabular-nums">{formatKES(order.total_kes)}</p>
                    <div className="mt-1 flex justify-end"><StatusPill status={order.payment_status} /></div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </main>
    );
  }

  if (currentUser.role === 'rider') {
    const myDeliveries = orders.filter((order) => order.rider_id === currentUser.id || order.rider_ids?.includes(currentUser.id));
    const activeJobs = myDeliveries
      .filter((order) => order.delivery_status === 'assigned' || order.delivery_status === 'in_transit')
      .sort((a, b) => (a.assigned_at || a.created_at).localeCompare(b.assigned_at || b.created_at));
    const currentJob = activeJobs[0];
    const completedToday = myDeliveries.filter((order) => order.delivery_status === 'delivered' && order.delivered_at && localDateKey(order.delivered_at) === todayKey).length;

    return (
      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5 pb-24 sm:px-6">
        <section className="rounded-xl border border-slate-800 bg-slate-950 p-5 text-white">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-400">Rider</p>
          <h1 className="mt-1 text-xl font-semibold">{currentUser.full_name}</h1>
          <p className="mt-1 text-sm text-slate-300">{currentUser.vehicle_plate || 'No vehicle'} · {activeJobs.length} active · {completedToday} done today</p>
        </section>
        {currentJob ? (
          <section className="rounded-lg border border-orange-200 bg-orange-50/30 p-4">
            <div className="flex items-center justify-between gap-3"><span className="text-xs font-medium uppercase tracking-wide text-orange-700">Next delivery</span><StatusPill status={currentJob.delivery_status} /></div>
            <h2 className="mt-2 text-lg font-semibold text-slate-950">{currentJob.customer_name}</h2>
            <p className="mt-1 text-sm text-slate-600">{currentJob.delivery_estate || 'Location not provided'}{currentJob.delivery_address ? ` · ${currentJob.delivery_address}` : ''}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {currentJob.customer_phone && <a href={`tel:${currentJob.customer_phone}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-300 bg-white px-3 text-sm font-medium text-slate-700"><Phone className="h-4 w-4" /> Call</a>}
              <Link href="/rider"><Button size="sm">Open run-sheet <ArrowRight className="ml-1.5 h-4 w-4" /></Button></Link>
            </div>
          </section>
        ) : (
          <section className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-10 text-center text-sm text-slate-600"><CheckCircle2 className="mx-auto mb-2 h-7 w-7 text-emerald-600" />No active deliveries.</section>
        )}
      </main>
    );
  }

  if (currentUser.approval_status !== 'approved') {
    return <main className="mx-auto max-w-xl px-4 py-16 text-center"><Clock3 className="mx-auto h-8 w-8 text-amber-500" /><h1 className="mt-3 text-lg font-semibold text-slate-900">Account awaiting approval</h1></main>;
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
  const attentionCount = (lowStock.length > 0 ? 1 : 0) + (isManager && pendingApprovals.length > 0 ? 1 : 0) + (unpaidOrdersToday.length > 0 ? 1 : 0);

  return (
    <main className="mx-auto max-w-[1440px] space-y-4 px-4 py-5 pb-24 sm:px-6 lg:px-8">
      <header className="flex flex-col gap-3 border-b border-slate-200 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{dateLabel}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Overview</h1>
            <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium capitalize text-slate-700">{currentUser.role.replace('_', ' ')}</span>
          </div>
          <p className="mt-1 text-sm text-slate-600">Today’s operations across branches, dispatch, and inventory.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/sales"><Button size="sm"><Plus className="mr-1.5 h-4 w-4" /> New sale</Button></Link>
          <Link href="/operations"><Button variant="outline" size="sm"><Send className="mr-1.5 h-4 w-4" /> Dispatch</Button></Link>
          <Link href="/inventory"><Button variant="outline" size="sm"><Package className="mr-1.5 h-4 w-4" /> Inventory</Button></Link>
        </div>
      </header>

      {attentionCount > 0 && (
        <section className="rounded-lg border border-amber-200 bg-amber-50/40 p-3">
          <div className="mb-2 flex items-center gap-2 text-amber-900">
            <AlertTriangle className="h-4 w-4" />
            <h2 className="text-sm font-semibold">Attention</h2>
          </div>
          <div className="grid gap-2 md:grid-cols-3">
            {lowStock.length > 0 && (
              <Link href="/inventory" className="flex items-center justify-between rounded-md border border-white/70 bg-white px-3 py-2 text-sm hover:border-rose-200">
                <span className="flex items-center gap-2 text-slate-700"><Package className="h-4 w-4 text-rose-600" />Low stock</span>
                <span className="font-semibold text-rose-700">{lowStock.length}</span>
              </Link>
            )}
            {isManager && pendingApprovals.length > 0 && (
              <Link href="/staff" className="flex items-center justify-between rounded-md border border-white/70 bg-white px-3 py-2 text-sm hover:border-amber-200">
                <span className="flex items-center gap-2 text-slate-700"><Users className="h-4 w-4 text-amber-600" />Staff approvals</span>
                <span className="font-semibold text-amber-700">{pendingApprovals.length}</span>
              </Link>
            )}
            {unpaidOrdersToday.length > 0 && (
              <Link href="/reports" className="flex items-center justify-between rounded-md border border-white/70 bg-white px-3 py-2 text-sm hover:border-orange-200">
                <span className="flex items-center gap-2 text-slate-700"><Wallet className="h-4 w-4 text-orange-600" />Unpaid today</span>
                <span className="font-semibold text-orange-700">{unpaidOrdersToday.length}</span>
              </Link>
            )}
          </div>
        </section>
      )}

      <DashboardChartsPanel />

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.6fr)_minmax(320px,1fr)]">
        <Panel title="Branches" action={<Link href="/inventory" className="text-xs font-medium text-orange-700 hover:text-orange-800">Inventory</Link>}>
          {activeBranches.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">No active branches.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50 text-[11px] uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-4 py-2 font-medium">Branch</th>
                    <th className="px-4 py-2 font-medium">Paid today</th>
                    <th className="px-4 py-2 font-medium">Full / empty</th>
                    <th className="px-4 py-2 font-medium">Low stock</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
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
                      <tr key={branch.id} className="hover:bg-slate-50/60">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2.5">
                            <span className="flex h-8 w-8 items-center justify-center rounded-md bg-slate-100 text-slate-600"><Building2 className="h-4 w-4" /></span>
                            <div className="min-w-0"><p className="truncate font-medium text-slate-900">{branch.name}</p><p className="text-xs text-slate-500">{branch.location_estate} · {branch.code}</p></div>
                          </div>
                        </td>
                        <td className="px-4 py-2.5 font-medium tabular-nums text-slate-900">{formatKES(branchPaidSales)}</td>
                        <td className="px-4 py-2.5 tabular-nums text-slate-700">{fullUnits} / {emptyUnits}</td>
                        <td className="px-4 py-2.5"><span className={`inline-flex min-w-[2rem] justify-center rounded px-2 py-0.5 text-xs font-medium ${branchLowStock > 0 ? 'bg-rose-50 text-rose-700' : 'bg-emerald-50 text-emerald-700'}`}>{branchLowStock || 'OK'}</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Stock alerts" action={<span className="text-xs text-slate-500">{lowStock.length}</span>}>
            {lowStock.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-600"><CheckCircle2 className="mx-auto mb-2 h-6 w-6 text-emerald-600" />No low-stock alerts.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {lowStock.slice(0, 6).map((item) => (
                  <li key={item.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                    <div className="min-w-0"><p className="truncate text-sm font-medium text-slate-900">{item.product?.brand} {item.product?.size_kg ? `${item.product.size_kg}kg` : item.product?.name}</p><p className="truncate text-xs text-slate-500">{item.branch?.name || 'Unknown branch'}</p></div>
                    <span className="shrink-0 rounded bg-rose-50 px-2 py-0.5 text-xs font-medium text-rose-700 tabular-nums">{item.full_units} full</span>
                  </li>
                ))}
                {lowStock.length > 6 && <li className="px-4 py-2 text-xs text-slate-500">+{lowStock.length - 6} more</li>}
              </ul>
            )}
          </Panel>

          <Panel title="Recent activity" action={<Link href="/reports" className="text-xs font-medium text-orange-700 hover:text-orange-800">Reports</Link>}>
            {recentOrders.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm text-slate-500">No orders recorded.</div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {recentOrders.map((order) => {
                  const branchName = branches.find((branch) => branch.id === order.branch_id)?.name || 'Unknown branch';
                  return (
                    <li key={order.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900">{order.customer_name}</p>
                        <p className="truncate text-xs text-slate-500">{order.order_number} · {branchName} · {timeLabel(order.created_at)}</p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-medium text-slate-900 tabular-nums">{formatKES(order.total_kes)}</p>
                        <div className="mt-1 flex justify-end gap-1"><StatusPill status={order.payment_status} /><StatusPill status={order.delivery_status} /></div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </Panel>
        </div>
      </section>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-3 text-xs text-slate-500">
        <span>Delivered today: <strong className="font-medium text-slate-700">{deliveredToday}</strong></span>
        <div className="flex flex-wrap gap-3">
          <Link href="/sales" className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-orange-700"><ShoppingCart className="h-3.5 w-3.5" /> Sale</Link>
          <Link href="/operations" className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-orange-700"><Send className="h-3.5 w-3.5" /> Dispatch</Link>
          <Link href="/inventory" className="inline-flex items-center gap-1 font-medium text-slate-700 hover:text-orange-700"><Package className="h-3.5 w-3.5" /> Inventory</Link>
        </div>
      </footer>
    </main>
  );
}
