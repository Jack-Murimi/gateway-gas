'use client';

import React, { useState } from 'react';
import { PaymentMethod, PaymentStatus } from '@/types';
import {
  Smartphone,
  Banknote,
  Building,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatKES } from '@/lib/formatters';

interface PosPayStepProps {
  paymentMethod: PaymentMethod;
  onChangePaymentMethod: (m: PaymentMethod) => void;
  paymentStatus: PaymentStatus;
  onChangePaymentStatus: (s: PaymentStatus) => void;
  paymentReference: string;
  onChangePaymentReference: (ref: string) => void;
  subtotal: number;
  deliveryFee: number;
}

export function PosPayStep({
  paymentMethod,
  onChangePaymentMethod,
  paymentStatus,
  onChangePaymentStatus,
  paymentReference,
  onChangePaymentReference,
  subtotal,
  deliveryFee,
}: PosPayStepProps) {
  const [showRefInput, setShowRefInput] = useState(Boolean(paymentReference));
  const total = subtotal + deliveryFee;

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm p-4 sm:p-6 space-y-5 text-left">
      <div className="border-b-2 border-slate-100 pb-3">
        <h2 className="text-lg font-black text-slate-900">Step 3: Payment Settlement</h2>
        <p className="text-xs text-slate-500">Select payment channel and confirmation status</p>
      </div>

      {/* Payment Method Cards */}
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
          Payment Method Channel
        </label>
        <div className="grid grid-cols-3 gap-2.5">
          <button
            type="button"
            onClick={() => onChangePaymentMethod('mpesa')}
            className={`min-h-[56px] p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-black text-xs transition active:scale-95 ${
              paymentMethod === 'mpesa'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-200 shadow-sm'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Smartphone className="w-5 h-5 text-emerald-600" />
            <span>M-Pesa Paybill</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentMethod('cash')}
            className={`min-h-[56px] p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-black text-xs transition active:scale-95 ${
              paymentMethod === 'cash'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-200 shadow-sm'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Banknote className="w-5 h-5 text-emerald-600" />
            <span>Cash at Counter</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentMethod('bank_transfer')}
            className={`min-h-[56px] p-3 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 font-black text-xs transition active:scale-95 ${
              paymentMethod === 'bank_transfer'
                ? 'border-emerald-500 bg-emerald-50 text-emerald-950 ring-2 ring-emerald-200 shadow-sm'
                : 'border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Building className="w-5 h-5 text-emerald-600" />
            <span>Bank / Till</span>
          </button>
        </div>
      </div>

      {/* Payment Status (Paid vs Pay on Delivery) */}
      <div className="space-y-1.5">
        <label className="block text-xs font-black uppercase tracking-wider text-slate-600">
          Payment Status
        </label>
        <div className="grid grid-cols-2 gap-2.5">
          <button
            type="button"
            onClick={() => onChangePaymentStatus('paid')}
            className={`min-h-[48px] p-2.5 rounded-2xl border-2 flex items-center justify-center gap-2 font-black text-sm transition active:scale-95 ${
              paymentStatus === 'paid'
                ? 'border-emerald-500 bg-emerald-100 text-emerald-950 shadow-sm'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
            <span>PAID (Received)</span>
          </button>

          <button
            type="button"
            onClick={() => onChangePaymentStatus('pending')}
            className={`min-h-[48px] p-2.5 rounded-2xl border-2 flex items-center justify-center gap-2 font-black text-sm transition active:scale-95 ${
              paymentStatus === 'pending'
                ? 'border-amber-500 bg-amber-100 text-amber-950 shadow-sm'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Clock className="w-5 h-5 text-amber-600" />
            <span>Pay on Delivery</span>
          </button>
        </div>
      </div>

      {/* Optional / Collapsible M-Pesa Code Reference */}
      <div className="pt-2 border-t-2 border-slate-100">
        <div className="flex items-center justify-between">
          <span className="text-xs font-bold text-slate-600">M-Pesa Confirmation Code (Optional)</span>
          <button
            type="button"
            onClick={() => setShowRefInput(!showRefInput)}
            className="text-xs font-black text-orange-600 flex items-center gap-1"
          >
            <span>{showRefInput ? 'Hide' : 'Add M-Pesa Ref'}</span>
            {showRefInput ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
        </div>

        {showRefInput && (
          <div className="pt-2">
            <input
              type="text"
              value={paymentReference}
              onChange={(e) => onChangePaymentReference(e.target.value.toUpperCase())}
              placeholder="e.g. QGK81920X"
              className="w-full min-h-[48px] px-3.5 text-base font-mono uppercase bg-white border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
            />
          </div>
        )}
      </div>

      {/* Calculation Summary Card */}
      <div className="p-4 bg-slate-900 text-white rounded-2xl space-y-2">
        <div className="flex justify-between text-xs text-slate-300 font-bold">
          <span>Items Subtotal:</span>
          <span>{formatKES(subtotal)}</span>
        </div>
        <div className="flex justify-between text-xs text-slate-300 font-bold">
          <span>Doorstep Delivery:</span>
          <span className="text-emerald-400">FREE (KES 0)</span>
        </div>
        <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-lg font-black text-white">
          <span>Grand Total:</span>
          <span className="text-amber-400 text-xl">{formatKES(total)}</span>
        </div>
      </div>
    </div>
  );
}
