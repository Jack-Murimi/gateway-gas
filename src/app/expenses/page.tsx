'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Ban,
  Banknote,
  Bike as BikeIcon,
  Building2,
  Download,
  Edit3,
  Fuel,
  PieChart,
  Receipt,
  Search,
  User,
  Wrench,
  X,
} from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { formatKES } from '@/lib/formatters';
import { Skeleton } from '@/components/ui/skeleton';
import {
  buildExpensesCsv,
  CATEGORY_META_MAP,
  EXPENSE_CATEGORIES,
  getPostedExpenses,
  normalizePlateNumber,
  PAYMENT_METHOD_LABELS,
  summarizeExpensesByBike,
  summarizeExpensesByBranch,
  summarizeExpensesByCategory,
  summarizeExpensesByPaymentMethod,
  summarizeSalariesByStaff,
  validateExpenseDraft,
  type ExpenseDraft,
} from '@/lib/expenses';
import type { Bike, Expense, ExpenseCategory, PaymentMethod } from '@/types';
import { ExpenseForm } from './expense-form';
import { BikesPanel } from './bikes-panel';
import { SummaryPanel } from './summary-panel';

type Tab = 'ledger' | 'bikes' | 'summary';
type PeriodPreset = 'this_month' | 'last_month' | 'today' | 'last_30_days' | 'all' | 'custom_month';

const todayISO = () => new Date().toLocaleDateString('en-CA');
const currentMonthISO = () => todayISO().slice(0, 7);

function previousMonthISO(): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toLocaleDateString('en-CA');
}

