'use client';

import React, { useState } from 'react';
import { Branch, StaffProfile } from '@/types';
import { Calendar, Receipt, Building2, ChevronDown, ChevronUp } from 'lucide-react';

interface PosAdvancedHeaderProps {
  branches: Branch[];
  selectedBranchId: string;
  onSelectBranch: (id: string) => void;
  receiptDate: string;
  onChangeDate: (date: string) => void;
  receiptNumber: string;
  onChangeReceiptNumber: (num: string) => void;
  currentUser: StaffProfile;
}

export function PosAdvancedHeader({
  branches,
  selectedBranchId,
  onSelectBranch,
  receiptDate,
  onChangeDate,
  receiptNumber,
  onChangeReceiptNumber,
  currentUser,
}: PosAdvancedHeaderProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const canEditDate = currentUser.role === 'admin' || currentUser.role === 'director' || currentUser.role === 'operator';
  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];

  return (
    <div className="bg-white rounded-2xl border-2 border-slate-200 shadow-sm p-3 text-left">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap text-sm font-bold text-slate-700">
          <div className="flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-xl">
            <Building2 className="w-4 h-4 text-orange-600 shrink-0" />
            <span className="font-black text-slate-900">{activeBranch?.name || 'Main Hub'}</span>
          </div>

          <div className="flex items-center gap-1.5 text-xs text-slate-500">
            <Calendar className="w-3.5 h-3.5" />
            <span>{receiptDate}</span>
          </div>

          {receiptNumber && (
            <div className="flex items-center gap-1.5 text-xs text-slate-800 font-mono bg-slate-100 px-2 py-0.5 rounded">
              <Receipt className="w-3.5 h-3.5" />
              <span>#{receiptNumber}</span>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-xs font-black text-orange-600 hover:text-orange-700 flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-orange-50 transition"
        >
          <span>{isExpanded ? 'Hide Options' : 'Station & Receipt Options'}</span>
          {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
        </button>
      </div>

      {isExpanded && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 mt-3 border-t-2 border-slate-100 animate-in slide-in-from-top-1">
          {/* Branch Station */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Branch Station Hub</label>
            <select
              value={selectedBranchId}
              onChange={(e) => onSelectBranch(e.target.value)}
              className="w-full min-h-[44px] text-sm px-3 bg-white text-slate-900 border-2 border-slate-300 rounded-xl font-bold focus:border-orange-500 focus:outline-none"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name} ({b.code})
                </option>
              ))}
            </select>
          </div>

          {/* Physical Receipt Ticket Number */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Paper Receipt Ticket #</label>
            <input
              type="text"
              value={receiptNumber}
              onChange={(e) => onChangeReceiptNumber(e.target.value)}
              placeholder="e.g. WST-4102"
              className="w-full min-h-[44px] text-sm px-3 font-mono font-bold text-black border-2 border-slate-300 rounded-xl focus:border-orange-500 focus:outline-none"
            />
          </div>

          {/* Date */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Sale Date</label>
            <input
              type="date"
              disabled={!canEditDate}
              value={receiptDate}
              onChange={(e) => onChangeDate(e.target.value)}
              className="w-full min-h-[44px] text-sm px-3 bg-white text-slate-900 border-2 border-slate-300 rounded-xl font-bold disabled:bg-slate-100 disabled:text-slate-500 focus:border-orange-500 focus:outline-none"
            />
          </div>
        </div>
      )}
    </div>
  );
}
