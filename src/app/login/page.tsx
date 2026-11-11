'use client';

import React, { useState, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { createClient } from '@/lib/supabase/client';
import { IS_DEMO_MODE, setDemoSessionCookies } from '@/lib/demo-mode';
import { StaffProfile } from '@/types';
import {
  Flame,
  Lock,
  Mail,
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

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTarget = searchParams.get('redirect');

  const { setCurrentUser, staffList } = useStore();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

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

  // Real Supabase Auth Production Login
  const handleRealSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please provide your work email and password.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (authError) {
        setError(authError.message || 'Invalid email or password.');
        return;
      }

      if (data.user) {
        // Fetch correlating staff profile
        const { data: profile, error: profError } = await supabase
          .from('profiles')
          .select('*')
          .eq('id', data.user.id)
          .single();

        if (profError || !profile) {
          setError('Profile record not found. Contact administrator.');
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
      const message = err instanceof Error ? err.message : 'Login failed. Please retry.';
      setError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Test account definitions for demo mode
  const testAccountConfigs = [
    { roleKey: 'admin', label: 'Admin', icon: ShieldCheck, color: 'border-purple-200 bg-purple-50 hover:bg-purple-100 text-purple-900' },
    { roleKey: 'director', label: 'Director', icon: Briefcase, color: 'border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-900' },
    { roleKey: 'operator', label: 'Operator', icon: Package, color: 'border-blue-200 bg-blue-50 hover:bg-blue-100 text-blue-900' },
    { roleKey: 'sales_rep', label: 'Sales Rep', icon: ShoppingCart, color: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-emerald-900' },
    { roleKey: 'rider', label: 'Rider', icon: Bike, color: 'border-amber-200 bg-amber-50 hover:bg-amber-100 text-amber-900' },
    { roleKey: 'pending', label: 'Pending', icon: Clock, color: 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-900', status: 'pending' },
    { roleKey: 'rejected', label: 'Rejected', icon: XCircle, color: 'border-red-200 bg-red-50 hover:bg-red-100 text-red-900', status: 'rejected' },
  ];

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full space-y-5">
        {/* Card */}
        <div className="bg-white rounded-3xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <span className="font-extrabold text-base tracking-tight text-slate-900 block leading-tight">
                  GATEWAY GAS
                </span>
                <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 block">
                  Staff Portal
                </span>
              </div>
            </div>
            {IS_DEMO_MODE && (
              <span className="px-2 py-0.5 rounded text-[10px] font-extrabold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                Demo Active
              </span>
            )}
          </div>

          <div>
            <h1 className="text-xl font-bold text-slate-900">Sign In to Your Station</h1>
            <p className="text-xs text-slate-500 mt-1">
              Internal-use only. Access is protected by enterprise role permissions.
            </p>
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Real Credentials Form */}
          <form onSubmit={handleRealSignIn} className="space-y-3.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Work Email</label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@gatewaygas.co.ke"
                  className="w-full min-h-[42px] pl-9 pr-3 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Password</label>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full min-h-[42px] pl-9 pr-3 text-xs border border-slate-300 rounded-xl focus:ring-1 focus:ring-orange-500 focus:outline-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full min-h-[44px] py-2.5 bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs rounded-xl shadow transition disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {isSubmitting ? 'Authenticating...' : 'Sign In with Password'}{' '}
              <ArrowRight className="w-4 h-4" />
            </button>
          </form>

          {/* DEMO MODE: Test Accounts Panel (Tree-shaken in production) */}
          {IS_DEMO_MODE && (
            <div className="pt-4 border-t border-slate-100 space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase tracking-wider">
                <Zap className="w-3.5 h-3.5 text-amber-600" /> Test accounts (1-Tap Instant Sign-In)
              </div>
              <p className="text-[11px] text-slate-500">
                App is in testing mode. Tap any role to sign in instantly with zero typing:
              </p>

              <div className="grid grid-cols-2 gap-2 pt-1">
                {testAccountConfigs.map((cfg) => {
                  const Icon = cfg.icon;
                  // Match user in staffList
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
                      className={`p-2 rounded-xl border text-left transition flex items-center gap-2 text-xs font-semibold ${cfg.color}`}
                    >
                      <Icon className="w-4 h-4 shrink-0" />
                      <div className="min-w-0 flex-1 truncate">
                        <div className="font-bold text-[11px] leading-tight">{cfg.label}</div>
                        <div className="text-[9px] opacity-75 truncate">{targetUser.full_name.split(' ')[0]}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="pt-3 border-t border-slate-100 text-center">
            <Link href="/signup" className="text-xs text-orange-600 hover:underline font-bold">
              New staff member? Register account →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[85vh] flex items-center justify-center text-xs text-slate-400">Loading portal...</div>}>
      <LoginContent />
    </Suspense>
  );
}

