'use client';

import React from 'react';
import { useStore } from '@/context/store-context';
import { Flame, Clock, XCircle, LogOut, ArrowRight, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { IS_DEMO_MODE } from '@/lib/demo-mode';

export default function PendingPage() {
  const { currentUser, logout } = useStore();
  const isRejected = currentUser?.approval_status === 'rejected';

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-12">
      <div className="max-w-md w-full bg-white rounded-3xl shadow-xl border-2 border-slate-200 p-6 sm:p-8 text-center space-y-6">
        <div className="w-14 h-14 rounded-2xl bg-orange-600 flex items-center justify-center text-white mx-auto shadow-md">
          <Flame className="w-7 h-7" />
        </div>

        <div>
          <span className="font-black text-xl tracking-tight text-slate-900 block leading-tight">
            GATEWAY GAS
          </span>
          <span className="text-xs font-bold uppercase tracking-wider text-orange-600">
            Operations Access Queue
          </span>
        </div>

        <div className="pt-2">
          {isRejected ? (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-full bg-red-100 text-red-600 flex items-center justify-center mx-auto">
                <XCircle className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black text-slate-900">Access Request Declined</h1>
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Your staff registration has been declined by station administration. If this was unexpected, please contact your Nairobi branch manager.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="w-14 h-14 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7" />
              </div>
              <h1 className="text-xl font-black text-slate-900">Profile Awaiting Review</h1>
              <p className="text-sm font-medium text-slate-600 leading-relaxed">
                Your staff account is currently in the station approval queue. An Admin or Director will verify your identity and unlock your role.
              </p>
            </div>
          )}
        </div>

        {currentUser && (
          <div className="p-4 bg-slate-50 rounded-2xl border-2 border-slate-200 text-left space-y-1">
            <div className="font-black text-sm text-slate-900">{currentUser.full_name}</div>
            <div className="text-xs font-bold text-slate-500">{currentUser.email}</div>
            <div className="pt-1">
              <Badge variant={isRejected ? 'danger' : 'warning'}>
                Status: {currentUser.approval_status}
              </Badge>
            </div>
          </div>
        )}

        {IS_DEMO_MODE && (
          <div className="text-xs font-bold text-amber-900 bg-amber-50 border-2 border-amber-200 rounded-2xl p-3 text-left">
            <strong>QA Demo Tip:</strong> Tap &quot;Switch User&quot; button in bottom-left corner to switch to Admin, Cashier, or Rider instantly.
          </div>
        )}

        <div className="pt-2">
          <Button onClick={logout} variant="secondary" size="lg" className="w-full">
            <LogOut className="w-5 h-5 mr-2" /> Sign Out from Station
          </Button>
        </div>
      </div>
    </div>
  );
}
