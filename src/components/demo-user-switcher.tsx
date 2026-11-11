'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { IS_DEMO_MODE, setDemoSessionCookies } from '@/lib/demo-mode';
import { StaffProfile } from '@/types';
import {
  Users,
  ShieldCheck,
  Briefcase,
  Package,
  ShoppingCart,
  Bike,
  Clock,
  XCircle,
  RefreshCw,
  X,
  ChevronUp,
  ChevronDown,
  Check,
  AlertTriangle,
} from 'lucide-react';

const roleMeta: Record<string, { label: string; icon: React.ComponentType<{ className?: string }>; color: string }> = {
  admin: { label: 'Admin', icon: ShieldCheck, color: 'bg-purple-100 text-purple-800 border-purple-200' },
  director: { label: 'Director', icon: Briefcase, color: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  operator: { label: 'Operator', icon: Package, color: 'bg-blue-100 text-blue-800 border-blue-200' },
  sales_rep: { label: 'Sales Rep', icon: ShoppingCart, color: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  rider: { label: 'Rider', icon: Bike, color: 'bg-amber-100 text-amber-800 border-amber-200' },
  pending: { label: 'Pending', icon: Clock, color: 'bg-zinc-100 text-zinc-800 border-zinc-200' },
  rejected: { label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-800 border-red-200' },
};

export function DemoUserSwitcher() {
  const router = useRouter();
  const pathname = usePathname();
  const { currentUser, setCurrentUser, staffList, resetDemoData } = useStore();

  const [isOpen, setIsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  // Compile-time tree-shake: dead-code eliminated when NEXT_PUBLIC_DEMO_MODE !== 'true'
  if (!IS_DEMO_MODE) {
    return null;
  }

  const handleSelectUser = (user: StaffProfile) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('gwg_demo_user_id', user.id);
      localStorage.setItem('gwg_user', JSON.stringify(user));
      setDemoSessionCookies(user.id, user.role, user.approval_status);
    }
    setIsOpen(false);

    // Redirect to appropriate landing by role if current page is restricted
    if (user.approval_status !== 'approved') {
      router.push('/pending');
    } else if (user.role === 'rider') {
      router.push('/rider');
    } else if (user.role === 'sales_rep' && (pathname === '/operations' || pathname === '/staff')) {
      router.push('/sales');
    } else if (user.role === 'operator' && pathname === '/staff') {
      router.push('/operations');
    } else if (pathname === '/login' || pathname === '/pending') {
      router.push('/');
    }
  };

  const handleResetData = () => {
    if (window.confirm('Reset all demo orders, stock, and staff back to original seed data?')) {
      resetDemoData();
      setResetSuccess(true);
      setTimeout(() => setResetSuccess(false), 2500);
      setIsOpen(false);
    }
  };

  return (
    <>
      {/* 1. VISIBLE DEMO MODE RIBBON (Never mistaken for production) */}
      <div className="fixed top-0 left-0 right-0 z-50 bg-amber-400 text-amber-950 px-3 py-1 text-[11px] font-black uppercase tracking-wider flex items-center justify-between shadow-sm select-none pointer-events-auto">
        <div className="flex items-center gap-1.5 mx-auto sm:mx-0">
          <AlertTriangle className="w-3.5 h-3.5 fill-amber-950 text-amber-400 shrink-0" />
          <span>DEMO MODE ACTIVE</span>
          <span className="hidden sm:inline font-medium lowercase text-amber-900">• mock session & sandbox data</span>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <span className="text-[10px] font-semibold text-amber-900">
            Current: {currentUser ? `${currentUser.full_name} (${currentUser.role})` : 'Not signed in'}
          </span>
          <button
            onClick={() => setIsOpen(true)}
            className="px-2 py-0.5 rounded bg-amber-950 text-amber-200 text-[10px] font-bold hover:bg-black transition"
          >
            Switch
          </button>
        </div>
      </div>

      {/* 2. FLOATING BOTTOM-LEFT BUTTON (Above mobile bottom nav) */}
      <div className="fixed bottom-16 sm:bottom-6 left-3 sm:left-4 z-40">
        {isCollapsed ? (
          <button
            onClick={() => setIsCollapsed(false)}
            title="Expand demo switcher"
            className="w-10 h-10 rounded-full bg-slate-900 text-white shadow-xl flex items-center justify-center hover:scale-105 transition border-2 border-amber-400"
          >
            <Users className="w-4 h-4 text-amber-400" />
          </button>
        ) : (
          <div className="flex items-center bg-slate-900 text-white rounded-full shadow-2xl border-2 border-amber-400 p-1 pl-3 gap-2">
            <button
              onClick={() => setIsOpen(true)}
              className="flex items-center gap-1.5 text-xs font-bold text-amber-300 hover:text-white transition py-1"
            >
              <Users className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Switch user</span>
              {currentUser && (
                <span className="max-w-[80px] sm:max-w-[120px] truncate text-[11px] text-slate-300 font-medium">
                  ({currentUser.role.replace('_', ' ')})
                </span>
              )}
            </button>
            <button
              onClick={() => setIsCollapsed(true)}
              title="Minimize"
              className="w-6 h-6 rounded-full hover:bg-slate-800 text-slate-400 hover:text-white flex items-center justify-center"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* 3. SWITCHER SHEET / MODAL */}
      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm transition-opacity"
            onClick={() => setIsOpen(false)}
          />

          {/* Modal / Sheet Card */}
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl border border-slate-200 shadow-2xl p-5 space-y-4 max-h-[85vh] overflow-y-auto animate-in slide-in-from-bottom sm:zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
                  <Users className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">Switch Test User</h3>
                  <p className="text-[11px] text-slate-500">1-tap fast role switching for QA & demos</p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="w-7 h-7 rounded-full bg-slate-100 hover:bg-slate-200 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* User List */}
            <div className="space-y-1.5">
              {staffList.map((user) => {
                const key = user.approval_status === 'rejected' ? 'rejected' : user.role;
                const meta = roleMeta[key] || roleMeta.pending;
                const Icon = meta.icon;
                const isCurrent = currentUser?.id === user.id;

                return (
                  <button
                    key={user.id}
                    onClick={() => handleSelectUser(user)}
                    className={`w-full text-left p-2.5 rounded-xl border transition flex items-center justify-between text-xs ${
                      isCurrent
                        ? 'border-orange-500 bg-orange-50/80 font-bold'
                        : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border ${meta.color}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-900 truncate leading-tight flex items-center gap-1.5">
                          <span>{user.full_name}</span>
                          {isCurrent && (
                            <span className="text-[10px] text-orange-600 font-extrabold flex items-center gap-0.5">
                              <Check className="w-3 h-3" /> Active
                            </span>
                          )}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">{user.email}</div>
                      </div>
                    </div>

                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold border uppercase shrink-0 ${meta.color}`}>
                      {user.approval_status === 'rejected' ? 'Rejected' : user.role.replace('_', ' ')}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Actions: Reset Data Button */}
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleResetData}
                className="w-full py-2 px-3 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold transition flex items-center justify-center gap-1.5"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Reset Demo Data
              </button>
            </div>

            {resetSuccess && (
              <div className="p-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs text-center font-semibold">
                Demo mock data reset to original seed.
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
