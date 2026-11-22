'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Copy,
  Link2,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Smartphone,
  X,
} from 'lucide-react';
import { Branch, MpesaTransaction, MpesaTransactionStatus, Order, StaffProfile } from '@/types';
import { createClient } from '@/lib/supabase/client';
import { formatKES, formatShortDate } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';

interface MpesaReconciliationPanelProps {
  branches: Branch[];
  currentUser: StaffProfile;
  onMutated?: () => Promise<void> | void;
}

type StatusFilter = 'unmatched' | 'matched' | 'ignored' | 'all';

export function MpesaReconciliationPanel({
  branches,
  currentUser,
  onMutated,
}: MpesaReconciliationPanelProps) {
  const { showSuccess, showError } = useToast();
  const isDirectorOrAdmin = currentUser.role === 'admin' || currentUser.role === 'director';

  const [statusFilter, setStatusFilter] = useState<StatusFilter>('unmatched');
  const [search, setSearch] = useState('');
  const [transactions, setTransactions] = useState<MpesaTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  // Match modal state
  const [matchingTx, setMatchingTx] = useState<MpesaTransaction | null>(null);
  const [unpaidOrders, setUnpaidOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [orderSearch, setOrderSearch] = useState('');
  const [submittingMatch, setSubmittingMatch] = useState(false);

  // Daraja setup panel state
  const [showSetup, setShowSetup] = useState(false);
  const [regShortCode, setRegShortCode] = useState('');
  const [registering, setRegistering] = useState(false);
  const [originUrl, setOriginUrl] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setOriginUrl(window.location.origin);
    }
  }, []);

  const fetchTransactions = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      let query = supabase
        .from('mpesa_transactions')
        .select(
          '*, branch:branches(id, name, code), matched_order:orders(id, order_number, receipt_number, customer_name, total_kes)',
        )
        .order('trans_time', { ascending: false })
        .limit(200);

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      setTransactions((data as MpesaTransaction[]) || []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load M-Pesa till transactions.');
    } finally {
      setLoading(false);
    }
  }, [statusFilter, showError]);

  useEffect(() => {
    void fetchTransactions();
  }, [fetchTransactions]);

  const filteredTransactions = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return transactions;
    return transactions.filter(
      (tx) =>
        tx.trans_id.toLowerCase().includes(q) ||
        (tx.payer_name || '').toLowerCase().includes(q) ||
        (tx.msisdn || '').toLowerCase().includes(q) ||
        (tx.business_short_code || '').toLowerCase().includes(q) ||
        (tx.bill_ref_number || '').toLowerCase().includes(q) ||
        (tx.matched_order?.order_number || '').toLowerCase().includes(q) ||
        (tx.matched_order?.customer_name || '').toLowerCase().includes(q),
    );
  }, [transactions, search]);

  const summaryStats = useMemo(() => {
    let totalKes = 0;
    let unmatchedCount = 0;
    let matchedCount = 0;
    for (const tx of filteredTransactions) {
      totalKes += Number(tx.trans_amount || 0);
      if (tx.status === 'unmatched') unmatchedCount += 1;
      if (tx.status === 'matched') matchedCount += 1;
    }
    return { count: filteredTransactions.length, totalKes, unmatchedCount, matchedCount };
  }, [filteredTransactions]);

  const openMatchModal = async (tx: MpesaTransaction) => {
    setMatchingTx(tx);
    setOrderSearch('');
    setLoadingOrders(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from('orders')
        .select('*, branch:branches(id, name, code)')
        .eq('payment_status', 'pending')
        .neq('delivery_status', 'cancelled')
        .order('created_at', { ascending: false })
        .limit(150);
      if (error) throw error;
      setUnpaidOrders((data as Order[]) || []);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load unpaid invoices.');
    } finally {
      setLoadingOrders(false);
    }
  };

  const rankedUnpaidOrders = useMemo(() => {
    if (!matchingTx) return [];
    const q = orderSearch.trim().toLowerCase();
    const list = q
      ? unpaidOrders.filter(
          (o) =>
            o.order_number.toLowerCase().includes(q) ||
            (o.receipt_number || '').toLowerCase().includes(q) ||
            o.customer_name.toLowerCase().includes(q) ||
            (o.customer_phone || '').toLowerCase().includes(q),
        )
      : unpaidOrders;

    return [...list].sort((a, b) => {
      const aExact = Math.abs(Number(a.total_kes) - Number(matchingTx.trans_amount)) < 0.01;
      const bExact = Math.abs(Number(b.total_kes) - Number(matchingTx.trans_amount)) < 0.01;
      if (aExact !== bExact) return aExact ? -1 : 1;
      const aBranch = Boolean(matchingTx.branch_id && a.branch_id === matchingTx.branch_id);
      const bBranch = Boolean(matchingTx.branch_id && b.branch_id === matchingTx.branch_id);
      if (aBranch !== bBranch) return aBranch ? -1 : 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [matchingTx, unpaidOrders, orderSearch]);

  const handleMatchToOrder = async (order: Order) => {
    if (!matchingTx) return;
    setSubmittingMatch(true);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('settle_customer_order', {
        p_order_id: order.id,
        p_payment_method: 'mpesa',
        p_payment_reference: matchingTx.trans_id,
        p_mpesa_transaction_id: matchingTx.id,
      });
      if (error) throw error;
      showSuccess(`Matched ${matchingTx.trans_id} to ${order.order_number} (${order.customer_name}).`);
      setMatchingTx(null);
      await fetchTransactions();
      if (onMutated) await onMutated();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to match M-Pesa transaction.');
    } finally {
      setSubmittingMatch(false);
    }
  };

  const handleToggleIgnore = async (tx: MpesaTransaction, nextStatus: MpesaTransactionStatus) => {
    setBusyId(tx.id);
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc('update_mpesa_transaction_status', {
        p_transaction_id: tx.id,
        p_status: nextStatus,
        p_notes: nextStatus === 'ignored' ? `Marked ignored by ${currentUser.full_name}` : null,
      });
      if (error) throw error;
      showSuccess(nextStatus === 'ignored' ? `Marked ${tx.trans_id} as ignored.` : `Restored ${tx.trans_id} to unmatched.`);
      await fetchTransactions();
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to update transaction status.');
    } finally {
      setBusyId(null);
    }
  };

  const handleCopy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      showSuccess(`${label} copied.`);
    } catch {
      showError('Unable to copy to clipboard.');
    }
  };

  const handleRegisterUrls = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regShortCode.trim()) {
      showError('Enter a Safaricom ShortCode / Till number first.');
      return;
    }
    setRegistering(true);
    try {
      const res = await fetch('/api/mpesa/register-urls', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shortCode: regShortCode.trim(), baseUrl: originUrl || undefined }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; shortCode?: string };
      if (!res.ok || !json.ok) {
        throw new Error(json.error || 'Daraja C2B registration failed.');
      }
      showSuccess(`Daraja C2B URLs registered for shortcode ${json.shortCode || regShortCode.trim()}.`);
      setRegShortCode('');
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Registration failed.');
    } finally {
      setRegistering(false);
    }
  };

  const branchShortcodes = useMemo(
    () => branches.filter((b) => b.is_active !== false),
    [branches],
  );

  return (
    <div className="space-y-4 text-left">
      {/* Filter & Search Bar */}
      <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                ['unmatched', 'Unmatched'],
                ['matched', 'Matched'],
                ['ignored', 'Ignored'],
                ['all', 'All'],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setStatusFilter(key)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                  statusFilter === key
                    ? 'bg-emerald-700 text-white shadow-sm'
                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void fetchTransactions()}
            disabled={loading}
            className="font-bold"
          >
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search M-Pesa code, payer, phone, till or order #..."
              className="w-full min-h-[42px] pl-9 pr-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold focus:border-emerald-500 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-3 text-xs font-bold text-slate-600">
            <span>{summaryStats.count} receipts</span>
            <span>•</span>
            <span className="text-emerald-700 font-black">{formatKES(summaryStats.totalKes)}</span>
          </div>
        </div>
      </div>

      {/* Transactions List */}
      <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-4 space-y-2.5">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-16 rounded-xl" />
            ))}
          </div>
        ) : filteredTransactions.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Smartphone className="w-8 h-8 text-slate-300 mx-auto" />
            <div className="text-sm font-black text-slate-700">
              No {statusFilter === 'all' ? '' : `${statusFilter} `}M-Pesa till receipts found
            </div>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Once Safaricom Daraja C2B webhooks are active on your till numbers, incoming customer payments appear here automatically for one-tap POS verification and invoice reconciliation.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredTransactions.map((tx) => (
              <div
                key={tx.id}
                className="p-3.5 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-sm font-black text-slate-900">{tx.trans_id}</span>
                    <span className="text-sm font-black text-emerald-700">{formatKES(tx.trans_amount)}</span>
                    <Badge
                      variant={
                        tx.status === 'matched'
                          ? 'success'
                          : tx.status === 'ignored'
                          ? 'neutral'
                          : 'warning'
                      }
                    >
                      {tx.status === 'matched'
                        ? 'Matched'
                        : tx.status === 'ignored'
                        ? 'Ignored'
                        : 'Unmatched'}
                    </Badge>
                    <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">
                      Till {tx.business_short_code}
                    </span>
                    {tx.branch ? (
                      <span className="text-[11px] font-bold text-slate-600">{tx.branch.name}</span>
                    ) : (
                      <span className="text-[11px] font-semibold text-slate-400">Shared / Unassigned Till</span>
                    )}
                  </div>

                  <div className="text-xs text-slate-600 flex flex-wrap items-center gap-x-3 gap-y-0.5">
                    <span className="font-bold text-slate-800">{tx.payer_name || 'M-Pesa Customer'}</span>
                    {tx.msisdn && <span className="font-mono text-[11px]">{tx.msisdn}</span>}
                    <span>{formatShortDate(tx.trans_time)}</span>
                    {tx.bill_ref_number && (
                      <span className="text-[11px] font-semibold text-slate-500">Ref: {tx.bill_ref_number}</span>
                    )}
                  </div>

                  {tx.matched_order && (
                    <div className="text-[11px] font-bold text-emerald-700 flex items-center gap-1.5">
                      <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        Linked to {tx.matched_order.order_number}
                        {tx.matched_order.receipt_number ? ` (Receipt #${tx.matched_order.receipt_number})` : ''} •{' '}
                        {tx.matched_order.customer_name} ({formatKES(tx.matched_order.total_kes)})
                      </span>
                    </div>
                  )}

                  {tx.notes && (
                    <div className="text-[11px] text-slate-500 italic">{tx.notes}</div>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {tx.status === 'unmatched' && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void openMatchModal(tx)}
                      disabled={busyId === tx.id}
                      className="font-bold"
                    >
                      <Link2 className="w-3.5 h-3.5 mr-1.5" />
                      Match to Unpaid Invoice
                    </Button>
                  )}

                  {isDirectorOrAdmin && tx.status === 'unmatched' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleToggleIgnore(tx, 'ignored')}
                      disabled={busyId === tx.id}
                      className="font-bold text-slate-600"
                    >
                      <Ban className="w-3.5 h-3.5 mr-1" />
                      Ignore
                    </Button>
                  )}

                  {isDirectorOrAdmin && tx.status === 'ignored' && (
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      onClick={() => void handleToggleIgnore(tx, 'unmatched')}
                      disabled={busyId === tx.id}
                      className="font-bold"
                    >
                      <RotateCcw className="w-3.5 h-3.5 mr-1" />
                      Restore
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Daraja C2B Webhook Setup Helper (Director / Admin only) */}
      {isDirectorOrAdmin && (
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden">
          <button
            type="button"
            onClick={() => setShowSetup((v) => !v)}
            className="w-full p-4 flex items-center justify-between text-left hover:bg-slate-50"
          >
            <div className="flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-emerald-700" />
              <div>
                <div className="text-sm font-black text-slate-900">Daraja C2B Till Webhook Setup</div>
                <div className="text-[11px] font-semibold text-slate-500">
                  Webhook URLs & one-click Safaricom C2B URL registration (supports shared tills across branches).
                </div>
              </div>
            </div>
            {showSetup ? (
              <ChevronUp className="w-4 h-4 text-slate-500" />
            ) : (
              <ChevronDown className="w-4 h-4 text-slate-500" />
            )}
          </button>

          {showSetup && (
            <div className="p-4 pt-0 border-t border-slate-100 space-y-4 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-black text-slate-700">Confirmation URL</div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[11px] text-slate-800 break-all">
                      {originUrl ? `${originUrl}/api/mpesa/c2b/confirmation` : '/api/mpesa/c2b/confirmation'}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopy(
                          `${originUrl || ''}/api/mpesa/c2b/confirmation`,
                          'Confirmation URL',
                        )
                      }
                      className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 shrink-0"
                      title="Copy Confirmation URL"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 space-y-1">
                  <div className="font-black text-slate-700">Validation URL</div>
                  <div className="flex items-center justify-between gap-2">
                    <code className="text-[11px] text-slate-800 break-all">
                      {originUrl ? `${originUrl}/api/mpesa/c2b/validation` : '/api/mpesa/c2b/validation'}
                    </code>
                    <button
                      type="button"
                      onClick={() =>
                        void handleCopy(
                          `${originUrl || ''}/api/mpesa/c2b/validation`,
                          'Validation URL',
                        )
                      }
                      className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-100 shrink-0"
                      title="Copy Validation URL"
                    >
                      <Copy className="w-3.5 h-3.5 text-slate-600" />
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-950 space-y-1">
                <div className="font-black">Shared Till Support</div>
                <p className="text-[11px] font-medium text-emerald-900">
                  Branches that share one till (e.g. Kileleshwa &amp; Jamhuri) can use the same{' '}
                  <code>mpesa_shortcode</code>. Incoming payments on a shared till remain visible to all matching branches until claimed by a receipt.
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {branchShortcodes.map((b) => (
                    <span
                      key={b.id}
                      className="px-2 py-0.5 rounded-md bg-white border border-emerald-200 text-[11px] font-bold text-slate-700"
                    >
                      {b.name}: <span className="font-mono text-emerald-700">{b.mpesa_shortcode || 'Not linked'}</span>
                    </span>
                  ))}
                </div>
              </div>

              <form onSubmit={handleRegisterUrls} className="flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[200px]">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Register C2B URLs for Till / Paybill ShortCode
                  </label>
                  <input
                    type="text"
                    value={regShortCode}
                    onChange={(e) => setRegShortCode(e.target.value)}
                    placeholder="e.g. 600984 or Till ShortCode"
                    className="w-full min-h-[40px] px-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-mono font-bold focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <Button type="submit" size="sm" disabled={registering} className="min-h-[40px] font-bold">
                  {registering ? 'Registering…' : 'Register with Daraja'}
                </Button>
              </form>
            </div>
          )}
        </div>
      )}

      {/* Match to Unpaid Invoice Modal */}
      {matchingTx && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-2">
              <div>
                <div className="text-sm font-black text-slate-900">
                  Match {matchingTx.trans_id} ({formatKES(matchingTx.trans_amount)})
                </div>
                <div className="text-[11px] text-slate-500 font-semibold">
                  {matchingTx.payer_name || 'M-Pesa Customer'} • Till {matchingTx.business_short_code}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMatchingTx(null)}
                className="p-1.5 rounded-xl hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={orderSearch}
                  onChange={(e) => setOrderSearch(e.target.value)}
                  placeholder="Filter unpaid invoices by customer, phone or ticket #..."
                  className="w-full min-h-[40px] pl-9 pr-3 bg-slate-50 border-2 border-slate-200 rounded-xl text-xs font-semibold focus:border-emerald-500 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {loadingOrders ? (
                <div className="p-4 space-y-2">
                  <Skeleton className="h-14 rounded-xl" />
                  <Skeleton className="h-14 rounded-xl" />
                </div>
              ) : rankedUnpaidOrders.length === 0 ? (
                <div className="p-8 text-center text-xs font-bold text-slate-400">
                  No open unpaid invoices match your filter.
                </div>
              ) : (
                rankedUnpaidOrders.map((order) => {
                  const exact = Math.abs(Number(order.total_kes) - Number(matchingTx.trans_amount)) < 0.01;
                  return (
                    <div
                      key={order.id}
                      className={`p-3.5 flex items-center justify-between gap-3 ${
                        exact ? 'bg-emerald-50/70' : 'hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="font-mono text-xs font-black text-slate-900">{order.order_number}</span>
                          {exact && <Badge variant="success">Exact Amount</Badge>}
                          {order.branch?.name && (
                            <span className="text-[11px] font-semibold text-slate-500">{order.branch.name}</span>
                          )}
                        </div>
                        <div className="text-xs font-bold text-slate-800 truncate">{order.customer_name}</div>
                        <div className="text-[11px] text-slate-500">
                          {order.customer_phone} • {formatShortDate(order.created_at)}
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          <div className="text-xs font-black text-slate-900">{formatKES(order.total_kes)}</div>
                          {!exact && (
                            <div className="text-[10px] font-bold text-amber-700">
                              Diff {formatKES(matchingTx.trans_amount - order.total_kes)}
                            </div>
                          )}
                        </div>
                        <Button
                          type="button"
                          size="sm"
                          disabled={submittingMatch}
                          onClick={() => void handleMatchToOrder(order)}
                          className="font-bold"
                        >
                          Match & Settle
                        </Button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
