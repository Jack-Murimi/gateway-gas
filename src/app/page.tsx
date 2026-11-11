'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/context/store-context';
import {
  Flame,
  Clock,
  CheckCircle2,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Package,
  Bike,
  Building2,
  Users,
  ShoppingCart,
  ChevronRight,
  AlertTriangle,
  Send,
  Phone,
  Navigation,
  DollarSign,
  Plus,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { formatKES, formatShortDate, displayKenyanPhone } from '@/lib/formatters';

export default function HomePage() {
  const { currentUser, branches, orders, inventory, products, staffList, leaderboard } = useStore();

  // =========================================================================
  // 1. LOGGED-OUT HIGH-TRUST BRAND LANDING
  // =========================================================================
  if (!currentUser) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
        <div className="max-w-lg w-full bg-white rounded-3xl shadow-xl border-2 border-slate-200 p-6 sm:p-8 text-center space-y-6">
          <div className="w-16 h-16 bg-orange-600 rounded-3xl flex items-center justify-center text-white mx-auto shadow-lg">
            <Flame className="w-9 h-9" />
          </div>

          <div>
            <span className="text-xs font-black uppercase tracking-widest text-orange-600 block">
              Enterprise Internal System
            </span>
            <h1 className="text-3xl font-black text-slate-900 mt-1">Gateway Gas Nairobi</h1>
            <p className="text-sm font-medium text-slate-500 mt-2">
              Multi-branch LPG cylinder brand exchange, POS cashiering, inventory reconciliation & fleet logistics.
            </p>
          </div>

          {/* Branch Station Network Badge */}
          <div className="p-3.5 bg-slate-50 rounded-2xl border-2 border-slate-200 text-xs font-bold text-slate-700 space-y-1">
            <div className="text-slate-900 font-black uppercase text-[11px] tracking-wider">
              Connected Hubs (Nairobi Station)
            </div>
            <div className="flex flex-wrap justify-center gap-1.5 pt-1">
              <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-300">Nextgen (NXG-01)</span>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-300">Lavington (LVN-02)</span>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-300">Jamhuri (JMH-03)</span>
              <span className="px-2 py-0.5 rounded-lg bg-white border border-slate-300">Kileleshwa (KLH-04)</span>
            </div>
          </div>

          <div className="space-y-3 pt-2">
            <Link href="/login" className="block">
              <Button size="lg" className="w-full text-base font-black shadow-lg">
                Sign In to Station <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>

            <Link href="/signup" className="block">
              <Button variant="outline" size="md" className="w-full text-sm font-bold">
                Request New Staff Access
              </Button>
            </Link>
          </div>

          <p className="text-xs text-slate-400">
            Internal operations only. Unauthorized access attempts are monitored and logged.
          </p>
        </div>
      </div>
    );
  }

  // =========================================================================
  // 2. CASHIER (SALES REP) DASHBOARD: Big "New Sale" CTA + Today's Receipts
  // =========================================================================
  if (currentUser.role === 'sales_rep') {
    const todayOrders = orders.filter((o) => {
      const todayStr = new Date().toISOString().split('T')[0];
      return o.created_at?.startsWith(todayStr);
    });

    const myOrdersToday = todayOrders.filter((o) => o.sales_rep_id === currentUser.id);
    const mySalesVolume = myOrdersToday.reduce((sum, o) => sum + o.total_kes, 0);

    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-6 text-left">
        {/* Cashier Welcome Card */}
        <div className="bg-slate-900 text-white rounded-3xl p-6 shadow-xl border-2 border-slate-800 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <Badge variant="default">Cashier Station</Badge>
              <h1 className="text-2xl font-black mt-1">Hello, {currentUser.full_name}</h1>
              <p className="text-xs text-slate-400 mt-0.5">Ready to process counter sales and delivery tickets.</p>
            </div>

            <Link href="/sales">
              <Button size="lg" className="min-h-[56px] text-lg font-black shadow-lg">
                <Plus className="w-6 h-6 mr-1.5" /> Start New Sale (POS)
              </Button>
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-800 text-center">
            <div className="p-3 bg-slate-800 rounded-2xl">
              <div className="text-2xl font-black text-amber-400">{myOrdersToday.length}</div>
              <div className="text-xs font-bold text-slate-400 uppercase mt-0.5">Tickets Today</div>
            </div>
            <div className="p-3 bg-slate-800 rounded-2xl">
              <div className="text-2xl font-black text-emerald-400">{formatKES(mySalesVolume)}</div>
              <div className="text-xs font-bold text-slate-400 uppercase mt-0.5">Sales Recorded</div>
            </div>
          </div>
        </div>

        {/* Quick Inventory Check Link */}
        <div className="p-4 bg-white rounded-3xl border-2 border-slate-200 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center font-bold">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-black text-slate-900">Branch Cylinder Stock</div>
              <div className="text-xs text-slate-500">Check full & empty cylinders available in your station</div>
            </div>
          </div>
          <Link href="/inventory">
            <Button variant="outline" size="sm">
              View Stock <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>

        {/* Today's Transactions Log */}
        <div className="bg-white rounded-3xl border-2 border-slate-200 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2">
            <h2 className="text-base font-black text-slate-900">Recent Tickets Issued</h2>
            <span className="text-xs font-bold text-slate-400">{todayOrders.length} total today</span>
          </div>

          {todayOrders.length === 0 ? (
            <p className="text-xs font-medium text-slate-400 py-6 text-center">
              No tickets recorded yet today. Tap &quot;Start New Sale&quot; to begin.
            </p>
          ) : (
            <div className="divide-y divide-slate-100">
              {todayOrders.slice(0, 6).map((order) => (
                <div key={order.id} className="py-3 flex items-center justify-between text-sm">
                  <div>
                    <div className="font-black text-slate-900 flex items-center gap-2">
                      <span className="font-mono">{order.order_number}</span>
                      {order.receipt_number && (
                        <span className="text-xs text-slate-500 font-mono">#{order.receipt_number}</span>
                      )}
                    </div>
                    <div className="text-xs text-slate-500">
                      {order.customer_name} • {order.is_pos_walkin ? 'Counter' : order.delivery_estate}
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="font-black text-slate-900">{formatKES(order.total_kes)}</div>
                    <Badge variant={order.payment_status === 'paid' ? 'success' : 'warning'}>
                      {order.payment_status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // =========================================================================
  // 3. RIDER DASHBOARD: Current Active Job First
  // =========================================================================
  if (currentUser.role === 'rider') {
    const myDeliveries = orders.filter((o) => o.rider_id === currentUser.id);
    const activeJobs = myDeliveries.filter((o) => o.delivery_status !== 'delivered' && o.delivery_status !== 'cancelled');
    const currentJob = activeJobs[0];

    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 pb-24 space-y-5 text-left">
        <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl border-2 border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <div>
              <Badge variant="warning">Rider Console</Badge>
              <h1 className="text-2xl font-black mt-1">{currentUser.full_name}</h1>
              <p className="text-xs text-slate-400">Bike Plate: {currentUser.vehicle_plate || 'Assigned Fleet'}</p>
            </div>
            <Link href="/rider">
              <Button size="sm" variant="outline" className="bg-white text-slate-900">
                Full Run-Sheet
              </Button>
            </Link>
          </div>
        </div>

        {/* CURRENT JOB FIRST */}
        {currentJob ? (
          <div className="bg-white rounded-3xl border-2 border-orange-400 shadow-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b-2 border-orange-100 pb-2">
              <span className="text-xs font-black uppercase text-orange-600 tracking-wider">
                Current Active Delivery
              </span>
              <Badge variant="warning">{currentJob.delivery_status === 'in_transit' ? 'In Transit' : 'Assigned'}</Badge>
            </div>

            <div>
              <h2 className="text-xl font-black text-slate-900">{currentJob.customer_name}</h2>
              <div className="text-sm font-bold text-slate-600 mt-1">
                📍 {currentJob.delivery_estate} — {currentJob.delivery_address || 'Landmark provided'}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <a
                href={`tel:${currentJob.customer_phone}`}
                className="min-h-[52px] bg-slate-900 text-white rounded-2xl flex items-center justify-center font-black text-sm gap-2"
              >
                <Phone className="w-4 h-4 text-emerald-400" /> Call Client
              </a>
              <Link href="/rider">
                <Button size="md" className="w-full min-h-[52px] text-sm font-black">
                  Manage Delivery →
                </Button>
              </Link>
            </div>
          </div>
        ) : (
          <div className="p-8 bg-white rounded-3xl border-2 border-dashed border-slate-300 text-center space-y-2">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto" />
            <h3 className="text-lg font-black text-slate-900">No Pending Trips</h3>
            <p className="text-xs text-slate-500">You are ready for your next customer delivery run.</p>
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // 4. ADMIN, DIRECTOR & OPERATOR EXECUTIVE DASHBOARD
  // =========================================================================
  const pendingApprovalsCount = staffList.filter((s) => s.approval_status === 'pending').length;
  const unassignedOrders = orders.filter((o) => !o.is_pos_walkin && o.delivery_status === 'pending');
  const inTransitCount = orders.filter((o) => o.delivery_status === 'in_transit').length;
  const completedOrdersCount = orders.filter((o) => o.delivery_status === 'delivered').length;
  const totalRevenue = orders.filter((o) => o.payment_status === 'paid').reduce((acc, o) => acc + o.total_kes, 0);

  // Compute Low Stock Alerts (< 5 full units on any cylinder SKU)
  const lowStockAlerts = inventory.filter((inv) => {
    const prod = products.find((p) => p.id === inv.product_id);
    return prod?.category === 'cylinder' && inv.full_units <= 5;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 space-y-6 text-left">
      {/* Header Banner */}
      <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant={currentUser.role === 'admin' ? 'purple' : 'info'}>
              {currentUser.role.replace('_', ' ')}
            </Badge>
            <span className="text-slate-400 text-xs font-bold">Nairobi Multi-Branch Station</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-black mt-2">Executive Station Overview</h1>
          <p className="text-sm font-medium text-slate-300 mt-1">
            Real-time multi-branch stock reconciliation, dispatch routing, and financial tracking.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link href="/sales">
            <Button size="md" className="font-black">
              <ShoppingCart className="w-4 h-4 mr-1.5" /> New POS Sale
            </Button>
          </Link>
          <Link href="/operations">
            <Button size="md" variant="secondary" className="bg-slate-800 hover:bg-slate-700 border-slate-700">
              <Send className="w-4 h-4 mr-1.5" /> Dispatch Desk
            </Button>
          </Link>
        </div>
      </div>

      {/* LOW STOCK CRITICAL ALERT BANNER */}
      {lowStockAlerts.length > 0 && (
        <div className="p-4 bg-rose-50 border-2 border-rose-300 rounded-3xl flex items-start justify-between gap-3 animate-in slide-in-from-top-2">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-rose-100 text-rose-700 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-rose-950">
                Low Cylinder Stock Alert ({lowStockAlerts.length} SKU{lowStockAlerts.length > 1 ? 's' : ''} under 5 full units)
              </h3>
              <p className="text-xs font-bold text-rose-800 mt-0.5">
                Immediate depot truck replenishment required to prevent stockouts during peak Nairobi evening hours.
              </p>
            </div>
          </div>
          <Link href="/inventory">
            <Button variant="destructive" size="sm" className="shrink-0 text-xs font-black">
              Replenish Stock
            </Button>
          </Link>
        </div>
      )}

      {/* PENDING APPROVALS ALERT FOR ADMIN */}
      {['admin', 'director'].includes(currentUser.role) && pendingApprovalsCount > 0 && (
        <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-3xl flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-black text-amber-950">
                {pendingApprovalsCount} Staff Registration{pendingApprovalsCount > 1 ? 's' : ''} Pending Review
              </h3>
              <p className="text-xs font-bold text-amber-800">
                Verify employee credentials and assign access roles.
              </p>
            </div>
          </div>
          <Link href="/staff">
            <Button variant="outline" size="sm" className="bg-amber-600 text-white hover:bg-amber-700 border-amber-600">
              Review Staff
            </Button>
          </Link>
        </div>
      )}

      {/* KPI METRIC CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase text-slate-500">Gross Sales Revenue</span>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-2 font-mono">
            {formatKES(totalRevenue)}
          </div>
          <span className="text-xs font-bold text-emerald-600 mt-1 block">Verified paid orders</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase text-slate-500">Awaiting Dispatch</span>
          <div className="text-2xl sm:text-3xl font-black text-orange-600 mt-2">
            {unassignedOrders.length}
          </div>
          <span className="text-xs font-bold text-slate-500 mt-1 block">Pending rider assignment</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase text-slate-500">In Transit on Bikes</span>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 mt-2">
            {inTransitCount}
          </div>
          <span className="text-xs font-bold text-slate-500 mt-1 block">Active on Nairobi roads</span>
        </div>

        <div className="bg-white p-5 rounded-3xl border-2 border-slate-200 shadow-sm">
          <span className="text-xs font-bold uppercase text-slate-500">Delivered Total</span>
          <div className="text-2xl sm:text-3xl font-black text-emerald-600 mt-2">
            {completedOrdersCount}
          </div>
          <span className="text-xs font-bold text-slate-500 mt-1 block">Fulfillments completed</span>
        </div>
      </div>

      {/* PER-BRANCH SUMMARY CARDS */}
      <div className="bg-white rounded-3xl border-2 border-slate-200 p-5 sm:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-600" /> Station Hubs Performance & Stock
            </h2>
            <p className="text-xs text-slate-500">Breakdown per Nairobi operational branch depot</p>
          </div>
          <Link href="/inventory" className="text-xs font-bold text-orange-600 hover:underline flex items-center gap-1">
            <span>Manage Inventory</span> <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {branches.map((b) => {
            const branchOrders = orders.filter((o) => o.branch_id === b.id);
            const branchRevenue = branchOrders
              .filter((o) => o.payment_status === 'paid')
              .reduce((sum, o) => sum + o.total_kes, 0);

            const branchInv = inventory.filter((i) => i.branch_id === b.id);
            const totalFull = branchInv.reduce((sum, i) => sum + i.full_units, 0);
            const totalEmpty = branchInv.reduce((sum, i) => sum + i.empty_units, 0);

            return (
              <div
                key={b.id}
                className="p-4 rounded-2xl border-2 border-slate-200 bg-slate-50/70 hover:bg-slate-50 transition space-y-3"
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-black uppercase text-orange-600">{b.code}</span>
                  <Badge variant="success">Active</Badge>
                </div>

                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">{b.name}</h3>
                  <div className="text-xs text-slate-500">{b.location_estate}</div>
                </div>

                <div className="pt-2 border-t border-slate-200 space-y-1 text-xs">
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>Revenue:</span>
                    <span className="font-mono text-slate-900 font-black">{formatKES(branchRevenue)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>Full Cylinders:</span>
                    <span className="text-emerald-700 font-black">{totalFull} units</span>
                  </div>
                  <div className="flex justify-between font-bold text-slate-700">
                    <span>Empty Tares:</span>
                    <span className="text-slate-600 font-black">{totalEmpty} units</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
