'use client';

import React, { useState } from 'react';
import { Bike as BikeIcon, Fuel, Plus, RefreshCw, Save, Wrench, X } from 'lucide-react';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';
import { formatKES } from '@/lib/formatters';
import type { BikeExpenseSummaryRow } from '@/lib/expenses';
import type { Bike, Branch, ExpenseCategory, StaffProfile } from '@/types';

interface BikesPanelProps {
  bikes: Bike[];
  bikeSummaries: BikeExpenseSummaryRow[];
  branches: Branch[];
  staffList: StaffProfile[];
  periodLabel: string;
  unsyncedPlatesCount: number;
  saving: boolean;
  onSaveBike: (
    editingBikeId: string | null,
    payload: {
      plate_number: string;
      model: string;
      branch_id: string;
      assigned_rider_id: string;
      notes: string;
    },
  ) => Promise<boolean>;
  onToggleBikeActive: (bike: Bike) => Promise<void>;
  onSyncFromStaff: () => Promise<void>;
  onQuickRecordForBike: (bikeId: string, category: Extract<ExpenseCategory, 'fuel' | 'bike_service'>) => void;
  onFilterLedgerByBike: (bikeId: string) => void;
}

export function BikesPanel({
  bikes,
  bikeSummaries,
  branches,
  staffList,
  periodLabel,
  unsyncedPlatesCount,
  saving,
  onSaveBike,
  onToggleBikeActive,
  onSyncFromStaff,
  onQuickRecordForBike,
  onFilterLedgerByBike,
}: BikesPanelProps) {
  const [editingBikeId, setEditingBikeId] = useState<string | null>(null);
  const [form, setForm] = useState({
    plate_number: '',
    model: '',
    branch_id: '',
    assigned_rider_id: '',
    notes: '',
  });

  const activeBranches = branches.filter((b) => b.is_active);
  const approvedStaff = staffList
    .filter((s) => s.approval_status === 'approved')
    .sort((a, b) => {
      if (a.role === 'rider' && b.role !== 'rider') return -1;
      if (a.role !== 'rider' && b.role === 'rider') return 1;
      return a.full_name.localeCompare(b.full_name);
    });

  const resetForm = () => {
    setEditingBikeId(null);
    setForm({ plate_number: '', model: '', branch_id: '', assigned_rider_id: '', notes: '' });
  };

  const startEdit = (bike: Bike) => {
    setEditingBikeId(bike.id);
    setForm({
      plate_number: bike.plate_number,
      model: bike.model || '',
      branch_id: bike.branch_id || '',
      assigned_rider_id: bike.assigned_rider_id || '',
      notes: bike.notes || '',
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const ok = await onSaveBike(editingBikeId, form);
    if (ok) resetForm();
  };

  const totalFuel = bikeSummaries.reduce((s, r) => s + r.fuel_kes, 0);
  const totalService = bikeSummaries.reduce((s, r) => s + r.service_kes, 0);
  const totalFleet = bikeSummaries.reduce((s, r) => s + r.total_kes, 0);

  return (
    <section className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_360px]">
      {/* Left: Fleet Cost Table */}
      <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 px-3 py-2">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-700">
              Fleet & Per-Bike Costs · {periodLabel}
            </h2>
            <p className="text-[11px] text-slate-500">
              {bikes.filter((b) => b.is_active).length} active bikes · Fuel{' '}
              <strong className="tabular-nums text-slate-800">{formatKES(totalFuel)}</strong> · Service{' '}
              <strong className="tabular-nums text-slate-800">{formatKES(totalService)}</strong> · Total{' '}
              <strong className="tabular-nums text-slate-900">{formatKES(totalFleet)}</strong>
            </p>
          </div>
          {unsyncedPlatesCount > 0 && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void onSyncFromStaff()}
              className="inline-flex h-7 items-center gap-1.5 rounded border border-orange-300 bg-orange-50 px-2.5 text-xs font-semibold text-orange-800 hover:bg-orange-100 disabled:opacity-50"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Import {unsyncedPlatesCount} plate{unsyncedPlatesCount === 1 ? '' : 's'} from Staff
            </button>
          )}
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] border-collapse text-left text-xs">
            <thead>
              <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2">Bike</th>
                <th className="px-2.5 py-2">Rider & Branch</th>
                <th className="px-2.5 py-2 text-right">Fuel</th>
                <th className="px-2.5 py-2 text-right">Service</th>
                <th className="px-2.5 py-2 text-right">Total</th>
                <th className="px-2.5 py-2 text-right">Last Odo</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {bikeSummaries.map((row) => {
                const bike = bikes.find((b) => b.id === row.bike_id);
                if (!bike) return null;
                return (
                  <tr key={row.bike_id} className="odd:bg-white even:bg-slate-50/50 hover:bg-slate-100/70">
                    <td className="px-3 py-2.5">
                      <div className="flex items-center gap-2">
                        <span className="grid h-7 w-7 shrink-0 place-items-center rounded bg-amber-50 text-amber-800">
                          <BikeIcon className="h-3.5 w-3.5" />
                        </span>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => onFilterLedgerByBike(bike.id)}
                              className="font-mono text-xs font-bold text-slate-950 hover:text-orange-700 hover:underline"
                            >
                              {row.plate_number}
                            </button>
                            {!row.is_active && (
                              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                Inactive
                              </span>
                            )}
                          </div>
                          {row.model && <p className="truncate text-[11px] text-slate-500">{row.model}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-2.5 py-2.5">
                      <p className="font-medium text-slate-800">{row.rider_name || <span className="text-slate-400">Unassigned</span>}</p>
                      <p className="text-[11px] text-slate-500">{row.branch_name || 'Floating'}</p>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums">
                      <p className="font-semibold text-slate-900">{formatKES(row.fuel_kes)}</p>
                      <p className="text-[10px] text-slate-500">
                        {row.fuel_entries} fill{row.fuel_entries === 1 ? '' : 's'}
                        {row.fuel_litres > 0 ? ` · ${row.fuel_litres.toFixed(1)}L` : ''}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-right tabular-nums">
                      <p className="font-semibold text-slate-900">{formatKES(row.service_kes)}</p>
                      <p className="text-[10px] text-slate-500">
                        {row.service_entries} job{row.service_entries === 1 ? '' : 's'}
                      </p>
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-bold tabular-nums text-slate-950">
                      {formatKES(row.total_kes)}
                    </td>
                    <td className="whitespace-nowrap px-2.5 py-2.5 text-right font-mono text-[11px] tabular-nums text-slate-600">
                      {row.last_odometer_km !== null ? `${row.last_odometer_km.toLocaleString('en-KE')} km` : '—'}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2.5 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {bike.is_active && (
                          <>
                            <button
                              type="button"
                              onClick={() => onQuickRecordForBike(bike.id, 'fuel')}
                              title="Record fuel for this bike"
                              className="inline-flex h-6 items-center gap-1 rounded border border-amber-300 bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-900 hover:bg-amber-100"
                            >
                              <Fuel className="h-3 w-3" /> Fuel
                            </button>
                            <button
                              type="button"
                              onClick={() => onQuickRecordForBike(bike.id, 'bike_service')}
                              title="Record service for this bike"
                              className="inline-flex h-6 items-center gap-1 rounded border border-orange-300 bg-orange-50 px-1.5 text-[11px] font-semibold text-orange-900 hover:bg-orange-100"
                            >
                              <Wrench className="h-3 w-3" /> Service
                            </button>
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() => startEdit(bike)}
                          className="px-1.5 text-[11px] font-semibold text-slate-600 hover:text-slate-950"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => void onToggleBikeActive(bike)}
                          className="px-1 text-[11px] font-semibold text-slate-500 hover:text-slate-900"
                        >
                          {bike.is_active ? 'Deactivate' : 'Activate'}
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {bikeSummaries.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-xs text-slate-500">
                    No bikes registered yet. Add your delivery bikes on the right to track per-bike fuel and service costs.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Right: Add / Edit Bike Form */}
      <aside className="rounded-md border border-slate-300 bg-white lg:sticky lg:top-20">
        <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2.5">
          <div>
            <h2 className="text-sm font-bold text-slate-950">
              {editingBikeId ? 'Edit bike' : 'Add delivery bike'}
            </h2>
            <p className="text-[11px] text-slate-500">Register fleet bikes for fuel & service tracking</p>
          </div>
          {editingBikeId && (
            <button
              type="button"
              onClick={resetForm}
              aria-label="Cancel edit bike"
              className="grid h-7 w-7 place-items-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <form onSubmit={handleSubmit} className="space-y-2.5 p-3">
          <div>
            <label htmlFor="bike-plate" className={labelClass}>Plate Number *</label>
            <input
              id="bike-plate"
              required
              value={form.plate_number}
              onChange={(e) => setForm((p) => ({ ...p, plate_number: e.target.value.toUpperCase() }))}
              placeholder="e.g. KMD 421B"
              className={`${fieldClass} font-mono uppercase`}
            />
          </div>
          <div>
            <label htmlFor="bike-model" className={labelClass}>Bike Model / Make</label>
            <input
              id="bike-model"
              value={form.model}
              onChange={(e) => setForm((p) => ({ ...p, model: e.target.value }))}
              placeholder="e.g. Bajaj Boxer BM 150, TVS HLX"
              className={fieldClass}
            />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label htmlFor="bike-branch" className={labelClass}>Home Branch</label>
              <select
                id="bike-branch"
                value={form.branch_id}
                onChange={(e) => setForm((p) => ({ ...p, branch_id: e.target.value }))}
                className={fieldClass}
              >
                <option value="">Floating / Any</option>
                {activeBranches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="bike-rider" className={labelClass}>Assigned Rider</label>
              <select
                id="bike-rider"
                value={form.assigned_rider_id}
                onChange={(e) => setForm((p) => ({ ...p, assigned_rider_id: e.target.value }))}
                className={fieldClass}
              >
                <option value="">Unassigned</option>
                {approvedStaff.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} ({s.role.replace('_', ' ')})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label htmlFor="bike-notes" className={labelClass}>Notes (insurance, chassis, etc.)</label>
            <textarea
              id="bike-notes"
              rows={2}
              value={form.notes}
              onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))}
              placeholder="Optional maintenance schedule or insurance renewal date"
              className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
            />
          </div>

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-2.5">
            {editingBikeId && (
              <button
                type="button"
                onClick={resetForm}
                className="h-8 rounded border border-slate-300 px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
            )}
            <button
              type="submit"
              disabled={saving}
              className="inline-flex h-8 items-center gap-1.5 rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
            >
              {editingBikeId ? <Save className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
              {saving ? 'Saving…' : editingBikeId ? 'Save bike' : 'Add bike'}
            </button>
          </div>
        </form>
      </aside>
    </section>
  );
}
