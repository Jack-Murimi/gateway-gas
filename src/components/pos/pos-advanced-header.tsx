'use client';

import type { Branch, StaffProfile } from '@/types';
import { Building2, CalendarDays, ReceiptText, LockKeyhole } from 'lucide-react';

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

const fieldClass =
  'w-full min-h-[46px] rounded-xl border border-slate-300 bg-white px-3 text-base font-semibold text-slate-900 ' +
  'focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/20 disabled:bg-slate-100 disabled:text-slate-500';

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
  const canEditDate = ['admin', 'director', 'operator'].includes(currentUser.role);
  const activeBranch = branches.find((branch) => branch.id === selectedBranchId) || branches[0];

  return (
    <section aria-label="Sale setup" className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm text-left">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-lg font-black tracking-tight text-slate-950">New sale</h1>
          <p className="text-sm text-slate-500">Confirm the sale details before adding products.</p>
        </div>
        <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-bold uppercase tracking-wide text-slate-600">
          {currentUser.role.replace('_', ' ')}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="min-w-0">
          <label htmlFor="pos-branch" className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            <Building2 className="h-4 w-4 text-orange-600" /> Selling branch
          </label>
          <select
            id="pos-branch"
            value={selectedBranchId}
            onChange={(event) => onSelectBranch(event.target.value)}
            disabled={branches.length < 2}
            className={fieldClass}
          >
            {branches.map((branch) => (
              <option key={branch.id} value={branch.id}>{branch.name}</option>
            ))}
          </select>
          {activeBranch && <p className="mt-1 truncate text-xs text-slate-500">{activeBranch.location_estate}</p>}
        </div>

        <div className="min-w-0">
          <label htmlFor="pos-receipt-date" className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            <CalendarDays className="h-4 w-4 text-orange-600" /> Sale date
            {!canEditDate && <LockKeyhole className="h-3.5 w-3.5 text-slate-400" />}
          </label>
          <input
            id="pos-receipt-date"
            type="date"
            value={receiptDate}
            onChange={(event) => onChangeDate(event.target.value)}
            disabled={!canEditDate}
            className={fieldClass}
          />
          <p className="mt-1 text-xs text-slate-500">{canEditDate ? 'Change only when correcting a backdated sale.' : 'Date changes are restricted.'}</p>
        </div>

        <div className="min-w-0">
          <label htmlFor="pos-receipt-number" className="mb-1.5 flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-600">
            <ReceiptText className="h-4 w-4 text-orange-600" /> Paper receipt number
            <span className="text-red-600">*</span>
          </label>
          <input
            id="pos-receipt-number"
            type="text"
            value={receiptNumber}
            onChange={(event) => onChangeReceiptNumber(event.target.value.toUpperCase())}
            placeholder="e.g. JM-00421"
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            required
            className={fieldClass + ' font-mono'}
          />
          <p className="mt-1 text-xs text-slate-500">Required to complete the sale.</p>
        </div>
      </div>
    </section>
  );
}
