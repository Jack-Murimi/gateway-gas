'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import {
  Package,
  Building2,
  Plus,
  Minus,
  RefreshCw,
  Search,
  CheckCircle2,
  AlertTriangle,
  ArrowRightLeft,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { formatKES, hasEmptyState } from '@/lib/formatters';

export default function InventoryPage() {
  const { currentUser, branches, products, inventory, updateBranchStock, createBranch } = useStore();
  const { showSuccess, showError } = useToast();

  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'cylinder' | 'water' | 'accessory'>('all');

  // Inter-branch transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetBranchId, setTransferTargetBranchId] = useState<string>(branches[1]?.id || '');
  const [transferProductId, setTransferProductId] = useState<string>(products[0]?.id || '');
  const [transferUnits, setTransferUnits] = useState<number>(5);
  const [transferType, setTransferType] = useState<'full' | 'empty'>('full');

  if (!currentUser || currentUser.approval_status !== 'approved') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-sm font-bold text-slate-500">Please sign in with an approved station staff profile.</p>
      </div>
    );
  }

  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
  const canEditStock = ['admin', 'director', 'operator'].includes(currentUser.role);

  // Branch inventory rows
  const branchItems = inventory.filter((i) => i.branch_id === selectedBranchId);

  // Extract unique brands for filter
  const brandsList = Array.from(new Set(products.map((p) => p.brand)));

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = filterCategory === 'all' || p.category === filterCategory;
    const matchesBrand = filterBrand === 'all' || p.brand.toLowerCase() === filterBrand.toLowerCase();
    return matchesSearch && matchesCat && matchesBrand;
  });

  // Quick inline +/- adjust
  const handleQuickAdjust = (productId: string, isFull: boolean, delta: number) => {
    if (!canEditStock) {
      showError('Stock adjustments require Operator or Admin credentials.');
      return;
    }
    const fullDelta = isFull ? delta : 0;
    const emptyDelta = !isFull ? delta : 0;
    updateBranchStock(selectedBranchId, productId, fullDelta, emptyDelta);
    showSuccess(`Updated ${isFull ? 'full' : 'empty'} count by ${delta > 0 ? `+${delta}` : delta}`);
  };

  // Inter-branch stock transfer
  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedBranchId === transferTargetBranchId) {
      showError('Source and destination branches must be different.');
      return;
    }

    const sourceItem = branchItems.find((i) => i.product_id === transferProductId);
    const available = transferType === 'full' ? sourceItem?.full_units || 0 : sourceItem?.empty_units || 0;

    if (transferUnits <= 0 || transferUnits > available) {
      showError(`Cannot transfer ${transferUnits} units. Only ${available} available at ${activeBranch.name}.`);
      return;
    }

    // Deduct from source branch
    updateBranchStock(
      selectedBranchId,
      transferProductId,
      transferType === 'full' ? -transferUnits : 0,
      transferType === 'empty' ? -transferUnits : 0
    );

    // Add to target branch
    updateBranchStock(
      transferTargetBranchId,
      transferProductId,
      transferType === 'full' ? transferUnits : 0,
      transferType === 'empty' ? transferUnits : 0
    );

    const targetBranch = branches.find((b) => b.id === transferTargetBranchId);
    showSuccess(`Transferred ${transferUnits} units to ${targetBranch?.name || 'target hub'}`);
    setShowTransferModal(false);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 space-y-6 text-left">
      {/* Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <Package className="w-6 h-6 text-orange-600" /> Multi-Branch Inventory Balance
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Real-time full cylinders, empty tares, and inter-hub transfers across Nairobi.
          </p>
        </div>

        {canEditStock && (
          <Button
            size="md"
            variant="outline"
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-2 text-sm font-black"
          >
            <ArrowRightLeft className="w-4 h-4 text-orange-600" />
            <span>Inter-Branch Stock Transfer</span>
          </Button>
        )}
      </div>

      {/* Branch & Brand Filter Strip */}
      <div className="bg-white p-4 rounded-3xl border-2 border-slate-200 shadow-sm space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          {/* Branch Select */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-600 mb-1">Station Hub</label>
            <select
              value={selectedBranchId}
              onChange={(e) => setSelectedBranchId(e.target.value)}
              className="w-full min-h-[48px] text-sm font-black px-3.5 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code}) — {b.location_estate}
                </option>
              ))}
            </select>
          </div>

          {/* Category Filter */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-600 mb-1">Category</label>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value as any)}
              className="w-full min-h-[48px] text-sm font-bold px-3.5 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
            >
              <option value="all">All Products</option>
              <option value="cylinder">Gas Cylinders</option>
              <option value="water">Drinking Water</option>
              <option value="accessory">Accessories</option>
            </select>
          </div>

          {/* Brand Filter */}
          <div>
            <label className="block text-xs font-black uppercase text-slate-600 mb-1">Brand</label>
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="w-full min-h-[48px] text-sm font-bold px-3.5 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
            >
              <option value="all">All Brands</option>
              {brandsList.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Live Search Bar */}
        <div className="relative">
          <Search className="w-5 h-5 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search specific size or SKU (e.g. 13kg Pro Gas, 6kg Total)..."
            className="w-full min-h-[48px] pl-11 pr-4 text-base bg-white border-2 border-slate-300 rounded-2xl font-medium focus:border-orange-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Stock Cards Grid (Mobile-friendly, big tap targets) */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredProducts.map((p) => {
          const invRow = branchItems.find((i) => i.product_id === p.id);
          const fullCount = invRow?.full_units || 0;
          const emptyCount = invRow?.empty_units || 0;
          const returnable = hasEmptyState(p);
          const isLowStock = p.category === 'cylinder' && fullCount <= 5;

          return (
            <div
              key={p.id}
              className={`p-5 rounded-3xl border-2 bg-white transition shadow-sm space-y-4 ${
                isLowStock ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'
              }`}
            >
              <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h3 className="text-base font-black text-slate-900 leading-tight">{p.name}</h3>
                  <div className="text-xs font-bold text-slate-500 mt-0.5">{p.brand}</div>
                </div>

                {isLowStock ? (
                  <Badge variant="danger" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
                    Low Stock
                  </Badge>
                ) : (
                  <Badge variant="success">In Stock</Badge>
                )}
              </div>

              {/* Counts & Quick Steppers */}
              {returnable ? (
                <div className="grid grid-cols-2 gap-3 text-center">
                  {/* Full Units */}
                  <div className="bg-emerald-50/70 p-3 rounded-2xl border-2 border-emerald-200 space-y-1.5">
                    <span className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">
                      Filled Units
                    </span>
                    <div className="text-2xl font-black text-emerald-950">{fullCount}</div>

                    {canEditStock && (
                      <div className="flex justify-center gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(p.id, true, -1)}
                          className="w-8 h-8 rounded-lg bg-white border border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(p.id, true, 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Empty Tares */}
                  <div className="bg-slate-100 p-3 rounded-2xl border-2 border-slate-300 space-y-1.5">
                    <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">
                      Empty Tares
                    </span>
                    <div className="text-2xl font-black text-slate-900">{emptyCount}</div>

                    {canEditStock && (
                      <div className="flex justify-center gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(p.id, false, -1)}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-800 flex items-center justify-center font-black active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(p.id, false, 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-slate-300 text-slate-800 flex items-center justify-center font-black active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                /* Disposable / Direct products have NO empty tares */
                <div className="text-center">
                  <div className="bg-emerald-50/70 p-3 rounded-2xl border-2 border-emerald-200 space-y-1.5">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">
                        Available Stock
                      </span>
                      <span className="text-[10px] font-black px-1.5 py-0.5 rounded bg-sky-100 text-sky-850 uppercase">
                        {p.category === 'water' ? 'Disposable Water (No Tare)' : 'Direct Sale'}
                      </span>
                    </div>
                    <div className="text-2xl font-black text-emerald-950">{fullCount}</div>

                    {canEditStock && (
                      <div className="flex justify-center gap-1 pt-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(p.id, true, -1)}
                          className="w-8 h-8 rounded-lg bg-white border border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95"
                        >
                          <Minus className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdjust(p.id, true, 1)}
                          className="w-8 h-8 rounded-lg bg-white border border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95"
                        >
                          <Plus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Pricing Spec */}
              {returnable ? (
                <div className="pt-1 text-xs font-bold text-slate-500 flex justify-between">
                  <span>Refill: {formatKES(p.refill_price_kes)}</span>
                  <span>Complete: {formatKES(p.complete_price_kes)}</span>
                </div>
              ) : (
                <div className="pt-1 text-xs font-bold text-slate-500 flex justify-between">
                  <span>Price: {formatKES(p.accessory_price_kes || p.complete_price_kes)}</span>
                  <span className="text-slate-400">
                    {p.category === 'water' ? 'Disposable Bottle' : 'Accessory'}
                  </span>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Inter-Branch Transfer Sheet / Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowTransferModal(false)} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border-2 border-slate-300 p-6 space-y-4 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-orange-600" /> Inter-Branch Stock Transfer
              </h3>
              <button onClick={() => setShowTransferModal(false)} className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Source Station (From)</label>
                <div className="p-3 bg-slate-100 rounded-xl font-black text-sm text-slate-900">
                  {activeBranch.name} ({activeBranch.code})
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Destination Station (To)</label>
                <select
                  value={transferTargetBranchId}
                  onChange={(e) => setTransferTargetBranchId(e.target.value)}
                  className="w-full min-h-[48px] text-sm font-black px-3.5 bg-white border-2 border-slate-300 rounded-xl"
                >
                  {branches
                    .filter((b) => b.id !== selectedBranchId)
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name} ({b.code})
                      </option>
                    ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product</label>
                <select
                  value={transferProductId}
                  onChange={(e) => {
                    const newId = e.target.value;
                    setTransferProductId(newId);
                    const prod = products.find((p) => p.id === newId);
                    if (prod && !hasEmptyState(prod)) {
                      setTransferType('full');
                    }
                  }}
                  className="w-full min-h-[48px] text-sm font-bold px-3.5 bg-white border-2 border-slate-300 rounded-xl"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit Type</label>
                  {(() => {
                    const selectedProd = products.find((p) => p.id === transferProductId);
                    const returnable = selectedProd ? hasEmptyState(selectedProd) : true;
                    return (
                      <select
                        value={transferType}
                        onChange={(e) => setTransferType(e.target.value as 'full' | 'empty')}
                        disabled={!returnable}
                        className="w-full min-h-[48px] text-sm font-bold px-3.5 bg-white border-2 border-slate-300 rounded-xl disabled:bg-slate-100 disabled:text-slate-500"
                      >
                        <option value="full">
                          {returnable ? 'Filled Units' : 'Full Stock (Disposable)'}
                        </option>
                        {returnable && <option value="empty">Empty Tares</option>}
                      </select>
                    );
                  })()}
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Quantity</label>
                  <input
                    type="number"
                    min={1}
                    value={transferUnits}
                    onChange={(e) => setTransferUnits(parseInt(e.target.value) || 1)}
                    className="w-full min-h-[48px] text-base font-black px-3.5 bg-white border-2 border-slate-300 rounded-xl"
                  />
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowTransferModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary">
                  Confirm Transfer
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
