import type { Bike, Branch, Expense, ExpenseCategory, PaymentMethod, StaffProfile } from '@/types';

export interface ExpenseCategoryMeta {
  value: ExpenseCategory;
  label: string;
  shortLabel: string;
  badgeClass: string;
  barClass: string;
  requiresBike: boolean;
  supportsStaff: boolean;
  supportsFuelFields: boolean;
  supportsOdometer: boolean;
  descriptionPlaceholder: string;
  vendorPlaceholder: string;
}

export const EXPENSE_CATEGORIES: ExpenseCategoryMeta[] = [
  {
    value: 'fuel',
    label: 'Bike Fuel',
    shortLabel: 'Fuel',
    badgeClass: 'bg-amber-100 text-amber-900',
    barClass: 'bg-amber-500',
    requiresBike: true,
    supportsStaff: true,
    supportsFuelFields: true,
    supportsOdometer: true,
    descriptionPlaceholder: 'e.g. Petrol top-up for morning deliveries',
    vendorPlaceholder: 'e.g. TotalEnergies Ngong Rd, Rubis',
  },
  {
    value: 'bike_service',
    label: 'Bike Service & Repairs',
    shortLabel: 'Bike Service',
    badgeClass: 'bg-orange-100 text-orange-900',
    barClass: 'bg-orange-600',
    requiresBike: true,
    supportsStaff: false,
    supportsFuelFields: false,
    supportsOdometer: true,
    descriptionPlaceholder: 'e.g. Engine oil change, brake pads, rear tyre',
    vendorPlaceholder: 'e.g. Kamau Garage, Bajaj Spares',
  },
  {
    value: 'salary',
    label: 'Salaries & Wages',
    shortLabel: 'Salary',
    badgeClass: 'bg-indigo-100 text-indigo-900',
    barClass: 'bg-indigo-600',
    requiresBike: false,
    supportsStaff: true,
    supportsFuelFields: false,
    supportsOdometer: false,
    descriptionPlaceholder: 'e.g. Monthly salary, mid-month advance, rider allowance',
    vendorPlaceholder: 'Casual worker name (if not in staff list)',
  },
  {
    value: 'rent',
    label: 'Branch Rent',
    shortLabel: 'Rent',
    badgeClass: 'bg-purple-100 text-purple-900',
    barClass: 'bg-purple-600',
    requiresBike: false,
    supportsStaff: false,
    supportsFuelFields: false,
    supportsOdometer: false,
    descriptionPlaceholder: 'e.g. Monthly shop rent for Lavington depot',
    vendorPlaceholder: 'e.g. Landlord / property agent',
  },
  {
    value: 'utilities',
    label: 'Utilities & Internet',
    shortLabel: 'Utilities',
    badgeClass: 'bg-sky-100 text-sky-900',
    barClass: 'bg-sky-600',
    requiresBike: false,
    supportsStaff: false,
    supportsFuelFields: false,
    supportsOdometer: false,
    descriptionPlaceholder: 'e.g. KPLC tokens, water bill, Safaricom Wi-Fi, airtime',
    vendorPlaceholder: 'e.g. KPLC, Safaricom, Nairobi Water',
  },
  {
    value: 'office_supplies',
    label: 'Shop & Office Supplies',
    shortLabel: 'Supplies',
    badgeClass: 'bg-teal-100 text-teal-900',
    barClass: 'bg-teal-600',
    requiresBike: false,
    supportsStaff: false,
    supportsFuelFields: false,
    supportsOdometer: false,
    descriptionPlaceholder: 'e.g. Receipt books, thermal paper rolls, cleaning supplies',
    vendorPlaceholder: 'e.g. Naivas, stationery shop',
  },
  {
    value: 'licenses_permits',
    label: 'Licenses, Permits & Insurance',
    shortLabel: 'Licenses',
    badgeClass: 'bg-rose-100 text-rose-900',
    barClass: 'bg-rose-600',
    requiresBike: false,
    supportsStaff: false,
    supportsFuelFields: false,
    supportsOdometer: false,
    descriptionPlaceholder: 'e.g. EPRA license, Nairobi County permit, bike insurance',
    vendorPlaceholder: 'e.g. EPRA, County Gov, Britam Insurance',
  },
  {
    value: 'other',
    label: 'Other Expenses',
    shortLabel: 'Other',
    badgeClass: 'bg-slate-200 text-slate-800',
    barClass: 'bg-slate-500',
    requiresBike: false,
    supportsStaff: false,
    supportsFuelFields: false,
    supportsOdometer: false,
    descriptionPlaceholder: 'Describe the expense incurred',
    vendorPlaceholder: 'Payee or vendor (optional)',
  },
];

