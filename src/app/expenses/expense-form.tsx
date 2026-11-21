'use client';

import React, { useState } from 'react';
import { Bike as BikeIcon, Fuel, Plus, Save, User, Wrench, X } from 'lucide-react';
import { fieldClass, labelClass, PAYMENT_METHODS } from '@/components/pos/pos-ui';
import {
  CATEGORY_META_MAP,
  EXPENSE_CATEGORIES,
  type ExpenseDraft,
} from '@/lib/expenses';
import type { Bike, Branch, Expense, ExpenseCategory, PaymentMethod, StaffProfile } from '@/types';

interface ExpenseFormProps {
  editingExpense: Expense | null;
  draft: ExpenseDraft;
  onChange: (patch: Partial<ExpenseDraft>) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancelEdit: () => void;
  saving: boolean;
  bikes: Bike[];
  branches: Branch[];
  staffList: StaffProfile[];
  onQuickAddBike: (payload: {
    plate_number: string;
    model: string;
    branch_id: string;
    assigned_rider_id: string;
  }) => Promise<Bike | null>;
}

export function ExpenseForm({
  editingExpense,
  draft,
  onChange,
  onSubmit,
  onCancelEdit,
  saving,
  bikes,
  branches,
  staffList,
  onQuickAddBike,
}: ExpenseFormProps) {
  const [showAddBike, setShowAddBike] = useState(false);
  const [addingBike, setAddingBike] = useState(false);
  const [newBikePlate, setNewBikePlate] = useState('');
  const [newBikeModel, setNewBikeModel] = useState('');
  const [newBikeBranch, setNewBikeBranch] = useState('');
  const [newBikeRider, setNewBikeRider] = useState('');

  const meta = CATEGORY_META_MAP[draft.category];
  const activeBranches = branches.filter((b) => b.is_active);
  const activeStaff = staffList
    .filter((s) => s.approval_status === 'approved')
    .sort((a, b) => a.full_name.localeCompare(b.full_name));
  const riders = activeStaff.filter((s) => s.role === 'rider');

  const selectableBikes = bikes.filter((b) => b.is_active || b.id === draft.bike_id);

  const handleCategoryChange = (category: ExpenseCategory) => {
    const nextMeta = CATEGORY_META_MAP[category];
    const patch: Partial<ExpenseDraft> = { category };
    if (!nextMeta.requiresBike) {
      patch.bike_id = '';
    }
    if (!nextMeta.supportsFuelFields) {
      patch.fuel_litres = '';
    }
    if (!nextMeta.supportsOdometer) {
      patch.odometer_km = '';
    }
    if (category !== 'salary') {
      patch.salary_period = '';
    } else if (!draft.salary_period) {
      patch.salary_period = draft.expense_date.slice(0, 7);
    }
    if (!nextMeta.supportsStaff) {
      patch.staff_id = '';
    }
    onChange(patch);
  };

  const handleBikeSelect = (bikeId: string) => {
    const selectedBike = bikes.find((b) => b.id === bikeId);
    const patch: Partial<ExpenseDraft> = { bike_id: bikeId };
    if (selectedBike) {
      if (!draft.branch_id && selectedBike.branch_id) {
        patch.branch_id = selectedBike.branch_id;
      }
      if (draft.category === 'fuel' && !draft.staff_id && selectedBike.assigned_rider_id) {
        patch.staff_id = selectedBike.assigned_rider_id;
      }
    }
    onChange(patch);
  };

  const handleStaffSelect = (staffId: string) => {
    const member = staffList.find((s) => s.id === staffId);
    const patch: Partial<ExpenseDraft> = { staff_id: staffId };
    if (member && draft.category === 'salary') {
      if (!draft.branch_id && member.branch_id) {
        patch.branch_id = member.branch_id;
      }
      if (!draft.description.trim()) {
        const period = draft.salary_period || draft.expense_date.slice(0, 7);
        patch.description = `Salary — ${member.full_name} (${period})`;
      }
    }
    onChange(patch);
  };

  const handleQuickBikeSubmit = async () => {
    if (!newBikePlate.trim()) return;
    setAddingBike(true);
    const created = await onQuickAddBike({
      plate_number: newBikePlate,
      model: newBikeModel,
      branch_id: newBikeBranch,
      assigned_rider_id: newBikeRider,
    });
    setAddingBike(false);
    if (created) {
      onChange({
        bike_id: created.id,
        branch_id: draft.branch_id || created.branch_id || '',
        staff_id: draft.category === 'fuel' ? (draft.staff_id || created.assigned_rider_id || '') : draft.staff_id,
      });
      setNewBikePlate('');
      setNewBikeModel('');
      setNewBikeBranch('');
      setNewBikeRider('');
      setShowAddBike(false);
    }
  };

  const costPerLitre =
    draft.category === 'fuel' && Number(draft.amount_kes) > 0 && Number(draft.fuel_litres) > 0
      ? Number(draft.amount_kes) / Number(draft.fuel_litres)
      : null;

  return (
    <aside className="rounded-md border border-slate-300 bg-white lg:sticky lg:top-20">
      <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
        <div>
          <h2 className="text-sm font-bold text-slate-950">
            {editingExpense ? 'Edit expense' : 'Record expense'}
          </h2>
          <p className="text-[11px] text-slate-500">
            {editingExpense
              ? 'Update details for this posted expense'
              : 'Director & Admin accounting ledger'}
          </p>
        </div>
        {editingExpense && (
          <button
            type="button"
            onClick={onCancelEdit}
            aria-label="Cancel editing"
            className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
          >
            <X className="h-4 w-4" />
          </button>
        )}
      </div>

      <form onSubmit={onSubmit} className="space-y-2.5 p-3">
        {/* Category Picker */}
        <div>
          <span className={labelClass}>Category *</span>
          <div className="grid grid-cols-2 gap-1 sm:grid-cols-4 lg:grid-cols-2">
            {EXPENSE_CATEGORIES.map((cat) => {
              const active = draft.category === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => handleCategoryChange(cat.value)}
                  className={`flex h-8 items-center justify-between rounded border px-2 text-left text-xs font-semibold transition ${
                    active
                      ? 'border-orange-500 bg-orange-50 text-orange-950 ring-1 ring-orange-500/30'
                      : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="truncate">{cat.shortLabel}</span>
                  {cat.requiresBike && (
                    <BikeIcon
                      className={`h-3 w-3 shrink-0 ${active ? 'text-orange-600' : 'text-slate-400'}`}
                      aria-hidden="true"
                    />
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Date & Amount */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="exp-date" className={labelClass}>Date *</label>
            <input
              id="exp-date"
              type="date"
              required
              value={draft.expense_date}
              onChange={(e) => onChange({ expense_date: e.target.value })}
              className={fieldClass}
            />
          </div>
          <div>
            <label htmlFor="exp-amount" className={labelClass}>Amount (KES) *</label>
            <input
              id="exp-amount"
              type="number"
              required
              min="1"
              step="0.01"
              value={draft.amount_kes}
              onChange={(e) => onChange({ amount_kes: e.target.value })}
              placeholder="0.00"
              className={`${fieldClass} font-semibold tabular-nums`}
            />
          </div>
        </div>

        {/* Specific Bike selector (required for Fuel & Bike Service) */}
        {meta.requiresBike && (
          <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50/50 p-2.5">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="exp-bike" className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-amber-950">
                {draft.category === 'fuel' ? (
                  <Fuel className="h-3 w-3 text-amber-700" />
                ) : (
                  <Wrench className="h-3 w-3 text-orange-700" />
                )}
                Specific Bike *
              </label>
              <button
                type="button"
                onClick={() => setShowAddBike((v) => !v)}
                className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-orange-700 hover:text-orange-800"
              >
                <Plus className="h-3 w-3" />
                {showAddBike ? 'Close' : 'Add bike'}
              </button>
            </div>

            <select
              id="exp-bike"
              required
              value={draft.bike_id}
              onChange={(e) => handleBikeSelect(e.target.value)}
              className={fieldClass}
            >
              <option value="">Select bike plate…</option>
              {selectableBikes.map((bike) => (
                <option key={bike.id} value={bike.id}>
                  {bike.plate_number}
                  {bike.assigned_rider?.full_name ? ` · ${bike.assigned_rider.full_name}` : ''}
                  {bike.model ? ` (${bike.model})` : ''}
                  {!bike.is_active ? ' [Inactive]' : ''}
                </option>
              ))}
            </select>

            {selectableBikes.length === 0 && !showAddBike && (
              <p className="text-[11px] text-amber-900">
                No bikes registered yet. Click <strong>+ Add bike</strong> above to add your first delivery bike.
              </p>
            )}

            {showAddBike && (
              <div className="space-y-2 rounded border border-amber-300 bg-white p-2">
                <p className="text-[11px] font-bold text-slate-800">Quick-add delivery bike</p>
                <div className="grid grid-cols-2 gap-1.5">
                  <input
                    value={newBikePlate}
                    onChange={(e) => setNewBikePlate(e.target.value.toUpperCase())}
                    placeholder="Plate e.g. KMD 421B *"
                    className={`${fieldClass} font-mono uppercase`}
                  />
                  <input
                    value={newBikeModel}
                    onChange={(e) => setNewBikeModel(e.target.value)}
                    placeholder="Model e.g. Boxer 150"
                    className={fieldClass}
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={newBikeBranch}
                    onChange={(e) => setNewBikeBranch(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Home branch…</option>
                    {activeBranches.map((b) => (
                      <option key={b.id} value={b.id}>{b.name}</option>
                    ))}
                  </select>
                  <select
                    value={newBikeRider}
                    onChange={(e) => setNewBikeRider(e.target.value)}
                    className={fieldClass}
                  >
                    <option value="">Assigned rider…</option>
                    {riders.map((r) => (
                      <option key={r.id} value={r.id}>{r.full_name}</option>
                    ))}
                  </select>
                </div>
                <div className="flex justify-end gap-1.5">
                  <button
                    type="button"
                    onClick={() => setShowAddBike(false)}
                    className="h-7 rounded border border-slate-300 px-2 text-[11px] font-semibold text-slate-600 hover:bg-slate-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    disabled={addingBike || !newBikePlate.trim()}
                    onClick={() => void handleQuickBikeSubmit()}
                    className="h-7 rounded bg-slate-900 px-2.5 text-[11px] font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
                  >
                    {addingBike ? 'Adding…' : 'Save & select'}
                  </button>
                </div>
              </div>
            )}

            {/* Fuel Litres & Odometer */}
            <div className="grid grid-cols-2 gap-2">
              {meta.supportsFuelFields && (
                <div>
                  <label htmlFor="exp-litres" className={labelClass}>Litres (optional)</label>
                  <input
                    id="exp-litres"
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={draft.fuel_litres}
                    onChange={(e) => onChange({ fuel_litres: e.target.value })}
                    placeholder="e.g. 5.5"
                    className={`${fieldClass} tabular-nums`}
                  />
                </div>
              )}
              <div className={meta.supportsFuelFields ? '' : 'col-span-2'}>
                <label htmlFor="exp-odometer" className={labelClass}>Odometer km (optional)</label>
                <input
                  id="exp-odometer"
                  type="number"
                  min="0"
                  step="1"
                  value={draft.odometer_km}
                  onChange={(e) => onChange({ odometer_km: e.target.value })}
                  placeholder="e.g. 24850"
                  className={`${fieldClass} tabular-nums`}
                />
              </div>
            </div>

            {costPerLitre !== null && (
              <p className="text-[11px] font-medium text-amber-900 tabular-nums">
                Effective fuel price: <strong>KES {costPerLitre.toFixed(2)} / L</strong>
              </p>
            )}

            {draft.category === 'fuel' && (
              <div>
                <label htmlFor="exp-rider" className={labelClass}>Rider (optional)</label>
                <select
                  id="exp-rider"
                  value={draft.staff_id}
                  onChange={(e) => onChange({ staff_id: e.target.value })}
                  className={fieldClass}
                >
                  <option value="">Not specified</option>
                  {activeStaff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.full_name} ({s.role.replace('_', ' ')})
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Salary-specific Staff & Period fields */}
        {draft.category === 'salary' && (
          <div className="grid grid-cols-1 gap-2 rounded-md border border-indigo-200 bg-indigo-50/50 p-2.5 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <label htmlFor="exp-staff" className="mb-0.5 flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-indigo-950">
                <User className="h-3 w-3 text-indigo-700" /> Staff Member
              </label>
              <select
                id="exp-staff"
                value={draft.staff_id}
                onChange={(e) => handleStaffSelect(e.target.value)}
                className={fieldClass}
              >
                <option value="">Casual / Non-system payee</option>
                {activeStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} · {s.role.replace('_', ' ')}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label htmlFor="exp-salary-period" className={labelClass}>Pay Period (Month)</label>
              <input
                id="exp-salary-period"
                type="month"
                value={draft.salary_period}
                onChange={(e) => onChange({ salary_period: e.target.value })}
                className={fieldClass}
              />
            </div>
          </div>
        )}

        {/* Description */}
        <div>
          <label htmlFor="exp-desc" className={labelClass}>Description *</label>
          <input
            id="exp-desc"
            required
            value={draft.description}
            onChange={(e) => onChange({ description: e.target.value })}
            placeholder={meta.descriptionPlaceholder}
            className={fieldClass}
          />
        </div>

        {/* Payment Method & Reference */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="exp-method" className={labelClass}>Payment Method *</label>
            <select
              id="exp-method"
              value={draft.payment_method}
              onChange={(e) => onChange({ payment_method: e.target.value as PaymentMethod })}
              className={fieldClass}
            >
              {PAYMENT_METHODS.map((pm) => (
                <option key={pm.value} value={pm.value}>{pm.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="exp-ref" className={labelClass}>Reference / Receipt #</label>
            <input
              id="exp-ref"
              value={draft.payment_reference}
              onChange={(e) => onChange({ payment_reference: e.target.value })}
              placeholder="e.g. M-Pesa code"
              className={fieldClass}
            />
          </div>
        </div>

        {/* Branch & Vendor */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label htmlFor="exp-branch" className={labelClass}>Branch</label>
            <select
              id="exp-branch"
              value={draft.branch_id}
              onChange={(e) => onChange({ branch_id: e.target.value })}
              className={fieldClass}
            >
              <option value="">Company-wide / HQ</option>
              {activeBranches.map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="exp-vendor" className={labelClass}>
              {draft.category === 'salary' ? 'Payee (optional)' : 'Vendor / Station'}
            </label>
            <input
              id="exp-vendor"
              value={draft.vendor_name}
              onChange={(e) => onChange({ vendor_name: e.target.value })}
              placeholder={meta.vendorPlaceholder}
              className={fieldClass}
            />
          </div>
        </div>

        {/* Notes */}
        <div>
          <label htmlFor="exp-notes" className={labelClass}>Notes (optional)</label>
          <textarea
            id="exp-notes"
            rows={2}
            value={draft.notes}
            onChange={(e) => onChange({ notes: e.target.value })}
            placeholder="Receipt details, approvals, or extra context"
            className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
          />
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-2.5">
          {editingExpense && (
            <button
              type="button"
              onClick={onCancelEdit}
              className="inline-flex h-8 items-center rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
          )}
          <button
            type="submit"
            disabled={saving}
            className="inline-flex h-8 items-center gap-1.5 rounded bg-orange-600 px-3.5 text-xs font-semibold text-white transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Save className="h-3.5 w-3.5" />
            {saving ? 'Saving…' : editingExpense ? 'Save changes' : 'Record expense'}
          </button>
        </div>
      </form>
    </aside>
  );
}
