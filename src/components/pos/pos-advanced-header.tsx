'use client';

import { useEffect, useId, useRef, useState } from 'react';
import type { Branch, StaffProfile } from '@/types';
import { Building2, Calendar, ChevronDown, Lock, Receipt } from 'lucide-react';

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

/** Today's date as YYYY-MM-DD in the device's own timezone (Nairobi for staff). */
function todayLocalISO(): string {
  const d = new Date();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

/** "Today" or "11 Nov 2026". Falls back to the raw string if it can't be parsed. */
function formatSaleDate(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  if (!y || !m || !d) return iso;
  if (iso === todayLocalISO()) return 'Today';
  return new Date(y, m - 1, d).toLocaleDateString('en-KE', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

// 16px text on inputs stops iOS Safari from zooming the page when a field is focused.
const fieldClass =
  'w-full min-h-[48px] rounded-xl border border-slate-300 bg-white px-3 text-base text-slate-900 ' +
  'placeholder:text-slate-400 focus:border-orange-500 focus:outline-none focus:ring-2 focus:ring-orange-500/30 ' +
  'disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500';

const labelClass = 'mb-1 block text-sm font-semibold text-slate-700';

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
  const receiptInputRef = useRef<HTMLInputElement>(null);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const pendingFocus = useRef<'receipt' | 'date' | null>(null);

  const uid = useId();
  const panelId = `${uid}-panel`;
  const branchId = `${uid}-branch`;
  const receiptId = `${uid}-receipt`;
  const dateId = `${uid}-date`;

  // ponytail: role check determines date edit rights; upgrade to granular branch permission table if sub-roles are added.
  const canEditDate = Boolean(currentUser && ['admin', 'director', 'operator'].includes(currentUser.role));
  const activeBranch = branches.find((b) => b.id === selectedBranchId) || branches[0];
  const hasReceipt = receiptNumber.trim().length > 0;

  useEffect(() => {
    if (isExpanded && pendingFocus.current) {
      pendingFocus.current = null;
      receiptInputRef.current?.focus();
    }
  }, [isExpanded]);

  const openAndFocusReceipt = () => {
    pendingFocus.current = 'receipt';
    if (isExpanded) {
      receiptInputRef.current?.focus();
    } else {
      setIsExpanded(true);
    }
  };

  return (
    <section
      aria-label="Branch, receipt number and sale date"
      className="rounded-2xl border border-slate-200 bg-white text-left shadow-sm"
    >
      {/* Summary row: always visible, wraps cleanly from 320px up */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 p-3 sm:px-4">
        <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
          <div className="flex max-w-full min-w-0 items-center gap-1.5 rounded-xl bg-slate-100 px-3 py-1.5">
            <Building2 className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
            <span className="truncate text-sm font-bold text-slate-900">
              {activeBranch?.name || 'Main Hub'}
            </span>
          </div>

          {/* On-click date picker: no extra "change" text field, 1-tap direct date picker */}
          {canEditDate ? (
            <label
              title="Click to change sale date"
              className="relative flex items-center gap-1.5 text-sm font-semibold text-slate-700 hover:text-orange-600 transition rounded-xl px-2 py-1.5 hover:bg-orange-50 cursor-pointer"
            >
              <Calendar className="h-4 w-4 shrink-0 text-orange-600" aria-hidden="true" />
              <time dateTime={receiptDate} suppressHydrationWarning>
                {formatSaleDate(receiptDate)}
              </time>
              <input
                type="date"
                value={receiptDate}
                onChange={(e) => onChangeDate(e.target.value)}
                onClick={(e) => (e.target as HTMLInputElement).showPicker?.()}
                className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
                aria-label="Sale date"
              />
            </label>
          ) : (
            <div className="flex items-center gap-1.5 text-sm text-slate-600 px-2 py-1.5">
              <Calendar className="h-4 w-4 shrink-0" aria-hidden="true" />
              <time dateTime={receiptDate} suppressHydrationWarning>
                {formatSaleDate(receiptDate)}
              </time>
            </div>
          )}

          {hasReceipt ? (
            <div className="flex max-w-full min-w-0 items-center gap-1.5 rounded-lg bg-slate-100 px-2 py-1 font-mono text-sm text-slate-800">
              <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate">#{receiptNumber}</span>
            </div>
          ) : (
            <button
              type="button"
              onClick={openAndFocusReceipt}
              className="flex min-h-[36px] items-center gap-1.5 rounded-lg border border-amber-300 bg-amber-50 px-2.5 text-sm font-semibold text-amber-800 transition hover:bg-amber-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-amber-600"
            >
              <Receipt className="h-4 w-4 shrink-0" aria-hidden="true" />
              Add receipt no.
            </button>
          )}
        </div>

        <button
          type="button"
          onClick={() => setIsExpanded((v) => !v)}
          aria-expanded={isExpanded}
          aria-controls={panelId}
          className="flex min-h-[44px] shrink-0 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-orange-700 transition hover:bg-orange-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600"
        >
          <span>{isExpanded ? 'Done' : 'Edit details'}</span>
          <ChevronDown
            className={`h-4 w-4 transition-transform duration-200 motion-reduce:transition-none ${
              isExpanded ? 'rotate-180' : ''
            }`}
            aria-hidden="true"
          />
        </button>
      </div>

      {/* Collapsible panel with standard conditional rendering for reliable form interactivity */}
      {isExpanded && (
        <div id={panelId} className="border-t border-slate-100 p-3 sm:p-4 animate-in slide-in-from-top-1 duration-150">
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-3">
            <div>
              <label htmlFor={branchId} className={labelClass}>
                Branch
              </label>
              <select
                id={branchId}
                value={selectedBranchId}
                onChange={(e) => onSelectBranch(e.target.value)}
                disabled={branches.length < 2}
                className={`${fieldClass} font-semibold`}
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={receiptId} className={labelClass}>
                Paper receipt no.
              </label>
              <input
                ref={receiptInputRef}
                id={receiptId}
                type="text"
                value={receiptNumber}
                onChange={(e) => onChangeReceiptNumber(e.target.value)}
                placeholder="e.g. NXG-4102"
                autoComplete="off"
                autoCapitalize="characters"
                autoCorrect="off"
                spellCheck={false}
                required
                className={`${fieldClass} font-mono font-semibold`}
              />
            </div>

            <div>
              <label htmlFor={dateId} className={labelClass}>
                Sale date {canEditDate ? '' : '(Locked)'}
              </label>
              <input
                ref={dateInputRef}
                id={dateId}
                type="date"
                value={receiptDate}
                onChange={(e) => onChangeDate(e.target.value)}
                onClick={(e) => canEditDate && (e.target as HTMLInputElement).showPicker?.()}
                disabled={!canEditDate}
                aria-describedby={canEditDate ? undefined : `${dateId}-hint`}
                className={`${fieldClass} ${canEditDate ? 'cursor-pointer hover:border-orange-500' : ''}`}
              />
              {!canEditDate && (
                <p
                  id={`${dateId}-hint`}
                  className="mt-1 flex items-center gap-1 text-sm text-slate-500"
                >
                  <Lock className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                  Only admins, directors and operators can change this.
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
