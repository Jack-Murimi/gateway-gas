'use client';

import React, { useEffect, useRef, useState } from 'react';
import { AlertCircle, ArrowRight, Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { StaffProfile } from '@/types';
import { useLockout } from './useLockout';
import { IDENTIFIER_STORAGE_KEY, PHONE_LIKE_REGEX } from './helpers';

type Props = {
  onSignedIn: (user: StaffProfile) => void;
  onForgot: (currentIdentifier: string) => void;
};

export function SignInForm({ onSignedIn, onForgot }: Props) {
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const { isLocked, registerFailure, reset, remaining } = useLockout();
  const identifierRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  // Restore last identifier and focus where user needs to type next.
  useEffect(() => {
    const saved = localStorage.getItem(IDENTIFIER_STORAGE_KEY);
    if (saved) {
      setIdentifier(saved);
      passwordRef.current?.focus();
    } else {
      identifierRef.current?.focus();
    }
  }, []);

  const looksLikePhone = PHONE_LIKE_REGEX.test(identifier.trim());

  // Static banner during lockout — no per-second screen-reader chatter.
  const bannerMessage = isLocked
    ? 'Too many failed attempts. Please wait a moment before trying again.'
    : error;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isLocked || isSubmitting) return;

    const trimmed = identifier.trim();
    if (!trimmed || !password) {
      setError('Enter your work email or phone, and your password.');
      (trimmed ? passwordRef : identifierRef).current?.focus();
      return;
    }

    setError('');
    setIsSubmitting(true);
    let succeeded = false;

    try {
      const res = await fetch('/api/auth/sign-in', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: trimmed, password }),
      });
      const body = await res.json().catch(() => ({}));

      if (!res.ok) {
        if (res.status === 401) {
          const locked = registerFailure();
          setError(locked ? '' : body.error ?? 'Incorrect email/phone or password.');
        } else {
          setError(body.error ?? 'Something went wrong. Please try again.');
        }
        setPassword('');
        passwordRef.current?.focus();
        return;
      }

      if (remember) localStorage.setItem(IDENTIFIER_STORAGE_KEY, trimmed);
      else localStorage.removeItem(IDENTIFIER_STORAGE_KEY);

      reset();
      succeeded = true;
      onSignedIn(body.profile as StaffProfile);
    } catch {
      setError("Can't reach the server. Check your connection and try again.");
    } finally {
      if (!succeeded) setIsSubmitting(false);
    }
  };

  return (
    <>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Sign in</h1>
        <p className="mt-1 text-sm text-slate-600">
          Use your staff email or phone number and password.
        </p>
      </div>

      {bannerMessage && (
        <div
          id="login-error"
          role="alert"
          className="flex items-start gap-2.5 rounded-lg border border-red-200 bg-red-50 p-3.5 text-sm text-red-700"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>{bannerMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <Input
          ref={identifierRef}
          label="Work email or phone"
          autoComplete="username"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="name@gatewaygas.co.ke or 0712 345 678"
          helperText={
            looksLikePhone
              ? "We'll sign you in with the account linked to this number."
              : undefined
          }
          leftIcon={<Mail className="h-5 w-5" />}
          aria-describedby={bannerMessage ? 'login-error' : undefined}
        />

        <div>
          <Input
            ref={passwordRef}
            id="password"
            label="Password"
            type={showPassword ? 'text' : 'password'}
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyUp={(e) => setCapsLock(e.getModifierState('CapsLock'))}
            onBlur={() => setCapsLock(false)}
            leftIcon={<Lock className="h-5 w-5" />}
            aria-describedby={bannerMessage ? 'login-error' : undefined}
            labelAction={
              <button
                type="button"
                onClick={() => onForgot(identifier)}
                className="rounded text-sm font-medium text-orange-600 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                Forgot password?
              </button>
            }
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                aria-pressed={showPassword}
                aria-controls="password"
                className="grid h-10 w-10 place-items-center rounded-md text-slate-500 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4" />
                ) : (
                  <Eye className="h-4 w-4" />
                )}
              </button>
            }
          />
          {capsLock && (
            <p role="status" className="mt-1.5 text-xs font-medium text-amber-700">
              Caps Lock is on
            </p>
          )}
        </div>

        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={remember}
            onChange={(e) => setRemember(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          Remember me on this device
        </label>

        <Button
          type="submit"
          isLoading={isSubmitting}
          disabled={isLocked}
          size="lg"
          className="w-full"
        >
          {isLocked ? (
            `Try again in ${remaining}s`
          ) : (
            <>
              Sign in <ArrowRight className="ml-1.5 h-4 w-4" aria-hidden="true" />
            </>
          )}
        </Button>
      </form>
    </>
  );
}
