import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSalesTrendData, getSalesByBranchData, getSalesByProductData, getStockLevelData } from '@/lib/dashboard/aggregates';
import { Branch, BranchInventory, Order, Product } from '@/types';

function toMonthKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

export async function GET() {
  try {
    const supabase = await createClient();

    const [branchesRes, productsRes, inventoryRes, ordersRes] = await Promise.all([
      supabase.from('branches').select('*').eq('is_active', true).order('code'),
      supabase.from('products').select('*').eq('is_active', true),
      supabase.from('branch_inventory').select('*'),
      supabase.from('orders').select('*, items:order_items(*)').order('created_at', { ascending: false }),
    ]);

    if (branchesRes.error) throw branchesRes.error;
    if (productsRes.error) throw productsRes.error;
    if (inventoryRes.error) throw inventoryRes.error;
    if (ordersRes.error) throw ordersRes.error;

    const branches = (branchesRes.data || []) as Branch[];
    const products = (productsRes.data || []) as Product[];
    const inventory = (inventoryRes.data || []) as BranchInventory[];
    const orders = (ordersRes.data || []) as Order[];

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
  } catch (error) {
    console.error('Dashboard charts API error:', error);
    return NextResponse.json({ error: 'Failed to load dashboard chart data' }, { status: 500 });
  }
}
