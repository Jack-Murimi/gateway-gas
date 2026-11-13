'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { createClient } from '@/lib/supabase/client';
import { IS_DEMO_MODE, setDemoSessionCookies } from '@/lib/demo-mode';
import { StaffProfile } from '@/types';
import { normalizeKenyanPhone } from '@/lib/formatters';
import {
  Flame,
  Lock,
  Mail,
  Phone,
  AlertCircle,
  ArrowRight,
  ShieldCheck,
  Briefcase,
  Package,
  ShoppingCart,
  Bike,
  Clock,
  XCircle,
  Zap,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect');

  const { setCurrentUser, staffList } = useStore();
  const [identifier, setIdentifier] = useState(''); // Email or Kenyan phone
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetMessage, setResetMessage] = useState('');
  const [isSendingReset, setIsSendingReset] = useState(false);

  const handlePasswordReset = async () => {
    setResetMessage('');
    if (!resetEmail.trim()) {
      setResetMessage('Enter your work email address first.');
      return;
    }
    setIsSendingReset(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(resetEmail.trim(), {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (resetError) throw resetError;
      setResetMessage('If an account exists for that email, a password reset link has been sent.');
    } catch (err: unknown) {
      setResetMessage(err instanceof Error ? err.message : 'Could not send the reset email. Please try again.');
    } finally {
      setIsSendingReset(false);
    }
  };

  // Navigate according to user role
  const navigateByRole = (user: StaffProfile) => {
    if (user.approval_status !== 'approved') {
      router.push('/pending');
      return;
    }
    if (redirectTarget) {
      router.push(redirectTarget);
      return;
    }
    if (user.role === 'rider') router.push('/rider');
    else if (user.role === 'sales_rep') router.push('/sales');
    else if (user.role === 'operator') router.push('/operations');
    else router.push('/');
  };

  // 1-Tap Demo Sign-in
  const handleDemoSignIn = (user: StaffProfile) => {
    setCurrentUser(user);
    if (typeof window !== 'undefined') {
      localStorage.setItem('gwg_demo_user_id', user.id);
      localStorage.setItem('gwg_user', JSON.stringify(user));
      setDemoSessionCookies(user.id, user.role, user.approval_status);
    }
    navigateByRole(user);
  };

  // Real Supabase Auth Login (supports email or phone lookup)
  const handleRealSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmed = identifier.trim();
    if (!trimmed || !password) {
      setError('Please provide your work email/phone and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      let emailToAuth = trimmed;

      // If user typed a phone number, resolve their work email first
      if (/^[0-9+ ]+$/.test(trimmed)) {
        const cleanPhone = normalizeKenyanPhone(trimmed);
        const { data: matchedProfile } = await supabase
          .from('profiles')
          .select('email')
          .eq('phone', cleanPhone)
          .single();

        if (matchedProfile?.email) {
          emailToAuth = matchedProfile.email;
        }
      }

      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: emailToAuth,
        password,
      });

      if (authError) {
        setError(authError.message || 'Invalid credentials. Please verify your email and password.');
        return;
      }

      if (data.user) {
        const { data: profile, error: profError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profError || !profile) {
          setError('Staff profile record not found. Please contact administration.');
          return;
        }

        const staffUser: StaffProfile = {
          id: profile.id,
          email: profile.email,
          full_name: profile.full_name,
          phone: profile.phone,
          role: profile.role,
          approval_status: profile.approval_status,
          vehicle_plate: profile.vehicle_plate,
          avatar_url: profile.avatar_url,
        };

        setCurrentUser(staffUser);
        if (typeof window !== 'undefined') {
          localStorage.setItem('gwg_user', JSON.stringify(staffUser));
          setDemoSessionCookies(staffUser.id, staffUser.role, staffUser.approval_status);
        }

        navigateByRole(staffUser);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Sign in failed. Please try again.';
      setError(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const testAccountConfigs = [
    { roleKey: 'admin', label: 'Admin', icon: ShieldCheck, color: 'bg-purple-100 text-purple-950 border-purple-300' },
    { roleKey: 'director', label: 'Director', icon: Briefcase, color: 'bg-indigo-100 text-indigo-950 border-indigo-300' },
    { roleKey: 'operator', label: 'Operator', icon: Package, color: 'bg-blue-100 text-blue-950 border-blue-300' },
    { roleKey: 'sales_rep', label: 'Sales Rep', icon: ShoppingCart, color: 'bg-emerald-100 text-emerald-950 border-emerald-300' },
    { roleKey: 'rider', label: 'Rider', icon: Bike, color: 'bg-amber-100 text-amber-950 border-amber-300' },
    { roleKey: 'pending', label: 'Pending', icon: Clock, color: 'bg-zinc-100 text-zinc-950 border-zinc-300', status: 'pending' },
    { roleKey: 'rejected', label: 'Rejected', icon: XCircle, color: 'bg-red-100 text-red-950 border-red-300', status: 'rejected' },
  ];

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        {/* Brand Card */}
        <div className="bg-white rounded-3xl shadow-xl border-2 border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-md">
                <Flame className="w-6 h-6" />
              </div>
              <div>
                <span className="font-black text-xl tracking-tight text-slate-900 block leading-tight">
                  GATEWAY GAS
                </span>
                <span className="text-xs font-bold uppercase tracking-wider text-orange-600 block">
                  Operations Portal
                </span>
              </div>
            </div>
            {IS_DEMO_MODE && <Badge variant="warning">Demo Active</Badge>}
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900">Sign In</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Internal staff credentials. Access managed by branch permissions.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-sm font-bold text-red-700 flex items-center gap-2.5">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Real Credentials Form */}
          <form onSubmit={handleRealSignIn} className="space-y-4">
            <Input
              label="Work Email or Phone"
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="e.g. name@gatewaygas.co.ke or 0712345678"
              leftIcon={<Mail className="w-5 h-5" />}
            />

            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              leftIcon={<Lock className="w-5 h-5" />}
            />

            <div className="flex items-center justify-between text-xs font-bold">
              <button type="button" onClick={() => { setShowForgotPassword((v) => !v); setResetMessage(''); setResetEmail(identifier.includes('@') ? identifier : ''); }} className="text-orange-600 hover:underline">
                {showForgotPassword ? 'Back to sign in' : 'Forgot password?'}
              </button>
            </div>
            {showForgotPassword && (
              <div className="rounded-2xl border border-orange-200 bg-orange-50 p-4 space-y-3">
                <p className="text-sm font-semibold text-slate-700">Enter your work email and we’ll send you a secure reset link.</p>
                <Input label="Work Email" type="email" required value={resetEmail} onChange={(e) => setResetEmail(e.target.value)} placeholder="name@example.com" leftIcon={<Mail className="w-5 h-5" />} />
                {resetMessage && <p role="status" className="text-xs font-semibold text-slate-700">{resetMessage}</p>}
                <Button type="button" isLoading={isSendingReset} size="lg" className="w-full" onClick={() => void handlePasswordReset()}>Send reset link</Button>
              </div>
            )}

            <Button type="submit" isLoading={isSubmitting} size="lg" className="w-full">
              Sign In to Station <ArrowRight className="w-5 h-5 ml-2" />
            </Button>
          </form>

          {/* DEMO MODE: Test Accounts Panel (Tree-shaken in production) */}
          {IS_DEMO_MODE && (
            <div className="pt-5 border-t-2 border-slate-100 space-y-3">
              <div className="flex items-center gap-2 text-xs font-black text-amber-900 uppercase tracking-wider">
                <Zap className="w-4 h-4 text-amber-600" /> 1-Tap QA Test Accounts
              </div>
              <p className="text-xs text-slate-600">
                Testing mode active. Tap any role to sign in instantly with no typing:
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {testAccountConfigs.map((cfg) => {
                  const Icon = cfg.icon;
                  const targetUser = staffList.find((u) => {
                    if (cfg.status === 'rejected') return u.approval_status === 'rejected';
                    if (cfg.status === 'pending') return u.approval_status === 'pending';
                    return u.role === cfg.roleKey && u.approval_status === 'approved';
                  });

                  if (!targetUser) return null;

                  return (
                    <button
                      key={cfg.label}
                      type="button"
                      onClick={() => handleDemoSignIn(targetUser)}
                      className={`min-h-[48px] p-2.5 rounded-2xl border-2 text-left transition flex items-center gap-2.5 font-bold ${cfg.color} active:scale-95`}
                    >
                      <Icon className="w-5 h-5 shrink-0" />
                      <div className="min-w-0 flex-1 truncate">
                        <div className="text-xs font-black leading-tight">{cfg.label}</div>
                        <div className="text-[11px] opacity-80 truncate">{targetUser.full_name.split(' ')[0]}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-3 border-t-2 border-slate-100 text-center">
            <Link href="/signup" className="text-sm font-bold text-orange-600 hover:underline">
              New staff employee? Request station access →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[85vh] flex items-center justify-center text-sm font-bold text-slate-500">Loading station portal...</div>}>
      <LoginContent />
    </Suspense>
  );
}