function formatDateLabel(dateStr?: string | null): string {
  if (!dateStr) return '—';
  return new Date(`${dateStr.slice(0, 10)}T00:00:00`).toLocaleDateString('en-KE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function formatMonthLabel(monthIso: string): string {
  const [y, m] = monthIso.split('-').map(Number);
  if (!y || !m) return monthIso;
  return new Date(y, m - 1, 1).toLocaleDateString('en-KE', { month: 'long', year: 'numeric' });
}

function emptyDraft(defaultCategory: ExpenseCategory = 'fuel'): ExpenseDraft {
  return {
    expense_date: todayISO(),
    category: defaultCategory,
    amount_kes: '',
    payment_method: 'mpesa',
    payment_reference: '',
    branch_id: '',
    bike_id: '',
    staff_id: '',
    vendor_name: '',
    description: '',
    fuel_litres: '',
    odometer_km: '',
    salary_period: defaultCategory === 'salary' ? currentMonthISO() : '',
    notes: '',
  };
}

const canManageExpenses = (role?: string) => role === 'admin' || role === 'director';

export default function ExpensesPage() {
  const { currentUser, branches, staffList } = useStore();
  const { showError, showSuccess } = useToast();

  const [tab, setTab] = useState<Tab>('ledger');
  const [bikes, setBikes] = useState<Bike[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Filters
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('this_month');
  const [customMonth, setCustomMonth] = useState(currentMonthISO());
  const [categoryFilter, setCategoryFilter] = useState<'all' | ExpenseCategory>('all');
  const [bikeFilter, setBikeFilter] = useState('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [methodFilter, setMethodFilter] = useState<'all' | PaymentMethod>('all');
  const [search, setSearch] = useState('');
  const [showVoided, setShowVoided] = useState(false);

  // Record / Edit state
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft>(() => emptyDraft('fuel'));

  // Void modal state
  const [voidTarget, setVoidTarget] = useState<Expense | null>(null);
  const [voidReason, setVoidReason] = useState('');

  const isAuthorized = Boolean(
    currentUser &&
      canManageExpenses(currentUser.role) &&
      currentUser.approval_status === 'approved',
  );

  const loadData = useCallback(async () => {
    if (!isAuthorized) return;
    setLoading(true);
    const supabase = createClient();
    const [bikesRes, expensesRes] = await Promise.all([
      supabase
        .from('bikes')
        .select('*, branch:branches(id,name,code), assigned_rider:profiles!bikes_assigned_rider_id_fkey(id,full_name,phone)')
        .order('plate_number'),
      supabase
        .from('expenses')
        .select(
          '*, bike:bikes(id,plate_number,model), branch:branches(id,name,code), staff:profiles!expenses_staff_id_fkey(id,full_name,role), recorder:profiles!expenses_created_by_fkey(id,full_name)',
        )
        .order('expense_date', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1000),
    ]);

    if (bikesRes.error) {
      showError(`Could not load bikes: ${bikesRes.error.message}`);
    } else {
      setBikes((bikesRes.data || []) as Bike[]);
    }

    if (expensesRes.error) {
      showError(`Could not load expenses: ${expensesRes.error.message}`);
    } else {
      setExpenses(
        (expensesRes.data || []).map((row: any) => ({
          ...row,
          amount_kes: Number(row.amount_kes || 0),
          fuel_litres: row.fuel_litres !== null && row.fuel_litres !== undefined ? Number(row.fuel_litres) : null,
          odometer_km: row.odometer_km !== null && row.odometer_km !== undefined ? Number(row.odometer_km) : null,
        })) as Expense[],
      );
    }
    setLoading(false);
  }, [isAuthorized, showError]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Period filtering
  const periodMeta = useMemo(() => {
    const today = todayISO();
    const thisMonth = currentMonthISO();
    const lastMonth = previousMonthISO();
    if (periodPreset === 'today') {
      return { label: 'Today', matches: (d: string) => d === today };
    }
    if (periodPreset === 'this_month') {
      return { label: formatMonthLabel(thisMonth), matches: (d: string) => d.startsWith(thisMonth) };
    }
    if (periodPreset === 'last_month') {
      return { label: formatMonthLabel(lastMonth), matches: (d: string) => d.startsWith(lastMonth) };
    }
    if (periodPreset === 'last_30_days') {
      const start = daysAgoISO(29);
      return { label: 'Last 30 days', matches: (d: string) => d >= start && d <= today };
    }
    if (periodPreset === 'custom_month') {
      return { label: formatMonthLabel(customMonth), matches: (d: string) => d.startsWith(customMonth) };
    }
    return { label: 'All time', matches: () => true };
  }, [periodPreset, customMonth]);

  const periodExpenses = useMemo(
    () => expenses.filter((e) => periodMeta.matches(e.expense_date)),
    [expenses, periodMeta],
  );

  const postedInPeriod = useMemo(() => getPostedExpenses(periodExpenses), [periodExpenses]);

  const filteredExpenses = useMemo(() => {
    const q = search.trim().toLowerCase();
    return periodExpenses.filter((e) => {
      if (!showVoided && e.status === 'void') return false;
      if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
      if (bikeFilter !== 'all' && e.bike_id !== bikeFilter) return false;
      if (branchFilter === 'hq' && e.branch_id) return false;
      if (branchFilter !== 'all' && branchFilter !== 'hq' && e.branch_id !== branchFilter) return false;
      if (methodFilter !== 'all' && e.payment_method !== methodFilter) return false;
      if (!q) return true;
      return [
        e.description,
        e.vendor_name,
        e.payment_reference,
        e.notes,
        e.bike?.plate_number,
        e.staff?.full_name,
        e.branch?.name,
        CATEGORY_META_MAP[e.category]?.label,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [periodExpenses, showVoided, categoryFilter, bikeFilter, branchFilter, methodFilter, search]);

  const filteredPostedTotal = useMemo(
    () => getPostedExpenses(filteredExpenses).reduce((sum, e) => sum + e.amount_kes, 0),
    [filteredExpenses],
  );

  // KPI metrics for selected period
  const kpis = useMemo(() => {
    let total = 0;
    let fuelKes = 0;
    let fuelLitres = 0;
    let fuelCount = 0;
    let serviceKes = 0;
    let serviceCount = 0;
    let salaryKes = 0;
    let salaryCount = 0;
    let otherKes = 0;

    for (const e of postedInPeriod) {
      total += e.amount_kes;
      if (e.category === 'fuel') {
        fuelKes += e.amount_kes;
        fuelCount += 1;
        if (e.fuel_litres) fuelLitres += e.fuel_litres;
      } else if (e.category === 'bike_service') {
        serviceKes += e.amount_kes;
        serviceCount += 1;
      } else if (e.category === 'salary') {
        salaryKes += e.amount_kes;
        salaryCount += 1;
      } else {
        otherKes += e.amount_kes;
      }
    }

    return { total, fuelKes, fuelLitres, fuelCount, serviceKes, serviceCount, salaryKes, salaryCount, otherKes };
  }, [postedInPeriod]);

  // Summaries
  const bikeSummaries = useMemo(
    () => summarizeExpensesByBike(bikes, periodExpenses, branches, staffList),
    [bikes, periodExpenses, branches, staffList],
  );
  const categorySummary = useMemo(() => summarizeExpensesByCategory(periodExpenses), [periodExpenses]);
  const branchSummary = useMemo(() => summarizeExpensesByBranch(periodExpenses, branches), [periodExpenses, branches]);
  const paymentSummary = useMemo(() => summarizeExpensesByPaymentMethod(periodExpenses), [periodExpenses]);
  const salarySummary = useMemo(() => summarizeSalariesByStaff(periodExpenses, staffList), [periodExpenses, staffList]);

  // Unsynced plates in staff profiles not yet in bikes registry
  const unsyncedStaffPlates = useMemo(() => {
    const existing = new Set(bikes.map((b) => normalizePlateNumber(b.plate_number)));
    const seen = new Set<string>();
    const missing: Array<{ plate_number: string; branch_id: string | null; assigned_rider_id: string }> = [];
    for (const s of staffList) {
      if (!s.vehicle_plate?.trim()) continue;
      const plate = normalizePlateNumber(s.vehicle_plate);
      if (existing.has(plate) || seen.has(plate)) continue;
      seen.add(plate);
      missing.push({ plate_number: plate, branch_id: s.branch_id || null, assigned_rider_id: s.id });
    }
    return missing;
  }, [bikes, staffList]);

  const updateDraft = (patch: Partial<ExpenseDraft>) => {
    setDraft((prev) => ({ ...prev, ...patch }));
  };

  const handleSaveExpense = async (e: React.FormEvent) => {
    e.preventDefault();
    const check = validateExpenseDraft(draft);
    if (!check.ok) {
      showError(check.error);
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const payload = {
      expense_date: draft.expense_date,
      category: draft.category,
      amount_kes: Number(Number(draft.amount_kes).toFixed(2)),
      payment_method: draft.payment_method,
      payment_reference: draft.payment_reference.trim() || null,
      branch_id: draft.branch_id || null,
      bike_id: draft.bike_id || null,
      staff_id: draft.staff_id || null,
      vendor_name: draft.vendor_name.trim() || null,
      description: draft.description.trim(),
      fuel_litres: draft.fuel_litres.trim() !== '' ? Number(draft.fuel_litres) : null,
      odometer_km: draft.odometer_km.trim() !== '' ? Number(draft.odometer_km) : null,
      salary_period: draft.category === 'salary' && draft.salary_period.trim() ? draft.salary_period.trim() : null,
      notes: draft.notes.trim() || null,
    };

    const result = editingExpense
      ? await supabase.from('expenses').update(payload).eq('id', editingExpense.id)
      : await supabase.from('expenses').insert({ ...payload, created_by: currentUser?.id });

    setSaving(false);
    if (result.error) {
      showError(result.error.message);
      return;
    }

    showSuccess(editingExpense ? 'Expense updated.' : 'Expense recorded.');
    const keepCategory = draft.category;
    setEditingExpense(null);
    setDraft(emptyDraft(keepCategory));
    await loadData();
  };

  const handleEditExpense = (expense: Expense) => {
    if (expense.status === 'void') return;
    setEditingExpense(expense);
    setDraft({
      expense_date: expense.expense_date,
      category: expense.category,
      amount_kes: String(expense.amount_kes),
      payment_method: expense.payment_method,
      payment_reference: expense.payment_reference || '',
      branch_id: expense.branch_id || '',
      bike_id: expense.bike_id || '',
      staff_id: expense.staff_id || '',
      vendor_name: expense.vendor_name || '',
      description: expense.description,
      fuel_litres: expense.fuel_litres !== null && expense.fuel_litres !== undefined ? String(expense.fuel_litres) : '',
      odometer_km: expense.odometer_km !== null && expense.odometer_km !== undefined ? String(expense.odometer_km) : '',
      salary_period: expense.salary_period || '',
      notes: expense.notes || '',
    });
    setTab('ledger');
  };

  const handleConfirmVoid = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidTarget) return;
    if (voidReason.trim().length < 3) {
      showError('Enter a brief reason (at least 3 characters) for voiding this expense.');
      return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('expenses')
      .update({
        status: 'void',
        void_reason: voidReason.trim(),
      })
      .eq('id', voidTarget.id);
    setSaving(false);

    if (error) {
      showError(error.message);
      return;
    }
    showSuccess('Expense voided and excluded from totals.');
    if (editingExpense?.id === voidTarget.id) {
      setEditingExpense(null);
      setDraft(emptyDraft('fuel'));
    }
    setVoidTarget(null);
    setVoidReason('');
    await loadData();
  };

  const handleQuickAddBike = async (payload: {
    plate_number: string;
    model: string;
    branch_id: string;
    assigned_rider_id: string;
  }): Promise<Bike | null> => {
    const normalized = normalizePlateNumber(payload.plate_number);
    if (!normalized) {
      showError('Enter a bike plate number.');
      return null;
    }
    const supabase = createClient();
    const { data, error } = await supabase
      .from('bikes')
      .insert({
        plate_number: normalized,
        model: payload.model.trim() || null,
        branch_id: payload.branch_id || null,
        assigned_rider_id: payload.assigned_rider_id || null,
        created_by: currentUser?.id,
      })
      .select('*, branch:branches(id,name,code), assigned_rider:profiles!bikes_assigned_rider_id_fkey(id,full_name,phone)')
      .single();

    if (error || !data) {
      showError(error?.message || 'Could not add bike.');
      return null;
    }
    showSuccess(`Bike ${normalized} added to fleet.`);
    await loadData();
    return data as Bike;
  };

  const handleSaveBike = async (
    editingBikeId: string | null,
    payload: {
      plate_number: string;
      model: string;
      branch_id: string;
      assigned_rider_id: string;
      notes: string;
    },
  ): Promise<boolean> => {
    const normalized = normalizePlateNumber(payload.plate_number);
    if (!normalized) {
      showError('Bike plate number is required.');
      return false;
    }
    setSaving(true);
    const supabase = createClient();
    const record = {
      plate_number: normalized,
      model: payload.model.trim() || null,
      branch_id: payload.branch_id || null,
      assigned_rider_id: payload.assigned_rider_id || null,
      notes: payload.notes.trim() || null,
    };
    const result = editingBikeId
      ? await supabase.from('bikes').update(record).eq('id', editingBikeId)
      : await supabase.from('bikes').insert({ ...record, created_by: currentUser?.id });
    setSaving(false);

    if (result.error) {
      showError(result.error.message);
      return false;
    }
    showSuccess(editingBikeId ? `Bike ${normalized} updated.` : `Bike ${normalized} added.`);
    await loadData();
    return true;
  };

  const handleToggleBikeActive = async (bike: Bike) => {
    const supabase = createClient();
    const { error } = await supabase
      .from('bikes')
      .update({ is_active: !bike.is_active })
      .eq('id', bike.id);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess(bike.is_active ? `${bike.plate_number} deactivated.` : `${bike.plate_number} reactivated.`);
    await loadData();
  };

  const handleSyncFromStaff = async () => {
    if (!unsyncedStaffPlates.length) return;
    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase.from('bikes').upsert(
      unsyncedStaffPlates.map((item) => ({
        plate_number: item.plate_number,
        branch_id: item.branch_id,
        assigned_rider_id: item.assigned_rider_id,
        created_by: currentUser?.id,
      })),
      { onConflict: 'plate_number', ignoreDuplicates: true },
    );
    setSaving(false);
    if (error) {
      showError(error.message);
      return;
    }
    showSuccess(`Imported ${unsyncedStaffPlates.length} bike plate${unsyncedStaffPlates.length === 1 ? '' : 's'} from staff profiles.`);
    await loadData();
  };

  const handleQuickRecordForBike = (
    bikeId: string,
    category: Extract<ExpenseCategory, 'fuel' | 'bike_service'>,
  ) => {
    const bike = bikes.find((b) => b.id === bikeId);
    setEditingExpense(null);
    setDraft({
      ...emptyDraft(category),
      bike_id: bikeId,
      branch_id: bike?.branch_id || '',
      staff_id: category === 'fuel' ? bike?.assigned_rider_id || '' : '',
    });
    setTab('ledger');
  };

  const handleFilterLedgerByBike = (bikeId: string) => {
    setBikeFilter(bikeId);
    setTab('ledger');
  };

  const handleExportCsv = () => {
    if (!filteredExpenses.length) {
      showError('No expenses to export for the current filters.');
      return;
    }
    const csv = buildExpensesCsv(filteredExpenses);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gateway-gas-expenses-${todayISO()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    showSuccess(`Exported ${filteredExpenses.length} expense rows to CSV.`);
  };

  const clearFilters = () => {
    setSearch('');
    setCategoryFilter('all');
    setBikeFilter('all');
    setBranchFilter('all');
    setMethodFilter('all');
    setShowVoided(false);
  };

  const isFiltered = Boolean(
    search ||
      categoryFilter !== 'all' ||
      bikeFilter !== 'all' ||
      branchFilter !== 'all' ||
      methodFilter !== 'all' ||
      showVoided,
  );

  if (!isAuthorized) {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Expenses Access Restricted</h1>
        <p className="text-xs text-slate-500">
          Recording and viewing operating expenses is currently restricted to approved Directors and Administrators.
        </p>
      </main>
    );
  }

  const tabs: Array<{ id: Tab; label: string; icon: React.ElementType }> = [
    { id: 'ledger', label: 'Expense Ledger', icon: Receipt },
    { id: 'bikes', label: `Bikes / Fleet (${bikes.filter((b) => b.is_active).length})`, icon: BikeIcon },
    { id: 'summary', label: 'Breakdown', icon: PieChart },
  ];

  return (
    <main className="mx-auto max-w-[1440px] space-y-2.5 px-2 pb-24 pt-2 sm:px-4 lg:px-5">
      {/* Compact Header Bar */}
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-2.5 py-1.5">
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Banknote className="h-4 w-4 text-orange-600" />
            <h1 className="text-sm font-bold text-slate-950">Expenses</h1>
          </div>
          <nav aria-label="Expenses navigation" className="flex gap-0.5 overflow-x-auto rounded bg-slate-100 p-0.5">
            {tabs.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setTab(item.id)}
                  className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded px-2.5 text-xs font-semibold transition ${
                    tab === item.id ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </button>
              );
            })}
          </nav>
        </div>

        {/* Period Picker & CSV Export */}
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            aria-label="Expense period"
            value={periodPreset}
            onChange={(e) => setPeriodPreset(e.target.value as PeriodPreset)}
            className="h-7 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
          >
            <option value="this_month">This month ({formatMonthLabel(currentMonthISO())})</option>
            <option value="last_month">Last month ({formatMonthLabel(previousMonthISO())})</option>
            <option value="today">Today</option>
            <option value="last_30_days">Last 30 days</option>
            <option value="custom_month">Pick month…</option>
            <option value="all">All time</option>
          </select>

          {periodPreset === 'custom_month' && (
            <input
              type="month"
              aria-label="Select month"
              value={customMonth}
              onChange={(e) => setCustomMonth(e.target.value)}
              className="h-7 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
            />
          )}

          <button
            type="button"
            onClick={handleExportCsv}
            className="inline-flex h-7 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
          >
            <Download className="h-3.5 w-3.5" /> CSV
          </button>
        </div>
      </header>

      {/* KPI Strip */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
            Total Expenses · {periodMeta.label}
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{formatKES(kpis.total)}</p>
          <p className="text-[11px] text-slate-500">
            {postedInPeriod.length} posted entr{postedInPeriod.length === 1 ? 'y' : 'ies'}
          </p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-amber-800">
            <Fuel className="h-3 w-3" /> Bike Fuel
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{formatKES(kpis.fuelKes)}</p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {kpis.fuelCount} fill{kpis.fuelCount === 1 ? '' : 's'}
            {kpis.fuelLitres > 0 ? ` · ${kpis.fuelLitres.toFixed(1)} L` : ''}
          </p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-orange-800">
            <Wrench className="h-3 w-3" /> Bike Services
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{formatKES(kpis.serviceKes)}</p>
          <p className="text-[11px] text-slate-500">
            {kpis.serviceCount} service/repair job{kpis.serviceCount === 1 ? '' : 's'}
          </p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide text-indigo-800">
            <User className="h-3 w-3" /> Salaries & Other
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{formatKES(kpis.salaryKes)}</p>
          <p className="text-[11px] text-slate-500 tabular-nums">
            {kpis.salaryCount} payroll · Other {formatKES(kpis.otherKes)}
          </p>
        </div>
      </section>

      {loading ? (
        <div className="space-y-2 rounded-md border border-slate-300 bg-white p-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded" />
          ))}
        </div>
      ) : null}

      {/* TAB 1: LEDGER + RECORD FORM */}
      {!loading && tab === 'ledger' && (
        <>
          {/* Filter Bar */}
          <section className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2">
            <div className="relative min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search description, plate, staff, vendor or reference…"
                aria-label="Search expenses"
                className="h-8 w-full rounded border border-slate-300 bg-white pl-8 pr-7 text-xs text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
              />
              {search && (
                <button
                  type="button"
                  onClick={() => setSearch('')}
                  aria-label="Clear search"
                  className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <select
              aria-label="Filter by category"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as 'all' | ExpenseCategory)}
              className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All categories</option>
              {EXPENSE_CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>{c.label}</option>
              ))}
            </select>

            <select
              aria-label="Filter by bike"
              value={bikeFilter}
              onChange={(e) => setBikeFilter(e.target.value)}
              className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All bikes</option>
              {bikes.map((b) => (
                <option key={b.id} value={b.id}>{b.plate_number}</option>
              ))}
            </select>

            <select
              aria-label="Filter by branch"
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All branches</option>
              <option value="hq">Company-wide / HQ</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>

            <select
              aria-label="Filter by payment method"
              value={methodFilter}
              onChange={(e) => setMethodFilter(e.target.value as 'all' | PaymentMethod)}
              className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">All methods</option>
              {(Object.keys(PAYMENT_METHOD_LABELS) as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>{PAYMENT_METHOD_LABELS[m]}</option>
              ))}
            </select>

            <label className="inline-flex h-8 cursor-pointer items-center gap-1.5 rounded border border-slate-200 bg-slate-50 px-2 text-xs font-medium text-slate-700">
              <input
                type="checkbox"
                checked={showVoided}
                onChange={(e) => setShowVoided(e.target.checked)}
                className="rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              Voided
            </label>

            {isFiltered && (
              <button
                type="button"
                onClick={clearFilters}
                className="h-8 px-1.5 text-xs font-semibold text-orange-700 hover:underline"
              >
                Clear
              </button>
            )}
          </section>

          <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_390px]">
            {/* Left: Expense Ledger Table */}
            <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
                <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
                  Expense Entries ({filteredExpenses.length})
                </h2>
                <span className="text-xs text-slate-600">
                  Filtered posted total:{' '}
                  <strong className="tabular-nums text-slate-950">{formatKES(filteredPostedTotal)}</strong>
                </span>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                      <th className="px-3 py-2">Date</th>
                      <th className="px-2.5 py-2">Category</th>
                      <th className="px-2.5 py-2">Details</th>
                      <th className="px-2.5 py-2">Branch / Pay</th>
                      <th className="px-2.5 py-2 text-right">Amount</th>
                      <th className="px-3 py-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {filteredExpenses.map((exp) => {
                      const cat = CATEGORY_META_MAP[exp.category];
                      const isVoid = exp.status === 'void';
                      const isEditing = editingExpense?.id === exp.id;
                      return (
                        <tr
                          key={exp.id}
                          className={
                            isEditing
                              ? 'bg-orange-50/80 ring-1 ring-inset ring-orange-300'
                              : isVoid
                              ? 'bg-slate-50/70 opacity-65'
                              : 'odd:bg-white even:bg-slate-50/50 hover:bg-slate-100/70'
                          }
                        >
                          <td className="whitespace-nowrap px-3 py-2.5 align-top font-medium text-slate-700 tabular-nums">
                            {formatDateLabel(exp.expense_date)}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 align-top">
                            <span className={`inline-flex rounded px-1.5 py-0.5 text-[10px] font-semibold ${cat.badgeClass}`}>
                              {cat.shortLabel}
                            </span>
                            {isVoid && (
                              <span className="mt-1 block w-fit rounded bg-rose-100 px-1.5 py-0.5 text-[10px] font-semibold text-rose-700">
                                Voided
                              </span>
                            )}
                          </td>
                          <td className="px-2.5 py-2.5 align-top">
                            <p className={`font-semibold text-slate-900 ${isVoid ? 'line-through' : ''}`}>
                              {exp.description}
                            </p>
                            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                              {exp.bike?.plate_number && (
                                <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 font-mono text-[10px] font-bold text-amber-900 ring-1 ring-inset ring-amber-200">
                                  <BikeIcon className="h-3 w-3" /> {exp.bike.plate_number}
                                </span>
                              )}
                              {exp.staff?.full_name && (
                                <span className="inline-flex items-center gap-1 rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-semibold text-indigo-800">
                                  <User className="h-3 w-3" /> {exp.staff.full_name}
                                </span>
                              )}
                              {exp.salary_period && (
                                <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                  Period: {exp.salary_period}
                                </span>
                              )}
                              {exp.fuel_litres !== null && exp.fuel_litres !== undefined && (
                                <span className="tabular-nums">{exp.fuel_litres} L</span>
                              )}
                              {exp.odometer_km !== null && exp.odometer_km !== undefined && (
                                <span className="font-mono text-[10px] tabular-nums">
                                  {exp.odometer_km.toLocaleString('en-KE')} km
                                </span>
                              )}
                              {exp.vendor_name && <span>· {exp.vendor_name}</span>}
                            </div>
                            {exp.notes && <p className="mt-0.5 text-[11px] text-slate-500">{exp.notes}</p>}
                            {isVoid && exp.void_reason && (
                              <p className="mt-1 text-[11px] font-medium text-rose-700">
                                Void reason: {exp.void_reason}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 align-top">
                            <div className="flex items-center gap-1 text-slate-700">
                              <Building2 className="h-3 w-3 text-slate-400" />
                              <span>{exp.branch?.name || 'HQ'}</span>
                            </div>
                            <div className="mt-0.5 text-[11px] text-slate-500">
                              {PAYMENT_METHOD_LABELS[exp.payment_method]}
                              {exp.payment_reference ? ` · ${exp.payment_reference}` : ''}
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-2.5 py-2.5 align-top text-right font-bold tabular-nums text-slate-950">
                            <span className={isVoid ? 'text-slate-400 line-through' : ''}>
                              {formatKES(exp.amount_kes)}
                            </span>
                            {exp.recorder?.full_name && (
                              <p className="mt-0.5 text-[10px] font-normal text-slate-400">
                                by {exp.recorder.full_name.split(' ')[0]}
                              </p>
                            )}
                          </td>
                          <td className="whitespace-nowrap px-3 py-2.5 align-top text-right">
                            {!isVoid ? (
                              <div className="flex items-center justify-end gap-1">
                                <button
                                  type="button"
                                  onClick={() => handleEditExpense(exp)}
                                  title="Edit expense"
                                  className="inline-flex h-6 items-center gap-1 rounded border border-slate-200 bg-white px-1.5 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                                >
                                  <Edit3 className="h-3 w-3" /> Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setVoidTarget(exp);
                                    setVoidReason('');
                                  }}
                                  title="Void expense"
                                  className="inline-flex h-6 items-center gap-1 rounded border border-rose-200 bg-rose-50 px-1.5 text-[11px] font-semibold text-rose-700 hover:bg-rose-100"
                                >
                                  <Ban className="h-3 w-3" /> Void
                                </button>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400">Audited</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {filteredExpenses.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-3 py-12 text-center text-xs text-slate-500">
                          No expenses recorded for these filters yet. Use the form on the right to record fuel, salaries,
                          bike services, or other expenses.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {/* Right: Sticky Record / Edit Expense Form */}
            <ExpenseForm
              editingExpense={editingExpense}
              draft={draft}
              onChange={updateDraft}
              onSubmit={handleSaveExpense}
              onCancelEdit={() => {
                setEditingExpense(null);
                setDraft(emptyDraft('fuel'));
              }}
              saving={saving}
              bikes={bikes}
              branches={branches}
              staffList={staffList}
              onQuickAddBike={handleQuickAddBike}
            />
          </div>
        </>
      )}

      {/* TAB 2: BIKES / FLEET */}
      {!loading && tab === 'bikes' && (
        <BikesPanel
          bikes={bikes}
          bikeSummaries={bikeSummaries}
          branches={branches}
          staffList={staffList}
          periodLabel={periodMeta.label}
          unsyncedPlatesCount={unsyncedStaffPlates.length}
          saving={saving}
          onSaveBike={handleSaveBike}
          onToggleBikeActive={handleToggleBikeActive}
          onSyncFromStaff={handleSyncFromStaff}
          onQuickRecordForBike={handleQuickRecordForBike}
          onFilterLedgerByBike={handleFilterLedgerByBike}
        />
      )}

      {/* TAB 3: SUMMARY BREAKDOWN */}
      {!loading && tab === 'summary' && (
        <SummaryPanel
          periodLabel={periodMeta.label}
          categorySummary={categorySummary}
          branchSummary={branchSummary}
          paymentSummary={paymentSummary}
          salarySummary={salarySummary}
        />
      )}

      {/* Void Confirmation Modal */}
      {voidTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/50 p-4 backdrop-blur-[1px]">
          <form
            onSubmit={handleConfirmVoid}
            className="w-full max-w-md space-y-3 rounded-lg border border-slate-200 bg-white p-4 shadow-xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-950">Void expense entry</h2>
                <p className="mt-0.5 text-xs text-slate-500">
                  Voided entries remain in the audit log but are excluded from all totals.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                aria-label="Close"
                className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="rounded border border-slate-200 bg-slate-50 p-2.5 text-xs">
              <div className="flex items-center justify-between font-semibold text-slate-900">
                <span>{voidTarget.description}</span>
                <span className="tabular-nums">{formatKES(voidTarget.amount_kes)}</span>
              </div>
              <p className="mt-0.5 text-[11px] text-slate-500">
                {formatDateLabel(voidTarget.expense_date)} · {CATEGORY_META_MAP[voidTarget.category].label}
                {voidTarget.bike?.plate_number ? ` · ${voidTarget.bike.plate_number}` : ''}
              </p>
            </div>

            <div>
              <label htmlFor="void-reason" className="mb-1 block text-[11px] font-semibold text-slate-700">
                Reason for voiding *
              </label>
              <input
                id="void-reason"
                required
                minLength={3}
                autoFocus
                value={voidReason}
                onChange={(e) => setVoidReason(e.target.value)}
                placeholder="e.g. Duplicate entry, wrong amount entered"
                className="h-9 w-full rounded border border-slate-300 bg-white px-2.5 text-xs text-slate-900 outline-none focus:border-rose-500 focus:ring-1 focus:ring-rose-500/30"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => setVoidTarget(null)}
                className="h-8 rounded border border-slate-300 bg-white px-3 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || voidReason.trim().length < 3}
                className="h-8 rounded bg-rose-600 px-3 text-xs font-semibold text-white hover:bg-rose-700 disabled:opacity-50"
              >
                {saving ? 'Voiding…' : 'Confirm Void'}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}
