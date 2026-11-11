'use client';

import React, { useState } from 'react';
import { useStore } from '@/context/store-context';
import { UserRole } from '@/types';
import { Users, CheckCircle2, XCircle, ShieldCheck, AlertCircle, Phone, Mail, Bike } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/toast';
import { displayKenyanPhone } from '@/lib/formatters';

export default function StaffManagementPage() {
  const { currentUser, staffList, approveStaff, rejectStaff } = useStore();
  const { showSuccess, showError } = useToast();
  const [selectedRoles, setSelectedRoles] = useState<Record<string, UserRole>>({});

  if (!currentUser || !['admin', 'director'].includes(currentUser.role)) {
    return (
      <div className="max-w-md mx-auto px-4 py-16 text-center space-y-4">
        <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto">
          <AlertCircle className="w-9 h-9" />
        </div>
        <h1 className="text-2xl font-black text-slate-900">Access Restricted</h1>
        <p className="text-sm text-slate-600">Staff management and RBAC approvals require Admin or Director credentials.</p>
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
    const staff = staffList.find((s) => s.id === staffId);
    showSuccess(`Approved ${staff?.full_name || 'Staff'} as ${role.replace('_', ' ')}.`);
  };

  const handleReject = (staffId: string) => {
    rejectStaff(staffId);
    showError('Staff registration rejected.');
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 pb-24 md:pb-12 space-y-6 text-left">
      <div>
        <h1 className="text-2xl font-black text-slate-900 flex items-center gap-2">
          <Users className="w-6 h-6 text-orange-600" /> Staff Directory & RBAC Approvals
        </h1>
        <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
          Review new employee registrations, assign operational roles, and manage permissions.
        </p>
      </div>

      {/* 1. Pending Approvals Section */}
      <div className="bg-white rounded-3xl border-2 border-amber-300 shadow-sm overflow-hidden">
        <div className="bg-amber-50 px-5 py-4 border-b-2 border-amber-200 flex items-center justify-between">
          <div>
            <h2 className="text-base font-black text-amber-950 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" /> Pending Approvals ({pendingStaff.length})
            </h2>
            <p className="text-xs font-bold text-amber-800">New employee accounts waiting for operational role assignment.</p>
          </div>
          {pendingStaff.length > 0 && <Badge variant="warning">{pendingStaff.length} Waiting</Badge>}
        </div>

        {pendingStaff.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm font-bold">
            <CheckCircle2 className="w-10 h-10 text-emerald-500 mx-auto mb-2" />
            No pending registrations at this time. All staff requests have been processed.
          </div>
        ) : (
          <div className="divide-y-2 divide-slate-100">
            {pendingStaff.map((staff) => (
              <div key={staff.id} className="p-4 sm:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-black text-base text-slate-900">{staff.full_name}</span>
                    <Badge variant="warning">Pending</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-slate-600">
                    <span className="flex items-center gap-1">
                      <Mail className="w-3.5 h-3.5 text-slate-400" /> {staff.email}
                    </span>
                    <span className="flex items-center gap-1">
                      <Phone className="w-3.5 h-3.5 text-slate-400" /> {displayKenyanPhone(staff.phone)}
                    </span>
                    {staff.vehicle_plate && (
                      <span className="flex items-center gap-1 font-mono text-orange-700 bg-orange-50 px-2 py-0.5 rounded-lg border border-orange-200">
                        <Bike className="w-3.5 h-3.5" /> Bike: {staff.vehicle_plate}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5">
                  <div className="flex items-center gap-2">
                    <label className="text-xs font-black uppercase text-slate-500 shrink-0">Role:</label>
                    <select
                      value={selectedRoles[staff.id] || (staff.vehicle_plate ? 'rider' : 'sales_rep')}
                      onChange={(e) => handleRoleChange(staff.id, e.target.value as UserRole)}
                      className="min-h-[48px] text-sm font-bold border-2 border-slate-300 rounded-xl px-3 bg-white text-slate-900 focus:border-orange-500 focus:outline-none"
                    >
                      <option value="sales_rep">Sales Rep (POS)</option>
                      <option value="operator">Operator (Dispatch & Stock)</option>
                      <option value="rider">Rider (Deliveries)</option>
                      <option value="director">Director (Audit & Analytics)</option>
                      <option value="admin">Admin (Full Access)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 sm:flex sm:items-center gap-2">
                    <Button onClick={() => handleApprove(staff.id)} variant="success" size="md">
                      <CheckCircle2 className="w-4 h-4 mr-1.5" /> Approve
                    </Button>
                    <Button onClick={() => handleReject(staff.id)} variant="outline" size="md" className="text-red-600 hover:bg-red-50">
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* 2. Active Staff Roster */}
      <div className="bg-white rounded-3xl border-2 border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b-2 border-slate-100 flex items-center justify-between">
          <h2 className="text-base font-black text-slate-900">Active Staff Roster ({approvedStaff.length})</h2>
          <span className="text-xs font-bold text-slate-400">Can float across any Nairobi hub</span>
        </div>

        {/* Mobile View */}
        <div className="md:hidden divide-y-2 divide-slate-100">
          {approvedStaff.map((staff) => (
            <div key={staff.id} className="p-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-black text-base text-slate-900">{staff.full_name}</div>
                  <div className="text-xs text-slate-500">{staff.email}</div>
                  <div className="text-xs font-bold text-slate-600 mt-0.5">{displayKenyanPhone(staff.phone)}</div>
                </div>
                <Badge variant={staff.role === 'admin' ? 'purple' : staff.role === 'rider' ? 'warning' : 'default'}>
                  {staff.role.replace('_', ' ')}
                </Badge>
              </div>

              {staff.vehicle_plate && (
                <div className="text-xs font-mono font-bold text-slate-700 flex items-center gap-1.5 bg-slate-50 p-2 rounded-xl">
                  <Bike className="w-4 h-4 text-orange-600" /> Motorbike Plate: {staff.vehicle_plate}
                </div>
              )}

              <div className="pt-1 flex items-center justify-between gap-2">
                <span className="text-xs font-black uppercase text-slate-500">Change Role:</span>
                <select
                  value={staff.role}
                  onChange={(e) => {
                    approveStaff(staff.id, e.target.value as UserRole);
                    showSuccess(`Updated ${staff.full_name} to ${e.target.value.replace('_', ' ')}`);
                  }}
                  className="min-h-[44px] text-xs font-bold border-2 border-slate-300 rounded-xl px-3 bg-slate-50 text-slate-900"
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

        {/* Desktop View */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-500 text-xs uppercase font-black">
              <tr>
                <th className="py-3.5 px-6">Employee Name</th>
                <th className="py-3.5 px-6">Contact Phone & Email</th>
                <th className="py-3.5 px-6">Current Role</th>
                <th className="py-3.5 px-6">Bike Plate</th>
                <th className="py-3.5 px-6 text-right">Change Role</th>
              </tr>
            </thead>
            <tbody className="divide-y-2 divide-slate-100 font-bold">
              {approvedStaff.map((staff) => (
                <tr key={staff.id} className="hover:bg-slate-50">
                  <td className="py-4 px-6 text-slate-900 font-black">{staff.full_name}</td>
                  <td className="py-4 px-6 text-xs text-slate-600">
                    <div className="font-mono text-slate-900">{displayKenyanPhone(staff.phone)}</div>
                    <div className="text-slate-400">{staff.email}</div>
                  </td>
                  <td className="py-4 px-6">
                    <Badge variant={staff.role === 'admin' ? 'purple' : staff.role === 'rider' ? 'warning' : 'default'}>
                      {staff.role.replace('_', ' ')}
                    </Badge>
                  </td>
                  <td className="py-4 px-6 text-xs font-mono text-slate-600">{staff.vehicle_plate || '—'}</td>
                  <td className="py-4 px-6 text-right">
                    <select
                      value={staff.role}
                      onChange={(e) => {
                        approveStaff(staff.id, e.target.value as UserRole);
                        showSuccess(`Updated ${staff.full_name} to ${e.target.value.replace('_', ' ')}`);
                      }}
                      className="min-h-[40px] text-xs font-bold border-2 border-slate-300 rounded-xl px-3 bg-white text-slate-800"
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
