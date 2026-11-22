'use client';

import { AlertTriangle, Minus, Plus, RotateCcw, X } from 'lucide-react';
import type { Branch, OrderType, Product } from '@/types';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import { CYLINDER_BRANDS, WATER_BRANDS } from './pos-ui';
import { groupReturns, resizeReturns } from './pos-logic';

export interface PosLine {
  id: string;
  productId: string;
  productName: string;
  category: Product['category'];
  orderType: OrderType;
  outgoingBrand: string;
  cylinderSizeKg: number | null;
  quantity: number;
  unitPrice: number;
  listPrice: number;
  /** One returned-empty brand per unit sold (refill lines only). */
  returns: string[];
  branchId: string;
}

export const listPriceFor = (product: Product, type: OrderType) =>
  Number(type === 'refill' ? product.refill_price_kes : type === 'complete' ? product.complete_price_kes : product.accessory_price_kes || product.complete_price_kes) || 0;

export function newLine(product: Product, branchId: string): PosLine {
  const returnable = hasEmptyState(product);
  const orderType: OrderType = returnable ? 'refill' : 'accessory';
  const price = listPriceFor(product, orderType);
  return {
    id: `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    productId: product.id, productName: product.name, category: product.category, orderType,
    outgoingBrand: product.brand, cylinderSizeKg: product.size_kg, quantity: 1,
    unitPrice: price, listPrice: price, returns: returnable ? [product.brand] : [], branchId,
  };
}

const COLS = 'md:grid-cols-[minmax(0,1fr)_92px_92px_84px_84px_minmax(0,150px)_28px]';
const cell = 'h-7 w-full rounded border border-slate-300 bg-white px-1.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30';
const tag = 'mb-px block text-[9px] font-semibold uppercase tracking-wide text-slate-400 md:hidden';

interface RowProps {
  line: PosLine;
  index: number;
  product?: Product;
  branches: Branch[];
  available: number;
  isHistorical?: boolean;
  onChange: (patch: Partial<PosLine>) => void;
  onRemove: () => void;
}

function PosCartRow({ line, index, product, branches, available, isHistorical = false, onChange, onRemove }: RowProps) {
  const returnable = product ? hasEmptyState(product) : line.orderType === 'refill';
  const edited = line.unitPrice !== line.listPrice;
  const outOfStock = !isHistorical && line.quantity > available;
  const isRefill = line.orderType === 'refill';
  const baseBrands = line.category === 'water' ? WATER_BRANDS : CYLINDER_BRANDS;
  const brandOptions = Array.from(new Set([line.outgoingBrand, ...baseBrands, ...line.returns]));
  const size = line.cylinderSizeKg ? `${line.cylinderSizeKg}kg` : '';

  const setQty = (raw: number) => {
    const quantity = Math.max(1, Math.floor(raw) || 1);
    onChange({ quantity, returns: isRefill ? resizeReturns(line.returns, quantity, line.outgoingBrand) : [] });
  };
  const setType = (orderType: OrderType) => {
    if (!product || orderType === line.orderType) return;
    const price = listPriceFor(product, orderType);
    onChange({ orderType, unitPrice: price, listPrice: price, returns: orderType === 'refill' ? resizeReturns([], line.quantity, line.outgoingBrand) : [] });
  };
  const setReturn = (i: number, brand: string) => onChange({ returns: line.returns.map((b, n) => (n === i ? brand : b)) });
  const summary = groupReturns(line.returns).map(r => `${r.brand}×${r.quantity}`).join(', ');

  return (
    <li className={`grid grid-cols-12 items-end gap-x-1.5 gap-y-1 px-2 py-1.5 md:items-center ${COLS} ${outOfStock ? 'bg-red-50' : 'odd:bg-white even:bg-slate-50/60'}`}>
      <div className="order-1 col-span-10 min-w-0 md:order-none md:col-span-1">
        <p className="truncate text-[13px] font-semibold leading-tight text-slate-900">
          <span className="mr-1.5 font-normal tabular-nums text-slate-400">{index}</span>{line.productName}
        </p>
        <p className={`flex items-center gap-1 truncate text-[11px] leading-tight ${outOfStock ? 'font-semibold text-red-600' : isHistorical ? 'text-sky-700' : 'text-slate-500'}`}>
          {outOfStock && <AlertTriangle className="h-3 w-3 shrink-0" />}
          {line.outgoingBrand}{size && ` ${size}`} · {isHistorical ? 'Pre-cutoff (no stock impact)' : outOfStock ? `only ${available} in stock` : `${available} in stock`}
          {branches.length > 1 && (
            <select aria-label="Stock location" value={line.branchId} onChange={e => onChange({ branchId: e.target.value })} className="ml-1 max-w-[110px] truncate rounded border border-slate-200 bg-white px-0.5 text-[10px] text-slate-600">
              {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          )}
        </p>
      </div>

      <div className="order-3 col-span-4 md:order-none md:col-span-1">
        <span className={tag}>Type</span>
        {returnable ? (
          <select aria-label={`Sale type for ${line.productName}`} value={line.orderType} onChange={e => setType(e.target.value as OrderType)} className={cell}>
            <option value="refill">Exchange</option>
            <option value="complete">New</option>
          </select>
        ) : <span className="flex h-7 items-center text-xs text-slate-500">Direct</span>}
      </div>

      <div className="order-4 col-span-4 md:order-none md:col-span-1">
        <span className={tag}>Qty</span>
        <div className="flex h-7 items-center rounded border border-slate-300 bg-white">
          <button type="button" aria-label="Decrease quantity" onClick={() => setQty(line.quantity - 1)} disabled={line.quantity <= 1} className="flex h-full w-6 shrink-0 items-center justify-center text-slate-600 hover:bg-slate-100 disabled:opacity-30"><Minus className="h-3 w-3" /></button>
          <input
            aria-label={`Quantity for ${line.productName}`} type="number" min="1" step="1" inputMode="numeric" value={line.quantity}
            onFocus={e => e.currentTarget.select()} onChange={e => setQty(Number(e.target.value))}
            className="h-full min-w-0 flex-1 border-x border-slate-200 text-center text-xs font-semibold tabular-nums outline-none focus:bg-orange-50"
          />
          <button type="button" aria-label="Increase quantity" onClick={() => setQty(line.quantity + 1)} className="flex h-full w-6 shrink-0 items-center justify-center text-slate-600 hover:bg-slate-100"><Plus className="h-3 w-3" /></button>
        </div>
      </div>

      <div className="order-5 col-span-4 md:order-none md:col-span-1">
        <span className={tag}>Price</span>
        <div className="relative">
          <input
            aria-label={`Unit price for ${line.productName}`} type="number" min="0" step="1" inputMode="decimal" value={line.unitPrice}
            onFocus={e => e.currentTarget.select()} onChange={e => onChange({ unitPrice: Math.max(0, Number(e.target.value) || 0) })}
            className={`${cell} text-right font-semibold tabular-nums ${edited ? 'border-amber-400 bg-amber-50 pl-5' : ''}`}
          />
          {edited && (
            <button type="button" title={`Reset to list price ${formatKES(line.listPrice)}`} aria-label="Reset to list price" onClick={() => onChange({ unitPrice: line.listPrice })} className="absolute left-0.5 top-1/2 -translate-y-1/2 rounded p-0.5 text-amber-700 hover:bg-amber-100">
              <RotateCcw className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <div className="order-7 col-span-4 text-right md:order-none md:col-span-1">
        <span className={tag}>Total</span>
        <p className="flex h-7 items-center justify-end text-[13px] font-semibold tabular-nums text-slate-950">{formatKES(line.quantity * line.unitPrice)}</p>
      </div>

      <div className="order-6 col-span-8 min-w-0 md:order-none md:col-span-1">
        {isRefill ? (
          <>
            <span className={tag}>Empty returned</span>
            {line.quantity === 1 ? (
              <select aria-label={`Returned empty for ${line.productName}`} value={line.returns[0] ?? line.outgoingBrand} onChange={e => setReturn(0, e.target.value)} className={cell}>
                {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            ) : (
              <select aria-label="Set all returned empties to one brand" value="" onChange={e => e.target.value && onChange({ returns: line.returns.map(() => e.target.value) })} className={cell} title={summary}>
                <option value="">{summary || 'Set all…'}</option>
                {brandOptions.map(b => <option key={b} value={b}>All {b}</option>)}
              </select>
            )}
          </>
        ) : <span className="hidden h-7 items-center text-xs text-slate-300 md:flex">—</span>}
      </div>

      <button type="button" aria-label={`Remove ${line.productName}`} onClick={onRemove} className="order-2 col-span-2 flex h-7 items-center justify-center justify-self-end rounded text-slate-400 hover:bg-red-100 hover:text-red-600 md:order-none md:col-span-1 md:w-7">
        <X className="h-4 w-4" />
      </button>

      {isRefill && line.quantity > 1 && (
        <div className="order-8 col-span-12 flex flex-wrap items-center gap-1 md:order-none md:col-span-full md:pl-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Empties</span>
          {line.returns.map((brand, i) => (
            <label key={i} className="flex items-center gap-0.5">
              <span className="w-3 text-right text-[10px] tabular-nums text-slate-400">{i + 1}</span>
              <select aria-label={`Returned empty ${i + 1} for ${line.productName}`} value={brand} onChange={e => setReturn(i, e.target.value)} className="h-6 w-[88px] rounded border border-slate-300 bg-white px-1 text-[11px] text-slate-900 outline-none focus:border-orange-500">
                {brandOptions.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          ))}
        </div>
      )}
    </li>
  );
}

interface TableProps {
  lines: PosLine[];
  products: Product[];
  branches: Branch[];
  availableFor: (line: PosLine) => number;
  isHistoricalFor?: (line: PosLine) => boolean;
  onChange: (id: string, patch: Partial<PosLine>) => void;
  onRemove: (id: string) => void;
}

export function PosCartTable({ lines, products, branches, availableFor, isHistoricalFor, onChange, onRemove }: TableProps) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-300 bg-white">
      <div className={`hidden gap-x-1.5 border-b border-slate-300 bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-500 md:grid ${COLS}`}>
        <span>Product</span><span>Type</span><span>Qty</span><span className="text-right">Price</span><span className="text-right">Total</span><span>Empty returned</span><span />
      </div>
      <ul className="divide-y divide-slate-200">
        {lines.map((line, i) => (
          <PosCartRow
            key={line.id} line={line} index={lines.length - i} product={products.find(p => p.id === line.productId)} branches={branches}
            available={availableFor(line)} isHistorical={isHistoricalFor ? isHistoricalFor(line) : false} onChange={patch => onChange(line.id, patch)} onRemove={() => onRemove(line.id)}
          />
        ))}
      </ul>
    </div>
  );
}
