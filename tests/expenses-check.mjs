import assert from 'node:assert/strict';
import fs from 'node:fs';
import { registerHooks } from 'node:module';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(import.meta.dirname, '..');

registerHooks({
  resolve(specifier, context, nextResolve) {
    if (specifier.startsWith('@/')) {
      const target = path.join(root, 'src', specifier.slice(2));
      const candidates = [target, `${target}.ts`, path.join(target, 'index.ts')];
      const filePath = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).isFile());
      if (filePath) return { url: pathToFileURL(filePath).href, shortCircuit: true };
    }
    return nextResolve(specifier, context);
  },
});

const {
  validateExpenseDraft,
  normalizePlateNumber,
  summarizeExpensesByCategory,
  summarizeExpensesByBike,
  summarizeExpensesByBranch,
  summarizeSalariesByStaff,
  summarizeExpensesByPaymentMethod,
  buildExpensesCsv,
} = await import('../src/lib/expenses.ts');

const baseDraft = {
  expense_date: '2026-11-21',
  category: 'fuel',
  amount_kes: '1500',
  payment_method: 'mpesa',
  payment_reference: 'SJK123456',
  branch_id: 'b1',
  bike_id: 'bike-1',
  staff_id: 'rider-1',
  vendor_name: 'Rubis Ngong Rd',
  description: 'Morning petrol refill',
  fuel_litres: '8.5',
  odometer_km: '24500',
  salary_period: '',
  notes: '',
};

// 1. Validation rules
assert.deepEqual(validateExpenseDraft(baseDraft), { ok: true });

// Fuel MUST require a specific bike
const fuelNoBike = validateExpenseDraft({ ...baseDraft, category: 'fuel', bike_id: '' });
assert.equal(fuelNoBike.ok, false);

// Bike service MUST require a specific bike
const serviceNoBike = validateExpenseDraft({ ...baseDraft, category: 'bike_service', bike_id: '', fuel_litres: '' });
assert.equal(serviceNoBike.ok, false);

// Salaries and other expenses do NOT require a bike
assert.deepEqual(
  validateExpenseDraft({
    ...baseDraft,
    category: 'salary',
    bike_id: '',
    fuel_litres: '',
    odometer_km: '',
    salary_period: '2026-11',
    description: 'November salary',
  }),
  { ok: true },
);
assert.deepEqual(
  validateExpenseDraft({
    ...baseDraft,
    category: 'other',
    bike_id: '',
    fuel_litres: '',
    odometer_km: '',
    description: 'Security padlock replacement',
  }),
  { ok: true },
);

// Non-positive amount rejected
assert.equal(validateExpenseDraft({ ...baseDraft, amount_kes: '0' }).ok, false);
assert.equal(validateExpenseDraft({ ...baseDraft, amount_kes: '-500' }).ok, false);

// Blank description rejected
assert.equal(validateExpenseDraft({ ...baseDraft, description: '   ' }).ok, false);

// Plate normalization
assert.equal(normalizePlateNumber('  kmd   421b '), 'KMD 421B');

// 2. Aggregations & voided exclusion
const branches = [
  { id: 'b1', name: 'Nextgen', code: 'NXG-01', location_estate: 'Nextgen', contact_phone: '', is_active: true },
  { id: 'b2', name: 'Lavington', code: 'LVN-02', location_estate: 'Lavington', contact_phone: '', is_active: true },
];
const staff = [
  { id: 's1', email: 'r1@gg.co.ke', full_name: 'John Kimani', role: 'rider', approval_status: 'approved', branch_id: 'b1' },
  { id: 's2', email: 'op@gg.co.ke', full_name: 'Brian Ochieng', role: 'operator', approval_status: 'approved', branch_id: 'b2' },
];
const bikes = [
  { id: 'bike-1', plate_number: 'KMD 421B', model: 'Boxer 150', branch_id: 'b1', assigned_rider_id: 's1', is_active: true },
  { id: 'bike-2', plate_number: 'KMH 988C', model: 'TVS HLX', branch_id: 'b2', assigned_rider_id: null, is_active: true },
];

