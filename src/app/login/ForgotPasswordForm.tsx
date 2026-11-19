'use client';

import React, { useEffect, useState } from 'react';
import { ArrowLeft, CheckCircle2, Mail } from 'lucide-react';
import { createClient } from '@/lib/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

const RESEND_SECONDS = 30;

type Props = { defaultEmail: string; onBack: () => void };

export function ForgotPasswordForm({ defaultEmail, onBack }: Props) {
  const [email, setEmail] = useState(defaultEmail);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const send = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      setError('Enter the work email address for your account.');
      return;
    }
    setError('');
    setIsSending(true);
    try {
      const supabase = createClient();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(trimmed, {
        redirectTo: `${window.location.origin}/auth/callback?next=/reset-password`,
      });
      if (resetError) throw resetError;
      setSent(true);
      setCooldown(RESEND_SECONDS);
    } catch (err) {
      const msg = err instanceof Error ? err.message.toLowerCase() : '';
      setError(
        msg.includes('rate') || msg.includes('seconds')
          ? 'Please wait a minute before requesting another link.'
          : msg.includes('fetch') || msg.includes('network')
            ? "Can't reach the server. Check your connection."
            : 'Could not send the reset email. Please try again.'
      );
    } finally {
      setIsSending(false);
    }
  };

  const BackButton = (
    <button
      type="button"
      onClick={onBack}
      className="inline-flex items-center gap-1.5 rounded text-sm font-medium text-slate-600 hover:text-slate-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to sign in
    </button>
  );

  if (sent) {
    return (
      <div className="space-y-4" role="status" aria-live="polite">
        <div className="flex h-11 w-11 items-center justify-center rounded-full bg-emerald-100 text-emerald-700">
          <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
            Check your inbox
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            If an account exists for{' '}
            <span className="font-medium text-slate-900">{email.trim()}</span>, a reset link
            is on its way. It may take a minute, and check spam too.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={send}
          isLoading={isSending}
          disabled={cooldown > 0}
          className="w-full"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend link'}
        </Button>
        {BackButton}
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {BackButton}
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">
          Reset your password
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Enter your work email and we&apos;ll send you a reset link. Signed in with a phone
          number? Ask your supervisor to reset it.
        </p>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send();
        }}
        className="space-y-4"
      >
        <Input
          label="Work email"
          type="email"
          autoComplete="email"
          autoCapitalize="none"
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="name@gatewaygas.co.ke"
          leftIcon={<Mail className="h-5 w-5" />}
          error={error}
        />
        <Button type="submit" isLoading={isSending} size="lg" className="w-full">
          Send reset link
        </Button>
      </form>
    </div>
  );
}