export const CATEGORY_META_MAP: Record<ExpenseCategory, ExpenseCategoryMeta> = EXPENSE_CATEGORIES.reduce(
  (acc, item) => {
    acc[item.value] = item;
    return acc;
  },
  {} as Record<ExpenseCategory, ExpenseCategoryMeta>,
);

export const ALLOWED_PAYMENT_METHODS: PaymentMethod[] = ['mpesa', 'cash', 'bank_transfer', 'cheque', 'pdq'];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  mpesa: 'M-Pesa',
  cash: 'Cash',
  bank_transfer: 'Bank Transfer',
  cheque: 'Cheque',
  pdq: 'Card / PDQ',
};

export interface ExpenseDraft {
  expense_date: string;
  category: ExpenseCategory;
  amount_kes: string;
  payment_method: PaymentMethod;
  payment_reference: string;
  branch_id: string;
  bike_id: string;
  staff_id: string;
  vendor_name: string;
  description: string;
  fuel_litres: string;
  odometer_km: string;
  salary_period: string;
  notes: string;
}

export function requiresBikeForCategory(category: ExpenseCategory): boolean {
  return category === 'fuel' || category === 'bike_service';
}

export function validateExpenseDraft(draft: ExpenseDraft): { ok: true } | { ok: false; error: string } {
  if (!draft.expense_date || !/^\d{4}-\d{2}-\d{2}$/.test(draft.expense_date)) {
    return { ok: false, error: 'Select a valid expense date.' };
  }
  if (!(draft.category in CATEGORY_META_MAP)) {
    return { ok: false, error: 'Select a valid expense category.' };
  }
  const amount = Number(draft.amount_kes);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: 'Enter a valid expense amount greater than KES 0.' };
  }
  if (!ALLOWED_PAYMENT_METHODS.includes(draft.payment_method)) {
    return { ok: false, error: 'Select a valid payment method.' };
  }
  if (requiresBikeForCategory(draft.category) && !draft.bike_id) {
    return {
      ok: false,
      error:
        draft.category === 'fuel'
          ? 'Select the specific bike for this fuel expense.'
          : 'Select the specific bike for this bike service expense.',
    };
  }
  if (!draft.description.trim()) {
    return { ok: false, error: 'Enter a short description of the expense.' };
  }
  if (draft.fuel_litres.trim() !== '') {
    const litres = Number(draft.fuel_litres);
    if (!Number.isFinite(litres) || litres <= 0) {
      return { ok: false, error: 'Fuel litres must be greater than 0.' };
    }
  }
  if (draft.odometer_km.trim() !== '') {
    const odo = Number(draft.odometer_km);
    if (!Number.isInteger(odo) || odo < 0) {
      return { ok: false, error: 'Odometer reading must be a non-negative whole number.' };
    }
  }
  if (draft.salary_period.trim() !== '' && !/^\d{4}-\d{2}$/.test(draft.salary_period.trim())) {
    return { ok: false, error: 'Salary period must use YYYY-MM format.' };
  }
  return { ok: true };
}

export function normalizePlateNumber(plate: string): string {
  return plate.trim().replace(/\s+/g, ' ').toUpperCase();
}

export interface CategorySummaryRow {
  category: ExpenseCategory;
  label: string;
  total_kes: number;
  count: number;
  share_pct: number;
}

export interface BikeExpenseSummaryRow {
  bike_id: string;
  plate_number: string;
  model: string | null;
  branch_name: string | null;
  rider_name: string | null;
  is_active: boolean;
  fuel_kes: number;
  fuel_litres: number;
  fuel_entries: number;
  service_kes: number;
  service_entries: number;
  other_kes: number;
  total_kes: number;
  last_odometer_km: number | null;
  last_expense_date: string | null;
}

export interface BranchExpenseSummaryRow {
  branch_id: string | null;
  branch_name: string;
  total_kes: number;
  count: number;
  share_pct: number;
}

export interface StaffSalarySummaryRow {
  staff_id: string;
  staff_name: string;
  role: string;
  salary_kes: number;
  entries: number;
  last_paid_date: string | null;
}

