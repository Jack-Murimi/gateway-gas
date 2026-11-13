'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Product, OrderType } from '@/types';
import {
  Search, Plus, Minus, Trash2, Repeat, Package, X, Check, ChevronDown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKES, hasEmptyState } from '@/lib/formatters';

export interface PosCartItem {
  id: string;
  productId: string;
  productName: string;
  orderType: OrderType;
  outgoingBrand: string;
  incomingBrand: string;
  cylinderSizeKg: number | null;
  quantity: number;
  unitPrice: number;
}

interface PosItemsStepProps {
  products: Product[];
  cart: PosCartItem[];
  onAddToCart: (item: PosCartItem) => void;
  onUpdateCartQty: (id: string, delta: number) => void;
  onRemoveFromCart: (id: string) => void;
}

const inputClass =
  'min-h-[48px] w-full rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900 ' +
  'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20';

export function PosItemsStep({
  products,
  cart,
  onAddToCart,
  onUpdateCartQty,
  onRemoveFromCart,
}: PosItemsStepProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProduct, setActiveProduct] = useState<Product | null>(null);
  const [itemType, setItemType] = useState<OrderType>('refill');
  const [incomingTareBrand, setIncomingTareBrand] = useState('');
  const [itemQuantity, setItemQuantity] = useState('1');
  const [unitPrice, setUnitPrice] = useState('');
  const [resultsOpen, setResultsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const filteredProducts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    if (!query) return [];
    return products
      .filter((product) => product.is_active)
      .filter((product) => {
        const haystack = [product.name, product.brand, product.category, product.size_kg ? `${product.size_kg}kg` : '']
          .join(' ')
          .toLowerCase();
        return haystack.includes(query);
      })
      .slice(0, 10);
  }, [products, searchQuery]);

  const chooseProduct = (product: Product) => {
    setActiveProduct(product);
    setSearchQuery(product.name);
    setResultsOpen(false);
    const returnable = hasEmptyState(product);
    const nextType: OrderType = returnable ? 'refill' : 'accessory';
    setItemType(nextType);
    setIncomingTareBrand(returnable ? product.brand : '');
    const price = nextType === 'refill'
      ? product.refill_price_kes
      : (product.accessory_price_kes || product.complete_price_kes);
    setUnitPrice(String(price));
    setItemQuantity('1');
  };

  const clearSelection = () => {
    setActiveProduct(null);
    setSearchQuery('');
    setItemQuantity('1');
    setUnitPrice('');
    setResultsOpen(false);
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  useEffect(() => {
    if (!activeProduct) return;
    const price = itemType === 'refill'
      ? activeProduct.refill_price_kes
      : itemType === 'complete'
        ? activeProduct.complete_price_kes
        : (activeProduct.accessory_price_kes || activeProduct.complete_price_kes);
    setUnitPrice(String(price));
  }, [itemType, activeProduct]);

  const handleAddItem = () => {
    if (!activeProduct) return;
    const quantity = Number(itemQuantity);
    const price = Number(unitPrice);
    if (!Number.isInteger(quantity) || quantity < 1 || !Number.isFinite(price) || price < 0) return;

    const returnable = hasEmptyState(activeProduct);
    onAddToCart({
      id: `cart-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      productId: activeProduct.id,
      productName: activeProduct.name,
      orderType: itemType,
      outgoingBrand: activeProduct.brand,
      incomingBrand: itemType === 'refill' && returnable ? incomingTareBrand : '',
      cylinderSizeKg: activeProduct.size_kg,
      quantity,
      unitPrice: price,
    });
    setActiveProduct(null);
    setSearchQuery('');
    setItemQuantity('1');
    setUnitPrice('');
    requestAnimationFrame(() => searchRef.current?.focus());
  };

  const returnable = activeProduct ? hasEmptyState(activeProduct) : false;
  const validLine = Boolean(activeProduct) &&
    Number.isInteger(Number(itemQuantity)) && Number(itemQuantity) > 0 &&
    Number.isFinite(Number(unitPrice)) && Number(unitPrice) >= 0;

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left sm:p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-lg font-black text-slate-950">Add products</h2>
          <p className="text-sm text-slate-500">Search, set quantity and price, then add the next item.</p>
        </div>
        <div className="rounded-full bg-orange-50 px-3 py-1 text-xs font-bold text-orange-800">
          {cart.length} {cart.length === 1 ? 'line' : 'lines'} in ticket
        </div>
      </div>

      <div className="relative">
        <label htmlFor="pos-product-search" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
          Find a product
        </label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
          <input
            ref={searchRef}
            id="pos-product-search"
            type="search"
            value={searchQuery}
            onChange={(event) => {
              setSearchQuery(event.target.value);
              setActiveProduct(null);
              setResultsOpen(true);
            }}
            onFocus={() => setResultsOpen(true)}
            onKeyDown={(event) => {
              if (event.key === 'Escape') setResultsOpen(false);
              if (event.key === 'Enter' && filteredProducts.length === 1) {
                event.preventDefault();
                chooseProduct(filteredProducts[0]);
              }
            }}
            placeholder="Search brand, cylinder size or product name…"
            autoComplete="off"
            className={inputClass + ' pl-11 pr-11 text-base'}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={clearSelection}
              aria-label="Clear product search"
              className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        {resultsOpen && searchQuery.trim() && !activeProduct && (
          <div className="absolute z-30 mt-2 max-h-72 w-full overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl">
            {filteredProducts.length ? filteredProducts.map((product) => (
              <button
                key={product.id}
                type="button"
                onClick={() => chooseProduct(product)}
                className="flex min-h-[58px] w-full items-center justify-between gap-3 border-b border-slate-100 px-3 py-2.5 text-left last:border-0 hover:bg-orange-50 focus:bg-orange-50 focus:outline-none"
              >
                <span className="min-w-0">
                  <span className="block truncate text-sm font-bold text-slate-900">{product.name}</span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {product.brand}{product.size_kg ? ` · ${product.size_kg}kg` : ''} · {product.category}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-black text-slate-900">
                  {formatKES(hasEmptyState(product) ? product.refill_price_kes : (product.accessory_price_kes || product.complete_price_kes))}
                </span>
              </button>
            )) : (
              <div className="px-4 py-5 text-center text-sm text-slate-500">
                No matching active products. Check the spelling or try the brand/size.
              </div>
            )}
          </div>
        )}
      </div>

      {!activeProduct && (
        <div className="mt-3 flex items-center gap-2 rounded-xl bg-slate-50 px-3 py-3 text-sm text-slate-500">
          <Search className="h-4 w-4 shrink-0" />
          Start typing to find a product. The catalogue stays hidden until you search.
        </div>
      )}

      {activeProduct && (
        <div className="mt-4 rounded-2xl border border-orange-200 bg-orange-50/50 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-xs font-bold uppercase tracking-wide text-orange-700">Selected product</div>
              <div className="mt-1 text-lg font-black text-slate-950">{activeProduct.name}</div>
              <div className="text-sm text-slate-600">
                {activeProduct.brand}{activeProduct.size_kg ? ` · ${activeProduct.size_kg}kg` : ''} · {activeProduct.category}
              </div>
            </div>
            <button type="button" onClick={clearSelection} className="flex min-h-[36px] items-center gap-1 rounded-lg px-2 text-sm font-semibold text-slate-600 hover:bg-white">
              <X className="h-4 w-4" /> Change
            </button>
          </div>

          {returnable && (
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="pos-order-type" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Sale type</label>
                <div className="relative">
                  <select
                    id="pos-order-type"
                    value={itemType}
                    onChange={(event) => setItemType(event.target.value as OrderType)}
                    className={inputClass + ' appearance-none pr-9'}
                  >
                    <option value="refill">Refill / exchange</option>
                    <option value="complete">Complete cylinder (new)</option>
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                </div>
              </div>
              {itemType === 'refill' && (
                <div>
                  <label htmlFor="pos-return-brand" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">
                    Empty cylinder returned
                  </label>
                  <div className="relative">
                    <select
                      id="pos-return-brand"
                      value={incomingTareBrand}
                      onChange={(event) => setIncomingTareBrand(event.target.value)}
                      className={inputClass + ' appearance-none pr-9'}
                    >
                      {['AFRIGAS', 'K-GAS', 'TOTAL', 'OLA', 'PROGAS', 'TOSHA', 'LAKE', 'HASHI', 'SUPA', 'JATEL', 'SEAGAS', 'RAHA', 'BONOKO', 'PURE', 'HUNKER', 'HASS'].map((brand) => (
                        <option key={brand} value={brand}>{brand}</option>
                      ))}
                    </select>
                    <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Choose the brand of the empty cylinder the customer hands in.</p>
                </div>
              )}
            </div>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[0.8fr_1fr_auto] sm:items-end">
            <div>
              <label htmlFor="pos-item-quantity" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Quantity</label>
              <input
                id="pos-item-quantity"
                type="number"
                min="1"
                step="1"
                inputMode="numeric"
                value={itemQuantity}
                onChange={(event) => setItemQuantity(event.target.value)}
                className={inputClass}
              />
            </div>
            <div>
              <label htmlFor="pos-item-price" className="mb-1.5 block text-xs font-bold uppercase tracking-wide text-slate-600">Unit selling price (KES)</label>
              <input
                id="pos-item-price"
                type="number"
                min="0"
                step="1"
                inputMode="decimal"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                className={inputClass}
              />
              <p className="mt-1 text-xs text-slate-500">Default price loaded; edit if authorised.</p>
            </div>
            <Button type="button" onClick={handleAddItem} disabled={!validLine || (itemType === 'refill' && returnable && !incomingTareBrand)} size="lg" className="min-h-[48px] w-full sm:w-auto">
              <Plus className="mr-1.5 h-5 w-5" /> Add product
            </Button>
          </div>
          <div className="mt-3 flex items-center justify-between border-t border-orange-200 pt-3 text-sm">
            <span className="text-slate-600">Line total</span>
            <strong className="text-lg font-black text-slate-950">
              {formatKES((Number(itemQuantity) || 0) * (Number(unitPrice) || 0))}
            </strong>
          </div>
        </div>
      )}

      {cart.length > 0 && (
        <div className="mt-5 border-t border-slate-200 pt-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-900">Current ticket</h3>
            <span className="text-xs font-semibold text-slate-500">{cart.reduce((sum, item) => sum + item.quantity, 0)} units</span>
          </div>
          <div className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200">
            {cart.map((item) => (
              <div key={item.id} className="flex flex-wrap items-center justify-between gap-3 bg-white p-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-900">{item.productName}</div>
                  <div className="mt-0.5 text-xs text-slate-500">
                    {item.orderType === 'refill' ? `Refill · empty returned: ${item.incomingBrand}` : item.orderType === 'complete' ? 'Complete cylinder' : 'Direct sale'}
                    {' · '}{formatKES(item.unitPrice)} each
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    <button type="button" aria-label={`Decrease ${item.productName} quantity`} onClick={() => onUpdateCartQty(item.id, -1)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"><Minus className="h-3.5 w-3.5" /></button>
                    <span className="w-7 text-center text-sm font-bold">{item.quantity}</span>
                    <button type="button" aria-label={`Increase ${item.productName} quantity`} onClick={() => onUpdateCartQty(item.id, 1)} className="flex h-8 w-8 items-center justify-center rounded-md hover:bg-white"><Plus className="h-3.5 w-3.5" /></button>
                  </div>
                  <strong className="min-w-[88px] text-right text-sm font-black text-slate-900">{formatKES(item.quantity * item.unitPrice)}</strong>
                  <button type="button" aria-label={`Remove ${item.productName}`} onClick={() => onRemoveFromCart(item.id)} className="flex h-9 w-9 items-center justify-center rounded-lg text-red-600 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
