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
    const result = await signupStaff(email, fullName, cleanPhone, roleHint === 'rider' ? vehiclePlate.toUpperCase() : undefined);
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
        <div className="max-w-md w-full bg-white rounded-3xl border-2 border-slate-200 p-8 shadow-xl text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle2 className="w-9 h-9" />
          </div>
          <div>
            <h2 className="text-2xl font-black text-slate-900">Registration Submitted</h2>
            <p className="text-sm text-slate-600 mt-2 leading-relaxed">
              Your staff profile for <strong>{fullName}</strong> has been placed in the station approval queue.
            </p>
          </div>

          <div className="p-4 bg-slate-50 border-2 border-slate-200 rounded-2xl text-left space-y-1.5 text-xs">
            <div className="font-bold text-slate-800">Next Steps:</div>
            <div className="text-slate-600">1. A Station Director or Admin will review your profile.</div>
            <div className="text-slate-600">2. Once approved, your operational permissions will unlock instantly.</div>
          </div>

          <Button onClick={() => router.push('/pending')} size="lg" className="w-full">
            View Approval Status
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="max-w-md w-full space-y-6">
        <div className="bg-white rounded-3xl shadow-xl border-2 border-slate-200 p-6 sm:p-8 space-y-6">
          <div className="flex items-center justify-between">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 text-sm font-bold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="w-4 h-4" /> Back to Sign In
            </Link>
            <div className="w-8 h-8 rounded-xl bg-orange-600 flex items-center justify-center text-white">
              <Flame className="w-4 h-4" />
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900">Request Station Access</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">
              Gateway Gas Nairobi operational staff registration.
            </p>
          </div>

          {error && (
            <div className="p-4 bg-red-50 border-2 border-red-300 rounded-2xl text-sm font-bold text-red-700 flex items-center gap-2">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label="Full Legal Name"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="e.g. Sarah Moraa"
            />

            <Input
              label="Work Email Address"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="e.g. sarah.moraa@gatewaygas.co.ke"
            />

            <Input
              label="M-Pesa / Mobile Phone Number"
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="e.g. 0712 345 678"
              helperText="Formats automatically to +254 Kenyan standard"
            />

            {/* Role Preference Hint */}
            <div className="space-y-1.5 text-left">
              <label className="block text-sm font-bold text-slate-800">Operational Role Requested</label>
              <div className="grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setRoleHint('sales_rep')}
                  className={`min-h-[48px] p-2 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-bold transition ${
                    roleHint === 'sales_rep'
                      ? 'border-orange-500 bg-orange-50 text-orange-950 font-black'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <ShoppingCart className="w-4 h-4 mb-1" />
                  <span>Cashier (POS)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleHint('rider')}
                  className={`min-h-[48px] p-2 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-bold transition ${
                    roleHint === 'rider'
                      ? 'border-orange-500 bg-orange-50 text-orange-950 font-black'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Bike className="w-4 h-4 mb-1" />
                  <span>Rider</span>
                </button>

                <button
                  type="button"
                  onClick={() => setRoleHint('operator')}
                  className={`min-h-[48px] p-2 rounded-xl border-2 flex flex-col items-center justify-center text-xs font-bold transition ${
                    roleHint === 'operator'
                      ? 'border-orange-500 bg-orange-50 text-orange-950 font-black'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Package className="w-4 h-4 mb-1" />
                  <span>Operator</span>
                </button>
              </div>
            </div>

            {/* Motorbike Plate (shown progressively ONLY when rider selected) */}
            {roleHint === 'rider' && (
              <Input
                label="Motorbike Number Plate"
                required
                value={vehiclePlate}
                onChange={(e) => setVehiclePlate(e.target.value.toUpperCase())}
                placeholder="e.g. KMDX 412M"
                helperText="Required for customer dispatch SMS & GPS identification"
              />
            )}

            {/* Branch Hub Choice */}
            <div className="space-y-1.5 text-left">
              <label className="block text-sm font-bold text-slate-800">Primary Station / Branch</label>
              <select
                value={selectedBranchId}
                onChange={(e) => setSelectedBranchId(e.target.value)}
                className="w-full min-h-[48px] text-base px-3.5 py-2.5 bg-white text-slate-900 rounded-xl border-2 border-slate-300 font-bold focus:border-orange-600 focus:outline-none"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name} ({b.code}) — {b.location_estate}
                  </option>
                ))}
              </select>
            </div>

            <Input
              label="Account Password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />

            <Button type="submit" isLoading={submitting} size="lg" className="w-full">
              Submit Registration for Approval
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