export interface PaymentMethodSummaryRow {
  payment_method: PaymentMethod;
  label: string;
  total_kes: number;
  count: number;
  share_pct: number;
}

export function getPostedExpenses(expenses: Expense[]): Expense[] {
  return expenses.filter((e) => e.status === 'posted');
}

export function summarizeExpensesByCategory(expenses: Expense[]): CategorySummaryRow[] {
  const posted = getPostedExpenses(expenses);
  const grandTotal = posted.reduce((sum, e) => sum + Number(e.amount_kes || 0), 0);
  const map = new Map<ExpenseCategory, { total: number; count: number }>();

  for (const e of posted) {
    const cur = map.get(e.category) || { total: 0, count: 0 };
    cur.total += Number(e.amount_kes || 0);
    cur.count += 1;
    map.set(e.category, cur);
  }

  return EXPENSE_CATEGORIES.map((meta) => {
    const entry = map.get(meta.value) || { total: 0, count: 0 };
    return {
      category: meta.value,
      label: meta.label,
      total_kes: entry.total,
      count: entry.count,
      share_pct: grandTotal > 0 ? (entry.total / grandTotal) * 100 : 0,
    };
  })
    .filter((row) => row.count > 0)
    .sort((a, b) => b.total_kes - a.total_kes);
}

export function summarizeExpensesByBike(
  bikes: Bike[],
  expenses: Expense[],
  branches: Branch[],
  staffList: StaffProfile[],
): BikeExpenseSummaryRow[] {
  const posted = getPostedExpenses(expenses);
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const staffMap = new Map(staffList.map((s) => [s.id, s.full_name]));

  const rows = new Map<string, BikeExpenseSummaryRow>();
  for (const bike of bikes) {
    rows.set(bike.id, {
      bike_id: bike.id,
      plate_number: bike.plate_number,
      model: bike.model ?? null,
      branch_name: bike.branch?.name ?? (bike.branch_id ? branchMap.get(bike.branch_id) ?? null : null),
      rider_name:
        bike.assigned_rider?.full_name ?? (bike.assigned_rider_id ? staffMap.get(bike.assigned_rider_id) ?? null : null),
      is_active: bike.is_active,
      fuel_kes: 0,
      fuel_litres: 0,
      fuel_entries: 0,
      service_kes: 0,
      service_entries: 0,
      other_kes: 0,
      total_kes: 0,
      last_odometer_km: null,
      last_expense_date: null,
    });
  }

  for (const e of posted) {
    if (!e.bike_id) continue;
    const row = rows.get(e.bike_id);
    if (!row) continue;
    const amt = Number(e.amount_kes || 0);
    if (e.category === 'fuel') {
      row.fuel_kes += amt;
      row.fuel_entries += 1;
      if (e.fuel_litres) row.fuel_litres += Number(e.fuel_litres);
    } else if (e.category === 'bike_service') {
      row.service_kes += amt;
      row.service_entries += 1;
    } else {
      row.other_kes += amt;
    }
    row.total_kes += amt;
    if (typeof e.odometer_km === 'number' && (row.last_odometer_km === null || e.odometer_km > row.last_odometer_km)) {
      row.last_odometer_km = e.odometer_km;
    }
    if (!row.last_expense_date || e.expense_date > row.last_expense_date) {
      row.last_expense_date = e.expense_date;
    }
  }

  return Array.from(rows.values()).sort((a, b) => {
    if (b.total_kes !== a.total_kes) return b.total_kes - a.total_kes;
    return a.plate_number.localeCompare(b.plate_number);
  });
}

