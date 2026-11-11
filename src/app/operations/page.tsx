'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { DeliveryStatus } from '@/types';
import {
  Send,
  Building2,
  Phone,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  Filter,
  Bike,
  User,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { formatKES, formatShortDate, displayKenyanPhone } from '@/lib/formatters';

export default function OperationsPage() {
  const { currentUser, branches, orders, staffList, assignRider, updateDeliveryStatus } = useStore();
  const { showSuccess } = useToast();
  const [selectedBranchId, setSelectedBranchId] = useState<string>('all');

  if (!currentUser || !['admin', 'director', 'operator'].includes(currentUser.role)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-600">Dispatch and operations routing is reserved for Operators and Admins.</p>
      </div>
    );
  }

  const approvedRiders = staffList.filter((s) => s.role === 'rider' && s.approval_status === 'approved');

  // Filter delivery orders (exclude counter walk-ins)
  const deliveryOrders = orders.filter((o) => {
    if (o.is_pos_walkin) return false;
    if (selectedBranchId !== 'all' && o.branch_id !== selectedBranchId) return false;
    return o.delivery_status !== 'delivered' && o.delivery_status !== 'cancelled';
  });

  // Sort OLDEST FIRST so oldest waiting customer orders are expedited first!
  const sortedOrders = [...deliveryOrders].sort(
    (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
  );

  const pendingOrders = sortedOrders.filter((o) => o.delivery_status === 'pending');
  const assignedOrders = sortedOrders.filter((o) => o.delivery_status === 'assigned');
  const inTransitOrders = sortedOrders.filter((o) => o.delivery_status === 'in_transit');

  const handleAssign = (orderId: string, riderId: string) => {
    if (!riderId) return;
    assignRider(orderId, riderId);
    const rider = approvedRiders.find((r) => r.id === riderId);
    showSuccess(`Order assigned to ${rider?.full_name || 'Rider'}`);
  };

  const renderOrderCard = (order: typeof orders[0]) => {
    const branch = branches.find((b) => b.id === order.branch_id);
    const assignedRider = staffList.find((s) => s.id === order.rider_id);

    return (
      <div
        key={order.id}
        className="p-4 bg-white rounded-2xl border-2 border-slate-200 hover:border-slate-300 shadow-sm space-y-3 text-left transition"
      >
        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
          <div className="font-mono text-sm font-black text-slate-900">{order.order_number}</div>
          <span className="text-xs font-bold text-slate-400">{formatShortDate(order.created_at)}</span>
        </div>

        <div>
          <div className="text-sm font-black text-slate-900">{order.customer_name}</div>
          <div className="text-xs font-bold text-slate-600 flex items-center gap-1.5 mt-0.5">
            <MapPin className="w-3.5 h-3.5 text-red-500 shrink-0" />
            <span className="truncate">{order.delivery_estate} • {order.delivery_address || 'Standard drop'}</span>
          </div>
          <div className="text-xs text-slate-500 mt-0.5">📞 {order.customer_phone}</div>
        </div>

        {/* Items */}
        <div className="text-xs font-bold text-slate-700 bg-slate-50 p-2 rounded-xl">
          {order.items?.map((item, idx) => (
            <div key={idx} className="truncate">
              {item.quantity}x {item.outgoing_brand} {item.cylinder_size_kg ? `${item.cylinder_size_kg}kg` : ''} ({item.order_type})
            </div>
          ))}
        </div>

        {/* Rider Assignment Dropdown */}
        <div className="pt-1">
          <label className="block text-[11px] font-bold text-slate-500 mb-1">Assigned Motorbike Rider</label>
          <select
            value={order.rider_id || ''}
            onChange={(e) => handleAssign(order.id, e.target.value)}
            className="w-full min-h-[44px] text-xs font-bold px-2.5 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
          >
            <option value="">-- Choose Rider to Dispatch --</option>
            {approvedRiders.map((r) => (
              <option key={r.id} value={r.id}>
                {r.full_name} ({r.vehicle_plate || 'Bike'})
              </option>
            ))}
          </select>
        </div>

        {/* Quick Status Action Button */}
        {order.delivery_status === 'assigned' && (
          <Button
            size="sm"
            onClick={() => {
              updateDeliveryStatus(order.id, 'in_transit');
              showSuccess('Order marked In Transit');
            }}
            className="w-full min-h-[40px] text-xs font-black bg-amber-600 hover:bg-amber-700 border-amber-600"
          >
            Mark Dispatched (On the Way)
          </Button>
        )}

        {order.delivery_status === 'in_transit' && (
          <Button
            size="sm"
            variant="success"
            onClick={() => {
              updateDeliveryStatus(order.id, 'delivered');
              showSuccess('Order marked Delivered');
            }}
            className="w-full min-h-[40px] text-xs font-black"
          >
            Mark Delivered & Complete
          </Button>
        )}
      </div>
    );
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 space-y-6 text-left">
      {/* Page Title & Hub Filter */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Send className="w-6 h-6 text-orange-600" /> Dispatch Board & Fleet Routing
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Oldest customer orders prioritized. Allocate motorbikes across Nairobi hubs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-slate-400 shrink-0" />
          <span className="text-xs font-bold text-slate-700">Hub:</span>
          <select
            value={selectedBranchId}
            onChange={(e) => setSelectedBranchId(e.target.value)}
            className="min-h-[44px] text-xs font-bold px-3 bg-white border-2 border-slate-300 rounded-xl"
          >
            <option value="all">All Branches</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* 3-COLUMN DISPATCH BOARD (Pending | Assigned | In-Transit) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 items-start">
        {/* Column 1: Awaiting Rider */}
        <div className="bg-slate-100 rounded-3xl p-4 border-2 border-slate-200 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-red-500 inline-block" />
              <span>Pending Allocation</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-white text-xs font-black text-slate-700 shadow-sm">
              {pendingOrders.length}
            </span>
          </div>

          <div className="space-y-3">
            {pendingOrders.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center font-bold">
                No orders waiting for riders.
              </p>
            ) : (
              pendingOrders.map(renderOrderCard)
            )}
          </div>
        </div>

        {/* Column 2: Assigned */}
        <div className="bg-slate-100 rounded-3xl p-4 border-2 border-slate-200 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 inline-block" />
              <span>Assigned to Rider</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-white text-xs font-black text-slate-700 shadow-sm">
              {assignedOrders.length}
            </span>
          </div>

          <div className="space-y-3">
            {assignedOrders.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center font-bold">
                No riders waiting at station.
              </p>
            ) : (
              assignedOrders.map(renderOrderCard)
            )}
          </div>
        </div>

        {/* Column 3: In Transit */}
        <div className="bg-slate-100 rounded-3xl p-4 border-2 border-slate-200 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <h2 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block" />
              <span>On the Way (Roads)</span>
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-white text-xs font-black text-slate-700 shadow-sm">
              {inTransitOrders.length}
            </span>
          </div>

          <div className="space-y-3">
            {inTransitOrders.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center font-bold">
                No bikes currently in transit.
              </p>
            ) : (
              inTransitOrders.map(renderOrderCard)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
