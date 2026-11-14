import { Branch, BranchInventory, Order, OrderItem, Product } from '@/types';

export type SalesTrendPoint = {
  date: string; // YYYY-MM-DD or YYYY-MM
  label: string;
  total: number;
  [branchId: string]: string | number; // per-branch totals keyed by branch id
};

export type BranchSalesPoint = {
  branchId: string;
  branchName: string;
  total: number;
};

export type ProductSalesPoint = {
  name: string;
  total: number;
};

export type StockLevelPoint = {
  branchId: string;
  branchName: string;
  fullUnits: number;
  reorderThreshold: number;
};

function toDateKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function toMonthKey(iso: string) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function paidOrders(orders: Order[]) {
  return orders.filter((o) => o.payment_status === 'paid');
}

export function getSalesTrendData(
  orders: Order[],
  branches: Branch[],
  opts: { granularity: 'day' | 'month'; branchId?: string | 'all'; days?: number; months?: number }
): SalesTrendPoint[] {
  const { granularity, branchId = 'all', days = 14, months = 6 } = opts;
  const source = paidOrders(orders).filter((o) => branchId === 'all' || o.branch_id === branchId);
  const now = new Date();

  if (granularity === 'day') {
    const keys: string[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(now.getDate() - i);
      keys.push(toDateKey(d.toISOString()));
    }
    return keys.map((key) => {
      const point: SalesTrendPoint = {
        date: key,
        label: new Intl.DateTimeFormat('en-KE', { day: 'numeric', month: 'short' }).format(new Date(key)),
        total: 0,
      };
      branches.forEach((b) => (point[b.id] = 0));
      source.forEach((o) => {
        if (toDateKey(o.created_at) === key) {
          point.total += o.total_kes;
          point[o.branch_id] = (Number(point[o.branch_id]) || 0) + o.total_kes;
        }
      });
      return point;
    });
  }

  const keys: string[] = [];
  for (let i = months - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(toMonthKey(d.toISOString()));
  }
  return keys.map((key) => {
    const [y, m] = key.split('-').map(Number);
    const point: SalesTrendPoint = {
      date: key,
      label: new Intl.DateTimeFormat('en-KE', { month: 'short', year: '2-digit' }).format(new Date(y, m - 1, 1)),
      total: 0,
    };
    branches.forEach((b) => (point[b.id] = 0));
    source.forEach((o) => {
      if (toMonthKey(o.created_at) === key) {
        point.total += o.total_kes;
        point[o.branch_id] = (Number(point[o.branch_id]) || 0) + o.total_kes;
      }
    });
    return point;
  });
}

export function getSalesByBranchData(orders: Order[], branches: Branch[], month?: string): BranchSalesPoint[] {
  const targetMonth = month || toMonthKey(new Date().toISOString());
  const source = paidOrders(orders).filter((o) => toMonthKey(o.created_at) === targetMonth);
  return branches.map((b) => ({
    branchId: b.id,
    branchName: b.name,
    total: source.filter((o) => o.branch_id === b.id).reduce((sum, o) => sum + o.total_kes, 0),
  }));
}

function itemLabel(item: OrderItem, product?: Product): string {
  if (product?.category === 'cylinder' || item.cylinder_size_kg) {
    const size = item.cylinder_size_kg ?? product?.size_kg;
    const base = size ? `${size}kg` : 'Cylinder';
    return item.order_type === 'refill' ? `${base} refill` : `${base} complete`;
  }
  if (product?.category === 'water') return product.size_kg ? `${product.size_kg}L water` : 'Water';
  if (product?.category === 'accessory') return 'Accessories';
  return product?.name || 'Other';
}

export function getSalesByProductData(orders: Order[], products: Product[], opts?: { branchId?: string | 'all'; month?: string }): ProductSalesPoint[] {
  const branchId = opts?.branchId ?? 'all';
  const targetMonth = opts?.month || toMonthKey(new Date().toISOString());
  const source = paidOrders(orders).filter((o) => toMonthKey(o.created_at) === targetMonth && (branchId === 'all' || o.branch_id === branchId));
  const totals = new Map<string, number>();
  for (const order of source) {
    for (const item of order.items || []) {
      const product = products.find((p) => p.id === item.product_id);
      const label = itemLabel(item, product);
      totals.set(label, (totals.get(label) || 0) + item.subtotal_kes);
    }
  }
  return Array.from(totals.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => b.total - a.total);
}

export function getStockLevelData(
  inventory: BranchInventory[],
  branches: Branch[],
  opts?: { reorderThreshold?: number }
): StockLevelPoint[] {
  const reorderThreshold = opts?.reorderThreshold ?? 20; // cylinders full units threshold (branch-level aggregate for chart)
  return branches.map((b) => {
    const rows = inventory.filter((i) => i.branch_id === b.id);
    // Sum full units across all tracked products as branch stock level indicator
    const fullUnits = rows.reduce((sum, i) => sum + i.full_units, 0);
    return { branchId: b.id, branchName: b.name, fullUnits, reorderThreshold };
  });
}
