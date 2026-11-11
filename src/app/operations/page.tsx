'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { DeliveryStatus } from '@/types';
import {
  Bike,
  Building2,
  Phone,
  MapPin,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowRight,
  Filter,
} from 'lucide-react';

export default function OperationsPage() {
  const { currentUser, branches, orders, staffList, assignRider, updateDeliveryStatus } = useStore();
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  if (!currentUser || !['admin', 'director', 'operator'].includes(currentUser.role)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-500 mt-1">Dispatch and operations routing is reserved for Operators and Admins.</p>
      </div>
    );
  }

  const riders = staffList.filter((s) => s.role === 'rider' && s.approval_status === 'approved');

  const filteredOrders = orders.filter((o) => {
    if (o.is_pos_walkin) return false; // Focus operations desk on deliveries
    const matchesBranch = selectedBranchId === 'all' || o.branch_id === selectedBranchId;
    const matchesStatus = selectedStatus === 'all' || o.delivery_status === selectedStatus;
    return matchesBranch && matchesStatus;
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 space-y-6">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bike className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" /> Dispatch Desk & Fleet Routing
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Allocate motorbike riders to pending cylinder deliveries across all branch zones.
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-slate-700 shrink-0">Hub:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="flex-1 sm:flex-none min-h-[40px] text-xs font-semibold border border-slate-300 rounded-xl px-3 py-1.5 bg-white text-slate-800"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none w-full sm:w-auto">
          {['all', 'pending', 'assigned', 'in_transit', 'delivered'].map((status) => (
            <button
              key={status}
              onClick={() => setSelectedStatus(status)}
              className={`min-h-[38px] px-3.5 py-1 text-xs font-bold rounded-xl capitalize transition whitespace-nowrap ${
                selectedStatus === status ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}
        </div>
      </div>

      {/* Orders Grid */}
      {filteredOrders.length === 0 ? (
        <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 text-sm">
          <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
          No deliveries match the selected filters.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredOrders.map((order) => {
            const branch = branches.find((b) => b.id === order.branch_id);
            const assignedRider = riders.find((r) => r.id === order.rider_id);

            return (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex flex-col justify-between hover:border-slate-300 transition"
              >
                <div>
                  {/* Top line */}
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <span className="font-mono font-bold text-xs text-orange-600">{order.order_number}</span>
                      {order.receipt_number && (
                        <span className="ml-2 font-mono text-[11px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                          Rcpt: {order.receipt_number}
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        order.delivery_status === 'delivered'
                          ? 'bg-emerald-100 text-emerald-800'
                          : order.delivery_status === 'in_transit'
                          ? 'bg-blue-100 text-blue-800'
                          : order.delivery_status === 'assigned'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {order.delivery_status.replace('_', ' ')}
                    </span>
                  </div>

                  {/* Customer & Address */}
                  <h3 className="font-bold text-slate-900 text-sm">{order.customer_name}</h3>
                  <div className="mt-1">
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-lg transition border border-emerald-200"
                    >
                      <Phone className="w-3 h-3" /> {order.customer_phone}
                    </a>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs text-slate-600 mt-2">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0 mt-0.5" />
                    <span>
                      <strong>{order.delivery_estate}</strong> — {order.delivery_address}
                    </span>
                  </div>

                  {/* Branch tag */}
                  <div className="mt-3 flex items-center justify-between text-xs text-slate-500 pt-2 border-t border-slate-100">
                    <span>Dispatch Hub:</span>
                    <span className="font-semibold text-slate-700">{branch?.name || '—'}</span>
                  </div>

                  {/* Items list */}
                  <div className="mt-2 text-xs text-slate-600 space-y-1 bg-slate-50 p-2 rounded-lg">
                    {order.items?.map((item) => (
                      <div key={item.id} className="flex justify-between">
                        <span>
                          {item.quantity}x {item.outgoing_brand} {item.cylinder_size_kg ? `${item.cylinder_size_kg}kg` : ''}
                        </span>
                        <span className="text-slate-400 font-mono text-[11px] capitalize">{item.order_type}</span>
                      </div>
                    ))}
                  </div>

                  {/* Rider Comment if present */}
                  {order.rider_comment && (
                    <div className="mt-2 text-xs bg-amber-50 border border-amber-200 text-amber-900 p-2 rounded-lg">
                      <strong>Rider Note:</strong> {order.rider_comment}
                    </div>
                  )}
                </div>

                {/* Bottom Actions: Rider Assignment & Status */}
                <div className="mt-4 pt-4 border-t border-slate-100 space-y-3">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Assigned Rider:</label>
                    <select
                      value={order.rider_id || ''}
                      onChange={(e) => assignRider(order.id, e.target.value)}
                      className="w-full min-h-[44px] text-xs border border-slate-200 rounded-xl px-2.5 py-2 bg-white font-medium text-slate-800"
                    >
                      <option value="">— Select Motorbike Rider —</option>
                      {riders.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.full_name} ({r.vehicle_plate || 'No Plate'})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[10px] font-bold text-slate-500 uppercase">Override Status:</span>
                    <select
                      value={order.delivery_status}
                      onChange={(e) => updateDeliveryStatus(order.id, e.target.value as DeliveryStatus)}
                      className="min-h-[40px] text-xs border border-slate-200 rounded-xl px-2.5 py-1.5 bg-slate-50 text-slate-700 font-semibold"
                    >
                      <option value="pending">Pending</option>
                      <option value="assigned">Assigned</option>
                      <option value="in_transit">In Transit</option>
                      <option value="delivered">Delivered</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
