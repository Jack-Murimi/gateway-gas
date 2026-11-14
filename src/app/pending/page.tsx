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
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-orange-600 text-white">
          <Flame className="h-6 w-6" />
        </div>

        <div>
          <span className="block text-lg font-semibold tracking-tight text-slate-900 leading-tight">
            Gateway Gas
          </span>
          <span className="text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
            Access review
          </span>
        </div>

        <div className="pt-1">
          {isRejected ? (
            <div className="space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
                <XCircle className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Access request declined</h1>
              <p className="text-sm leading-relaxed text-slate-600">
                Your registration was not approved. Contact an administrator if you believe this is a mistake.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600">
                <Clock className="h-6 w-6" />
              </div>
              <h1 className="text-xl font-semibold tracking-tight text-slate-900">Awaiting approval</h1>
              <p className="text-sm leading-relaxed text-slate-600">
                Your account is pending review. An administrator or director will approve access and assign your role.
              </p>
            </div>
          )}
        </div>

        {currentUser && (
          <div className="space-y-1 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left">
            <div className="text-sm font-medium text-slate-900">{currentUser.full_name}</div>
            <div className="text-xs text-slate-500">{currentUser.email}</div>
            <div className="pt-1.5">
              <Badge variant={isRejected ? 'danger' : 'warning'}>
                {currentUser.approval_status}
              </Badge>
            </div>
          </div>
        )}

        {IS_DEMO_MODE && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-left text-xs text-amber-900">
            <strong className="font-medium">Demo tip:</strong> Use the demo user switcher to try approved roles instantly.
          </div>
        )}

        <div className="pt-1">
          <Button onClick={logout} variant="secondary" size="lg" className="w-full">
            <LogOut className="mr-1.5 h-4 w-4" /> Sign out
          </Button>
        </div>
      </div>
    </div>
  );
}
