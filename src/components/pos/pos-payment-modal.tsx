'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle2, Plus, RefreshCw, ShieldCheck, Trash2, X } from 'lucide-react';
import type { MpesaTransaction, PaymentMethod, PaymentStatus } from '@/types';
import { Button } from '@/components/ui/button';
import { formatKES } from '@/lib/formatters';
import { rankMpesaCandidates } from '@/lib/mpesa';
import { createClient } from '@/lib/supabase/client';
import { PAYMENT_METHODS, fieldClass, labelClass } from './pos-ui';

interface PayLine {
  id: string;
  method: PaymentMethod;
  amount: string;
  reference: string;
  mpesaTransactionId?: string | null;
}

export interface PosPayment {
  method: PaymentMethod;
  status: PaymentStatus;
  reference?: string;
  mpesaTransactionId?: string | null;
}

const refLabel: Record<PaymentMethod, string> = {
  cash: 'Reference',
  mpesa: 'M-Pesa code',
  bank_transfer: 'Bank ref',
  pdq: 'Card ref',
  cheque: 'Cheque no.',
};
const uid = () => `pay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

interface Props {
  total: number;
  branchId?: string;
  branchShortcode?: string | null;
  isSubmitting: boolean;
  onClose: () => void;
  onConfirm: (payment: PosPayment) => void;
}

export function PosPaymentModal({
  total,
  branchId,
  branchShortcode,
  isSubmitting,
  onClose,
  onConfirm,
}: Props) {
  const [lines, setLines] = useState<PayLine[]>([
    { id: uid(), method: 'cash', amount: String(total), reference: '', mpesaTransactionId: null },
  ]);
  const [error, setError] = useState('');
  const [unmatchedMpesa, setUnmatchedMpesa] = useState<MpesaTransaction[]>([]);
  const [loadingMpesa, setLoadingMpesa] = useState(false);

  const hasMpesaLine = lines.some((l) => l.method === 'mpesa');

  const loadUnmatchedMpesa = useCallback(async () => {
    setLoadingMpesa(true);
    const supabase = createClient();
    const { data, error: fetchErr } = await supabase
      .from('mpesa_transactions')
      .select('id, trans_id, trans_time, trans_amount, business_short_code, bill_ref_number, msisdn, payer_name, branch_id, status, created_at')
      .eq('status', 'unmatched')
      .order('trans_time', { ascending: false })
      .limit(25);
    if (!fetchErr && data) {
      setUnmatchedMpesa(
        (data as any[]).map((r) => ({ ...r, trans_amount: Number(r.trans_amount || 0) })) as MpesaTransaction[],
      );
    }
    setLoadingMpesa(false);
  }, []);

  useEffect(() => {
    if (hasMpesaLine) {
      void loadUnmatchedMpesa();
    }
  }, [hasMpesaLine, loadUnmatchedMpesa]);

  const patch = (id: string, change: Partial<PayLine>) =>
    setLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...change } : l)));

  const paid = lines.reduce((sum, l) => sum + (Number(l.amount) || 0), 0);
  const remaining = Math.max(0, total - paid);
  const change = Math.max(0, paid - total);

  const addLine = () =>
    setLines((prev) => [
      ...prev,
      { id: uid(), method: 'mpesa', amount: String(remaining || ''), reference: '', mpesaTransactionId: null },
    ]);

  const claimedMpesaIds = useMemo(
    () => new Set(lines.map((l) => l.mpesaTransactionId).filter(Boolean) as string[]),
    [lines],
  );

  const confirm = () => {
    const rows = lines.map((l) => ({
      ...l,
      amountNum: Number(l.amount) || 0,
      reference: l.reference.trim(),
    }));
    if (rows.some((l) => l.amountNum <= 0)) {
      setError('Each payment amount must be greater than 0.');
      return;
    }
    const primary = [...rows].sort((a, b) => b.amountNum - a.amountNum)[0];
    const matchedTx = rows.find((l) => l.method === 'mpesa' && l.mpesaTransactionId)?.mpesaTransactionId ?? null;
    const breakdown = rows
      .map((l) => `${l.method.toUpperCase()}:${l.amountNum}${l.reference ? `(${l.reference})` : ''}`)
      .join(' | ');
    onConfirm({
      method: primary.method,
      status: paid >= total ? 'paid' : 'pending',
      reference: rows.length === 1 ? primary.reference || undefined : breakdown,
      mpesaTransactionId: matchedTx,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pos-payment-title"
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
    >
      <div className="max-h-[92dvh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:rounded-2xl sm:p-5">
        <div className="mb-3 flex items-start justify-between">
          <div>
            <h2 id="pos-payment-title" className="text-lg font-semibold text-slate-950">
              Record payment
            </h2>
            <p className="text-xs text-slate-500">Split across methods if needed.</p>
          </div>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-3 flex items-center justify-between gap-3 rounded-xl bg-slate-950 px-4 py-3 text-white">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-300">Amount due</p>
            <p className="text-2xl font-semibold tabular-nums">{formatKES(total)}</p>
          </div>
          <div className="text-right text-xs">
            <p>
              Paid <strong className="tabular-nums">{formatKES(paid)}</strong>
            </p>
            {change > 0 ? (
              <p className="text-sky-300">
                Change <strong className="tabular-nums">{formatKES(change)}</strong>
              </p>
            ) : (
              <p className={remaining > 0 ? 'text-amber-300' : 'text-emerald-300'}>
                Balance <strong className="tabular-nums">{formatKES(remaining)}</strong>
              </p>
            )}
          </div>
        </div>

        {error && (
          <p role="alert" className="mb-2 flex items-center gap-2 text-xs font-medium text-red-700">
            <AlertCircle className="h-4 w-4" />
            {error}
          </p>
        )}

        <div className="space-y-2">
          {lines.map((line) => {
            const lineAmount = Number(line.amount) || total;
            const candidates =
              line.method === 'mpesa'
                ? rankMpesaCandidates(unmatchedMpesa, lineAmount, branchId, branchShortcode).filter(
                    (tx) => !claimedMpesaIds.has(tx.id) || tx.id === line.mpesaTransactionId,
                  )
                : [];

            return (
              <div key={line.id} className="rounded-xl border border-slate-200 p-2.5">
                <div role="group" aria-label="Payment method" className="mb-2 flex flex-wrap gap-1">
                  {PAYMENT_METHODS.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      aria-pressed={line.method === m.value}
                      onClick={() =>
                        patch(line.id, {
                          method: m.value,
                          mpesaTransactionId: m.value === 'mpesa' ? line.mpesaTransactionId : null,
                        })
                      }
                      className={`h-9 rounded-lg px-3 text-xs font-semibold transition ${
                        line.method === m.value
                          ? 'bg-orange-600 text-white'
                          : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-[1fr_1fr_auto] items-end gap-2">
                  <div>
                    <label className={labelClass}>Amount</label>
                    <input
                      className={`${fieldClass} font-semibold tabular-nums`}
                      type="number"
                      min="0"
                      step="1"
                      inputMode="decimal"
                      value={line.amount}
                      onFocus={(e) => e.currentTarget.select()}
                      onChange={(e) => patch(line.id, { amount: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      <span className="flex items-center justify-between gap-1">
                        <span>{refLabel[line.method]}</span>
                        {line.mpesaTransactionId && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-emerald-700">
                            <ShieldCheck className="h-3 w-3" /> Verified
                          </span>
                        )}
                      </span>
                    </label>
                    <input
                      className={`${fieldClass} ${line.mpesaTransactionId ? 'border-emerald-400 bg-emerald-50/40 font-mono font-semibold' : ''}`}
                      value={line.reference}
                      onChange={(e) =>
                        patch(line.id, {
                          reference: e.target.value.toUpperCase(),
                          mpesaTransactionId: null,
                        })
                      }
                      placeholder={line.method === 'cash' ? 'Optional' : 'Required for tracking'}
                    />
                  </div>
                  <button
                    type="button"
                    aria-label="Remove payment line"
                    disabled={lines.length === 1}
                    onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                    className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Verified M-Pesa Till Receipts Picker */}
                {line.method === 'mpesa' && (
                  <div className="mt-2 rounded-lg border border-emerald-200 bg-emerald-50/40 p-2">
                    <div className="mb-1.5 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-900">
                        <ShieldCheck className="h-3.5 w-3.5 text-emerald-700" />
                        Incoming Till Payments ({candidates.length})
                      </span>
                      <button
                        type="button"
                        onClick={() => void loadUnmatchedMpesa()}
                        className="inline-flex items-center gap-1 rounded border border-emerald-300 bg-white px-2 py-0.5 text-[10px] font-semibold text-emerald-800 hover:bg-emerald-50"
                      >
                        <RefreshCw className={`h-3 w-3 ${loadingMpesa ? 'animate-spin' : ''}`} />
                        Refresh
                      </button>
                    </div>
                    {candidates.length === 0 ? (
                      <p className="text-[11px] text-slate-600">
                        No unmatched till callbacks yet. You can type the M-Pesa code manually above.
                      </p>
                    ) : (
                      <div className="max-h-36 space-y-1 overflow-y-auto">
                        {candidates.slice(0, 6).map((tx) => {
                          const selected = line.mpesaTransactionId === tx.id;
                          return (
                            <button
                              key={tx.id}
                              type="button"
                              onClick={() =>
                                patch(
                                  line.id,
                                  selected
                                    ? { mpesaTransactionId: null }
                                    : {
                                        mpesaTransactionId: tx.id,
                                        reference: tx.trans_id,
                                        amount: String(tx.trans_amount),
                                      },
                                )
                              }
                              className={`flex w-full items-center justify-between gap-2 rounded-md border px-2 py-1.5 text-left text-xs transition ${
                                selected
                                  ? 'border-emerald-600 bg-emerald-100/80 ring-1 ring-emerald-500'
                                  : tx.exactAmount
                                    ? 'border-emerald-300 bg-white hover:bg-emerald-50'
                                    : 'border-slate-200 bg-white hover:bg-slate-50'
                              }`}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-1.5">
                                  {selected && <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-emerald-700" />}
                                  <span className="font-mono font-bold text-slate-900">{tx.trans_id}</span>
                                  {tx.exactAmount && (
                                    <span className="rounded bg-emerald-100 px-1 py-0.5 text-[9px] font-bold uppercase text-emerald-800">
                                      Exact match
                                    </span>
                                  )}
                                </div>
                                <p className="truncate text-[10px] text-slate-500">
                                  {tx.payer_name || tx.msisdn || 'Customer'} · Till {tx.business_short_code} ·{' '}
                                  {new Date(tx.trans_time).toLocaleTimeString('en-KE', {
                                    hour: '2-digit',
                                    minute: '2-digit',
                                  })}
                                </p>
                              </div>
                              <span className="shrink-0 font-bold tabular-nums text-emerald-800">
                                {formatKES(tx.trans_amount)}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
          <Button type="button" variant="outline" size="sm" onClick={addLine}>
            <Plus className="h-4 w-4" />
            Add payment
          </Button>
          <span className="text-xs text-slate-500">
            {remaining > 0 ? 'Partial payment saves the sale as unpaid.' : 'Fully covered.'}
          </span>
        </div>

        <div className="mt-4 flex gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>
            Cancel
          </Button>
          <Button className="flex-1" onClick={confirm} isLoading={isSubmitting} disabled={isSubmitting || paid <= 0}>
            Save sale
          </Button>
        </div>
      </div>
    </div>
  );
}
