'use client';

import React, { useCallback, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Flame } from 'lucide-react';
import { useStore } from '@/context/store-context';
import { IS_DEMO_MODE, setDemoSessionCookies } from '@/lib/demo-mode';
import type { StaffProfile } from '@/types';
import { Badge } from '@/components/ui/badge';
import { SignInForm } from './SignInForm';
import { ForgotPasswordForm } from './ForgotPasswordForm';
import { DemoAccounts } from './DemoAccounts';
import { getPostLoginPath, safeInternalPath } from './helpers';

export function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = safeInternalPath(searchParams.get('redirect'));
  const { setCurrentUser, staffList, refreshLiveData } = useStore();

  const [view, setView] = useState<'signin' | 'reset'>('signin');
  const [resetPrefill, setResetPrefill] = useState('');

  const goNext = useCallback(
    (user: StaffProfile) => {
      router.replace(getPostLoginPath(user, redirectTarget));
      router.refresh();
    },
    [router, redirectTarget]
  );

  const handleSignedIn = useCallback(
    (user: StaffProfile) => {
      setCurrentUser(user);
      localStorage.setItem('gwg_user', JSON.stringify(user));
      setDemoSessionCookies(user.id, user.role, user.approval_status);
      if (user.approval_status === 'approved') {
        void refreshLiveData();
      }
      goNext(user);
    },
    [setCurrentUser, refreshLiveData, goNext]
  );

  const handleDemoSelect = useCallback(
    (user: StaffProfile) => {
      setCurrentUser(user);
      localStorage.setItem('gwg_user', JSON.stringify(user));
      localStorage.setItem('gwg_demo_user_id', user.id);
      setDemoSessionCookies(user.id, user.role, user.approval_status);
      goNext(user);
    },
    [setCurrentUser, goNext]
  );

  return (
    <div className="flex min-h-[85vh] items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-orange-600 text-white">
              <Flame className="h-5 w-5" aria-hidden="true" />
            </div>
            <div>
              <span className="block text-lg font-semibold leading-tight tracking-tight text-slate-900">
                Gateway Gas
              </span>
              <span className="block text-xs font-medium uppercase tracking-[0.14em] text-slate-500">
                Operations Portal
              </span>
            </div>
          </div>
          {IS_DEMO_MODE && <Badge variant="warning">Demo</Badge>}
        </div>

        {view === 'signin' ? (
          <SignInForm
            onSignedIn={handleSignedIn}
            onForgot={(id) => {
              setResetPrefill(id.includes('@') ? id.trim() : '');
              setView('reset');
            }}
          />
        ) : (
          <ForgotPasswordForm defaultEmail={resetPrefill} onBack={() => setView('signin')} />
        )}

        {IS_DEMO_MODE && view === 'signin' && (
          <DemoAccounts staffList={staffList} onSelect={handleDemoSelect} />
        )}

        {view === 'signin' && (
          <div className="border-t border-slate-100 pt-4 text-center">
            <Link href="/signup" className="text-sm font-medium text-orange-600 hover:underline">
              New staff member? Request station access →
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
