'use client';

import React, { useState } from 'react';
import { Product, OrderType } from '@/types';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Repeat,
  Package,
  Droplets,
  Flame,
  Check,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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

export function PosItemsStep({
  products,
  cart,
  onAddToCart,
  onUpdateCartQty,
  onRemoveFromCart,
}: PosItemsStepProps) {
  const [filterCat, setFilterCat] = useState<'all' | 'cylinder' | 'water' | 'accessory'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeProduct, setActiveProduct] = useState<Product | null>(products[0] || null);

  // Active item config for cylinder exchange / sale type
  const [itemType, setItemType] = useState<OrderType>('refill');
  const [incomingTareBrand, setIncomingTareBrand] = useState('AFRIGAS');
  const [itemQuantity, setItemQuantity] = useState(1);

  // Filter products by search & category
  const filteredProducts = products.filter((p) => {
    if (filterCat !== 'all' && p.category !== filterCat) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = p.name.toLowerCase().includes(q);
      const matchBrand = p.brand.toLowerCase().includes(q);
      const matchSize = p.size_kg ? `${p.size_kg}kg`.includes(q) || `${p.size_kg}l`.includes(q) : false;
      return matchName || matchBrand || matchSize;
    }
    return true;
  });

  const handleSelectProduct = (p: Product) => {
    setActiveProduct(p);
    const returnable = hasEmptyState(p);
    if (!returnable) {
      setItemType('accessory');
      setIncomingTareBrand('');
    } else if (p.category === 'water') {
      setItemType('refill');
      setIncomingTareBrand(p.brand === 'KERINGET' ? 'KERINGET' : 'AQUAMIST');
    } else {
      setItemType('refill');
      setIncomingTareBrand(p.brand);
    }
  };

  const handleAddItemToTicket = () => {
    if (!activeProduct) return;

    let price = 0;
    if (itemType === 'refill') price = activeProduct.refill_price_kes;
    else if (itemType === 'complete') price = activeProduct.complete_price_kes;
    else price = activeProduct.accessory_price_kes || activeProduct.complete_price_kes;

    const returnable = hasEmptyState(activeProduct);
    const inc = itemType === 'refill' && returnable ? incomingTareBrand : '';

    const newItem: PosCartItem = {
      id: `cart-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
      productId: activeProduct.id,
      productName: activeProduct.name,
      orderType: itemType,
      outgoingBrand: activeProduct.brand,
      incomingBrand: inc,
      cylinderSizeKg: activeProduct.size_kg,
      quantity: itemQuantity,
      unitPrice: price,
    };

    onAddToCart(newItem);
    setItemQuantity(1); // Reset stepper
  };

  return (
    <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm p-4 sm:p-6 space-y-5 text-left">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-slate-100 pb-3">
        <div>
          <h2 className="text-lg font-black text-slate-900">Step 2: Select Products & Cylinders</h2>
          <p className="text-xs text-slate-500">Tap tiles to choose size and brand exchange</p>
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
          {(['all', 'cylinder', 'water', 'accessory'] as const).map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setFilterCat(cat)}
              className={`min-h-[40px] px-3.5 py-1.5 rounded-xl text-xs font-black capitalize transition shrink-0 ${
                filterCat === cat
                  ? 'bg-slate-900 text-white shadow'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              {cat === 'all' ? 'All Items' : cat === 'cylinder' ? 'Gas' : cat === 'water' ? 'Water' : 'Accessories'}
            </button>
          ))}
        </div>
      </div>

      {/* Live Search Bar */}
      <div className="relative">
        <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter by size or brand (e.g. 13KG AFRIGAS, 6KG PROGAS, 20L KERINGET)..."
          className="w-full min-h-[48px] pl-11 pr-10 text-base bg-white border-2 border-slate-300 rounded-2xl font-medium focus:border-orange-500 focus:outline-none"
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => setSearchQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Product Tiles Grid (Touch-friendly 48px+ tiles) */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 max-h-64 overflow-y-auto pr-1">
        {filteredProducts.map((p) => {
          const isSelected = activeProduct?.id === p.id;
          const returnable = hasEmptyState(p);
          const isDisposableWater = p.category === 'water' && !returnable;
          const displayPrice = returnable
            ? p.refill_price_kes
            : (p.accessory_price_kes || p.complete_price_kes);

          return (
            <button
              key={p.id}
              type="button"
              onClick={() => handleSelectProduct(p)}
              className={`p-3 rounded-2xl border-2 text-left transition select-none flex flex-col justify-between min-h-[72px] active:scale-95 ${
                isSelected
                  ? 'border-orange-500 bg-orange-50/90 ring-2 ring-orange-200'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <div>
                <div className="text-xs font-black text-slate-900 leading-tight truncate">{p.name}</div>
                <div className="text-[11px] font-bold text-slate-500 mt-0.5 flex items-center justify-between gap-1">
                  <span className="truncate">{p.brand}</span>
                  {isDisposableWater && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-sky-100 text-sky-850 font-black uppercase shrink-0">
                      Disposable
                    </span>
                  )}
                </div>
              </div>
              <div className="mt-2 text-xs font-black text-orange-600">
                {formatKES(displayPrice)}
              </div>
            </button>
          );
        })}
      </div>

      {/* Active Product Exchange & Quantity Config Drawer */}
      {activeProduct && (
        <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-200 pb-2">
            <div>
              <span className="text-xs font-black uppercase tracking-wider text-orange-600">Selected Item</span>
              <div className="text-base font-black text-slate-900">{activeProduct.name}</div>
            </div>

            {/* Sale Type Selector */}
            <div className="flex gap-1 bg-white p-1 rounded-xl border border-slate-200">
              {hasEmptyState(activeProduct) ? (
                <>
                  <button
                    type="button"
                    onClick={() => setItemType('refill')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition ${
                      itemType === 'refill' ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Refill Swap
                  </button>
                  <button
                    type="button"
                    onClick={() => setItemType('complete')}
                    className={`px-3 py-1 text-xs font-black rounded-lg transition ${
                      itemType === 'complete' ? 'bg-orange-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    Complete (New)
                  </button>
                </>
              ) : (
                <span className="px-3 py-1 text-xs font-black text-slate-800">
                  {activeProduct.category === 'water' ? 'Disposable Bottle (Direct Sale)' : 'Direct Purchase'}
                </span>
              )}
            </div>
          </div>

          {/* Visual Brand Exchange: Returned Tare -> Dispensed Brand (Only if product has empty state) */}
          {itemType === 'refill' && hasEmptyState(activeProduct) && (
            <div className="bg-white p-3.5 rounded-2xl border-2 border-orange-200 space-y-2">
              <div className="text-xs font-black text-slate-700 uppercase flex items-center gap-1.5">
                <Repeat className="w-4 h-4 text-orange-600" />
                <span>Cylinder Tare Exchange (Returned Brand → Dispensed)</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">
                    Customer Returned Empty Brand
                  </label>
                  <select
                    value={incomingTareBrand}
                    onChange={(e) => setIncomingTareBrand(e.target.value)}
                    className="w-full min-h-[44px] text-sm font-bold bg-slate-50 border-2 border-slate-300 rounded-xl px-3 text-slate-900 focus:border-orange-500 focus:outline-none"
                  >
                    {activeProduct.category === 'water' ? (
                      <>
                        <option value="KERINGET">KERINGET 20L EMPTY</option>
                        <option value="AQUAMIST">AQUAMIST 20L EMPTY</option>
                      </>
                    ) : (
                      <>
                        <option value="AFRIGAS">AFRIGAS TARE</option>
                        <option value="K-GAS">K-GAS TARE</option>
                        <option value="TOTAL">TOTAL TARE</option>
                        <option value="OLA">OLA TARE</option>
                        <option value="PROGAS">PROGAS TARE</option>
                        <option value="TOSHA">TOSHA TARE</option>
                        <option value="LAKE">LAKE TARE</option>
                        <option value="HASHI">HASHI TARE</option>
                        <option value="SUPA">SUPA TARE</option>
                        <option value="JATEL">JATEL TARE</option>
                        <option value="SEAGAS">SEAGAS TARE</option>
                        <option value="RAHA">RAHA TARE</option>
                        <option value="BONOKO">BONOKO TARE</option>
                        <option value="PURE">PURE TARE</option>
                        <option value="HUNKER">HUNKER TARE</option>
                        <option value="HASS">HASS TARE</option>
                      </>
                    )}
                  </select>
                </div>

                <div className="bg-orange-50 p-2.5 rounded-xl border border-orange-200 text-xs font-bold text-orange-950 flex items-center gap-2">
                  <Flame className="w-5 h-5 text-orange-600 shrink-0" />
                  <div>
                    <span>Dispensing Filled: </span>
                    <strong className="text-slate-900">{activeProduct.brand} {activeProduct.size_kg ? `${activeProduct.size_kg}kg` : ''}</strong>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Stepper & Add to Ticket Button */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            {/* Rapid +/- Stepper */}
            <div className="flex items-center gap-2">
              <span className="text-xs font-black text-slate-700">Quantity:</span>
              <div className="flex items-center bg-white border-2 border-slate-300 rounded-2xl p-1">
                <button
                  type="button"
                  onClick={() => setItemQuantity(Math.max(1, itemQuantity - 1))}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black active:scale-95 transition"
                >
                  <Minus className="w-4 h-4" />
                </button>
                <span className="w-12 text-center text-base font-black text-slate-900">
                  {itemQuantity}
                </span>
                <button
                  type="button"
                  onClick={() => setItemQuantity(itemQuantity + 1)}
                  className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-black active:scale-95 transition"
                >
                  <Plus className="w-4 h-4" />
                </button>
              </div>
            </div>

            <Button
              type="button"
              onClick={handleAddItemToTicket}
              size="md"
              className="min-h-[48px]"
            >
              <Plus className="w-5 h-5 mr-1.5" /> Add to Ticket
            </Button>
          </div>
        </div>
      )}

      {/* Cart Summary List in POS */}
      {cart.length > 0 && (
        <div className="border-t-2 border-slate-100 pt-4 space-y-2">
          <div className="text-xs font-black uppercase text-slate-500">Current Ticket Line Items ({cart.length})</div>
          <div className="divide-y-2 divide-slate-100 border-2 border-slate-200 rounded-2xl overflow-hidden bg-white">
            {cart.map((item) => (
              <div key={item.id} className="p-3 sm:p-4 flex items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-black text-slate-900 leading-tight">
                    {item.productName} ({item.orderType})
                  </div>
                  <div className="text-xs font-bold text-slate-500 mt-0.5">
                    {item.orderType === 'refill' && item.incomingBrand
                      ? `Tare Swap: In (${item.incomingBrand}) → Out (${item.outgoingBrand})`
                      : `Unit: ${item.outgoingBrand}`}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex items-center bg-slate-100 rounded-xl p-0.5 border border-slate-300">
                    <button
                      type="button"
                      onClick={() => onUpdateCartQty(item.id, -1)}
                      className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-white rounded-lg"
                    >
                      <Minus className="w-3.5 h-3.5" />
                    </button>
                    <span className="w-8 text-center text-xs font-black text-slate-900">{item.quantity}</span>
                    <button
                      type="button"
                      onClick={() => onUpdateCartQty(item.id, 1)}
                      className="w-7 h-7 flex items-center justify-center font-bold text-slate-700 hover:bg-white rounded-lg"
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </button>
                  </div>

                  <div className="text-sm font-black text-slate-900 min-w-[80px] text-right">
                    {formatKES(item.quantity * item.unitPrice)}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveFromCart(item.id)}
                    className="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
