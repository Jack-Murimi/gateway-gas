'use client';

import React, { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { ShiftDaySummary, ShiftZReport } from '@/types';
import { createClient } from '@/lib/supabase/client';
import {
  AlertTriangle,
  Building2,
  Calendar,
  CheckCircle2,
  Clock,
  DollarSign,
  FileText,
  Layers,
  Printer,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  TrendingUp,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/toast';
import { formatKES } from '@/lib/formatters';
import { PnlDashboard } from '@/components/reports/pnl-dashboard';
import { MpesaReconciliationPanel } from '@/components/reports/mpesa-reconciliation-panel';

type ReportsTab = 'shift' | 'pnl' | 'mpesa';

function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

const EMPTY_SUMMARY: ShiftDaySummary = {
  total_sales_count: 0,
  total_revenue_kes: 0,
  unpaid_sales_count: 0,
  unpaid_total_kes: 0,
  mpesa_total_kes: 0,
  cash_total_kes: 0,
  bank_total_kes: 0,
  cylinders_sold_count: 0,
  accessories_sold_count: 0,
  cylinder_breakdown: [],
};

function ReportsPageInner() {
  const { currentUser, branches, shiftReports, createShiftReport, refreshLiveData } = useStore();
  const { showSuccess, showError } = useToast();
  const searchParams = useSearchParams();
  const router = useRouter();

  const canViewPnl = currentUser?.role === 'admin' || currentUser?.role === 'director';
  const canViewMpesa =
    currentUser?.role === 'admin' || currentUser?.role === 'director' || currentUser?.role === 'operator';

  const requestedTab = searchParams.get('tab');
  const initialTab: ReportsTab =
    requestedTab === 'pnl' && canViewPnl
      ? 'pnl'
      : requestedTab === 'mpesa' && canViewMpesa
      ? 'mpesa'
      : 'shift';
  const [activeTab, setActiveTab] = useState<ReportsTab>(initialTab);

  useEffect(() => {
    if (requestedTab === 'pnl' && canViewPnl) setActiveTab('pnl');
    else if (requestedTab === 'mpesa' && canViewMpesa) setActiveTab('mpesa');
    else if (requestedTab === 'shift') setActiveTab('shift');
  }, [requestedTab, canViewPnl, canViewMpesa]);

  const handleTabChange = (next: ReportsTab) => {
    setActiveTab(next);
    router.replace(next === 'shift' ? '/reports' : `/reports?tab=${next}`, { scroll: false });
  };

  const activeBranches = useMemo(() => branches.filter((b) => b.is_active !== false), [branches]);
  const defaultBranchId = useMemo(
    () => activeBranches.find((b) => b.id === currentUser?.branch_id)?.id || activeBranches[0]?.id || '',
    [activeBranches, currentUser?.branch_id],
  );
  const [selectedBranchId, setSelectedBranchId] = useState<string>(defaultBranchId);
  const effectiveBranchId = useMemo(
    () => (activeBranches.some((b) => b.id === selectedBranchId) ? selectedBranchId : defaultBranchId),
    [activeBranches, selectedBranchId, defaultBranchId],
  );
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [declaredCash, setDeclaredCash] = useState<string>('');
  const [operatorNotes, setOperatorNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [printReport, setPrintReport] = useState<ShiftZReport | null>(null);

  const [liveSummary, setLiveSummary] = useState<ShiftDaySummary>(EMPTY_SUMMARY);
  const [dbExistingReport, setDbExistingReport] = useState<ShiftZReport | null>(null);
  const [loadingShift, setLoadingShift] = useState<boolean>(false);

  useEffect(() => {
    if (effectiveBranchId && selectedBranchId !== effectiveBranchId) {
      setSelectedBranchId(effectiveBranchId);
    }
  }, [effectiveBranchId, selectedBranchId]);

  // Fast match from StoreContext cache, backed up by direct DB lookup for older dates
  const cachedExistingReport = useMemo(
    () => shiftReports.find((r) => r.branch_id === effectiveBranchId && r.shift_date === selectedDate) || null,
    [shiftReports, effectiveBranchId, selectedDate],
  );
  const existingReport = cachedExistingReport || dbExistingReport;

  const loadShiftDayData = useCallback(async () => {
    if (!effectiveBranchId || !selectedDate) return;
    setLoadingShift(true);
    try {
      const supabase = createClient();
      const [summaryRes, existingRes] = await Promise.all([
        supabase.rpc('get_shift_day_summary', {
          p_branch_id: effectiveBranchId,
          p_shift_date: selectedDate,
        }),
        supabase
          .from('shift_reports')
          .select('*')
          .eq('branch_id', effectiveBranchId)
          .eq('shift_date', selectedDate)
          .maybeSingle(),
      ]);

      if (summaryRes.error) throw summaryRes.error;
      const raw = (summaryRes.data as ShiftDaySummary | null) || EMPTY_SUMMARY;
      setLiveSummary({
        ...EMPTY_SUMMARY,
        ...raw,
        cylinder_breakdown: Array.isArray(raw.cylinder_breakdown) ? raw.cylinder_breakdown : [],
      });

      if (!existingRes.error && existingRes.data) {
        const rep = existingRes.data as ShiftZReport;
        setDbExistingReport({
          ...rep,
          cylinder_breakdown: Array.isArray(rep.cylinder_breakdown) ? rep.cylinder_breakdown : [],
        });
      } else {
        setDbExistingReport(null);
      }
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to load shift summary.');
    } finally {
      setLoadingShift(false);
    }
  }, [effectiveBranchId, selectedDate, showError]);

  useEffect(() => {
    if (activeTab === 'shift' && effectiveBranchId) {
      void loadShiftDayData();
    }
  }, [activeTab, effectiveBranchId, loadShiftDayData]);

  // Live cash variance
  const declaredCashNum = declaredCash.trim() === '' ? 0 : Number(declaredCash);
  const expectedCash = existingReport ? existingReport.expected_cash_kes : liveSummary.cash_total_kes;
  const cashVariance = declaredCashNum - expectedCash;

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;
    if (!effectiveBranchId) {
      showError('Select a station branch first.');
      return;
    }

    if (declaredCash.trim() === '' || Number.isNaN(declaredCashNum) || declaredCashNum < 0) {
      showError('Please enter a valid declared physical cash amount counted in the drawer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const report = await createShiftReport({
        branch_id: effectiveBranchId,
        shift_date: selectedDate,
        declared_cash_kes: declaredCashNum,
        notes: operatorNotes.trim() || undefined,
      });

      setDbExistingReport(report);
      setDeclaredCash('');
      setOperatorNotes('');
      showSuccess(`Shift closed! Z-Report #${report.report_number} sealed and saved.`);
      setPrintReport(report);
    } catch (err) {
      showError(err instanceof Error ? err.message : 'Failed to record shift close.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handlePrintSlip = (rep: ShiftZReport) => {
    setPrintReport(rep);
    setTimeout(() => {
      window.print();
    }, 150);
  };

  if (
    !currentUser ||
    currentUser.approval_status !== 'approved' ||
    !['admin', 'director', 'operator', 'sales_rep'].includes(currentUser.role)
  ) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <h1 className="text-xl font-bold text-slate-900">Access restricted</h1>
        <p className="mt-1 text-sm text-slate-500">Reports require an approved station staff account.</p>
      </div>
    );
  }

  const displayRevenue = existingReport ? existingReport.total_revenue_kes : liveSummary.total_revenue_kes;
  const displaySalesCount = existingReport ? existingReport.total_sales_count : liveSummary.total_sales_count;
  const displayMpesa = existingReport ? existingReport.mpesa_total_kes : liveSummary.mpesa_total_kes;
  const displayBank = existingReport ? existingReport.bank_total_kes : liveSummary.bank_total_kes;
  const displayCash = existingReport ? existingReport.expected_cash_kes : liveSummary.cash_total_kes;
  const displayCylinders = existingReport ? existingReport.cylinders_sold_count : liveSummary.cylinders_sold_count;
  const displayAccessories = existingReport
    ? existingReport.accessories_sold_count
    : liveSummary.accessories_sold_count;
  const displayUnpaidCount = existingReport
    ? existingReport.unpaid_sales_count ?? 0
    : liveSummary.unpaid_sales_count;
  const displayUnpaidTotal = existingReport
    ? existingReport.unpaid_total_kes ?? 0
    : liveSummary.unpaid_total_kes;
  const displayBreakdown = existingReport ? existingReport.cylinder_breakdown : liveSummary.cylinder_breakdown;

  return (
    <>
      {/* Printable Thermal 58mm/80mm ESC/POS Receipt View (Visible only during print) */}
      {printReport && (
        <div className="hidden print:block fixed inset-0 bg-white text-black p-4 font-mono text-xs z-[9999]">
          <div className="max-w-[320px] mx-auto space-y-2 border-b border-dashed pb-4">
            <div className="text-center">
              <div className="font-bold text-sm">GATEWAY GAS NAIROBI</div>
              <div className="text-[10px]">END-OF-DAY Z-REPORT</div>
              <div className="text-[10px]">================================</div>
            </div>
            <div>
              <div>Branch: {printReport.branch_name}</div>
              <div>Report #: {printReport.report_number}</div>
              <div>Date: {printReport.shift_date}</div>
              <div>Closed: {new Date(printReport.closed_at).toLocaleTimeString('en-KE')}</div>
              <div>Operator: {printReport.operator_name}</div>
            </div>
            <div className="border-t border-dashed pt-2 space-y-1">
              <div className="flex justify-between font-bold">
                <span>COLLECTED REVENUE:</span>
                <span>{formatKES(printReport.total_revenue_kes)}</span>
              </div>
              <div className="flex justify-between">
                <span>- M-Pesa:</span>
                <span>{formatKES(printReport.mpesa_total_kes)}</span>
              </div>
              <div className="flex justify-between">
                <span>- System Cash:</span>
                <span>{formatKES(printReport.expected_cash_kes)}</span>
              </div>
              <div className="flex justify-between">
                <span>- Bank/PDQ:</span>
                <span>{formatKES(printReport.bank_total_kes)}</span>
              </div>
              {(printReport.unpaid_total_kes ?? 0) > 0 && (
                <div className="flex justify-between">
                  <span>Unpaid ({printReport.unpaid_sales_count ?? 0}):</span>
                  <span>{formatKES(printReport.unpaid_total_kes ?? 0)}</span>
                </div>
              )}
            </div>
            <div className="border-t border-dashed pt-2 space-y-1">
              <div className="flex justify-between">
                <span>Declared Cash:</span>
                <span>{formatKES(printReport.declared_cash_kes)}</span>
              </div>
              <div className="flex justify-between font-bold">
                <span>Cash Variance:</span>
                <span>
                  {printReport.cash_variance_kes === 0
                    ? 'KES 0 (BALANCED)'
                    : formatKES(printReport.cash_variance_kes)}
                </span>
              </div>
            </div>
            <div className="border-t border-dashed pt-2 space-y-1">
              <div className="font-bold">CYLINDER SUMMARY:</div>
              <div>Filled Sold: {printReport.cylinders_sold_count} units</div>
              <div>Accessories: {printReport.accessories_sold_count} units</div>
              {printReport.cylinder_breakdown.map((c, i) => (
                <div key={i} className="flex justify-between text-[11px]">
                  <span>
                    {c.brand} {c.size_kg ? `${c.size_kg}kg` : ''}:
                  </span>
                  <span>
                    {c.full_sold} Out / {c.empty_in} In
                  </span>
                </div>
              ))}
            </div>
            {printReport.notes && (
              <div className="border-t border-dashed pt-1 text-[10px]">Notes: {printReport.notes}</div>
            )}
            <div className="text-center pt-3 text-[10px]">*** END OF Z-REPORT SLIP ***</div>
          </div>
        </div>
      )}

      {/* Main Screen Content */}
      <div
        className={`${
          activeTab === 'pnl' ? 'max-w-6xl' : 'max-w-5xl'
        } mx-auto px-4 sm:px-6 py-6 pb-28 space-y-5 print:hidden`}
      >
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md">
              {activeTab === 'pnl' ? (
                <TrendingUp className="w-6 h-6" />
              ) : activeTab === 'mpesa' ? (
                <Smartphone className="w-6 h-6" />
              ) : (
                <FileText className="w-6 h-6" />
              )}
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                {activeTab === 'pnl'
                  ? 'Profit & Loss Cockpit'
                  : activeTab === 'mpesa'
                  ? 'M-Pesa Till Reconciliation'
                  : 'Shift Close & Z-Report'}
              </h1>
              <p className="text-xs font-bold text-slate-500">
                {activeTab === 'pnl'
                  ? 'Executive gross margin, operating expenses, cashflow, and branch profitability.'
                  : activeTab === 'mpesa'
                  ? 'Verify incoming Daraja C2B till receipts and match payments to unpaid invoices.'
                  : 'Daily cash drawer balancing, M-Pesa tally, and cylinder exchange audit.'}
              </p>
            </div>
          </div>

          {activeTab === 'shift' && existingReport && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handlePrintSlip(existingReport)}
              className="font-bold"
            >
              <Printer className="w-4 h-4 mr-1.5" /> Print Z-Slip
            </Button>
          )}
        </div>

        {/* Section Tabs */}
        {(canViewPnl || canViewMpesa) && (
          <div className="flex flex-wrap items-center gap-2 bg-slate-100 p-1.5 rounded-2xl border border-slate-200">
            <button
              type="button"
              onClick={() => handleTabChange('shift')}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                activeTab === 'shift'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileText className="w-3.5 h-3.5 text-orange-600" />
              Shift Z-Report
            </button>

            {canViewPnl && (
              <button
                type="button"
                onClick={() => handleTabChange('pnl')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  activeTab === 'pnl'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                Profit &amp; Loss
              </button>
            )}

            {canViewMpesa && (
              <button
                type="button"
                onClick={() => handleTabChange('mpesa')}
                className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition-all ${
                  activeTab === 'mpesa'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5 text-emerald-600" />
                M-Pesa Till
              </button>
            )}
          </div>
        )}

        {/* Tab Body */}
        {activeTab === 'pnl' && canViewPnl ? (
          <PnlDashboard branches={branches} />
        ) : activeTab === 'mpesa' && canViewMpesa ? (
          <MpesaReconciliationPanel
            branches={branches}
            currentUser={currentUser}
            onMutated={refreshLiveData}
          />
        ) : (
          <div className="space-y-5">
            {/* Filter Bar: Branch + Date + Refresh */}
            <div className="p-3.5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-3 items-end">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Building2 className="w-3.5 h-3.5 text-orange-600" /> Station Branch
                </label>
                <select
                  value={effectiveBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  disabled={activeBranches.length === 0}
                  className="w-full min-h-[44px] px-3 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-bold focus:border-orange-500 focus:outline-none disabled:opacity-60"
                >
                  {activeBranches.length === 0 ? (
                    <option value="">Loading branches…</option>
                  ) : (
                    activeBranches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))
                  )}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-orange-600" /> Shift Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  className="w-full min-h-[44px] px-3 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-bold focus:border-orange-500 focus:outline-none"
                />
              </div>

              <Button
                type="button"
                variant="outline"
                onClick={() => void loadShiftDayData()}
                disabled={loadingShift}
                className="min-h-[44px] font-bold"
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${loadingShift ? 'animate-spin' : ''}`} />
                Refresh
              </Button>
            </div>

            {/* Existing Closed Shift Banner */}
            {existingReport ? (
              <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                  <div>
                    <div className="text-sm font-black text-emerald-950">
                      Shift Closed • Report #{existingReport.report_number}
                    </div>
                    <div className="text-xs text-emerald-800 font-medium mt-0.5">
                      Sealed on {new Date(existingReport.closed_at).toLocaleString('en-KE')} by{' '}
                      <span className="font-bold">{existingReport.operator_name}</span>.
                    </div>
                    <div className="text-xs font-bold text-emerald-900 mt-2 flex flex-wrap items-center gap-3">
                      <span>Declared: {formatKES(existingReport.declared_cash_kes)}</span>
                      <span>•</span>
                      <span>
                        Variance:{' '}
                        {existingReport.cash_variance_kes === 0 ? (
                          <span className="text-emerald-700">Balanced</span>
                        ) : (
                          <span className={existingReport.cash_variance_kes > 0 ? 'text-blue-700' : 'text-rose-700'}>
                            {formatKES(existingReport.cash_variance_kes)}
                          </span>
                        )}
                      </span>
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => handlePrintSlip(existingReport)}
                  className="shrink-0 font-bold bg-white"
                >
                  <Printer className="w-4 h-4 mr-1" /> Reprint
                </Button>
              </div>
            ) : (
              <div className="p-3.5 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-center gap-2.5 text-xs font-bold text-amber-950">
                <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Shift is currently OPEN. Totals are calculated directly from all database orders for this date.
                </span>
              </div>
            )}

            {/* Unpaid Sales Notice */}
            {displayUnpaidCount > 0 && (
              <div className="p-3.5 bg-orange-50 border-2 border-orange-200 rounded-2xl flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-bold text-orange-950">
                  <AlertTriangle className="w-4 h-4 text-orange-600 shrink-0" />
                  <span>
                    {displayUnpaidCount} unpaid credit/delivery {displayUnpaidCount === 1 ? 'order' : 'orders'} on{' '}
                    {selectedDate} totaling <strong>{formatKES(displayUnpaidTotal)}</strong> (excluded from collected
                    cash/M-Pesa below).
                  </span>
                </div>
                <Link
                  href="/sales?tab=unpaid"
                  className="px-3 py-1 rounded-lg bg-orange-600 text-white font-bold hover:bg-orange-700 shrink-0"
                >
                  View Unpaid Desk
                </Link>
              </div>
            )}

            {/* Live Metrics Grid */}
            {loadingShift && !existingReport ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-2xl" />
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
                  <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">
                    Collected Sales
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">{formatKES(displayRevenue)}</div>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {displaySalesCount} tickets
                    {displayBank > 0 ? ` • Bank ${formatKES(displayBank)}` : ''}
                  </div>
                </div>

                <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
                  <div className="text-[11px] font-black uppercase tracking-wider text-emerald-600">M-Pesa Tally</div>
                  <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">{formatKES(displayMpesa)}</div>
                  <div className="text-xs text-emerald-600 mt-0.5 font-bold">Direct to Till</div>
                </div>

                <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
                  <div className="text-[11px] font-black uppercase tracking-wider text-blue-600">System Cash</div>
                  <div className="text-xl sm:text-2xl font-black text-blue-700 mt-1">{formatKES(displayCash)}</div>
                  <div className="text-xs text-blue-600 mt-0.5 font-bold">Expected in Drawer</div>
                </div>

                <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
                  <div className="text-[11px] font-black uppercase tracking-wider text-purple-600">
                    Cylinders Dispensed
                  </div>
                  <div className="text-xl sm:text-2xl font-black text-purple-700 mt-1">{displayCylinders}</div>
                  <div className="text-xs text-purple-600 mt-0.5 font-bold">+{displayAccessories} accessories</div>
                </div>
              </div>
            )}

            {/* Cylinder Tare & Brand Exchange Summary */}
            <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden text-left">
              <div className="p-4 border-b border-slate-100 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Layers className="w-4 h-4 text-orange-600" />
                  <h2 className="text-sm font-black text-slate-900">Cylinder Exchange &amp; Tare Audit</h2>
                </div>
                <span className="text-xs font-bold text-slate-500">Filled Out vs Empty In</span>
              </div>

              <div className="divide-y divide-slate-100 text-xs">
                {displayBreakdown.length === 0 ? (
                  <div className="p-6 text-center text-slate-400 font-bold">
                    No cylinders dispensed on this date yet.
                  </div>
                ) : (
                  displayBreakdown.map((item, idx) => (
                    <div key={idx} className="p-3.5 flex items-center justify-between hover:bg-slate-50">
                      <div>
                        <span className="font-bold text-slate-900">{item.brand}</span>
                        <span className="text-slate-500 ml-1.5">{item.size_kg ? `${item.size_kg}kg` : ''}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-bold text-slate-700">
                          Sold: <strong className="text-orange-600">{item.full_sold}</strong>
                        </span>
                        <span className="font-bold text-slate-700">
                          Empty In: <strong className="text-emerald-600">{item.empty_in}</strong>
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Shift Close Cash Drawer Declaration (Only if shift not closed yet) */}
            {!existingReport && (
              <form
                onSubmit={handleCloseShift}
                className="p-5 bg-white rounded-3xl border-2 border-orange-200 shadow-md space-y-4 text-left"
              >
                <div className="flex items-center gap-2 text-slate-900 border-b border-slate-100 pb-3">
                  <DollarSign className="w-5 h-5 text-orange-600" />
                  <div>
                    <h3 className="font-black text-base">Physical Cash Declaration</h3>
                    <p className="text-xs text-slate-500 font-medium">
                      Count physical shillings in cash drawer and seal the permanent Z-Report in the database.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-black text-slate-700 mb-1">
                      Declared Cash in Hand (KES) *
                    </label>
                    <input
                      type="number"
                      min="0"
                      step="1"
                      required
                      value={declaredCash}
                      onChange={(e) => setDeclaredCash(e.target.value)}
                      placeholder="e.g. 12500"
                      className="w-full min-h-[48px] px-3.5 bg-slate-50 border-2 border-slate-300 rounded-xl text-base font-black focus:border-orange-500 focus:outline-none"
                    />
                  </div>

                  <div className="p-3.5 bg-slate-50 rounded-2xl border-2 border-slate-200 space-y-1">
                    <div className="flex justify-between text-xs font-bold text-slate-600">
                      <span>System Expected:</span>
                      <span>{formatKES(liveSummary.cash_total_kes)}</span>
                    </div>
                    <div className="flex justify-between text-xs font-black">
                      <span>Variance:</span>
                      <span
                        className={
                          cashVariance === 0
                            ? 'text-emerald-700'
                            : cashVariance > 0
                            ? 'text-blue-700'
                            : 'text-rose-700'
                        }
                      >
                        {declaredCash.trim() === ''
                          ? '—'
                          : cashVariance === 0
                          ? 'KES 0 (Balanced)'
                          : formatKES(cashVariance)}
                      </span>
                    </div>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Operator Shift Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={operatorNotes}
                    onChange={(e) => setOperatorNotes(e.target.value)}
                    placeholder="e.g. KES 300 fuel voucher for delivery bike KMDX 412M"
                    className="w-full min-h-[44px] px-3 bg-slate-50 border-2 border-slate-300 rounded-xl text-xs font-medium focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2 flex justify-end">
                  <Button
                    type="submit"
                    size="lg"
                    disabled={isSubmitting || loadingShift}
                    className="w-full sm:w-auto font-black px-6 min-h-[50px] shadow-lg"
                  >
                    <ShieldCheck className="w-5 h-5 mr-2" />
                    {isSubmitting ? 'Sealing Report...' : 'Seal & Close Daily Shift (Z-Report)'}
                  </Button>
                </div>
              </form>
            )}

            {/* Historical Shifts Log */}
            {shiftReports.length > 0 && (
              <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm p-4 text-left space-y-3">
                <h3 className="text-sm font-black text-slate-900 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-slate-500" /> Historical Closed Shifts
                </h3>
                <div className="divide-y divide-slate-100">
                  {shiftReports.map((rep) => (
                    <div key={rep.id} className="py-2.5 flex items-center justify-between gap-3 text-xs">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedBranchId(rep.branch_id);
                          setSelectedDate(rep.shift_date);
                        }}
                        className="text-left hover:underline"
                      >
                        <div className="font-mono font-bold text-slate-900">{rep.report_number}</div>
                        <div className="text-slate-500 text-[11px]">
                          {rep.branch_name} • {rep.shift_date} • {rep.operator_name}
                        </div>
                      </button>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <div className="font-black text-slate-900">{formatKES(rep.total_revenue_kes)}</div>
                          <div
                            className={`text-[10px] font-bold ${
                              rep.cash_variance_kes === 0
                                ? 'text-emerald-600'
                                : rep.cash_variance_kes > 0
                                ? 'text-blue-600'
                                : 'text-rose-600'
                            }`}
                          >
                            {rep.cash_variance_kes === 0
                              ? 'Cash balanced'
                              : `Var ${formatKES(rep.cash_variance_kes)}`}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handlePrintSlip(rep)}
                          className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-50 text-slate-700"
                          title="Print Z-Slip"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense
      fallback={
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-4">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-64 rounded-2xl" />
        </div>
      }
    >
      <ReportsPageInner />
    </Suspense>
  );
}
