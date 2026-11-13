'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { DeliveryStatus } from '@/types';
import {
  Bike,
  Phone,
  Navigation,
  CheckCircle2,
  Clock,
  Send,
  Trophy,
  AlertCircle,
  MessageSquare,
  MapPin,
  Flame,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { formatKES, displayKenyanPhone, formatShortDate } from '@/lib/formatters';

export default function RiderPage() {
  const { currentUser, orders, leaderboard, updateDeliveryStatus, updateRiderComment } = useStore();
  const { showSuccess } = useToast();

  const [activeTab, setActiveTab] = useState<'runs' | 'leaderboard'>('runs');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  if (!currentUser || (currentUser.role !== 'rider' && currentUser.role !== 'admin')) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-amber-100 text-amber-700 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">Rider Portal Restricted</h1>
        <p className="text-sm text-slate-600">
          This mobile dispatch screen is reserved for verified field delivery riders.
        </p>
      </div>
    );
  }

  // Filter orders assigned to this rider
  const myDeliveries = orders.filter((o) => o.rider_id === currentUser.id || o.rider_ids?.includes(currentUser.id));
  const activeDeliveries = myDeliveries.filter(
    (o) => o.delivery_status !== 'delivered' && o.delivery_status !== 'cancelled'
  );
  const completedDeliveries = myDeliveries.filter((o) => o.delivery_status === 'delivered');

  const handleStatusChange = (orderId: string, status: DeliveryStatus) => {
    updateDeliveryStatus(orderId, status);
    if (status === 'delivered') {
      showSuccess(`Order delivered successfully! Well done.`);
    } else if (status === 'in_transit') {
      showSuccess(`Status updated: On the way.`);
    }
  };

  const handleSaveComment = (orderId: string) => {
    const text = commentInputs[orderId];
    if (text !== undefined) {
      updateRiderComment(orderId, text);
      showSuccess('Delivery note updated in station log.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 sm:px-6 py-5 pb-24 space-y-5">
      {/* 1. RIDER STICKY RUN SUMMARY */}
      <div className="bg-slate-900 text-white rounded-3xl p-5 shadow-xl border-2 border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center text-white font-black shadow-md">
              <Bike className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-black leading-tight">{currentUser.full_name}</h1>
              <div className="text-xs font-bold text-orange-400">
                Bike: {currentUser.vehicle_plate || 'Assigned Fleet'}
              </div>
            </div>
          </div>
          <Badge variant="warning">Rider Active</Badge>
        </div>

        {/* Big Quick Stats */}
        <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-slate-800 text-center">
          <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <div className="text-2xl font-black text-amber-400">{activeDeliveries.length}</div>
            <div className="text-[11px] font-bold uppercase text-slate-400 mt-0.5">Active Trips</div>
          </div>
          <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <div className="text-2xl font-black text-emerald-400">{completedDeliveries.length}</div>
            <div className="text-[11px] font-bold uppercase text-slate-400 mt-0.5">Completed</div>
          </div>
          <div className="bg-slate-800/80 p-3 rounded-2xl border border-slate-700">
            <div className="text-2xl font-black text-sky-400">
              {completedDeliveries.length > 0 ? '18m' : '—'}
            </div>
            <div className="text-[11px] font-bold uppercase text-slate-400 mt-0.5">Avg Time</div>
          </div>
        </div>
      </div>

      {/* 2. TAB TOGGLE (Run Sheet vs Leaderboard) */}
      <div className="flex p-1 bg-slate-200 rounded-2xl">
        <button
          onClick={() => setActiveTab('runs')}
          className={`flex-1 min-h-[44px] text-sm font-black rounded-xl transition flex items-center justify-center gap-2 ${
            activeTab === 'runs'
              ? 'bg-white text-slate-900 shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Bike className="w-4 h-4" />
          <span>My Run Sheet ({activeDeliveries.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('leaderboard')}
          className={`flex-1 min-h-[44px] text-sm font-black rounded-xl transition flex items-center justify-center gap-2 ${
            activeTab === 'leaderboard'
              ? 'bg-white text-slate-900 shadow-md'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Trophy className="w-4 h-4 text-amber-500" />
          <span>Fleet Standings</span>
        </button>
      </div>

      {/* 3. RUN SHEET VIEW: One Large Card Per Delivery */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          {activeDeliveries.length === 0 ? (
            <div className="text-center py-12 px-4 bg-white border-2 border-dashed border-slate-300 rounded-3xl space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-500 mx-auto" />
              <h3 className="text-xl font-black text-slate-900">No Pending Deliveries!</h3>
              <p className="text-sm font-medium text-slate-500 max-w-sm mx-auto">
                You have fulfilled all assigned customer orders. Stand by at your branch hub for the next dispatch.
              </p>
            </div>
          ) : (
            activeDeliveries.map((order) => {
              const mapsQuery = encodeURIComponent(
                `${order.delivery_address || ''}, ${order.delivery_estate || ''}, Nairobi`
              );
              const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;
              const phoneTel = `tel:${order.customer_phone.replace(/\s+/g, '')}`;

              return (
                <div
                  key={order.id}
                  className="bg-white rounded-3xl border-2 border-slate-300 shadow-md p-5 space-y-4 text-left"
                >
                  {/* Top Bar: Order ID & Status Badge */}
                  <div className="flex items-center justify-between border-b-2 border-slate-100 pb-3">
                    <div>
                      <span className="text-xs font-black uppercase text-orange-600">Ticket</span>
                      <h2 className="text-xl font-black text-slate-900 font-mono">{order.order_number}</h2>
                    </div>
                    <Badge variant={order.delivery_status === 'in_transit' ? 'warning' : 'info'}>
                      {order.delivery_status === 'in_transit' ? 'On the Way' : 'Assigned to You'}
                    </Badge>
                  </div>

                  {/* Customer & Location */}
                  <div className="space-y-2">
                    <div className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <span>{order.customer_name}</span>
                    </div>

                    <div className="flex items-start gap-2 text-sm font-bold text-slate-700 bg-slate-50 p-3 rounded-2xl border border-slate-200">
                      <MapPin className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                      <div>
                        <div className="text-slate-900 font-black">{order.delivery_estate || 'Nairobi'}</div>
                        <div className="text-xs text-slate-600 font-medium">
                          {order.delivery_address || 'Customer provided estate landmark'}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Cylinders / Items on this trip */}
                  <div className="p-3 bg-orange-50/70 rounded-2xl border-2 border-orange-200 text-sm space-y-1.5">
                    <div className="text-xs font-black uppercase tracking-wider text-orange-800">
                      Items to Deliver & Collect
                    </div>
                    {order.items?.map((item, idx) => (
                      <div key={idx} className="flex justify-between items-center text-sm font-black text-slate-900">
                        <span>
                          {item.quantity}x {item.outgoing_brand} {item.cylinder_size_kg ? `${item.cylinder_size_kg}kg` : ''}
                        </span>
                        <span className="text-xs font-bold text-orange-700">
                          {item.order_type === 'refill' ? `Swap with empty ${item.incoming_brand || item.outgoing_brand}` : 'New Cylinder'}
                        </span>
                      </div>
                    ))}
                    <div className="pt-2 border-t border-orange-200 flex justify-between items-center text-sm font-black text-slate-900">
                      <span>Payment Status:</span>
                      <span className={order.payment_status === 'paid' ? 'text-emerald-700' : 'text-amber-800'}>
                        {order.payment_status === 'paid' ? 'PAID (Verified)' : `COLLECT ${formatKES(order.total_kes)}`}
                      </span>
                    </div>
                  </div>

                  {/* Huge Primary Action Buttons: CALL & NAVIGATE */}
                  <div className="grid grid-cols-2 gap-3 pt-1">
                    <a
                      href={phoneTel}
                      className="min-h-[56px] px-4 py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-md active:scale-95 transition"
                    >
                      <Phone className="w-5 h-5 text-emerald-400" />
                      <span>Call Client</span>
                    </a>

                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="min-h-[56px] px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-2xl font-black text-base flex items-center justify-center gap-2 shadow-md active:scale-95 transition"
                    >
                      <Navigation className="w-5 h-5 text-white" />
                      <span>Google Maps</span>
                    </a>
                  </div>

                  {/* Giant Single-Tap Progress Button */}
                  <div className="pt-2">
                    {order.delivery_status === 'assigned' ? (
                      <Button
                        onClick={() => handleStatusChange(order.id, 'in_transit')}
                        variant="primary"
                        size="lg"
                        className="w-full bg-amber-600 hover:bg-amber-700 border-amber-500 min-h-[56px] text-lg font-black"
                      >
                        <Bike className="w-6 h-6 mr-2" /> Start Trip (On the Way)
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleStatusChange(order.id, 'delivered')}
                        variant="success"
                        size="lg"
                        className="w-full min-h-[56px] text-lg font-black"
                      >
                        <CheckCircle2 className="w-6 h-6 mr-2" /> Mark Delivered & Complete
                      </Button>
                    )}
                  </div>

                  {/* Quick Rider Note */}
                  <div className="pt-2 border-t border-slate-100 flex gap-2">
                    <input
                      type="text"
                      placeholder="Add note (e.g. Left with gate guard Stanley)..."
                      value={commentInputs[order.id] !== undefined ? commentInputs[order.id] : order.rider_comment || ''}
                      onChange={(e) => setCommentInputs({ ...commentInputs, [order.id]: e.target.value })}
                      className="flex-1 min-h-[44px] text-sm px-3 rounded-xl border-2 border-slate-300 font-medium focus:border-orange-500 focus:outline-none"
                    />
                    <Button onClick={() => handleSaveComment(order.id)} variant="outline" size="sm">
                      Save Note
                    </Button>
                  </div>
                </div>
              );
            })
          )}

          {/* Completed Today Section (Collapsible) */}
          {completedDeliveries.length > 0 && (
            <div className="pt-4 border-t-2 border-slate-200">
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-500 mb-2">
                Delivered Today ({completedDeliveries.length})
              </h3>
              <div className="space-y-2">
                {completedDeliveries.slice(0, 5).map((o) => (
                  <div
                    key={o.id}
                    className="p-3 bg-white rounded-2xl border-2 border-slate-200 flex items-center justify-between text-sm"
                  >
                    <div>
                      <div className="font-black text-slate-900">{o.customer_name}</div>
                      <div className="text-xs text-slate-500">{o.delivery_estate} • {formatShortDate(o.delivered_at)}</div>
                    </div>
                    <Badge variant="success">Delivered</Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 4. COMPACT MOBILE FLEET LEADERBOARD (Replaces unreadable 6-col table) */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-3">
          <div className="bg-white p-4 rounded-3xl border-2 border-slate-200 text-left space-y-1">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-500" /> Nairobi Station Rider Rankings
            </h2>
            <p className="text-xs text-slate-500">
              Rankings calculated strictly on completed delivery speed and volume. Zero financial data.
            </p>
          </div>

          <div className="space-y-2.5">
            {leaderboard.map((entry, idx) => {
              const isMe = entry.rider_id === currentUser.id;
              return (
                <div
                  key={entry.rider_id}
                  className={`p-4 rounded-3xl border-2 transition flex items-center justify-between text-left ${
                    isMe
                      ? 'bg-amber-50 border-amber-400 ring-2 ring-amber-200 shadow-md'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`w-9 h-9 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-amber-950 shadow'
                          : idx === 1
                          ? 'bg-slate-300 text-slate-800'
                          : idx === 2
                          ? 'bg-amber-700 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      #{idx + 1}
                    </div>
                    <div>
                      <div className="font-black text-base text-slate-900 flex items-center gap-1.5">
                        <span>{entry.rider_name}</span>
                        {isMe && <Badge variant="warning">You</Badge>}
                      </div>
                      <div className="text-xs font-bold text-slate-500">
                        Plate: {entry.vehicle_plate || '—'}
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-lg font-black text-emerald-700">
                      {entry.completed_deliveries}{' '}
                      <span className="text-xs font-bold text-slate-500">done</span>
                    </div>
                    <div className="text-xs font-bold text-slate-600">
                      avg {entry.avg_delivery_minutes} mins
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
