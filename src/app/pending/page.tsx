'use client';

import React from 'react';
import Link from 'next/link';
import { useStore } from '@/context/store-context';
import { Flame, Clock, XCircle, LogOut } from 'lucide-react';
import { IS_DEMO_MODE } from '@/lib/demo-mode';

export default function PendingPage() {
  const { currentUser, logout } = useStore();
  const isRejected = currentUser?.approval_status === 'rejected';

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border border-slate-200 p-8 text-center space-y-5">
        <div className="w-12 h-12 rounded-2xl bg-orange-600 flex items-center justify-center text-white mx-auto shadow-md">
          <Flame className="w-6 h-6" />
        </div>

        <div>
          <span className="font-extrabold text-base tracking-tight text-slate-900 block">
            GATEWAY GAS
          </span>
          <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600">
            Internal Operations Portal
          </span>
        </div>

        <div className="pt-2">
          {isRejected ? (
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <XCircle className="w-6 h-6" />
              </div>
              <h1 className="text-lg font-bold text-slate-900">Account Access Rejected</h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your staff profile registration was reviewed and declined by station management. If this was a mistake, please reach out directly to your branch supervisor.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="w-12 h-12 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <Clock className="w-6 h-6" />
              </div>
              <h1 className="text-lg font-bold text-slate-900">Account Pending Verification</h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                Your staff profile is registered and pending role assignment. An Admin or Director will approve your access level shortly.
              </p>
            </div>
          )}
        </div>

        {currentUser && (
          <div className="p-3 bg-slate-50 rounded-2xl border border-slate-100 text-xs text-left">
            <div className="font-bold text-slate-800">{currentUser.full_name}</div>
            <div className="text-[11px] text-slate-500">{currentUser.email}</div>
            <div className="mt-1 inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-slate-200 text-slate-700">
              Status: {currentUser.approval_status}
            </div>
          </div>
        )}

        {IS_DEMO_MODE && (
          <p className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
            <strong>Demo tip:</strong> Tap the &quot;Switch user&quot; button in the bottom-left corner to switch to an Admin or approved role.
          </p>
        )}

        <div className="pt-2">
          <button
            type="button"
            onClick={logout}
            className="w-full min-h-[44px] px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition flex items-center justify-center gap-2 shadow"
          >
            <LogOut className="w-4 h-4" /> Sign Out
          </button>
        </div>
      </div>
    </div>
  );
}