export function summarizeExpensesByBranch(expenses: Expense[], branches: Branch[]): BranchExpenseSummaryRow[] {
  const posted = getPostedExpenses(expenses);
  const grandTotal = posted.reduce((sum, e) => sum + Number(e.amount_kes || 0), 0);
  const branchMap = new Map(branches.map((b) => [b.id, b.name]));
  const totals = new Map<string, { branch_id: string | null; branch_name: string; total: number; count: number }>();

  for (const e of posted) {
    const key = e.branch_id || '__hq__';
    const name = e.branch?.name ?? (e.branch_id ? branchMap.get(e.branch_id) || 'Unknown Branch' : 'Company-wide / HQ');
    const cur = totals.get(key) || { branch_id: e.branch_id ?? null, branch_name: name, total: 0, count: 0 };
    cur.total += Number(e.amount_kes || 0);
    cur.count += 1;
    totals.set(key, cur);
  }

  return Array.from(totals.values())
    .map((r) => ({
      branch_id: r.branch_id,
      branch_name: r.branch_name,
      total_kes: r.total,
      count: r.count,
      share_pct: grandTotal > 0 ? (r.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total_kes - a.total_kes);
}

export function summarizeSalariesByStaff(expenses: Expense[], staffList: StaffProfile[]): StaffSalarySummaryRow[] {
  const posted = getPostedExpenses(expenses).filter((e) => e.category === 'salary');
  const staffMap = new Map(staffList.map((s) => [s.id, s]));
  const map = new Map<string, StaffSalarySummaryRow>();

  for (const e of posted) {
    const key = e.staff_id || `unlinked:${(e.vendor_name || 'Unassigned').trim().toLowerCase()}`;
    const staffObj = e.staff_id ? staffMap.get(e.staff_id) : undefined;
    const name = e.staff?.full_name ?? staffObj?.full_name ?? (e.vendor_name?.trim() || 'Casual / Unlinked');
    const role = e.staff?.role ?? staffObj?.role ?? 'casual';
    const cur = map.get(key) || {
      staff_id: key,
      staff_name: name,
      role,
      salary_kes: 0,
      entries: 0,
      last_paid_date: null,
    };
    cur.salary_kes += Number(e.amount_kes || 0);
    cur.entries += 1;
    if (!cur.last_paid_date || e.expense_date > cur.last_paid_date) {
      cur.last_paid_date = e.expense_date;
    }
    map.set(key, cur);
  }

  return Array.from(map.values()).sort((a, b) => b.salary_kes - a.salary_kes);
}

export function summarizeExpensesByPaymentMethod(expenses: Expense[]): PaymentMethodSummaryRow[] {
  const posted = getPostedExpenses(expenses);
  const grandTotal = posted.reduce((sum, e) => sum + Number(e.amount_kes || 0), 0);
  const map = new Map<PaymentMethod, { total: number; count: number }>();

  for (const e of posted) {
    const cur = map.get(e.payment_method) || { total: 0, count: 0 };
    cur.total += Number(e.amount_kes || 0);
    cur.count += 1;
    map.set(e.payment_method, cur);
  }

  return Array.from(map.entries())
    .map(([payment_method, v]) => ({
      payment_method,
      label: PAYMENT_METHOD_LABELS[payment_method] || payment_method,
      total_kes: v.total,
      count: v.count,
      share_pct: grandTotal > 0 ? (v.total / grandTotal) * 100 : 0,
    }))
    .sort((a, b) => b.total_kes - a.total_kes);
}

function escapeCsvCell(value: string | number | null | undefined): string {
  const raw = value === null || value === undefined ? '' : String(value);
  if (/[",\r\n]/.test(raw)) {
    return `"${raw.replace(/"/g, '""')}"`;
  }
  return raw;
}

export function buildExpensesCsv(expenses: Expense[]): string {
  const headers = [
    'Date',
    'Category',
    'Description',
    'Amount (KES)',
    'Payment Method',
    'Reference',
    'Bike Plate',
    'Litres',
    'Odometer (km)',
    'Staff Member',
    'Salary Period',
    'Branch',
    'Vendor / Payee',
    'Status',
    'Notes',
  ];

  const lines = [headers.map(escapeCsvCell).join(',')];
  for (const e of expenses) {
    lines.push(
      [
        e.expense_date,
        CATEGORY_META_MAP[e.category]?.label || e.category,
        e.description,
        Number(e.amount_kes || 0).toFixed(2),
        PAYMENT_METHOD_LABELS[e.payment_method] || e.payment_method,
        e.payment_reference || '',
        e.bike?.plate_number || '',
        e.fuel_litres ?? '',
        e.odometer_km ?? '',
        e.staff?.full_name || '',
        e.salary_period || '',
        e.branch?.name || 'Company-wide / HQ',
        e.vendor_name || '',
        e.status,
        e.status === 'void' && e.void_reason ? `VOID: ${e.void_reason}` : e.notes || '',
      ]
        .map(escapeCsvCell)
        .join(','),
    );
  }

  return lines.join('\r\n');
}
