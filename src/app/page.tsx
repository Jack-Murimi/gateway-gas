'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/context/store-context';
import {
  Flame,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  TrendingUp,
  Package,
  Bike,
  Building2,
  Users,
  ShoppingCart,
  ChevronRight,
  ShieldCheck,
} from 'lucide-react';

export default function HomePage() {
  const { currentUser, branches, orders, inventory, staffList, leaderboard } = useStore();

  // 1. Not logged in view
  if (!currentUser) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-slate-200 p-8 text-center">
          <div className="w-14 h-14 bg-orange-600 rounded-2xl flex items-center justify-center text-white mx-auto mb-4 shadow-lg">
            <Flame className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold text-slate-900 mb-2">Gateway Gas Portal</h1>
          <p className="text-sm text-slate-500 mb-6">Internal operations, stock management & rider dispatch.</p>
          <div className="space-y-3">
            <Link
              href="/signup"
              className="block w-full py-3 px-4 bg-orange-600 hover:bg-orange-700 text-white font-semibold rounded-xl transition shadow-md"
            >
              Sign Up as Staff
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // 2. Pending Approval Screen (strictly required by Q2)
  if (currentUser.approval_status === 'pending') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-lg w-full bg-white rounded-2xl shadow-xl border border-amber-200 p-8 text-center">
          <div className="w-14 h-14 bg-amber-100 text-amber-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <Clock className="w-8 h-8" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">Account Pending Approval</h2>
          <p className="text-slate-600 mb-4">
            Welcome, <span className="font-semibold text-slate-800">{currentUser.full_name}</span>. Your staff account has been
            registered with email <span className="font-semibold text-slate-800">{currentUser.email}</span>.
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-left text-xs text-amber-800 space-y-2 mb-6">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="w-4 h-4 text-amber-600" /> Security Notice: Internal Access Only
            </div>
            <p>
              An <strong>Admin</strong> or <strong>Director</strong> must verify your credentials and assign your operating role
              (Sales Rep, Operator, Rider, Director, or Admin) before operational features unlock.
            </p>
          </div>
          <p className="text-xs text-slate-400">
            For testing: Use the user switcher in the top right navbar to switch to an Admin account to approve this user.
          </p>
        </div>
      </div>
    );
  }

  // 3. Rejected Screen
  if (currentUser.approval_status === 'rejected') {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div className="max-w-md w-full bg-white rounded-2xl shadow-xl border border-red-200 p-8 text-center">
          <div className="w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8" />
          </div>
          <h2 className="text-xl font-bold text-red-800 mb-2">Access Revoked</h2>
          <p className="text-sm text-slate-600">Your staff account request has been declined or revoked by an administrator.</p>
        </div>
      </div>
    );
  }

  // Role-specific stats
  const pendingApprovalsCount = staffList.filter((s) => s.approval_status === 'pending').length;
  const pendingOrdersCount = orders.filter((o) => o.delivery_status === 'pending').length;
  const inTransitCount = orders.filter((o) => o.delivery_status === 'in_transit').length;
  const completedOrdersCount = orders.filter((o) => o.delivery_status === 'delivered').length;
  const totalRevenue = orders.filter((o) => o.payment_status === 'paid').reduce((acc, o) => acc + o.total_kes, 0);

  // If Rider: redirect to /rider or show Rider view directly
  if (currentUser.role === 'rider') {
    const myDeliveries = orders.filter((o) => o.rider_id === currentUser.id);
    const myPending = myDeliveries.filter((o) => o.delivery_status !== 'delivered' && o.delivery_status !== 'cancelled');

    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
        <div className="bg-gradient-to-r from-amber-500 to-orange-600 rounded-2xl p-6 text-white shadow-lg flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-amber-100">Rider Console</span>
            <h1 className="text-2xl font-bold mt-1">Hello, {currentUser.full_name}</h1>
            <p className="text-sm text-amber-100 mt-1">
              Vehicle Plate: <span className="font-semibold text-white">{currentUser.vehicle_plate || 'Not Assigned'}</span>
            </p>
          </div>
          <Link
            href="/rider"
            className="px-5 py-2.5 bg-white text-orange-600 font-bold text-sm rounded-xl hover:bg-orange-50 transition shadow self-start md:self-auto flex items-center gap-2"
          >
            Open Active Run-Sheet <ArrowRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Rider Summary Cards (Strictly NO revenue/money amounts shown!) */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Active Deliveries</span>
            <p className="text-2xl font-bold text-amber-600 mt-2">{myPending.length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Completed Deliveries</span>
            <p className="text-2xl font-bold text-emerald-600 mt-2">
              {myDeliveries.filter((o) => o.delivery_status === 'delivered').length}
            </p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Total Run-Sheet</span>
            <p className="text-2xl font-bold text-slate-800 mt-2">{myDeliveries.length}</p>
          </div>
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Leaderboard Rank</span>
            <p className="text-2xl font-bold text-indigo-600 mt-2">
              #{Math.max(1, leaderboard.findIndex((r) => r.rider_id === currentUser.id) + 1)}
            </p>
          </div>
        </div>

        {/* Rider Leaderboard preview (Strictly NO money amounts!) */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Bike className="w-5 h-5 text-orange-600" /> Fleet Delivery Performance Leaderboard
            </h2>
            <span className="text-xs text-slate-400">Aggregated live run-time</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
                <tr>
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Rider</th>
                  <th className="py-3 px-4">Plate</th>
                  <th className="py-3 px-4 text-center">Completed Deliveries</th>
                  <th className="py-3 px-4 text-center">In Transit</th>
                  <th className="py-3 px-4 text-right">Avg Time (min)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {leaderboard.map((r, idx) => (
                  <tr
                    key={r.rider_id}
                    className={r.rider_id === currentUser.id ? 'bg-orange-50 font-semibold' : 'hover:bg-slate-50'}
                  >
                    <td className="py-3 px-4 text-slate-400">#{idx + 1}</td>
                    <td className="py-3 px-4 text-slate-800">
                      {r.rider_name} {r.rider_id === currentUser.id && '(You)'}
                    </td>
                    <td className="py-3 px-4 text-slate-600">{r.vehicle_plate || '—'}</td>
                    <td className="py-3 px-4 text-center text-emerald-600 font-bold">{r.completed_deliveries}</td>
                    <td className="py-3 px-4 text-center text-amber-600">{r.active_deliveries}</td>
                    <td className="py-3 px-4 text-right text-slate-700">{r.avg_delivery_minutes}m</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    );
  }

  // Admin, Director, Operator, Sales Rep Dashboard
  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {/* Welcome Banner */}
      <div className="bg-slate-900 rounded-2xl p-6 text-white shadow-xl flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded text-[11px] font-bold uppercase bg-orange-600 text-white">
              {currentUser.role.replace('_', ' ')}
            </span>
            <span className="text-slate-400 text-xs">Gateway Gas Nairobi Network</span>
          </div>
          <h1 className="text-2xl font-bold mt-2">Welcome back, {currentUser.full_name}</h1>
          <p className="text-sm text-slate-300 mt-1">
            Managing 4 active branches with cylinder brand exchange & cross-branch dispatch.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {['admin', 'director', 'sales_rep'].includes(currentUser.role) && (
            <Link
              href="/sales"
              className="px-4 py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-semibold text-sm rounded-xl transition shadow flex items-center gap-2"
            >
              <ShoppingCart className="w-4 h-4" /> New POS Sale / Order
            </Link>
          )}
          {['admin', 'director', 'operator'].includes(currentUser.role) && (
            <Link
              href="/operations"
              className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-white font-semibold text-sm rounded-xl transition flex items-center gap-2"
            >
              <Bike className="w-4 h-4" /> Dispatch Desk
            </Link>
          )}
        </div>
      </div>

      {/* Staff Approvals Alert for Admin/Director */}
      {['admin', 'director'].includes(currentUser.role) && pendingApprovalsCount > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-amber-100 rounded-xl flex items-center justify-center text-amber-600">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-amber-900">
                {pendingApprovalsCount} New Staff Registration{pendingApprovalsCount > 1 ? 's' : ''} Awaiting Approval
              </h3>
              <p className="text-xs text-amber-700">Review employee identities and assign operating roles.</p>
            </div>
          </div>
          <Link
            href="/staff"
            className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold rounded-lg transition"
          >
            Review Staff
          </Link>
        </div>
      )}

      {/* Primary KPI Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {['admin', 'director'].includes(currentUser.role) && (
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <span className="text-xs font-medium text-slate-500">Total Revenue (KES)</span>
            <p className="text-2xl font-bold text-slate-900 mt-2">KES {totalRevenue.toLocaleString()}</p>
            <span className="text-[11px] text-emerald-600 font-medium">All Branches Combined</span>
          </div>
        )}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-medium text-slate-500">Unassigned Orders</span>
          <p className="text-2xl font-bold text-orange-600 mt-2">{pendingOrdersCount}</p>
          <span className="text-[11px] text-slate-500">Awaiting rider allocation</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-medium text-slate-500">In Transit</span>
          <p className="text-2xl font-bold text-blue-600 mt-2">{inTransitCount}</p>
          <span className="text-[11px] text-slate-500">Active bike deliveries</span>
        </div>
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <span className="text-xs font-medium text-slate-500">Completed Today</span>
          <p className="text-2xl font-bold text-emerald-600 mt-2">{completedOrdersCount}</p>
          <span className="text-[11px] text-slate-500">Delivered & verified</span>
        </div>
      </div>

      {/* Multi-Branch Quick Stock Overview */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-600" /> Multi-Branch Inventory Balance
            </h2>
            <p className="text-xs text-slate-500">Live full vs tare (empty) cylinders across Nairobi hubs</p>
          </div>
          <Link href="/inventory" className="text-xs font-semibold text-orange-600 hover:underline flex items-center gap-1">
            Detailed Stock Management <ChevronRight className="w-3.5 h-3.5" />
          </Link>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {branches.map((branch) => {
            const branchItems = inventory.filter((i) => i.branch_id === branch.id);
            const totalFull = branchItems.reduce((acc, i) => acc + i.full_units, 0);
            const totalEmpty = branchItems.reduce((acc, i) => acc + i.empty_units, 0);

            return (
              <div key={branch.id} className="p-4 rounded-xl border border-slate-100 bg-slate-50 hover:border-slate-300 transition">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="font-bold text-sm text-slate-900">{branch.name}</h4>
                  <span className="text-[10px] font-mono font-bold bg-white px-2 py-0.5 rounded border border-slate-200 text-slate-600">
                    {branch.code}
                  </span>
                </div>
                <p className="text-xs text-slate-500 mb-3">{branch.location_estate}</p>
                <div className="grid grid-cols-2 gap-2 text-center">
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-semibold text-emerald-600 block">Full Gas</span>
                    <span className="text-lg font-bold text-slate-800">{totalFull}</span>
                  </div>
                  <div className="bg-white p-2 rounded-lg border border-slate-200">
                    <span className="text-[10px] uppercase font-semibold text-amber-600 block">Empty Tare</span>
                    <span className="text-lg font-bold text-slate-800">{totalEmpty}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Orders List */}
      <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShoppingCart className="w-5 h-5 text-orange-600" /> Recent Sales & Deliveries
          </h2>
          <Link href="/sales" className="text-xs font-semibold text-orange-600 hover:underline">
            View All Orders
          </Link>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3 px-4">Order #</th>
                <th className="py-3 px-4">Customer</th>
                <th className="py-3 px-4">Branch</th>
                <th className="py-3 px-4">Type</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Payment</th>
                <th className="py-3 px-4 text-right">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {orders.slice(0, 5).map((order) => {
                const branch = branches.find((b) => b.id === order.branch_id);
                return (
                  <tr key={order.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4 font-mono font-bold text-xs text-slate-800">{order.order_number}</td>
                    <td className="py-3 px-4">
                      <div className="font-medium text-slate-900">{order.customer_name}</div>
                      <div className="text-xs text-slate-500">{order.customer_phone}</div>
                    </td>
                    <td className="py-3 px-4 text-xs font-medium text-slate-700">{branch?.name || '—'}</td>
                    <td className="py-3 px-4 text-xs">
                      {order.is_pos_walkin ? (
                        <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-semibold">POS Walk-In</span>
                      ) : (
                        <span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 font-semibold">Delivery</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          order.delivery_status === 'delivered'
                            ? 'bg-emerald-100 text-emerald-800'
                            : order.delivery_status === 'in_transit'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                        }`}
                      >
                        {order.delivery_status.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-xs">
                      <span
                        className={`px-2 py-0.5 rounded font-bold uppercase text-[10px] ${
                          order.payment_status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {order.payment_status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-slate-900 text-xs">
                      KES {order.total_kes.toLocaleString()}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
