'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { Flame, CheckCircle2, AlertCircle, ArrowLeft, Bike, ShoppingCart, Package } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { normalizeKenyanPhone } from '@/lib/formatters';

export default function SignupPage() {
  const router = useRouter();
  const { signupStaff, branches } = useStore();

  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [roleHint, setRoleHint] = useState<'sales_rep' | 'rider' | 'operator'>('sales_rep');
  const [vehiclePlate, setVehiclePlate] = useState('');
  const [selectedBranchId, setSelectedBranchId] = useState(branches[0]?.id || '');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!fullName || !email || !phone || !password) {
      setError('Please fill in all required registration fields.');
      return;
    }

    if (roleHint === 'rider' && !vehiclePlate.trim()) {
      setError('Motorbike registration plate is required for riders (e.g. KMDX 412M).');
      return;
    }

    const cleanPhone = normalizeKenyanPhone(phone);

    setSubmitting(true);
    const result = await signupStaff(email, password, fullName, cleanPhone, roleHint === 'rider' ? vehiclePlate.toUpperCase() : undefined);
    setSubmitting(false);

    if (result.success) {
      setIsSuccess(true);
    } else {
      setError(result.message);
    }
  };

  if (isSuccess) {
    return (
      <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
        <div className="w-full max-w-md space-y-6 rounded-xl border border-slate-200 bg-white p-6 text-center shadow-sm sm:p-8">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-7 w-7" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-tight text-slate-900">Access request submitted</h2>
            <p className="mt-2 text-sm leading-relaxed text-slate-600">
              The profile for <strong className="font-medium text-slate-900">{fullName}</strong> is pending review by an administrator or director.
            </p>
          </div>
          <div className="space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-4 text-left text-sm text-slate-600">
            <p className="font-medium text-slate-800">What happens next</p>
            <p>1. An administrator reviews your request.</p>
            <p>2. Once approved, your role permissions will be available at sign-in.</p>
          </div>
          <Button onClick={() => router.push('/pending')} size="lg" className="w-full">
            View approval status
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md space-y-6">
        <div className="space-y-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" /> Back to sign in
            </Link>
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white">
              <Flame className="h-4 w-4" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Request access</h1>
            <p className="mt-1 text-sm text-slate-600">
              Create a staff profile for Gateway Gas operations. Access is granted after approval.
            </p>
          </div>

          {error && (
            <div className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sarah Moraa"
            />

            <Input
              label="Work email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. sarah.moraa@gatewaygas.co.ke"
            />

            <Input
              label="Mobile phone"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712 345 678"
              helperText="Will be formatted to Kenyan (+254) format"
            />

            {/* Role Preference Hint */}
            <div className="space-y-1.5 text-left">
              <label className="block text-sm font-medium text-slate-700">Requested role</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRoleHint('sales_rep')}
                  className={`min-h-[44px] rounded-lg border p-2 text-xs font-medium transition-colors flex flex-col items-center justify-center gap-1 ${
                    roleHint === 'sales_rep'
                      ? 'border-orange-500 bg-orange-50 text-orange-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <ShoppingCart className="h-4 w-4" />
                  <span>Sales (POS)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleHint('rider')}
                  className={`min-h-[44px] rounded-lg border p-2 text-xs font-medium transition-colors flex flex-col items-center justify-center gap-1 ${
                    roleHint === 'rider'
                      ? 'border-orange-500 bg-orange-50 text-orange-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <Bike className="h-4 w-4" />
                  <span>Rider</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleHint('operator')}
                  className={`min-h-[44px] rounded-lg border p-2 text-xs font-medium transition-colors flex flex-col items-center justify-center gap-1 ${
                    roleHint === 'operator'
                      ? 'border-orange-500 bg-orange-50 text-orange-900'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 hover:border-slate-300'
                  }`}
                >
                  <Package className="h-4 w-4" />
                  <span>Operator</span>
                </button>
              </div>
            </div>

            {/* Motorbike Plate (shown progressively ONLY when rider selected) */}
            {roleHint === 'rider' && (
              <Input
                label="Motorbike number plate"
                required
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="e.g. KMDX 412M"
                helperText="Used for dispatch and delivery identification"
              />
            )}

            {/* Branch Hub Choice */}
            <div className="space-y-1.5 text-left">
              <label className="block text-sm font-medium text-slate-700">Primary branch</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-slate-300 bg-white px-3 py-2 text-base text-slate-900 transition-colors hover:border-slate-400 focus:border-orange-500 focus:outline-none focus-visible:ring-2 focus-visible:ring-orange-100"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}) — {b.location_estate}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Button type="submit" isLoading={submitting} size="lg" className="w-full">
              Submit access request
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
