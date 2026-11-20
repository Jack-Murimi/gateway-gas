'use client';

import { useMemo, useState } from 'react';
import { Check, Package, Search, X } from 'lucide-react';
import type { BranchInventory, Product } from '@/types';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import { compareProducts } from '@/lib/product-order';
import { fieldClass, labelClass } from './pos-ui';

interface Props {
  products: Product[];
  inventory: BranchInventory[];
  branchId: string;
  inCart: Set<string>;
  inputRef: React.RefObject<HTMLInputElement | null>;
  onPick: (product: Product) => void;
}

const defaultPrice = (p: Product) => (hasEmptyState(p) ? p.refill_price_kes : p.accessory_price_kes || p.complete_price_kes);

export function PosProductSearch({ products, inventory, branchId, inCart, inputRef, onPick }: Props) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(() => {
    const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    return products
      .filter(p => p.is_active && words.every(w => [p.name, p.brand, p.category, p.size_kg ? `${p.size_kg}kg ${p.size_kg}` : ''].join(' ').toLowerCase().includes(w)))
      .sort(compareProducts)
      .slice(0, 8);
  }, [products, query]);

  const pick = (product: Product) => {
    onPick(product);
    setQuery('');
    setOpen(false);
    setActive(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const showList = open && query.trim().length > 0;

  return (
    <div className="relative">
      <label htmlFor="pos-product-search" className="sr-only">Add product</label>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          ref={inputRef}
          id="pos-product-search"
          role="combobox"
          aria-expanded={showList}
          aria-controls="pos-product-results"
          aria-activedescendant={showList && matches[active] ? `pos-product-${matches[active].id}` : undefined}
          autoComplete="off"
          enterKeyHint="done"
          className={`${fieldClass} h-9 pl-8 pr-9`}
          placeholder="Search brand, size or name, e.g. total 13"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onKeyDown={e => {
            if (e.key === 'Escape') setOpen(false);
            else if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => Math.min(matches.length - 1, i + 1)); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => Math.max(0, i - 1)); }
            else if (e.key === 'Enter' && matches[active]) { e.preventDefault(); pick(matches[active]); }
          }}
        />
        {query && (
          <button type="button" aria-label="Clear search" onMouseDown={e => e.preventDefault()} onClick={() => { setQuery(''); inputRef.current?.focus(); }} className="absolute right-1 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 hover:bg-slate-100">
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      {showList && (
        <ul id="pos-product-results" role="listbox" className="absolute z-30 mt-1 max-h-[min(22rem,50dvh)] w-full overflow-y-auto rounded-md border border-slate-300 bg-white shadow-xl">
          {matches.length ? matches.map((p, i) => {
            const stock = inventory.find(r => r.branch_id === branchId && r.product_id === p.id)?.full_units ?? 0;
            return (
              <li key={p.id} role="option" id={`pos-product-${p.id}`} aria-selected={i === active}>
                <button
                  type="button"
                  onMouseDown={e => e.preventDefault()}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(p)}
                  className={`flex min-h-9 w-full items-center justify-between gap-3 border-b border-slate-100 px-2.5 py-1 text-left last:border-0 ${i === active ? 'bg-orange-50' : ''}`}
                >
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5 truncate text-[13px] font-medium text-slate-900">
                      {p.name}
                      {inCart.has(p.id) && <span className="inline-flex items-center gap-0.5 rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-700"><Check className="h-3 w-3" />In sale</span>}
                    </span>
                    <span className={`text-[11px] ${stock > 0 ? 'text-slate-500' : 'font-medium text-red-600'}`}>
                      {p.brand}{p.size_kg ? ` · ${p.size_kg}kg` : ''} · {stock > 0 ? `${stock} in stock` : 'Out of stock'}
                    </span>
                  </span>
                  <span className="shrink-0 text-[13px] font-semibold tabular-nums text-slate-900">{formatKES(defaultPrice(p))}</span>
                </button>
              </li>
            );
          }) : (
            <li className="flex items-center gap-2 p-4 text-sm text-slate-500"><Package className="h-4 w-4" />No active product matches “{query.trim()}”.</li>
          )}
        </ul>
      )}
    </div>
  );
}
