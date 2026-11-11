'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { DeliveryStatus } from '@/types';
import {
  Bike,
  Phone,
  MapPin,
  CheckCircle2,
  Clock,
  Send,
  Trophy,
  AlertCircle,
  MessageSquare,
} from 'lucide-react';

export default function RiderPage() {
  const { currentUser, orders, leaderboard, updateDeliveryStatus, updateRiderComment } = useStore();

  const [activeTab, setActiveTab] = useState<'runs' | 'leaderboard'>('runs');
  const [commentInputs, setCommentInputs] = useState<Record<string, string>>({});

  if (!currentUser || (currentUser.role !== 'rider' && currentUser.role !== 'admin')) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-900">Rider Portal Restricted</h1>
        <p className="text-xs text-slate-500 mt-1">This page is tailored for assigned delivery riders.</p>
      </div>
    );
  }

  // Filter orders assigned to this rider
  const myDeliveries = orders.filter((o) => o.rider_id === currentUser.id);
  const activeDeliveries = myDeliveries.filter(
    (o) => o.delivery_status !== 'delivered' && o.delivery_status !== 'cancelled'
  );
  const completedDeliveries = myDeliveries.filter((o) => o.delivery_status === 'delivered');

  const handleStatusChange = (orderId: string, status: DeliveryStatus) => {
    updateDeliveryStatus(orderId, status);
  };

  const handleSaveComment = (orderId: string) => {
    const text = commentInputs[orderId];
    if (text !== undefined) {
      updateRiderComment(orderId, text);
      alert('Note saved to dispatch log.');
    }
  };

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-24 md:pb-12 space-y-6">
      {/* Mobile Top Header */}
      <div className="bg-slate-900 rounded-2xl p-5 text-white shadow-lg">
        <div className="flex items-center justify-between">
          <div>
            <span className="text-[10px] font-bold uppercase tracking-wider text-orange-400">Rider Run-Sheet</span>
            <h1 className="text-xl font-bold mt-0.5">{currentUser.full_name}</h1>
            <p className="text-xs text-slate-400 font-mono mt-0.5">Plate: {currentUser.vehicle_plate || 'Unassigned'}</p>
          </div>
          <div className="w-10 h-10 bg-orange-600 rounded-xl flex items-center justify-center text-white">
            <Bike className="w-6 h-6" />
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="mt-4 grid grid-cols-2 gap-2 bg-slate-800 p-1 rounded-xl">
          <button
            onClick={() => setActiveTab('runs')}
            className={`min-h-[44px] py-2 text-xs font-bold rounded-lg transition ${
              activeTab === 'runs' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            My Deliveries ({activeDeliveries.length})
          </button>
          <button
            onClick={() => setActiveTab('leaderboard')}
            className={`min-h-[44px] py-2 text-xs font-bold rounded-lg transition flex items-center justify-center gap-1.5 ${
              activeTab === 'leaderboard' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'
            }`}
          >
            <Trophy className="w-3.5 h-3.5" /> Performance Rank
          </button>
        </div>
      </div>

      {/* Tab 1: Run-Sheet Deliveries */}
      {activeTab === 'runs' && (
        <div className="space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider px-1">
            Active Deliveries ({activeDeliveries.length})
          </h2>

          {activeDeliveries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-slate-400 text-xs">
              <CheckCircle2 className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
              All caught up! No pending deliveries assigned to your bike.
            </div>
          ) : (
            activeDeliveries.map((order) => (
              <div
                key={order.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4"
              >
                {/* Order Top Bar: strictly NO money amounts! */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div>
                      <span className="font-mono font-bold text-xs text-orange-600">{order.order_number}</span>
                      {order.receipt_number && (
                        <span className="ml-2 font-mono text-[11px] text-slate-500 font-semibold bg-slate-100 px-1.5 py-0.5 rounded">
                          Rcpt: {order.receipt_number}
                        </span>
                      )}
                    </div>
                  <div className="flex items-center gap-2">
                    {/* Paid / Pending Status Tag (No monetary value) */}
                    <span
                      className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                        order.payment_status === 'paid'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      Payment: {order.payment_status}
                    </span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                      {order.delivery_status.replace('_', ' ')}
                    </span>
                  </div>
                </div>

                {/* Customer Details & One-Tap Dialer */}
                <div>
                  <h3 className="font-bold text-base text-slate-900">{order.customer_name}</h3>
                  <div className="flex items-center gap-2 mt-2">
                    <a
                      href={`tel:${order.customer_phone}`}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-bold text-xs rounded-xl transition border border-emerald-200"
                    >
                      <Phone className="w-3.5 h-3.5" /> Call Customer ({order.customer_phone})
                    </a>
                  </div>
                  <div className="flex items-start gap-1.5 text-xs text-slate-700 mt-3">
                    <MapPin className="w-4 h-4 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <span className="font-bold">{order.delivery_estate}</span> — {order.delivery_address}
                    </div>
                  </div>
                </div>

                {/* Cylinders to Deliver & Empties to Swap */}
                <div className="bg-slate-50 rounded-xl p-3 text-xs space-y-1.5">
                  <span className="font-bold text-[10px] uppercase text-slate-400 block">Deliver to Customer:</span>
                  {order.items?.map((item) => (
                    <div key={item.id} className="flex justify-between items-center text-slate-800">
                      <span className="font-semibold">
                        {item.quantity}x {item.outgoing_brand} {item.cylinder_size_kg ? `${item.cylinder_size_kg}kg` : ''}
                      </span>
                      {item.order_type === 'refill' && (
                        <span className="text-[11px] font-medium text-orange-700 bg-orange-50 px-2 py-0.5 rounded border border-orange-200">
                          Collect Tare: {item.incoming_brand || item.outgoing_brand}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Rider Comment Input */}
                <div className="space-y-1.5">
                  <label className="text-[11px] font-semibold text-slate-600 flex items-center gap-1">
                    <MessageSquare className="w-3 h-3" /> Delivery Note / Comment
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      defaultValue={order.rider_comment || ''}
                      placeholder="e.g. Paid via M-Pesa to till, left at gate"
                      onChange={(e) =>
                        setCommentInputs({ ...commentInputs, [order.id]: e.target.value })
                      }
                      className="flex-1 min-h-[44px] px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleSaveComment(order.id)}
                      className="min-h-[44px] px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition"
                    >
                      Save Note
                    </button>
                  </div>
                </div>

                {/* Status Toggle Buttons */}
                <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    disabled={order.delivery_status === 'in_transit'}
                    onClick={() => handleStatusChange(order.id, 'in_transit')}
                    className={`min-h-[48px] py-2.5 text-xs font-bold rounded-xl transition ${
                      order.delivery_status === 'in_transit'
                        ? 'bg-blue-50 text-blue-400 border border-blue-200 cursor-not-allowed'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow'
                    }`}
                  >
                    Start Trip (In Transit)
                  </button>

                  <button
                    type="button"
                    onClick={() => handleStatusChange(order.id, 'delivered')}
                    className="min-h-[48px] py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition shadow flex items-center justify-center gap-1"
                  >
                    <CheckCircle2 className="w-4 h-4" /> Mark Delivered
                  </button>
                </div>
              </div>
            ))
          )}

          {/* Past Completed Deliveries */}
          {completedDeliveries.length > 0 && (
            <div className="pt-4 space-y-2">
              <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider px-1">
                Completed Deliveries Today ({completedDeliveries.length})
              </h3>
              <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                {completedDeliveries.slice(0, 5).map((o) => (
                  <div key={o.id} className="p-3.5 flex items-center justify-between text-xs">
                    <div>
                      <span className="font-mono font-bold text-slate-700">{o.order_number}</span> — {o.customer_name}
                      <div className="text-[10px] text-slate-400">{o.delivery_estate}</div>
                    </div>
                    <span className="text-emerald-600 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" /> Delivered
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Tab 2: Rider Performance Leaderboard (STRICTLY NO MONEY / REVENUE SHOWN!) */}
      {activeTab === 'leaderboard' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2 mb-1">
              <Trophy className="w-5 h-5 text-amber-500" /> Fleet Delivery Leaderboard
            </h2>
            <p className="text-xs text-slate-500 mb-4">
              Comparing completion counts & delivery speed across Nairobi riders.
            </p>

            <div className="space-y-3">
              {leaderboard.map((r, idx) => {
                const isMe = r.rider_id === currentUser.id;
                return (
                  <div
                    key={r.rider_id}
                    className={`p-4 rounded-xl border transition ${
                      isMe ? 'bg-orange-50 border-orange-300 ring-2 ring-orange-400/20' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center font-bold text-xs ${
                            idx === 0
                              ? 'bg-amber-400 text-amber-950 shadow'
                              : idx === 1
                              ? 'bg-slate-300 text-slate-800'
                              : 'bg-slate-200 text-slate-700'
                          }`}
                        >
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-bold text-xs text-slate-900">
                            {r.rider_name} {isMe && '(You)'}
                          </div>
                          <div className="text-[10px] font-mono text-slate-500">{r.vehicle_plate || '—'}</div>
                        </div>
                      </div>

                      {/* 3 Metrics: Deliveries, Active, Avg Time (Zero amounts shown) */}
                      <div className="flex items-center gap-4 text-right">
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Completed</span>
                          <span className="font-bold text-sm text-emerald-600">{r.completed_deliveries}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">In Transit</span>
                          <span className="font-bold text-sm text-amber-600">{r.active_deliveries}</span>
                        </div>
                        <div>
                          <span className="text-[10px] uppercase font-semibold text-slate-400 block">Avg Time</span>
                          <span className="font-bold text-sm text-slate-800">{r.avg_delivery_minutes}m</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
