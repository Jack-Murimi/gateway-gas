'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Flame, Lock, AlertCircle, CheckCircle2 } from 'lucide-react';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError('');
    setSuccess('');

    if (password.length < 8) {
      setError('Your password must be at least 8 characters long.');
      return;
    }
    if (password !== confirmPassword) {
      setError('The passwords do not match.');
      return;
    }

    setIsSubmitting(true);
    try {
      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;

      setSuccess('Your password has been updated. You can now sign in with your new password.');
      await supabase.auth.signOut();
      window.setTimeout(() => router.replace('/login'), 1200);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not update your password. Request a fresh reset link.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-[85vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md">
        <div className="rounded-3xl border-2 border-slate-200 bg-white p-6 shadow-xl sm:p-8 space-y-6">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-orange-600 text-white shadow-md">
              <Flame className="h-6 w-6" />
            </div>
            <div>
              <span className="block text-xl font-black tracking-tight text-slate-900">GATEWAY GAS</span>
              <span className="block text-xs font-bold uppercase tracking-wider text-orange-600">Operations Portal</span>
            </div>
          </div>

          <div>
            <h1 className="text-2xl font-black text-slate-900">Set a new password</h1>
            <p className="mt-1 text-sm font-medium text-slate-500">Choose a new password for your staff account.</p>
          </div>

          {error && (
            <div role="alert" className="flex items-center gap-2 rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-sm font-bold text-red-700">
              <AlertCircle className="h-5 w-5 shrink-0" /> {error}
            </div>
          )}
          {success && (
            <div role="status" className="flex items-center gap-2 rounded-2xl border-2 border-emerald-300 bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              <CheckCircle2 className="h-5 w-5 shrink-0" /> {success}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <Input label="New Password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters" leftIcon={<Lock className="h-5 w-5" />} />
            <Input label="Confirm New Password" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} placeholder="Enter the password again" leftIcon={<Lock className="h-5 w-5" />} />
            <Button type="submit" isLoading={isSubmitting} size="lg" className="w-full">Update Password</Button>
          </form>
        </div>
      </div>
    </div>
  );
}
