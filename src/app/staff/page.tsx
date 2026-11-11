'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { UserRole } from '@/types';
import { Users, CheckCircle, XCircle, ShieldCheck, AlertCircle, Phone, Mail, Bike } from 'lucide-react';

export default function StaffManagementPage() {
  const { currentUser, staffList, approveStaff, rejectStaff } = useStore();
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});

  if (!currentUser || !['admin', 'director'].includes(currentUser.role)) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-16 text-center">
        <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-3" />
        <h1 className="text-xl font-bold text-slate-900">Access Denied</h1>
        <p className="text-sm text-slate-500 mt-1">Staff management and user approvals require Admin or Director credentials.</p>
      </div>
    );
  }

  const pendingStaff = staffList.filter((s) => s.approval_status === 'pending');
  const approvedStaff = staffList.filter((s) => s.approval_status === 'approved');

  const handleRoleChange = (staffId: string, role: UserRole) => {
    setSelectedRoles((prev) => ({ ...prev, [staffId]: role }));
  };

  const handleApprove = (staffId: string) => {
    const role = selectedRoles[staffId] || 'sales_rep';
    approveStaff(staffId, role);
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 space-y-6">
      {/* Page Title */}
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900 flex items-center gap-2">
          <Users className="w-5 h-5 sm:w-6 sm:h-6 text-orange-600" /> Staff Directory & RBAC Approvals
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Review new employee registrations, assign operational roles, and manage permissions.
        </p>
      </div>

      {/* 1. Pending Approvals Section */}
      <div className="bg-white rounded-2xl border border-amber-200 shadow-sm overflow-hidden">
        <div className="bg-amber-50 px-4 sm:px-6 py-4 border-b border-amber-100 flex items-center justify-between">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-amber-900 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-amber-600" /> Pending Employee Approvals ({pendingStaff.length})
            </h2>
            <p className="text-xs text-amber-700">These accounts are blocked until you approve them and grant a role.</p>
          </div>
        </div>

        {pendingStaff.length === 0 ? (
          <div className="p-8 text-center text-slate-400 text-xs sm:text-sm">
            <CheckCircle className="w-8 h-8 text-emerald-500 mx-auto mb-2 opacity-80" />
            No pending registrations at this time. All staff requests are processed.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {pendingStaff.map((staff) => (
              <div key={staff.id} className="p-4 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm sm:text-base text-slate-900">{staff.full_name}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-100 text-amber-800">
                      Pending
                    </span>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 sm:gap-4 text-xs text-slate-500 mt-1">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5" /> {staff.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5" /> {staff.phone || 'No phone'}
                    </span>
                    {staff.vehicle_plate && (
                      <span className="flex items-center gap-1 font-mono font-semibold text-slate-700">
                        <Bike className="w-3.5 h-3.5" /> Plate: {staff.vehicle_plate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-3">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-semibold text-slate-600 shrink-0">Role:</label>
                    <select
                      value={selectedRoles[staff.id] || (staff.vehicle_plate ? 'rider' : 'sales_rep')}
                      onChange={(e) => handleRoleChange(staff.id, e.target.value as UserRole)}
                      className="flex-1 sm:flex-none min-h-[44px] text-xs font-semibold border border-slate-300 rounded-xl px-3 py-1.5 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-orange-500"
                    >
                      <option value="sales_rep">Sales Rep</option>
                      <option value="operator">Operator (Stock & Dispatch)</option>
                      <option value="rider">Rider (Deliveries)</option>
                      <option value="director">Director (Audit & Analytics)</option>
                      <option value="admin">Admin (Full System Access)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                    <button
                      onClick={() => handleApprove(staff.id)}
                      className="min-h-[44px] px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition shadow flex items-center justify-center gap-1"
                    >
                      <CheckCircle className="w-3.5 h-3.5" /> Approve
                    </button>

                    <button
                      onClick={() => rejectStaff(staff.id)}
                      className="min-h-[44px] px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold rounded-xl transition flex items-center justify-center"
                    >
                      Reject
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Active Staff Roster */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="text-sm sm:text-base font-bold text-slate-900">Active Staff Roster ({approvedStaff.length})</h2>
          <span className="text-[11px] sm:text-xs text-slate-400">Can float across any branch</span>
        </div>

        {/* Mobile Cards View (< 768px) */}
        <div className="md:hidden divide-y divide-slate-100">
          {approvedStaff.map((staff) => (
            <div key={staff.id} className="p-4 space-y-2.5">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-sm text-slate-900">{staff.full_name}</div>
                  <div className="text-xs text-slate-500">{staff.email}</div>
                  {staff.phone && <div className="text-xs text-slate-400">{staff.phone}</div>}
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                  {staff.role.replace('_', ' ')}
                </span>
              </div>

              {staff.vehicle_plate && (
                <div className="text-xs font-mono text-slate-600 flex items-center gap-1">
                  <Bike className="w-3.5 h-3.5 text-slate-400" /> Plate: {staff.vehicle_plate}
                </div>
              )}

              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold text-slate-500">Change Role:</span>
                <select
                  value={staff.role}
                  onChange={(e) => approveStaff(staff.id, e.target.value as UserRole)}
                  className="min-h-[40px] text-xs font-semibold border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 text-slate-800"
                >
                  <option value="admin">Admin</option>
                  <option value="director">Director</option>
                  <option value="operator">Operator</option>
                  <option value="sales_rep">Sales Rep</option>
                  <option value="rider">Rider</option>
                </select>
              </div>
            </div>
          ))}
        </div>

        {/* Desktop Table View (>= 768px) */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-semibold">
              <tr>
                <th className="py-3 px-6">Employee Name</th>
                <th className="py-3 px-6">Email & Phone</th>
                <th className="py-3 px-6">Current Role</th>
                <th className="py-3 px-6">Plate</th>
                <th className="py-3 px-6 text-right">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {approvedStaff.map((staff) => (
                <tr key={staff.id} className="hover:bg-slate-50">
                  <td className="py-3.5 px-6 font-semibold text-slate-900">{staff.full_name}</td>
                  <td className="py-3.5 px-6 text-xs text-slate-600">
                    <div>{staff.email}</div>
                    <div className="text-slate-400">{staff.phone}</div>
                  </td>
                  <td className="py-3.5 px-6">
                    <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-100 text-slate-800 border border-slate-200">
                      {staff.role.replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3.5 px-6 text-xs font-mono text-slate-600">{staff.vehicle_plate || '—'}</td>
                  <td className="py-3.5 px-6 text-right">
                    <select
                      value={staff.role}
                      onChange={(e) => approveStaff(staff.id, e.target.value as UserRole)}
                      className="text-xs border border-slate-200 rounded-lg px-2.5 py-1.5 bg-white text-slate-700 font-medium"
                    >
                      <option value="admin">Admin</option>
                      <option value="director">Director</option>
                      <option value="operator">Operator</option>
                      <option value="sales_rep">Sales Rep</option>
                      <option value="rider">Rider</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
