'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Bike,
  Building2,
  CheckCircle2,
  IdCard,
  Mail,
  MessageCircle,
  Phone,
  Save,
  Search,
  ShieldCheck,
  UserCheck,
  Users,
  UserX,
  X,
} from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { createClient } from '@/lib/supabase/client';
import { displayKenyanPhone, normalizeKenyanPhone } from '@/lib/formatters';
import { fieldClass, labelClass } from '@/components/pos/pos-ui';
import type { ApprovalStatus, StaffProfile, UserRole } from '@/types';

const ROLE_META: Record<UserRole, { label: string; cls: string }> = {
  admin: { label: 'Admin', cls: 'bg-purple-100 text-purple-800' },
  director: { label: 'Director', cls: 'bg-indigo-100 text-indigo-800' },
  operator: { label: 'Operator', cls: 'bg-sky-100 text-sky-800' },
  sales_rep: { label: 'Sales Rep', cls: 'bg-emerald-100 text-emerald-800' },
  rider: { label: 'Rider', cls: 'bg-amber-100 text-amber-900' },
  pending: { label: 'Pending', cls: 'bg-slate-100 text-slate-600' },
};

const STATUS_META: Record<ApprovalStatus, { label: string; cls: string }> = {
  approved: { label: 'Active', cls: 'bg-emerald-50 text-emerald-700' },
  pending: { label: 'Pending', cls: 'bg-amber-50 text-amber-800' },
  rejected: { label: 'Suspended', cls: 'bg-rose-50 text-rose-700' },
};

