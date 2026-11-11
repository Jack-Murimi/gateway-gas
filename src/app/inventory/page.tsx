'use client';

import React, { useState, useMemo } from 'react';
import { useStore } from '@/context/store-context';
import {
  Package,
  Building2,
  Plus,
  Minus,
  Search,
  AlertTriangle,
  ArrowRightLeft,
  X,
  Flame,
  Droplets,
  Layers,
  LayoutGrid,
  List,
  Phone,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Filter,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { formatKES, hasEmptyState } from '@/lib/formatters';
import { Product } from '@/types';

export default function InventoryPage() {
  const { currentUser, branches, products, inventory, updateBranchStock } = useStore();
  const { showSuccess, showError } = useToast();

  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterBrand, setFilterBrand] = useState<string>('all');
  const [filterCategory, setFilterCategory] = useState<'all' | 'cylinder' | 'water' | 'accessory'>('all');
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Inter-branch transfer modal
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [transferTargetBranchId, setTransferTargetBranchId] = useState<string>(branches[1]?.id || '');
  const [transferProductId, setTransferProductId] = useState<string>(products[0]?.id || '');
  const [transferUnits, setTransferUnits] = useState<number>(5);
  const [transferType, setTransferType] = useState<'full' | 'empty'>('full');

  if (!currentUser || currentUser.approval_status !== 'approved') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <div className="w-16 h-16 mx-auto mb-4 rounded-3xl bg-slate-100 flex items-center justify-center text-slate-400">
          <Package className="w-8 h-8" />
        </div>
        <h2 className="text-xl font-black text-slate-900">Restricted Station Inventory</h2>
        <p className="text-sm font-bold text-slate-500 mt-1">Please sign in with an approved station staff profile.</p>
      </div>
    );
  }

  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
  const canEditStock = ['admin', 'director', 'operator'].includes(currentUser.role);

  // Branch inventory rows
  const branchItems = inventory.filter((i) => i.branch_id === selectedBranchId);

  // Extract unique brands for filter
  const brandsList = Array.from(new Set(products.map((p) => p.brand))).sort();

  // Category counts for quick filter pills
  const categoryCounts = useMemo(() => {
    return {
      all: products.length,
      cylinder: products.filter((p) => p.category === 'cylinder').length,
      water: products.filter((p) => p.category === 'water').length,
      accessory: products.filter((p) => p.category === 'accessory').length,
    };
  }, [products]);

  // Filtered product items
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      const invRow = branchItems.find((i) => i.product_id === p.id);
      const fullCount = invRow?.full_units || 0;
      const isLowStock = p.category === 'cylinder' && fullCount <= 5;

      if (lowStockOnly && !isLowStock) return false;

      const q = searchQuery.toLowerCase().trim();
      const matchesSearch =
        !q ||
        p.name.toLowerCase().includes(q) ||
        p.brand.toLowerCase().includes(q) ||
        (p.size_kg && `${p.size_kg}kg`.includes(q));

      const matchesCat = filterCategory === 'all' || p.category === filterCategory;
      const matchesBrand = filterBrand === 'all' || p.brand.toLowerCase() === filterBrand.toLowerCase();

      return matchesSearch && matchesCat && matchesBrand;
    });
  }, [products, branchItems, searchQuery, filterCategory, filterBrand, lowStockOnly]);

  // Station KPI metrics
  const stationKpis = useMemo(() => {
    let totalFullCylinders = 0;
    let totalEmptyTares = 0;
    let totalWaterUnits = 0;
    let lowStockCount = 0;

    products.forEach((p) => {
      const invRow = branchItems.find((i) => i.product_id === p.id);
      const full = invRow?.full_units || 0;
      const empty = invRow?.empty_units || 0;

      if (p.category === 'cylinder') {
        totalFullCylinders += full;
        totalEmptyTares += empty;
        if (full <= 5) lowStockCount += 1;
      } else if (p.category === 'water') {
        totalWaterUnits += full;
        if (hasEmptyState(p)) {
          totalEmptyTares += empty;
        }
      }
    });

    return {
      totalFullCylinders,
      totalEmptyTares,
      totalWaterUnits,
      lowStockCount,
    };
  }, [products, branchItems]);

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

  // Open transfer preselected for specific product
  const handleOpenTransferForProduct = (p: Product) => {
    setTransferProductId(p.id);
    if (!hasEmptyState(p)) {
      setTransferType('full');
    }
    setShowTransferModal(true);
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

  const selectedTransferProduct = products.find((p) => p.id === transferProductId) || products[0];
  const transferProductReturnable = selectedTransferProduct ? hasEmptyState(selectedTransferProduct) : true;
  const sourceTransferInv = branchItems.find((i) => i.product_id === transferProductId);
  const transferAvailableUnits =
    transferType === 'full' ? sourceTransferInv?.full_units || 0 : sourceTransferInv?.empty_units || 0;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-28 md:pb-14 space-y-6 text-left">
      {/* Header & Station Selector Strip */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b-2 border-slate-200 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-orange-600 text-white flex items-center justify-center shadow-md shadow-orange-600/20">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">
                Station Inventory & Stocks
              </h1>
              <p className="text-xs font-bold text-slate-500">
                Real-time cylinder exchange tally, empty tares, and inter-hub transfers across Nairobi.
              </p>
            </div>
          </div>
        </div>

        {canEditStock && (
          <Button
            size="md"
            variant="outline"
            onClick={() => setShowTransferModal(true)}
            className="flex items-center gap-2 text-sm font-black shadow-sm bg-white hover:bg-slate-50 border-2 border-slate-300"
          >
            <ArrowRightLeft className="w-4 h-4 text-orange-600" />
            <span>Inter-Branch Stock Transfer</span>
          </Button>
        )}
      </div>

      {/* Station Branch Switcher Tabs (One-touch switching for operators) */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
            <Building2 className="w-3.5 h-3.5 text-orange-600" /> Station Hub
          </span>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
            <Phone className="w-3 h-3 text-slate-400" />
            <span>{activeBranch.contact_phone}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          {branches.map((b) => {
            const isSelected = b.id === selectedBranchId;
            return (
              <button
                key={b.id}
                type="button"
                onClick={() => setSelectedBranchId(b.id)}
                className={`p-3.5 rounded-2xl border-2 text-left transition select-none flex flex-col justify-between active:scale-[0.98] ${
                  isSelected
                    ? 'border-orange-500 bg-orange-50/70 ring-2 ring-orange-200 shadow-sm'
                    : 'border-slate-200 hover:border-slate-300 bg-white'
                }`}
              >
                <div className="flex items-center justify-between gap-1">
                  <span
                    className={`text-[10px] font-black px-2 py-0.5 rounded-md tracking-wider uppercase ${
                      isSelected ? 'bg-orange-600 text-white' : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {b.code}
                  </span>
                  {isSelected && <span className="w-2 h-2 rounded-full bg-orange-600" />}
                </div>
                <div className="mt-2">
                  <div className={`text-sm font-black truncate ${isSelected ? 'text-orange-950' : 'text-slate-900'}`}>
                    {b.name}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500 truncate">{b.location_estate}</div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Station KPI Quick Glance Banners */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* Full Cylinders */}
        <div className="p-4 bg-white rounded-3xl border-2 border-emerald-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-[11px] font-black uppercase tracking-wider">Filled Cylinders</span>
            <div className="w-7 h-7 rounded-xl bg-emerald-100 flex items-center justify-center">
              <Flame className="w-4 h-4 text-emerald-700" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-emerald-950 mt-1">
            {stationKpis.totalFullCylinders}
          </div>
          <div className="text-[11px] font-bold text-emerald-700 mt-0.5">Ready for Dispensing</div>
        </div>

        {/* Empty Tares */}
        <div className="p-4 bg-white rounded-3xl border-2 border-slate-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-slate-600">
            <span className="text-[11px] font-black uppercase tracking-wider">Empty Tares</span>
            <div className="w-7 h-7 rounded-xl bg-slate-100 flex items-center justify-center">
              <Layers className="w-4 h-4 text-slate-600" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 mt-1">
            {stationKpis.totalEmptyTares}
          </div>
          <div className="text-[11px] font-bold text-slate-500 mt-0.5">Pending Depot Refill</div>
        </div>

        {/* Water Stock */}
        <div className="p-4 bg-white rounded-3xl border-2 border-sky-200 shadow-sm relative overflow-hidden">
          <div className="flex items-center justify-between text-sky-800">
            <span className="text-[11px] font-black uppercase tracking-wider">Water Units</span>
            <div className="w-7 h-7 rounded-xl bg-sky-100 flex items-center justify-center">
              <Droplets className="w-4 h-4 text-sky-700" />
            </div>
          </div>
          <div className="text-2xl sm:text-3xl font-black text-sky-950 mt-1">
            {stationKpis.totalWaterUnits}
          </div>
          <div className="text-[11px] font-bold text-sky-700 mt-0.5">Returnable & Japeli</div>
        </div>

        {/* Low Stock Watch */}
        <div
          className={`p-4 rounded-3xl border-2 shadow-sm transition ${
            stationKpis.lowStockCount > 0
              ? 'bg-rose-50 border-rose-300'
              : 'bg-white border-slate-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <span
              className={`text-[11px] font-black uppercase tracking-wider ${
                stationKpis.lowStockCount > 0 ? 'text-rose-800' : 'text-slate-600'
              }`}
            >
              Stock Watch
            </span>
            <div
              className={`w-7 h-7 rounded-xl flex items-center justify-center ${
                stationKpis.lowStockCount > 0 ? 'bg-rose-200 text-rose-800' : 'bg-slate-100 text-slate-600'
              }`}
            >
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div
            className={`text-2xl sm:text-3xl font-black mt-1 ${
              stationKpis.lowStockCount > 0 ? 'text-rose-950' : 'text-slate-900'
            }`}
          >
            {stationKpis.lowStockCount}
          </div>
          <div
            className={`text-[11px] font-bold mt-0.5 ${
              stationKpis.lowStockCount > 0 ? 'text-rose-700' : 'text-slate-500'
            }`}
          >
            {stationKpis.lowStockCount > 0 ? 'SKUs <= 5 Units' : 'All Healthy (> 5 units)'}
          </div>
        </div>
      </div>

      {/* Filter and Control Bar */}
      <div className="bg-white p-4 rounded-3xl border-2 border-slate-200 shadow-sm space-y-4">
        {/* Category Filter Pills & View Mode */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setFilterCategory('all')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition select-none flex items-center gap-1.5 ${
                filterCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <span>All Items</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {categoryCounts.all}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterCategory('cylinder')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition select-none flex items-center gap-1.5 ${
                filterCategory === 'cylinder'
                  ? 'bg-orange-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Flame className="w-3.5 h-3.5" />
              <span>Gas Cylinders</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {categoryCounts.cylinder}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterCategory('water')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition select-none flex items-center gap-1.5 ${
                filterCategory === 'water'
                  ? 'bg-sky-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Droplets className="w-3.5 h-3.5" />
              <span>Drinking Water</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {categoryCounts.water}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setFilterCategory('accessory')}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition select-none flex items-center gap-1.5 ${
                filterCategory === 'accessory'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>Accessories</span>
              <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-white/20">
                {categoryCounts.accessory}
              </span>
            </button>
          </div>

          {/* View Mode & Low Stock Filter Toggle */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setLowStockOnly(!lowStockOnly)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black border-2 transition select-none flex items-center gap-1.5 ${
                lowStockOnly
                  ? 'bg-rose-50 border-rose-400 text-rose-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
              <span>Low Stock Only</span>
            </button>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'grid' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Grid Cards"
              >
                <LayoutGrid className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-bold transition ${
                  viewMode === 'table' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Dense Table"
              >
                <List className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Search & Brand Filter Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div className="sm:col-span-2 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by size, brand, or SKU (e.g. 13kg Pro Gas, 20L Japeli)..."
              className="w-full min-h-[44px] pl-10 pr-9 text-sm bg-slate-50 border-2 border-slate-300 rounded-xl font-medium focus:border-orange-500 focus:bg-white focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          <div>
            <select
              value={filterBrand}
              onChange={(e) => setFilterBrand(e.target.value)}
              className="w-full min-h-[44px] text-xs font-bold px-3 bg-slate-50 border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:bg-white focus:outline-none"
            >
              <option value="all">All Brands ({brandsList.length})</option>
              {brandsList.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Results Count & Clear Filter Bar */}
        {(searchQuery || filterBrand !== 'all' || filterCategory !== 'all' || lowStockOnly) && (
          <div className="flex items-center justify-between text-xs font-bold text-slate-500 pt-1">
            <span>
              Showing {filteredProducts.length} of {products.length} items at {activeBranch.name}
            </span>
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setFilterBrand('all');
                setFilterCategory('all');
                setLowStockOnly(false);
              }}
              className="text-orange-600 hover:underline flex items-center gap-1 font-black"
            >
              <X className="w-3.5 h-3.5" /> Reset Filters
            </button>
          </div>
        )}
      </div>

      {/* Empty State */}
      {filteredProducts.length === 0 && (
        <div className="p-12 text-center bg-white rounded-3xl border-2 border-dashed border-slate-300 space-y-3">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-slate-100 flex items-center justify-center text-slate-400">
            <Search className="w-6 h-6" />
          </div>
          <div className="text-base font-black text-slate-900">No matching stock items found</div>
          <p className="text-xs font-bold text-slate-500 max-w-sm mx-auto">
            Try adjusting your brand, category filter, or search query.
          </p>
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setSearchQuery('');
              setFilterBrand('all');
              setFilterCategory('all');
              setLowStockOnly(false);
            }}
          >
            Clear All Filters
          </Button>
        </div>
      )}

      {/* Grid View (Mobile-optimized cards with high-touch targets) */}
      {viewMode === 'grid' && filteredProducts.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredProducts.map((p) => {
            const invRow = branchItems.find((i) => i.product_id === p.id);
            const fullCount = invRow?.full_units || 0;
            const emptyCount = invRow?.empty_units || 0;
            const returnable = hasEmptyState(p);
            const isDisposableWater = p.category === 'water' && !returnable;
            const isLowStock = p.category === 'cylinder' && fullCount <= 5;

            return (
              <div
                key={p.id}
                className={`p-5 rounded-3xl border-2 bg-white transition shadow-sm space-y-4 hover:border-slate-300 ${
                  isLowStock ? 'border-rose-400 ring-2 ring-rose-100' : 'border-slate-200'
                }`}
              >
                {/* Card Header: Product Info & Low Stock Badge */}
                <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[11px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-slate-100 text-slate-700">
                        {p.brand}
                      </span>
                      {p.size_kg && (
                        <span className="text-[11px] font-black px-2 py-0.5 rounded-md uppercase tracking-wider bg-orange-100 text-orange-950">
                          {p.size_kg}kg
                        </span>
                      )}
                    </div>
                    <h3 className="text-base font-black text-slate-900 leading-tight pt-1">
                      {p.name}
                    </h3>
                  </div>

                  <div>
                    {isLowStock ? (
                      <Badge variant="danger" icon={<AlertTriangle className="w-3.5 h-3.5" />}>
                        Low Stock
                      </Badge>
                    ) : (
                      <Badge variant="success">In Stock</Badge>
                    )}
                  </div>
                </div>

                {/* Returnable Items (Cylinders & 20L returnable water) */}
                {returnable ? (
                  <div className="grid grid-cols-2 gap-3 text-center">
                    {/* Filled Units */}
                    <div className="bg-emerald-50/80 p-3 rounded-2xl border-2 border-emerald-200 space-y-1">
                      <span className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">
                        Filled Units
                      </span>
                      <div className="text-2xl sm:text-3xl font-black text-emerald-950">{fullCount}</div>

                      {canEditStock && (
                        <div className="flex justify-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(p.id, true, -1)}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95 shadow-sm hover:bg-emerald-100 transition"
                            title="Decrease filled stock"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(p.id, true, 1)}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95 shadow-sm hover:bg-emerald-100 transition"
                            title="Increase filled stock"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Empty Tares */}
                    <div className="bg-slate-100/90 p-3 rounded-2xl border-2 border-slate-300 space-y-1">
                      <span className="text-[11px] font-black uppercase text-slate-700 tracking-wider">
                        Empty Tares
                      </span>
                      <div className="text-2xl sm:text-3xl font-black text-slate-900">{emptyCount}</div>

                      {canEditStock && (
                        <div className="flex justify-center gap-1.5 pt-1">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(p.id, false, -1)}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-slate-300 text-slate-800 flex items-center justify-center font-black active:scale-95 shadow-sm hover:bg-slate-200 transition"
                            title="Decrease empty tares"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(p.id, false, 1)}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-slate-300 text-slate-800 flex items-center justify-center font-black active:scale-95 shadow-sm hover:bg-slate-200 transition"
                            title="Increase empty tares"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Disposable Water & Accessories (No empty state) */
                  <div className="text-center">
                    <div className="bg-emerald-50/80 p-3.5 rounded-2xl border-2 border-emerald-200 space-y-1.5">
                      <div className="flex items-center justify-between px-1">
                        <span className="text-[11px] font-black uppercase text-emerald-800 tracking-wider">
                          Available Stock
                        </span>
                        <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-sky-100 text-sky-900 uppercase">
                          {isDisposableWater ? 'Disposable Water' : 'Direct Sale'}
                        </span>
                      </div>
                      <div className="text-2xl sm:text-3xl font-black text-emerald-950">{fullCount}</div>

                      {canEditStock && (
                        <div className="flex justify-center gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(p.id, true, -1)}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95 shadow-sm hover:bg-emerald-100 transition"
                          >
                            <Minus className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleQuickAdjust(p.id, true, 1)}
                            className="w-9 h-9 rounded-xl bg-white border-2 border-emerald-300 text-emerald-900 flex items-center justify-center font-black active:scale-95 shadow-sm hover:bg-emerald-100 transition"
                          >
                            <Plus className="w-4 h-4" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Pricing & Quick Transfer Button */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 text-xs">
                  <div className="space-y-0.5 text-slate-600 font-bold">
                    {returnable ? (
                      <div className="flex items-center gap-2">
                        <span>Refill: <strong className="text-slate-900">{formatKES(p.refill_price_kes)}</strong></span>
                        <span>•</span>
                        <span>Complete: <strong className="text-slate-900">{formatKES(p.complete_price_kes)}</strong></span>
                      </div>
                    ) : (
                      <div>
                        Price: <strong className="text-slate-900">{formatKES(p.accessory_price_kes || p.complete_price_kes)}</strong>
                      </div>
                    )}
                  </div>

                  {canEditStock && (
                    <button
                      type="button"
                      onClick={() => handleOpenTransferForProduct(p)}
                      className="text-xs font-bold text-orange-600 hover:text-orange-700 flex items-center gap-1 shrink-0 p-1 hover:bg-orange-50 rounded-lg transition"
                      title="Transfer to another station"
                    >
                      <ArrowRightLeft className="w-3.5 h-3.5" />
                      <span>Transfer</span>
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dense Table View (Ideal for desktop stock take and fast audits) */}
      {viewMode === 'table' && filteredProducts.length > 0 && (
        <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b-2 border-slate-200 text-slate-700 font-black uppercase tracking-wider text-[11px]">
                  <th className="py-3.5 px-4">Product & Brand</th>
                  <th className="py-3.5 px-4">Category</th>
                  <th className="py-3.5 px-4 text-center">Filled / Stock</th>
                  <th className="py-3.5 px-4 text-center">Empty Tares</th>
                  <th className="py-3.5 px-4">Status</th>
                  <th className="py-3.5 px-4">Pricing</th>
                  {canEditStock && <th className="py-3.5 px-4 text-right">Quick Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredProducts.map((p) => {
                  const invRow = branchItems.find((i) => i.product_id === p.id);
                  const fullCount = invRow?.full_units || 0;
                  const emptyCount = invRow?.empty_units || 0;
                  const returnable = hasEmptyState(p);
                  const isLowStock = p.category === 'cylinder' && fullCount <= 5;

                  return (
                    <tr key={p.id} className="hover:bg-slate-50 transition">
                      <td className="py-3.5 px-4 font-bold text-slate-900">
                        <div className="font-black text-sm">{p.name}</div>
                        <div className="text-[11px] text-slate-500">{p.brand} {p.size_kg ? `• ${p.size_kg}kg` : ''}</div>
                      </td>
                      <td className="py-3.5 px-4">
                        <span className="capitalize font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        <span className="font-black text-base text-emerald-950">{fullCount}</span>
                      </td>
                      <td className="py-3.5 px-4 text-center">
                        {returnable ? (
                          <span className="font-black text-base text-slate-800">{emptyCount}</span>
                        ) : (
                          <span className="text-[10px] text-slate-400 font-bold uppercase">Disposable</span>
                        )}
                      </td>
                      <td className="py-3.5 px-4">
                        {isLowStock ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-rose-100 text-rose-800">
                            Low Stock
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-black uppercase bg-emerald-100 text-emerald-800">
                            Healthy
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-4 font-medium text-slate-700">
                        {returnable ? (
                          <div>
                            <div>Refill: <strong>{formatKES(p.refill_price_kes)}</strong></div>
                            <div className="text-slate-500">New: {formatKES(p.complete_price_kes)}</div>
                          </div>
                        ) : (
                          <div>Price: <strong>{formatKES(p.accessory_price_kes || p.complete_price_kes)}</strong></div>
                        )}
                      </td>
                      {canEditStock && (
                        <td className="py-3.5 px-4 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleQuickAdjust(p.id, true, -1)}
                              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100"
                              title="Decrease filled stock"
                            >
                              <Minus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleQuickAdjust(p.id, true, 1)}
                              className="p-1.5 rounded-lg border border-slate-300 hover:bg-slate-100"
                              title="Increase filled stock"
                            >
                              <Plus className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleOpenTransferForProduct(p)}
                              className="ml-1 px-2.5 py-1.5 rounded-lg border border-orange-200 text-orange-600 hover:bg-orange-50 font-bold flex items-center gap-1"
                            >
                              <ArrowRightLeft className="w-3 h-3" /> Transfer
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Inter-Branch Transfer Sheet / Modal */}
      {showTransferModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowTransferModal(false)}
          />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border-2 border-slate-300 p-6 space-y-4 shadow-2xl z-10 text-left">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ArrowRightLeft className="w-5 h-5 text-orange-600" /> Inter-Branch Stock Transfer
              </h3>
              <button
                type="button"
                onClick={() => setShowTransferModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center text-slate-500 hover:text-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleTransfer} className="space-y-4">
              {/* Branch Routing (Source -> Destination) */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-2xl border-2 border-slate-200">
                <div>
                  <span className="text-[10px] font-black uppercase text-slate-500">From (Source)</span>
                  <div className="text-sm font-black text-slate-900 mt-0.5 truncate">
                    {activeBranch.name}
                  </div>
                  <div className="text-[11px] font-bold text-slate-500">{activeBranch.code}</div>
                </div>

                <div>
                  <span className="text-[10px] font-black uppercase text-slate-500">To (Destination)</span>
                  <select
                    value={transferTargetBranchId}
                    onChange={(e) => setTransferTargetBranchId(e.target.value)}
                    className="w-full mt-0.5 min-h-[38px] text-xs font-black px-2 bg-white border border-slate-300 rounded-xl"
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
              </div>

              {/* Product Select */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Product Item</label>
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
                  className="w-full min-h-[46px] text-sm font-bold px-3.5 bg-white border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
                >
                  {products.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.brand})
                    </option>
                  ))}
                </select>
              </div>

              {/* Unit Type & Quantity */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Unit Type</label>
                  <select
                    value={transferType}
                    onChange={(e) => setTransferType(e.target.value as 'full' | 'empty')}
                    disabled={!transferProductReturnable}
                    className="w-full min-h-[46px] text-xs font-bold px-3 bg-white border-2 border-slate-300 rounded-xl disabled:bg-slate-100 disabled:text-slate-500"
                  >
                    <option value="full">
                      {transferProductReturnable ? 'Filled Cylinders' : 'Stock Units (Disposable)'}
                    </option>
                    {transferProductReturnable && <option value="empty">Empty Tares</option>}
                  </select>
                </div>

                <div>
                  <div className="flex justify-between items-center mb-1">
                    <label className="text-xs font-bold text-slate-700">Quantity</label>
                    <span className="text-[11px] font-bold text-slate-500">
                      Avail: <strong className="text-slate-900">{transferAvailableUnits}</strong>
                    </span>
                  </div>
                  <input
                    type="number"
                    min={1}
                    max={transferAvailableUnits}
                    inputMode="numeric"
                    value={transferUnits}
                    onChange={(e) => setTransferUnits(parseInt(e.target.value) || 1)}
                    className="w-full min-h-[46px] text-base font-black px-3.5 bg-white border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
                  />
                </div>
              </div>

              {/* Quick Presets for Quantity */}
              <div className="flex items-center gap-1.5 pt-1">
                {[5, 10, 20].map((qty) => (
                  <button
                    key={qty}
                    type="button"
                    onClick={() => setTransferUnits(Math.min(qty, transferAvailableUnits))}
                    className="px-2.5 py-1 text-xs font-bold rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 active:scale-95"
                  >
                    +{qty}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setTransferUnits(Math.max(1, transferAvailableUnits))}
                  className="px-2.5 py-1 text-xs font-bold rounded-lg border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 active:scale-95 ml-auto"
                >
                  All ({transferAvailableUnits})
                </button>
              </div>

              {/* Action buttons */}
              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <Button type="button" variant="ghost" onClick={() => setShowTransferModal(false)}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" className="font-black px-5">
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
