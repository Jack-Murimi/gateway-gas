'use client';

import { useState } from 'react';
import { AlertCircle, Plus, Trash2, X } from 'lucide-react';
import type { PaymentMethod, PaymentStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { formatKES } from '@/lib/formatters';
import { PAYMENT_METHODS, fieldClass, labelClass } from './pos-ui';

interface PayLine { id: string; method: PaymentMethod; amount: string; reference: string }
export interface PosPayment { method: PaymentMethod; status: PaymentStatus; reference?: string }

const refLabel: Record<PaymentMethod, string> = {
  cash: 'Reference', mpesa: 'M-Pesa code', bank_transfer: 'Bank ref', pdq: 'Card ref', cheque: 'Cheque no.',
};
const uid = () => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface Props {
  total: number;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (payment: PosPayment) => void;
}

export function PosPaymentModal({ total, isSubmitting, onClose, onConfirm }: Props) {
  const [lines, setLines] = useState<PayLine[]>([{ id: uid(), method: 'cash', amount: String(total), reference: '' }]);
  const [error, setError] = useState('');

  const patch = (id: string, change: Partial<PayLine>) => setLines(prev => prev.map(l => (l.id === id ? { ...l, ...change } : l)));
  const paid = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);

  const addLine = () => setLines(prev => [...prev, { id: uid(), method: 'mpesa', amount: String(remaining || ''), reference: '' }]);

  const confirm = () => {
    const rows = lines.map(l => ({ ...l, amountNum: Number(l.amount) || 0, reference: l.reference.trim() }));
    if (rows.some(l => l.amountNum <= 0)) { setError('Each payment amount must be greater than 0.'); return; }
    const primary = [...rows].sort((a, b) => b.amountNum - a.amountNum)[0];
    const breakdown = rows.map(l => `${l.method.toUpperCase()}:${l.amountNum}${l.reference ? `(${l.reference})` : ''}`).join(' | ');
    onConfirm({
      method: primary.method,
      status: paid >= total ? 'paid' : 'pending',
      reference: rows.length === 1 ? primary.reference || undefined : breakdown,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
      role="dialog" aria-modal="true" aria-labelledby="pos-payment-title"
      onKeyDown={e => e.key === 'Escape' && onClose()}
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 id="pos-payment-title" className="text-lg font-semibold text-slate-950">Record payment</h2>
            <p className="text-xs text-slate-500">Split across methods if needed.</p>
          </div>
          <button type="button" aria-label="Close" onClick={onClose} className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-slate-950 px-4 py-3 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Amount due</p>
            <p className="text-2xl font-semibold tabular-nums">{formatKES(total)}</p>
          </div>
          <div className="text-right text-xs">
            <p>Paid <strong className="tabular-nums">{formatKES(paid)}</strong></p>
            {change > 0
              ? <p className="text-sky-300">Change <strong className="tabular-nums">{formatKES(change)}</strong></p>
              : <p className={remaining > 0 ? 'text-amber-300' : 'text-emerald-300'}>Balance <strong className="tabular-nums">{formatKES(remaining)}</strong></p>}
          </div>
        </div>

        {error && <p role="alert" className="mb-2 flex items-center gap-2 text-xs font-medium text-red-700"><AlertCircle className="h-4 w-4" />{error}</p>}

        <div className="space-y-2">
          {lines.map(line => (
            <div key={line.id} className="rounded-xl border border-slate-200 p-2.5">
              <div role="group" aria-label="Payment method" className="mb-2 flex flex-wrap gap-1">
                {PAYMENT_METHODS.map(m => (
                  <button
                    key={m.value} type="button" aria-pressed={line.method === m.value}
                    onClick={() => patch(line.id, { method: m.value })}
                    className={`h-9 rounded-lg px-3 text-xs font-semibold transition ${line.method === m.value ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                <div>
                  <label className={labelClass}>Amount</label>
                  <input className={`${fieldClass} font-semibold tabular-nums`} type="number" min="0" step="1" inputMode="decimal" value={line.amount} onFocus={e => e.currentTarget.select()} onChange={e => patch(line.id, { amount: e.target.value })} />
                </div>
                <div>
                  <label className={labelClass}>{refLabel[line.method]}</label>
                  <input className={fieldClass} value={line.reference} onChange={e => patch(line.id, { reference: e.target.value.toUpperCase() })} placeholder={line.method === 'cash' ? 'Optional' : 'Required for tracking'} />
                </div>
                <button
                  type="button" aria-label="Remove payment line" disabled={lines.length === 1}
                  onClick={() => setLines(prev => prev.filter(l => l.id !== line.id))}
                  className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLine}><Plus className="h-4 w-4" />Add payment</Button>
          <span className="text-xs text-slate-500">{remaining > 0 ? 'Partial payment saves the sale as unpaid.' : 'Fully covered.'}</span>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Cancel</Button>
          <Button className="flex-1" onClick={confirm} isLoading={isSubmitting} disabled={isSubmitting || paid <= 0}>Save sale</Button>
        </div>
      </div>
    </div>
  );
}