function initialsOf(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'ST';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export default function StaffManagementPage() {
  const { currentUser, staffList, branches, orders, approveStaff, rejectStaff, refreshLiveData } = useStore();
  const { showSuccess, showError } = useToast();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | ApprovalStatus>('all');
  const [roleFilter, setRoleFilter] = useState<'all' | UserRole>('all');
  const [branchFilter, setBranchFilter] = useState('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingRoles, setPendingRoles] = useState<Record<string, UserRole>>({});
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    phone: '',
    national_id: '',
    role: 'sales_rep' as UserRole,
    branch_id: '',
    vehicle_plate: '',
    notes: '',
  });

  const branchMap = useMemo(() => new Map(branches.map((b) => [b.id, b])), [branches]);

  const activityByStaff = useMemo(() => {
    const map = new Map<string, { sales: number; deliveries: number }>();
    const bump = (id: string | null | undefined, field: 'sales' | 'deliveries') => {
      if (!id) return;
      const cur = map.get(id) || { sales: 0, deliveries: 0 };
      cur[field] += 1;
      map.set(id, cur);
    };
    for (const o of orders) {
      if (o.delivery_status === 'cancelled') continue;
      bump(o.sales_rep_id, 'sales');
      if (o.delivery_status === 'delivered') {
        const riders = o.rider_ids?.length ? o.rider_ids : o.rider_id ? [o.rider_id] : [];
        riders.forEach((rid) => bump(rid, 'deliveries'));
      }
    }
    return map;
  }, [orders]);

  const pendingStaff = useMemo(() => staffList.filter((s) => s.approval_status === 'pending'), [staffList]);
  const approvedStaff = useMemo(() => staffList.filter((s) => s.approval_status === 'approved'), [staffList]);
  const rejectedStaff = useMemo(() => staffList.filter((s) => s.approval_status === 'rejected'), [staffList]);
  const activeRiders = useMemo(() => approvedStaff.filter((s) => s.role === 'rider'), [approvedStaff]);

  const filteredStaff = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staffList
      .filter((s) => {
        if (statusFilter !== 'all' && s.approval_status !== statusFilter) return false;
        if (roleFilter !== 'all' && s.role !== roleFilter) return false;
        if (branchFilter === 'floating' && s.branch_id) return false;
        if (branchFilter !== 'all' && branchFilter !== 'floating' && s.branch_id !== branchFilter) return false;
        if (!q) return true;
        return [s.full_name, s.email, s.phone, s.national_id, s.vehicle_plate, s.role]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const order = { pending: 0, approved: 1, rejected: 2 };
        const diff = order[a.approval_status] - order[b.approval_status];
        return diff !== 0 ? diff : a.full_name.localeCompare(b.full_name);
      });
  }, [staffList, search, statusFilter, roleFilter, branchFilter]);

  const selected = useMemo<StaffProfile | null>(
    () => staffList.find((s) => s.id === selectedId) ?? filteredStaff[0] ?? null,
    [staffList, selectedId, filteredStaff],
  );

  useEffect(() => {
    if (!selected) return;
    setForm({
      full_name: selected.full_name || '',
      phone: selected.phone || '',
      national_id: selected.national_id || '',
      role: selected.role === 'pending' ? (selected.vehicle_plate ? 'rider' : 'sales_rep') : selected.role,
      branch_id: selected.branch_id || '',
      vehicle_plate: selected.vehicle_plate || '',
      notes: selected.notes || '',
    });
  }, [selected?.id, selected?.updated_at]);

  if (!currentUser || !['admin', 'director'].includes(currentUser.role) || currentUser.approval_status !== 'approved') {
    return (
      <main className="mx-auto max-w-md space-y-3 px-4 py-16 text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-100 text-rose-600">
          <AlertCircle className="h-7 w-7" />
        </div>
        <h1 className="text-lg font-bold text-slate-900">Access Restricted</h1>
        <p className="text-xs text-slate-500">Staff management and approvals require Admin or Director access.</p>
      </main>
    );
  }

  const defaultPendingRole = (staff: StaffProfile): UserRole =>
    pendingRoles[staff.id] ?? (staff.vehicle_plate ? 'rider' : 'sales_rep');

  const handleQuickApprove = (staff: StaffProfile) => {
    const role = defaultPendingRole(staff);
    approveStaff(staff.id, role);
    showSuccess(`Approved ${staff.full_name} as ${ROLE_META[role].label}.`);
  };

  const handleQuickReject = (staff: StaffProfile) => {
    if (staff.id === currentUser.id) return showError('You cannot suspend your own account.');
    if (!window.confirm(`Suspend / reject ${staff.full_name}'s access?`)) return;
    rejectStaff(staff.id);
    showSuccess(`${staff.full_name} access revoked.`);
  };

  const handleSaveStaff = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!form.full_name.trim()) return showError('Full name is required.');
    if (selected.id === currentUser.id && form.role !== currentUser.role) {
      if (!window.confirm('You are changing your own role. Continue?')) return;
    }

    setSaving(true);
    const supabase = createClient();
    const { error } = await supabase
      .from('profiles')
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim() ? normalizeKenyanPhone(form.phone.trim()) : null,
        national_id: form.national_id.trim() || null,
        role: form.role,
        branch_id: form.branch_id || null,
        vehicle_plate: form.vehicle_plate.trim().toUpperCase() || null,
        notes: form.notes.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', selected.id);

    setSaving(false);
    if (error) return showError(error.message);
    await refreshLiveData();
    showSuccess(`Saved changes for ${form.full_name.trim()}.`);
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setRoleFilter('all');
    setBranchFilter('all');
  };

  const isFiltered = Boolean(search || statusFilter !== 'all' || roleFilter !== 'all' || branchFilter !== 'all');
  const selectedPhone = selected?.phone ? normalizeKenyanPhone(selected.phone) : '';
  const selectedWhatsApp = selectedPhone ? selectedPhone.replace(/\D/g, '') : '';

  return (
    <main className="mx-auto max-w-[1440px] space-y-3 px-2 pb-24 pt-2 sm:px-4 lg:px-5">
      {/* Compact Header */}
      <header className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-slate-300 bg-white px-3 py-2">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-orange-600" />
          <h1 className="text-sm font-bold text-slate-950">Staff & Roles</h1>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-slate-600">
            {staffList.length} total
          </span>
        </div>
        {pendingStaff.length > 0 && (
          <button
            type="button"
            onClick={() => setStatusFilter(statusFilter === 'pending' ? 'all' : 'pending')}
            className="inline-flex h-7 items-center gap-1.5 rounded bg-amber-100 px-2.5 text-xs font-semibold text-amber-900 hover:bg-amber-200"
          >
            <AlertCircle className="h-3.5 w-3.5" />
            {pendingStaff.length} pending approval{pendingStaff.length === 1 ? '' : 's'}
          </button>
        )}
      </header>

      {/* KPI Cards */}
      <section className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active staff</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{approvedStaff.length}</p>
          <p className="text-[11px] text-slate-500">
            {approvedStaff.filter((s) => ['admin', 'director'].includes(s.role)).length} mgmt ·{' '}
            {approvedStaff.filter((s) => ['operator', 'sales_rep'].includes(s.role)).length} ops/sales
          </p>
        </div>

        <div className={`rounded-md border p-3 ${pendingStaff.length > 0 ? 'border-amber-300 bg-amber-50/50' : 'border-slate-300 bg-white'}`}>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Pending approvals</p>
          <p className={`mt-1 text-lg font-bold tabular-nums ${pendingStaff.length > 0 ? 'text-amber-800' : 'text-emerald-700'}`}>
            {pendingStaff.length}
          </p>
          <p className="text-[11px] text-slate-500">
            {pendingStaff.length > 0 ? 'Waiting for role assignment' : 'All requests processed'}
          </p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Active riders</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{activeRiders.length}</p>
          <p className="text-[11px] text-slate-500">
            {activeRiders.filter((r) => r.vehicle_plate).length} with bike plates
          </p>
        </div>

        <div className="rounded-md border border-slate-300 bg-white p-3">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">Suspended / Rejected</p>
          <p className="mt-1 text-lg font-bold tabular-nums text-slate-950">{rejectedStaff.length}</p>
          <p className="text-[11px] text-slate-500">No system access</p>
        </div>
      </section>

      {/* Pending Approvals Callout (only shown when there are pending signups) */}
      {pendingStaff.length > 0 && (
        <section className="overflow-hidden rounded-md border border-amber-300 bg-white">
          <div className="flex items-center justify-between border-b border-amber-200 bg-amber-50 px-3 py-2">
            <h2 className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wide text-amber-950">
              <AlertCircle className="h-4 w-4 text-amber-600" /> Pending Approvals ({pendingStaff.length})
            </h2>
          </div>
          <div className="divide-y divide-amber-100">
            {pendingStaff.map((staff) => (
              <div key={staff.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-slate-900">{staff.full_name}</span>
                    {staff.vehicle_plate && (
                      <span className="inline-flex items-center gap-1 rounded bg-orange-50 px-1.5 py-0.5 font-mono text-[10px] font-semibold text-orange-800">
                        <Bike className="h-3 w-3" /> {staff.vehicle_plate}
                      </span>
                    )}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                    <span>{staff.email}</span>
                    {staff.phone && <span className="tabular-nums">{displayKenyanPhone(staff.phone)}</span>}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <select
                    aria-label={`Assign role for ${staff.full_name}`}
                    value={defaultPendingRole(staff)}
                    onChange={(e) => setPendingRoles((prev) => ({ ...prev, [staff.id]: e.target.value as UserRole }))}
                    className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-800 outline-none focus:border-orange-500"
                  >
                    <option value="sales_rep">Sales Rep</option>
                    <option value="operator">Operator</option>
                    <option value="rider">Rider</option>
                    <option value="director">Director</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => handleQuickApprove(staff)}
                    className="inline-flex h-8 items-center gap-1 rounded bg-emerald-600 px-3 text-xs font-semibold text-white hover:bg-emerald-700"
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" /> Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => handleQuickReject(staff)}
                    className="inline-flex h-8 items-center rounded border border-rose-300 bg-white px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-50"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Single-Row Search & Filters */}
      <section className="flex flex-wrap items-center gap-1.5 rounded-md border border-slate-300 bg-white p-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, phone, email, ID or plate…"
            aria-label="Search staff"
            className="h-8 w-full rounded border border-slate-300 bg-white pl-8 pr-7 text-xs text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              aria-label="Clear search"
              className="absolute right-1 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded text-slate-400 hover:bg-slate-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as 'all' | ApprovalStatus)}
          aria-label="Filter by status"
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="all">All statuses</option>
          <option value="approved">Active</option>
          <option value="pending">Pending</option>
          <option value="rejected">Suspended</option>
        </select>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as 'all' | UserRole)}
          aria-label="Filter by role"
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="all">All roles</option>
          <option value="admin">Admin</option>
          <option value="director">Director</option>
          <option value="operator">Operator</option>
          <option value="sales_rep">Sales Rep</option>
          <option value="rider">Rider</option>
        </select>
        <select
          value={branchFilter}
          onChange={(e) => setBranchFilter(e.target.value)}
          aria-label="Filter by branch"
          className="h-8 rounded border border-slate-300 bg-white px-2 text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="all">All branches</option>
          <option value="floating">Floating / Any</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>{b.name}</option>
          ))}
        </select>
        {isFiltered && (
          <button type="button" onClick={clearFilters} className="h-8 px-1.5 text-xs font-semibold text-orange-700 hover:underline">
            Clear
          </button>
        )}
      </section>

      {/* Main 2-column Master-Detail layout */}
      <div className="grid items-start gap-3 lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Left: Staff Roster Table */}
        <section className="overflow-hidden rounded-md border border-slate-300 bg-white">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[680px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-300 bg-slate-100 text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Employee</th>
                  <th className="px-2.5 py-2">Contact</th>
                  <th className="px-2.5 py-2">Role & Status</th>
                  <th className="px-2.5 py-2">Branch</th>
                  <th className="px-2.5 py-2">ID / Plate</th>
                  <th className="px-3 py-2 text-right">Activity</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {filteredStaff.map((staff) => {
                  const isSelected = selected?.id === staff.id;
                  const roleStyle = ROLE_META[staff.role] ?? ROLE_META.pending;
                  const statusStyle = STATUS_META[staff.approval_status] ?? STATUS_META.pending;
                  const branchName = staff.branch_id ? branchMap.get(staff.branch_id)?.name : null;
                  const stats = activityByStaff.get(staff.id);
                  return (
                    <tr
                      key={staff.id}
                      onClick={() => setSelectedId(staff.id)}
                      className={`cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-orange-50/80 ring-1 ring-inset ring-orange-300'
                          : 'odd:bg-white even:bg-slate-50/50 hover:bg-slate-100/70'
                      }`}
                    >
                      <td className="px-3 py-2.5">
                        <div className="flex items-center gap-2.5">
                          <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-[11px] font-bold ${isSelected ? 'bg-orange-600 text-white' : 'bg-slate-200 text-slate-700'}`}>
                            {initialsOf(staff.full_name)}
                          </span>
                          <div className="min-w-0">
                            <p className="truncate font-bold text-slate-900">
                              {staff.full_name}
                              {staff.id === currentUser.id && <span className="ml-1 text-[10px] font-semibold text-orange-700">(You)</span>}
                            </p>
                            <p className="text-[10px] text-slate-400">
                              {staff.created_at ? `Joined ${new Date(staff.created_at).toLocaleDateString('en-KE', { month: 'short', year: 'numeric' })}` : '—'}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-2.5 py-2.5">
                        <div className="font-semibold tabular-nums text-slate-800">{displayKenyanPhone(staff.phone)}</div>
                        <div className="max-w-[180px] truncate text-[11px] text-slate-500">{staff.email}</div>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5">
                        <div className="flex flex-wrap items-center gap-1">
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${roleStyle.cls}`}>{roleStyle.label}</span>
                          <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${statusStyle.cls}`}>{statusStyle.label}</span>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 text-slate-700">
                        {branchName ? (
                          <span className="font-medium">{branchName}</span>
                        ) : (
                          <span className="text-slate-400">Floating</span>
                        )}
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2.5 font-mono text-[11px] text-slate-600">
                        {staff.vehicle_plate && <div className="font-semibold text-orange-800">{staff.vehicle_plate}</div>}
                        {staff.national_id && <div>ID: {staff.national_id}</div>}
                        {!staff.vehicle_plate && !staff.national_id && <span className="text-slate-300">—</span>}
                      </td>
                      <td className="whitespace-nowrap px-3 py-2.5 text-right tabular-nums text-slate-600">
                        {stats ? (
                          <div className="space-y-0.5">
                            {stats.sales > 0 && <div><strong>{stats.sales}</strong> sales</div>}
                            {stats.deliveries > 0 && <div><strong>{stats.deliveries}</strong> deliveries</div>}
                          </div>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {filteredStaff.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                      No staff match your filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* Right: Sticky Staff Editor Panel */}
        <aside className="rounded-md border border-slate-300 bg-white lg:sticky lg:top-20">
          {!selected ? (
            <div className="p-8 text-center text-xs text-slate-500">Select a staff member to view or edit details.</div>
          ) : (
            <div>
              <div className="flex items-start justify-between gap-2 border-b border-slate-200 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <h2 className="truncate text-sm font-bold text-slate-950">{selected.full_name}</h2>
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-semibold ${STATUS_META[selected.approval_status].cls}`}>
                      {STATUS_META[selected.approval_status].label}
                    </span>
                  </div>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-[11px] text-slate-500">
                    <Mail className="h-3 w-3 shrink-0" /> {selected.email}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  {selectedPhone && (
                    <a
                      href={`tel:${selectedPhone}`}
                      title="Call staff"
                      className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white text-emerald-700 hover:bg-emerald-50"
                    >
                      <Phone className="h-3.5 w-3.5" />
                    </a>
                  )}
                  {selectedWhatsApp && (
                    <a
                      href={`https://wa.me/${selectedWhatsApp}`}
                      target="_blank"
                      rel="noreferrer"
                      title="WhatsApp staff"
                      className="grid h-7 w-7 place-items-center rounded border border-slate-300 bg-white text-emerald-700 hover:bg-emerald-50"
                    >
                      <MessageCircle className="h-3.5 w-3.5" />
                    </a>
                  )}
                </div>
              </div>

              <form onSubmit={handleSaveStaff} className="space-y-2.5 p-3">
                <div>
                  <label className={labelClass}>Full name *</label>
                  <input
                    required
                    value={form.full_name}
                    onChange={(e) => setForm((prev) => ({ ...prev, full_name: e.target.value }))}
                    className={fieldClass}
                  />
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>Phone number</label>
                    <input
                      value={form.phone}
                      onChange={(e) => setForm((prev) => ({ ...prev, phone: e.target.value }))}
                      placeholder="0712 345 678"
                      className={fieldClass}
                    />
                  </div>
                  <div>
                    <label className={labelClass}>
                      <span className="inline-flex items-center gap-1"><IdCard className="h-3 w-3" /> National ID</span>
                    </label>
                    <input
                      value={form.national_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, national_id: e.target.value }))}
                      placeholder="e.g. 34567890"
                      className={fieldClass}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className={labelClass}>
                      <span className="inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Role</span>
                    </label>
                    <select
                      value={form.role}
                      onChange={(e) => setForm((prev) => ({ ...prev, role: e.target.value as UserRole }))}
                      className={fieldClass}
                    >
                      <option value="admin">Admin</option>
                      <option value="director">Director</option>
                      <option value="operator">Operator</option>
                      <option value="sales_rep">Sales Rep</option>
                      <option value="rider">Rider</option>
                    </select>
                  </div>
                  <div>
                    <label className={labelClass}>
                      <span className="inline-flex items-center gap-1"><Building2 className="h-3 w-3" /> Home branch</span>
                    </label>
                    <select
                      value={form.branch_id}
                      onChange={(e) => setForm((prev) => ({ ...prev, branch_id: e.target.value }))}
                      className={fieldClass}
                    >
                      <option value="">Floating / All hubs</option>
                      {branches.filter((b) => b.is_active).map((b) => (
                        <option key={b.id} value={b.id}>{b.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass}>
                    <span className="inline-flex items-center gap-1"><Bike className="h-3 w-3" /> Motorbike / Vehicle plate</span>
                  </label>
                  <input
                    value={form.vehicle_plate}
                    onChange={(e) => setForm((prev) => ({ ...prev, vehicle_plate: e.target.value.toUpperCase() }))}
                    placeholder="e.g. KMDX 412M"
                    className={`${fieldClass} font-mono uppercase`}
                  />
                </div>

                <div>
                  <label className={labelClass}>Internal notes (emergency contact, shift, etc.)</label>
                  <textarea
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm((prev) => ({ ...prev, notes: e.target.value }))}
                    placeholder="Optional HR or operational notes"
                    className="w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30"
                  />
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-200 pt-2.5">
                  {selected.id !== currentUser.id ? (
                    selected.approval_status === 'approved' ? (
                      <button
                        type="button"
                        onClick={() => handleQuickReject(selected)}
                        className="inline-flex h-8 items-center gap-1 rounded border border-rose-300 bg-rose-50 px-2.5 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <UserX className="h-3.5 w-3.5" /> Suspend
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          approveStaff(selected.id, form.role);
                          showSuccess(`${selected.full_name} approved as ${ROLE_META[form.role].label}.`);
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100"
                      >
                        <UserCheck className="h-3.5 w-3.5" /> Approve / Restore
                      </button>
                    )
                  ) : (
                    <span className="text-[11px] text-slate-400">Signed-in account</span>
                  )}

                  <button
                    type="submit"
                    disabled={saving}
                    className="inline-flex h-8 items-center gap-1.5 rounded bg-orange-600 px-3 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-50"
                  >
                    <Save className="h-3.5 w-3.5" /> {saving ? 'Saving…' : 'Save details'}
                  </button>
                </div>
              </form>
            </div>
          )}
        </aside>
      </div>
    </main>
  );
}