const expenses = [
  {
    id: 'e1',
    expense_date: '2026-11-20',
    category: 'fuel',
    amount_kes: 1500,
    payment_method: 'mpesa',
    branch_id: 'b1',
    bike_id: 'bike-1',
    staff_id: 's1',
    description: 'Fuel fill',
    fuel_litres: 8.5,
    odometer_km: 12000,
    status: 'posted',
    created_at: '2026-11-20T08:00:00Z',
    updated_at: '2026-11-20T08:00:00Z',
    bike: { id: 'bike-1', plate_number: 'KMD 421B', model: 'Boxer 150' },
    branch: { id: 'b1', name: 'Nextgen', code: 'NXG-01' },
  },
  {
    id: 'e2',
    expense_date: '2026-11-21',
    category: 'bike_service',
    amount_kes: 3200,
    payment_method: 'cash',
    branch_id: 'b1',
    bike_id: 'bike-1',
    description: 'Oil & brake pads',
    odometer_km: 12400,
    status: 'posted',
    created_at: '2026-11-21T09:00:00Z',
    updated_at: '2026-11-21T09:00:00Z',
    bike: { id: 'bike-1', plate_number: 'KMD 421B', model: 'Boxer 150' },
    branch: { id: 'b1', name: 'Nextgen', code: 'NXG-01' },
  },
  {
    id: 'e3',
    expense_date: '2026-11-21',
    category: 'salary',
    amount_kes: 25000,
    payment_method: 'bank_transfer',
    branch_id: 'b2',
    staff_id: 's2',
    salary_period: '2026-11',
    description: 'November salary, Brian',
    status: 'posted',
    created_at: '2026-11-21T10:00:00Z',
    updated_at: '2026-11-21T10:00:00Z',
    branch: { id: 'b2', name: 'Lavington', code: 'LVN-02' },
    staff: { id: 's2', full_name: 'Brian Ochieng', role: 'operator' },
  },
  {
    id: 'e4',
    expense_date: '2026-11-21',
    category: 'fuel',
    amount_kes: 9999,
    payment_method: 'cash',
    branch_id: 'b1',
    bike_id: 'bike-1',
    description: 'Mistaken duplicate fuel',
    status: 'void',
    void_reason: 'Duplicate entry',
    created_at: '2026-11-21T11:00:00Z',
    updated_at: '2026-11-21T11:05:00Z',
  },
];

const byCat = summarizeExpensesByCategory(expenses);
assert.equal(byCat.length, 3);
assert.equal(byCat[0].category, 'salary');
assert.equal(byCat[0].total_kes, 25000);
assert.equal(byCat.find((c) => c.category === 'fuel')?.total_kes, 1500); // voided excluded!

const byBike = summarizeExpensesByBike(bikes, expenses, branches, staff);
assert.equal(byBike[0].plate_number, 'KMD 421B');
assert.equal(byBike[0].fuel_kes, 1500);
assert.equal(byBike[0].fuel_litres, 8.5);
assert.equal(byBike[0].service_kes, 3200);
assert.equal(byBike[0].total_kes, 4700);
assert.equal(byBike[0].last_odometer_km, 12400);

const byBranch = summarizeExpensesByBranch(expenses, branches);
assert.equal(byBranch[0].branch_name, 'Lavington');
assert.equal(byBranch[0].total_kes, 25000);

const byStaff = summarizeSalariesByStaff(expenses, staff);
assert.equal(byStaff.length, 1);
assert.equal(byStaff[0].staff_name, 'Brian Ochieng');
assert.equal(byStaff[0].salary_kes, 25000);

const byMethod = summarizeExpensesByPaymentMethod(expenses);
assert.equal(byMethod.find((m) => m.payment_method === 'bank_transfer')?.total_kes, 25000);
assert.equal(byMethod.find((m) => m.payment_method === 'cash')?.total_kes, 3200);

// 3. CSV export escaping (handles comma in description)
const csv = buildExpensesCsv(expenses);
assert.ok(csv.includes('"November salary, Brian"'));
assert.ok(csv.includes('KMD 421B'));
assert.ok(csv.includes('VOID: Duplicate entry'));

console.log('Expenses validation, bike/category/salary aggregations, and CSV export assertions passed.');
