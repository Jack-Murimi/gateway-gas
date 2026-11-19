'use client';

import { useRef } from 'react';
import { Minus, Package, Plus, X } from 'lucide-react';
import type { BranchInventory, Product } from '@/types';
import { formatKES } from '@/lib/formatters';
import { PosProductSearch } from '@/components/pos/pos-product-search';

export type InvoiceLineDraft = {
  key: string;
  product_id: string;
  description: string;
  quantity: string;
  unit_cost_kes: string;
  track_stock: boolean;
};

const COLS = 'md:grid-cols-[minmax(0,1fr)_92px_96px_92px_68px_28px]';
const cell = 'h-7 w-full rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30';
const tag = 'mb-px block text-[9px] font-semibold uppercase tracking-wide text-slate-400 md:hidden';

interface Props {
  lines: InvoiceLineDraft[];
  products: Product[];
  inventory: BranchInventory[];
  branchId: string;
  onAddProduct: (product: Product) => void;
  onAddCustom: () => void;
  onChange: (key: string, patch: Partial<InvoiceLineDraft>) => void;
  onRemove: (key: string) => void;
}

export function PurchaseInvoiceItems({
  lines, products, inventory, branchId, onAddProduct, onAddCustom, onChange, onRemove,
}: Props) {
  const searchRef = useRef<HTMLInputElement>(null);
  const inCart = new Set(lines.map(l => l.product_id).filter(Boolean));
  const units = lines.reduce((sum, l) => sum + (Number(l.quantity) || 0), 0);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1.5">
        <div className="min-w-0 flex-1">
          <PosProductSearch products={products} inventory={inventory} branchId={branchId} inCart={inCart} inputRef={searchRef} onPick={onAddProduct} />
        </div>
        <button
          type="button" onClick={onAddCustom}
          className="inline-flex h-9 shrink-0 items-center gap-1 rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <Plus className="h-3.5 w-3.5" />Custom line
        </button>
      </div>

      {lines.length === 0 ? (
        <div className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-300 bg-white px-3 py-6 text-xs text-slate-500">
          <Package className="h-4 w-4 text-slate-300" />No items
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
            <div className={`hidden gap-x-1.5 border-b border-slate-300 bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:grid ${COLS}`}>
              <span>Item / description</span><span>Qty</span><span className="text-right">Unit cost</span><span className="text-right">Total</span><span className="text-center">Stock</span><span />
            </div>
            <ul className="divide-y divide-slate-200">
              {lines.map((line, i) => {
                const product = products.find(p => p.id === line.product_id);
                const qty = Number(line.quantity) || 0;
                const cost = Number(line.unit_cost_kes) || 0;
                const stepQty = (delta: number) => onChange(line.key, { quantity: String(Math.max(1, Math.round(qty + delta))) });

                return (
                  <li key={line.key} className={`grid grid-cols-12 items-end gap-x-1.5 gap-y-1 px-2 py-1.5 odd:bg-white even:bg-slate-50/60 md:items-center ${COLS}`}>
                    <div className="order-1 col-span-10 min-w-0 md:order-none md:col-span-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-xs tabular-nums text-slate-400">{lines.length - i}</span>
                        <input
                          required aria-label={`Description for line ${lines.length - i}`}
                          value={line.description}
                          onChange={e => onChange(line.key, { description: e.target.value })}
                          placeholder="Goods or service description"
                          className={`${cell} font-semibold`}
                        />
                      </div>
                      <p className="mt-0.5 truncate pl-4 text-[11px] leading-tight text-slate-500">
                        {product ? `${product.brand}${product.size_kg ? ` ${product.size_kg}kg` : ''} · ${product.category}` : 'Custom / non-stock charge'}
                      </p>
                    </div>

                    <div className="order-3 col-span-4 md:order-none md:col-span-1">
                      <span className={tag}>Qty</span>
                      <div className="flex h-7 items-center rounded border border-slate-300 bg-white">
                        <button type="button" aria-label="Decrease quantity" onClick={() => stepQty(-1)} disabled={qty <= 1} className="flex h-full w-6 shrink-0 items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Minus className="h-3 w-3" /></button>
                        <input
                          required aria-label={`Quantity for ${line.description || 'line'}`} type="number" min="0.001" step="any" inputMode="decimal"
                          value={line.quantity} onFocus={e => e.currentTarget.select()}
                          onChange={e => onChange(line.key, { quantity: e.target.value })}
                          className="h-full min-w-0 flex-1 border-x border-slate-200 text-center text-xs font-semibold tabular-nums outline-none focus:bg-orange-50"
                        />
                        <button type="button" aria-label="Increase quantity" onClick={() => stepQty(1)} className="flex h-full w-6 shrink-0 items-center justify-center text-slate-600 hover:bg-slate-100"><Plus className="h-3 w-3" /></button>
                      </div>
                    </div>

                    <div className="order-4 col-span-4 md:order-none md:col-span-1">
                      <span className={tag}>Unit cost</span>
                      <input
                        required aria-label={`Unit cost for ${line.description || 'line'}`} type="number" min="0" step="0.01" inputMode="decimal"
                        value={line.unit_cost_kes} placeholder="0"
                        onFocus={e => e.currentTarget.select()}
                        onChange={e => onChange(line.key, { unit_cost_kes: e.target.value })}
                        className={`${cell} text-right font-semibold tabular-nums`}
                      />
                    </div>

                    <div className="order-6 col-span-6 text-right md:order-none md:col-span-1">
                      <span className={tag}>Total</span>
                      <p className="flex h-7 items-center justify-end text-[13px] font-semibold tabular-nums text-slate-950">{formatKES(qty * cost)}</p>
                    </div>

                    <div className="order-5 col-span-4 md:order-none md:col-span-1">
                      <span className={tag}>Add to stock</span>
                      <label className={`flex h-7 items-center justify-center gap-1 text-xs ${product ? 'cursor-pointer text-slate-700' : 'text-slate-300'}`}>
                        <input
                          type="checkbox" checked={line.track_stock} disabled={!product}
                          onChange={e => onChange(line.key, { track_stock: e.target.checked })}
                        />
                        <span className="md:hidden">Stock</span>
                      </label>
                    </div>

                    <button
                      type="button" aria-label={`Remove ${line.description || 'line'}`} onClick={() => onRemove(line.key)}
                      className="order-2 col-span-2 flex h-7 items-center justify-center justify-self-end rounded text-slate-400 hover:bg-red-100 hover:text-red-600 md:order-none md:col-span-1 md:w-7"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <p className="text-right text-[11px] text-slate-500">{lines.length} {lines.length === 1 ? 'line' : 'lines'} · {units} {units === 1 ? 'unit' : 'units'}</p>
        </>
      )}
    </div>
  );
}
