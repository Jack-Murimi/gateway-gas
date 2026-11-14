'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/context/store-context';
import { ShiftZReport } from '@/types';
import {
  FileText,
  Building2,
  Calendar,
  CheckCircle2,
  AlertTriangle,
  Printer,
  DollarSign,
  TrendingUp,
  Receipt,
  Layers,
  Clock,
  ArrowRight,
  ShieldCheck,
  ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/toast';
import { formatKES, formatShortDate } from '@/lib/formatters';

function todayISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

export default function ReportsPage() {
  const { currentUser, branches, orders, shiftReports, createShiftReport } = useStore();
  const { showSuccess, showError } = useToast();

  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || '');
  const [selectedDate, setSelectedDate] = useState<string>(todayISO());
  const [declaredCash, setDeclaredCash] = useState<string>('');
  const [operatorNotes, setOperatorNotes] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [printReport, setPrintReport] = useState<ShiftZReport | null>(null);

  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];

  // 1. Check if a report was already generated for this branch & date
  const existingReport = useMemo(() => {
    return shiftReports.find(
      (r) => r.branch_id === selectedBranchId && r.shift_date === selectedDate
    );
  }, [shiftReports, selectedBranchId, selectedDate]);

  // 2. Filter orders matching branch and date
  const matchingOrders = useMemo(() => {
    return orders.filter((o) => {
      if (o.branch_id !== selectedBranchId) return false;
      const orderDate = o.created_at ? o.created_at.slice(0, 10) : '';
      return orderDate === selectedDate;
    });
  }, [orders, selectedBranchId, selectedDate]);

  // 3. Calculate live revenue & payment breakdown
  const metrics = useMemo(() => {
    let totalRevenue = 0;
    let mpesaTotal = 0;
    let cashTotal = 0;
    let bankTotal = 0;
    let cylindersSold = 0;
    let accessoriesSold = 0;

    const brandCounts: Record<string, { brand: string; size_kg: number | null; full_sold: number; empty_in: number }> = {};

    matchingOrders.forEach((o) => {
      // Count revenue only for paid sales or walk-ins
      const isPaid = o.payment_status === 'paid' || o.delivery_status === 'delivered';
      const orderRev = isPaid ? o.total_kes : 0;
      totalRevenue += orderRev;

      if (isPaid) {
        if (o.payment_method === 'mpesa') mpesaTotal += orderRev;
        else if (o.payment_method === 'cash') cashTotal += orderRev;
        else bankTotal += orderRev;
      }

      o.items?.forEach((item) => {
        if (item.order_type === 'accessory') {
          accessoriesSold += item.quantity;
        } else {
          cylindersSold += item.quantity;
          const key = `${item.outgoing_brand}-${item.cylinder_size_kg || 0}`;
          if (!brandCounts[key]) {
            brandCounts[key] = {
              brand: item.outgoing_brand,
              size_kg: item.cylinder_size_kg || null,
              full_sold: 0,
              empty_in: 0,
            };
          }
          brandCounts[key].full_sold += item.quantity;

          if (item.order_type === 'refill') {
            const inBrand = item.incoming_brand || item.outgoing_brand;
            const inKey = `${inBrand}-${item.cylinder_size_kg || 0}`;
            if (!brandCounts[inKey]) {
              brandCounts[inKey] = {
                brand: inBrand,
                size_kg: item.cylinder_size_kg || null,
                full_sold: 0,
                empty_in: 0,
              };
            }
            brandCounts[inKey].empty_in += item.quantity;
          }
        }
      });
    });

    return {
      totalSalesCount: matchingOrders.length,
      totalRevenue,
      mpesaTotal,
      cashTotal,
      bankTotal,
      cylindersSold,
      accessoriesSold,
      cylinderBreakdown: Object.values(brandCounts),
    };
  }, [matchingOrders]);

  // Live cash variance
  const declaredCashNum = declaredCash.trim() === '' ? 0 : Number(declaredCash);
  const expectedCash = existingReport ? existingReport.expected_cash_kes : metrics.cashTotal;
  const cashVariance = declaredCashNum - expectedCash;

  const handleCloseShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentUser) return;

    if (declaredCash.trim() === '') {
      showError('Please enter the declared physical cash counted in the drawer.');
      return;
    }

    setIsSubmitting(true);
    try {
      const report = await createShiftReport({
        branch_id: selectedBranchId,
        branch_name: activeBranch?.name || 'All branches',
        operator_id: currentUser.id,
        operator_name: currentUser.full_name,
        shift_date: selectedDate,
        total_sales_count: metrics.totalSalesCount,
        total_revenue_kes: metrics.totalRevenue,
        mpesa_total_kes: metrics.mpesaTotal,
        cash_total_kes: metrics.cashTotal,
        bank_total_kes: metrics.bankTotal,
        expected_cash_kes: metrics.cashTotal,
        declared_cash_kes: declaredCashNum,
        cash_variance_kes: cashVariance,
        cylinders_sold_count: metrics.cylindersSold,
        accessories_sold_count: metrics.accessoriesSold,
        cylinder_breakdown: metrics.cylinderBreakdown,
        notes: operatorNotes.trim() || undefined,
      });

      showSuccess(`Shift closed! Z-Report #${report.report_number} generated.`);
      setPrintReport(report);
    } catch {
      showError('Failed to record shift close.');
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
                <span>TOTAL REVENUE:</span>
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
                  <span>{c.brand} {c.size_kg ? `${c.size_kg}kg` : ''}:</span>
                  <span>{c.full_sold} Out / {c.empty_in} In</span>
                </div>
              ))}
            </div>
            {printReport.notes && (
              <div className="border-t border-dashed pt-1 text-[10px]">
                Notes: {printReport.notes}
              </div>
            )}
            <div className="text-center pt-3 text-[10px]">
              *** END OF Z-REPORT SLIP ***
            </div>
          </div>
        </div>
      )}

      {/* Main Screen Content */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 pb-28 space-y-5 print:hidden">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 pb-4">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight">
                Shift Close & Z-Report
              </h1>
              <p className="text-xs font-bold text-slate-500">
                Daily cash drawer balancing, M-Pesa tally, and cylinder exchange audit.
              </p>
            </div>
          </div>

          {existingReport && (
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

        {/* Filter Bar: Branch + Date */}
        <div className="p-3.5 bg-white rounded-2xl border-2 border-slate-200 shadow-sm grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-orange-600" /> Station Branch
            </label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full min-h-[44px] px-3 bg-slate-50 border-2 border-slate-300 rounded-xl text-sm font-bold focus:border-orange-500 focus:outline-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
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
                  Closed on {new Date(existingReport.closed_at).toLocaleTimeString('en-KE')} by{' '}
                  <span className="font-bold">{existingReport.operator_name}</span>.
                </div>
                <div className="text-xs font-bold text-emerald-900 mt-2 flex items-center gap-3">
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
            <span>Shift is currently OPEN. Enter physical drawer count below to balance and seal report.</span>
          </div>
        )}

        {/* Live Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
            <div className="text-[11px] font-black uppercase tracking-wider text-slate-500">Gross Sales</div>
            <div className="text-xl sm:text-2xl font-black text-slate-900 mt-1">
              {formatKES(existingReport ? existingReport.total_revenue_kes : metrics.totalRevenue)}
            </div>
            <div className="text-xs text-slate-500 mt-0.5">
              {existingReport ? existingReport.total_sales_count : metrics.totalSalesCount} tickets
            </div>
          </div>

          <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
            <div className="text-[11px] font-black uppercase tracking-wider text-emerald-600">M-Pesa Tally</div>
            <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
              {formatKES(existingReport ? existingReport.mpesa_total_kes : metrics.mpesaTotal)}
            </div>
            <div className="text-xs text-emerald-600 mt-0.5 font-bold">Direct to Till</div>
          </div>

          <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
            <div className="text-[11px] font-black uppercase tracking-wider text-blue-600">System Cash</div>
            <div className="text-xl sm:text-2xl font-black text-blue-700 mt-1">
              {formatKES(existingReport ? existingReport.expected_cash_kes : metrics.cashTotal)}
            </div>
            <div className="text-xs text-blue-600 mt-0.5 font-bold">Expected in Drawer</div>
          </div>

          <div className="p-4 bg-white rounded-2xl border-2 border-slate-200 shadow-sm text-left">
            <div className="text-[11px] font-black uppercase tracking-wider text-purple-600">Cylinders Dispensed</div>
            <div className="text-xl sm:text-2xl font-black text-purple-700 mt-1">
              {existingReport ? existingReport.cylinders_sold_count : metrics.cylindersSold}
            </div>
            <div className="text-xs text-purple-600 mt-0.5 font-bold">
              +{existingReport ? existingReport.accessories_sold_count : metrics.accessoriesSold} accessories
            </div>
          </div>
        </div>

        {/* Cylinder Tare & Brand Exchange Summary */}
        <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm overflow-hidden text-left">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-orange-600" />
              <h2 className="text-sm font-black text-slate-900">
                Cylinder Exchange & Tare Audit
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-500">Filled Out vs Empty In</span>
          </div>

          <div className="divide-y divide-slate-100 text-xs">
            {(existingReport ? existingReport.cylinder_breakdown : metrics.cylinderBreakdown).length === 0 ? (
              <div className="p-6 text-center text-slate-400 font-bold">
                No cylinders dispensed on this date yet.
              </div>
            ) : (
              (existingReport ? existingReport.cylinder_breakdown : metrics.cylinderBreakdown).map((item, idx) => (
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
                  Count physical shillings in cash drawer and declare total below.
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
                  <span>{formatKES(metrics.cashTotal)}</span>
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
                disabled={isSubmitting}
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
                  <div>
                    <div className="font-mono font-bold text-slate-900">{rep.report_number}</div>
                    <div className="text-slate-500 text-[11px]">
                      {rep.branch_name} • {rep.shift_date} • {rep.operator_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-black text-slate-900">{formatKES(rep.total_revenue_kes)}</span>
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
    </>
  );
}
