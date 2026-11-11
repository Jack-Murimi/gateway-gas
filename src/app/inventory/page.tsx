'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import {
  Package,
  Building2,
  Plus,
  RefreshCw,
  Search,
  CheckCircle,
  AlertTriangle,
  ArrowUpDown,
} from 'lucide-react';

export default function InventoryPage() {
  const { currentUser, branches, products, inventory, updateBranchStock, createBranch } = useStore();

  const [selectedBranchId, setSelectedBranchId] = useState<string>(branches[0]?.id || '');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<'all' | 'cylinder' | 'accessory'>('all');

  // New Branch modal state
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');
  const [newBranchCode, setNewBranchCode] = useState('');
  const [newBranchEstate, setNewBranchEstate] = useState('');
  const [newBranchPhone, setNewBranchPhone] = useState('');

  // Stock edit state
  const [editingStock, setEditingStock] = useState<{ productId: string; full: number; empty: number } | null>(null);

  if (!currentUser || currentUser.approval_status !== 'approved') {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <p className="text-sm text-slate-500">Please log in with an approved staff account.</p>
      </div>
    );
  }

  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
  const canEditStock = ['admin', 'director', 'operator'].includes(currentUser.role);
  const canAddBranch = currentUser.role === 'admin';

  // Branch inventory rows
  const branchItems = inventory.filter((i) => i.branch_id === selectedBranchId);

  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = filterCategory === 'all' || p.category === filterCategory;
    return matchesSearch && matchesCat;
  });

  const handleSaveStock = (productId: string) => {
    if (!editingStock) return;
    const existing = branchItems.find((i) => i.product_id === productId);
    const currentFull = existing ? existing.full_units : 0;
    const currentEmpty = existing ? existing.empty_units : 0;

    const fullDelta = editingStock.full - currentFull;
    const emptyDelta = editingStock.empty - currentEmpty;

    updateBranchStock(selectedBranchId, productId, fullDelta, emptyDelta);
    setEditingStock(null);
  };

  const handleCreateBranch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newBranchName || !newBranchCode || !newBranchEstate) return;
    createBranch(newBranchName, newBranchCode, newBranchEstate, newBranchPhone);
    setShowBranchModal(false);
    setNewBranchName('');
    setNewBranchCode('');
    setNewBranchEstate('');
    setNewBranchPhone('');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 space-y-6">
      {/* Page Title & Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Package className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" /> Branch Stock & Cylinder Tally
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Operator control: monitor full gas vs tare empties per distribution hub.
          </p>
        </div>

        {canAddBranch && (
          <button
            onClick={() => setShowBranchModal(true)}
            className="min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center gap-2 self-start sm:self-auto shadow"
          >
            <Plus className="w-4 h-4" /> Add Branch Hub
          </button>
        )}
      </div>

      {/* Branch Horizontal Selector */}
      <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
        {branches.map((b) => (
          <button
            key={b.id}
            onClick={() => {
              setSelectedBranchId(b.id);
              setEditingStock(null);
            }}
            className={`min-h-[44px] px-4 py-2 rounded-xl text-xs font-bold transition flex items-center gap-2 whitespace-nowrap shadow-sm ${
              selectedBranchId === b.id
                ? 'bg-orange-600 text-white shadow-md'
                : 'bg-white border border-slate-200 text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Building2 className="w-4 h-4" />
            <span>{b.name}</span>
            <span
              className={`text-[10px] px-1.5 py-0.2 rounded font-mono ${
                selectedBranchId === b.id ? 'bg-orange-700 text-white' : 'bg-slate-100 text-slate-500'
              }`}
            >
              {b.code}
            </span>
          </button>
        ))}
      </div>

      {/* Branch Summary Metrics */}
      {activeBranch && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-6 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-100">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-orange-600 font-mono">
                {activeBranch.code}
              </span>
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-0.5">{activeBranch.name}</h2>
              <p className="text-xs text-slate-500 mt-0.5">{activeBranch.location_estate}</p>
            </div>

            <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:gap-6 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-xl">
              <div className="text-center sm:text-right">
                <span className="text-[11px] text-slate-500 block font-medium">Full Cylinders</span>
                <span className="text-xl sm:text-2xl font-bold text-emerald-600">
                  {branchItems.reduce((acc, i) => acc + i.full_units, 0)}
                </span>
              </div>
              <div className="text-center sm:text-right">
                <span className="text-[11px] text-slate-500 block font-medium">Empty Tare Swaps</span>
                <span className="text-xl sm:text-2xl font-bold text-amber-600">
                  {branchItems.reduce((acc, i) => acc + i.empty_units, 0)}
                </span>
              </div>
            </div>
          </div>

          {/* Search & Filter Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative w-full sm:w-72">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search cylinder or accessory..."
                className="w-full min-h-[44px] pl-9 pr-3 py-2 text-base md:text-sm border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500 bg-slate-50/50"
              />
            </div>

            <div className="flex items-center gap-1.5 self-start sm:self-auto overflow-x-auto w-full sm:w-auto pb-1">
              {(['all', 'cylinder', 'accessory'] as const).map((cat) => (
                <button
                  key={cat}
                  onClick={() => setFilterCategory(cat)}
                  className={`min-h-[38px] px-3.5 py-1 text-xs font-bold rounded-xl capitalize transition ${
                    filterCategory === cat ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mobile Card Layout (< 768px) */}
      <div className="md:hidden space-y-3">
        {filteredProducts.map((prod) => {
          const invItem = branchItems.find((i) => i.product_id === prod.id);
          const fullCount = invItem ? invItem.full_units : 0;
          const emptyCount = invItem ? invItem.empty_units : 0;
          const isEditing = editingStock?.productId === prod.id;

          return (
            <div key={prod.id} className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-sm text-slate-900">{prod.name}</h3>
                  <div className="text-xs text-slate-500 mt-0.5">
                    {prod.brand} • {prod.category} {prod.size_kg ? `(${prod.size_kg}kg)` : ''}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-xs font-bold text-slate-900">
                    KES{' '}
                    {prod.category === 'cylinder'
                      ? prod.refill_price_kes.toLocaleString()
                      : prod.accessory_price_kes.toLocaleString()}
                  </div>
                  <div className="text-[10px] text-slate-400">Refill Price</div>
                </div>
              </div>

              {/* Stock counters */}
              <div className="grid grid-cols-2 gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-100">
                <div>
                  <span className="text-[10px] uppercase font-bold text-emerald-700 block">Full Stock</span>
                  {isEditing ? (
                    <input
                      type="number"
                      min="0"
                      value={editingStock.full}
                      onChange={(e) =>
                        setEditingStock({ ...editingStock, full: parseInt(e.target.value) || 0 })
                      }
                      className="w-full min-h-[38px] px-2 py-1 text-sm border border-slate-300 rounded-lg text-center font-bold"
                    />
                  ) : (
                    <span className="text-base font-bold text-slate-800">{fullCount} units</span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] uppercase font-bold text-amber-700 block">Empty Tare</span>
                  {prod.category === 'cylinder' ? (
                    isEditing ? (
                      <input
                        type="number"
                        min="0"
                        value={editingStock.empty}
                        onChange={(e) =>
                          setEditingStock({ ...editingStock, empty: parseInt(e.target.value) || 0 })
                        }
                        className="w-full min-h-[38px] px-2 py-1 text-sm border border-slate-300 rounded-lg text-center font-bold"
                      />
                    ) : (
                      <span className="text-base font-bold text-slate-800">{emptyCount} empties</span>
                    )
                  ) : (
                    <span className="text-xs text-slate-300 block pt-1.5">—</span>
                  )}
                </div>
              </div>

              {canEditStock && (
                <div className="pt-1">
                  {isEditing ? (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handleSaveStock(prod.id)}
                        className="min-h-[40px] bg-emerald-600 text-white font-bold text-xs rounded-xl"
                      >
                        Save Count
                      </button>
                      <button
                        onClick={() => setEditingStock(null)}
                        className="min-h-[40px] bg-slate-100 text-slate-700 font-bold text-xs rounded-xl"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() =>
                        setEditingStock({
                          productId: prod.id,
                          full: fullCount,
                          empty: emptyCount,
                        })
                      }
                      className="w-full min-h-[40px] bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition flex items-center justify-center gap-1.5"
                    >
                      <RefreshCw className="w-3.5 h-3.5" /> Adjust Stock Balance
                    </button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Desktop Table (>= 768px) */}
      <div className="hidden md:block bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3 px-6">Product / Brand</th>
                <th className="py-3 px-6">Category & Size</th>
                <th className="py-3 px-6 text-center">Full Gas Stock</th>
                <th className="py-3 px-6 text-center">Empty Tare Stock</th>
                <th className="py-3 px-6 text-right">Standard Refill Price</th>
                {canEditStock && <th className="py-3 px-6 text-right">Operator Tally</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.map((prod) => {
                const invItem = branchItems.find((i) => i.product_id === prod.id);
                const fullCount = invItem ? invItem.full_units : 0;
                const emptyCount = invItem ? invItem.empty_units : 0;
                const isEditing = editingStock?.productId === prod.id;

                return (
                  <tr key={prod.id} className="hover:bg-slate-50">
                    <td className="py-3.5 px-6">
                      <div className="font-bold text-slate-900">{prod.name}</div>
                      <div className="text-xs text-slate-500 font-medium">{prod.brand}</div>
                    </td>

                    <td className="py-3.5 px-6">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-700">
                        {prod.category} {prod.size_kg ? `• ${prod.size_kg}kg` : ''}
                      </span>
                    </td>

                    <td className="py-3.5 px-6 text-center">
                      {isEditing ? (
                        <input
                          type="number"
                          min="0"
                          value={editingStock.full}
                          onChange={(e) =>
                            setEditingStock({ ...editingStock, full: parseInt(e.target.value) || 0 })
                          }
                          className="w-16 px-2 py-1 text-xs border border-slate-300 rounded text-center font-bold text-emerald-700"
                        />
                      ) : (
                        <span
                          className={`font-bold text-sm ${
                            fullCount === 0 ? 'text-red-500' : fullCount < 5 ? 'text-amber-600' : 'text-emerald-700'
                          }`}
                        >
                          {fullCount} units
                        </span>
                      )}
                    </td>

                    <td className="py-3.5 px-6 text-center">
                      {prod.category === 'cylinder' ? (
                        isEditing ? (
                          <input
                            type="number"
                            min="0"
                            value={editingStock.empty}
                            onChange={(e) =>
                              setEditingStock({ ...editingStock, empty: parseInt(e.target.value) || 0 })
                            }
                            className="w-16 px-2 py-1 text-xs border border-slate-300 rounded text-center font-bold text-amber-700"
                          />
                        ) : (
                          <span className="font-bold text-sm text-amber-700">{emptyCount} empties</span>
                        )
                      ) : (
                        <span className="text-xs text-slate-300">—</span>
                      )}
                    </td>

                    <td className="py-3.5 px-6 text-right font-medium text-slate-700 text-xs">
                      {prod.category === 'cylinder'
                        ? `KES ${prod.refill_price_kes.toLocaleString()}`
                        : `KES ${prod.accessory_price_kes.toLocaleString()}`}
                    </td>

                    {canEditStock && (
                      <td className="py-3.5 px-6 text-right">
                        {isEditing ? (
                          <div className="flex items-center justify-end gap-1">
                            <button
                              onClick={() => handleSaveStock(prod.id)}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingStock(null)}
                              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800"
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              setEditingStock({
                                productId: prod.id,
                                full: fullCount,
                                empty: emptyCount,
                              })
                            }
                            className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-xs rounded transition flex items-center gap-1 ml-auto"
                          >
                            <RefreshCw className="w-3 h-3" /> Adjust
                          </button>
                        )}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add Branch Modal */}
      {showBranchModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-900 mb-1">Add New Distribution Branch</h3>
            <p className="text-xs text-slate-500 mb-4">
              Expand Gateway Gas network to a new Nairobi estate or station.
            </p>

            <form onSubmit={handleCreateBranch} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Name *</label>
                <input
                  type="text"
                  required
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  placeholder="e.g. Lang'ata Hub"
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Branch Code (Unique) *</label>
                <input
                  type="text"
                  required
                  value={newBranchCode}
                  onChange={(e) => setNewBranchCode(e.target.value.toUpperCase())}
                  placeholder="e.g. LNG-05"
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm font-mono uppercase border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Estate / Location *</label>
                <input
                  type="text"
                  required
                  value={newBranchEstate}
                  onChange={(e) => setNewBranchEstate(e.target.value)}
                  placeholder="e.g. Lang'ata Road, Nairobi"
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Contact Phone</label>
                <input
                  type="text"
                  value={newBranchPhone}
                  onChange={(e) => setNewBranchPhone(e.target.value)}
                  placeholder="+254..."
                  className="w-full min-h-[44px] px-3 py-2 text-base md:text-sm border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-orange-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBranchModal(false)}
                  className="min-h-[44px] px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="min-h-[44px] px-5 py-2 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl transition shadow"
                >
                  Save Branch
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
