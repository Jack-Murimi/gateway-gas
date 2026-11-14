import { NextResponse } from 'next/server';
import { INITIAL_BRANCHES, INITIAL_INVENTORY, INITIAL_ORDERS, INITIAL_PRODUCTS } from '@/lib/mock-data';
import { getSalesTrendData, getSalesByBranchData, getSalesByProductData, getStockLevelData } from '@/lib/dashboard/aggregates';

function toMonthKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function GET() {
  // Aggregate query layer: in production this would query Supabase/Postgres.
  // Here we aggregate from the canonical mock dataset and return plain arrays.
  const branches = INITIAL_BRANCHES.filter((b) => b.is_active);
  const orders = INITIAL_ORDERS;
  const products = INITIAL_PRODUCTS;
  const inventory = INITIAL_INVENTORY;
  const currentMonth = toMonthKey(new Date().toISOString());
  const monthLabel = new Intl.DateTimeFormat('en-KE', { month: 'long', year: 'numeric' }).format(new Date());

  const salesByProductByBranch: Record<string, ReturnType<typeof getSalesByProductData>> = {
    all: getSalesByProductData(orders, products, { branchId: 'all', month: currentMonth }),
  };
  branches.forEach((b) => {
    salesByProductByBranch[b.id] = getSalesByProductData(orders, products, { branchId: b.id, month: currentMonth });
  });

  const payload = {
    branches: branches.map((b) => ({ id: b.id, name: b.name, code: b.code })),
    currentMonth,
    monthLabel,
    salesTrendDay: getSalesTrendData(orders, branches, { granularity: 'day', branchId: 'all', days: 14 }),
    salesTrendMonth: getSalesTrendData(orders, branches, { granularity: 'month', branchId: 'all', months: 6 }),
    salesByBranch: getSalesByBranchData(orders, branches, currentMonth),
    salesByProductByBranch,
    stockLevels: getStockLevelData(inventory, branches, { reorderThreshold: 20 }),
  };

  return NextResponse.json(payload);
}
