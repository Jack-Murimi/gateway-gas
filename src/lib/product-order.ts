import type { Product } from '@/types';
import { hasEmptyState } from '@/lib/formatters';

const GAS_BRAND_ORDER = [
  'afrigas',
  'k-gas',
  'total',
  'ola',
  'progas',
  'tosha',
  'lake',
  'hashi',
  'supa',
  'sea',
  'jatel',
  'raha',
] as const;

const GAS_BRAND_ALIASES: Record<string, string> = {
  kgas: 'k-gas',
  'k gas': 'k-gas',
  seagas: 'sea',
  'sea gas': 'sea',
  supagas: 'supa',
  'supa gas': 'supa',
  lakegas: 'lake',
  'lake gas': 'lake',
  hashigas: 'hashi',
  'hashi gas': 'hashi',
  toshagas: 'tosha',
  'tosha gas': 'tosha',
};

const WATER_BRAND_ORDER = ['keringet', 'aquamist'] as const;

export interface ProductGroupMeta {
  key: string;
  label: string;
  order: number;
  subOrder: number;
}

export interface ProductGroup<T> {
  key: string;
  label: string;
  items: T[];
}

function normalizeBrand(brand: string | null | undefined): string {
  const cleaned = (brand ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  return GAS_BRAND_ALIASES[cleaned] ?? cleaned;
}

function gasBrandRank(brand: string | null | undefined): number {
  const normalized = normalizeBrand(brand);
  if (normalized === 'bonoko') return GAS_BRAND_ORDER.length + 1;
  const idx = GAS_BRAND_ORDER.indexOf(normalized as (typeof GAS_BRAND_ORDER)[number]);
  return idx === -1 ? GAS_BRAND_ORDER.length : idx;
}

function waterBrandRank(brand: string | null | undefined): number {
  const normalized = (brand ?? '').trim().toLowerCase();
  const idx = WATER_BRAND_ORDER.indexOf(normalized as (typeof WATER_BRAND_ORDER)[number]);
  return idx === -1 ? WATER_BRAND_ORDER.length : idx;
}

function parseWaterVolumeLiters(product: Product): number {
  const match = product.name.match(/(\d+(?:\.\d+)?)\s*(ml|l)\b/i);
  if (match) {
    const value = Number(match[1]);
    if (Number.isFinite(value)) {
      return match[2].toLowerCase() === 'ml' ? value / 1000 : value;
    }
  }
  return product.size_kg ?? Number.POSITIVE_INFINITY;
}

function accessoryRank(product: Product): number {
  const name = product.name.toLowerCase();
  if (name.includes('regulator')) {
    if (/\b13\s*kg\b/.test(name)) return 0;
    if (/\b6\s*kg\b/.test(name)) return 1;
    return 2;
  }
  if (name.includes('burner')) return 3;
  if (name.includes('grill') || name.includes('trivet')) return 4;
  if (name.includes('clip')) return 6;
  if (name.includes('pipe') || name.includes('hose')) return 5;
  return 7;
}

export function getProductGroup(product: Product): ProductGroupMeta {
  if (product.category === 'cylinder') {
    if (product.size_kg !== null && product.size_kg !== undefined && product.size_kg > 0) {
      return {
        key: `gas-${product.size_kg}`,
        label: `${product.size_kg}kg Gas`,
        order: 0,
        subOrder: product.size_kg,
      };
    }
    return {
      key: 'gas-other',
      label: 'Other Gas',
      order: 0,
      subOrder: Number.POSITIVE_INFINITY,
    };
  }

  if (product.category === 'water') {
    if (hasEmptyState(product)) {
      return {
        key: 'water-container',
        label: 'Water (with containers)',
        order: 1,
        subOrder: 0,
      };
    }
    return {
      key: 'water-other',
      label: 'Other Water',
      order: 2,
      subOrder: 0,
    };
  }

  if (product.category === 'accessory') {
    return {
      key: 'accessory',
      label: 'Accessories',
      order: 3,
      subOrder: 0,
    };
  }

  return {
    key: 'other',
    label: 'Other Products',
    order: 4,
    subOrder: 0,
  };
}

export function compareProducts(a: Product, b: Product): number {
  const ga = getProductGroup(a);
  const gb = getProductGroup(b);

  if (ga.order !== gb.order) return ga.order - gb.order;
  if (ga.subOrder !== gb.subOrder) return ga.subOrder - gb.subOrder;

  if (a.category === 'cylinder' && b.category === 'cylinder') {
    const rankDiff = gasBrandRank(a.brand) - gasBrandRank(b.brand);
    if (rankDiff !== 0) return rankDiff;
    const brandDiff = a.brand.localeCompare(b.brand);
    if (brandDiff !== 0) return brandDiff;
    return a.name.localeCompare(b.name);
  }

  if (a.category === 'water' && b.category === 'water') {
    const rankDiff = waterBrandRank(a.brand) - waterBrandRank(b.brand);
    if (rankDiff !== 0) return rankDiff;
    const brandDiff = a.brand.localeCompare(b.brand);
    if (brandDiff !== 0) return brandDiff;
    const volDiff = parseWaterVolumeLiters(a) - parseWaterVolumeLiters(b);
    if (volDiff !== 0) return volDiff;
    return a.name.localeCompare(b.name);
  }

  if (a.category === 'accessory' && b.category === 'accessory') {
    const rankDiff = accessoryRank(a) - accessoryRank(b);
    if (rankDiff !== 0) return rankDiff;
    const aStd = a.name.toLowerCase().includes('standard') ? 0 : 1;
    const bStd = b.name.toLowerCase().includes('standard') ? 0 : 1;
    if (aStd !== bStd) return aStd - bStd;
    return a.name.localeCompare(b.name);
  }

  return a.name.localeCompare(b.name);
}

export function sortProducts<T extends Product>(products: readonly T[]): T[] {
  return [...products].sort(compareProducts);
}

export function groupProducts<T>(
  items: readonly T[],
  getProduct: (item: T) => Product,
): ProductGroup<T>[] {
  const sorted = [...items].sort((a, b) => compareProducts(getProduct(a), getProduct(b)));
  const groups: ProductGroup<T>[] = [];

  for (const item of sorted) {
    const meta = getProductGroup(getProduct(item));
    const last = groups[groups.length - 1];
    if (last && last.key === meta.key) {
      last.items.push(item);
    } else {
      groups.push({ key: meta.key, label: meta.label, items: [item] });
    }
  }

  return groups;
}
