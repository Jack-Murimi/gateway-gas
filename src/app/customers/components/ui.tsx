'use client';

import React from 'react';
import { AlertCircle, MapPin, MoreVertical, Phone, Plus, UserRound, WifiOff, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { formatKES } from '@/lib/formatters';
import type { Customer } from '@/types';
import type { T } from '../constants';
import { iconBtn } from '../constants';
import { initials, usableNameOf, primaryPhoneOf, toneFor } from '../helpers';

/* ── Highlight ── */
export function Highlight({ text, query }: { text: string; query: string }) {
  const q = query.trim();
  if (!q || !text) return <>{text}</>;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i === -1) return <>{text}</>;
  return (
    <>
      {text.slice(0, i)}
      <mark className="rounded bg-orange-100 px-0.5 text-inherit">{text.slice(i, i + q.length)}</mark>
      {text.slice(i + q.length)}
    </>
  );
}

/* ── Avatar ── */
export function Avatar({ customer, size }: { customer: Customer; size: 'sm' | 'lg' }) {
  const name = usableNameOf(customer);
  const box = size === 'lg' ? 'h-14 w-14 text-lg' : 'h-11 w-11 text-sm lg:h-9 lg:w-9 lg:text-xs';
  const icon = size === 'lg' ? 'h-6 w-6' : 'h-5 w-5 lg:h-4 lg:w-4';
  return (
    <span
      aria-hidden
      className={`flex shrink-0 items-center justify-center rounded-full font-bold ${box} ${
        name ? toneFor(customer.id) : 'bg-slate-100 text-slate-500'
      }`}
    >
      {name ? initials(name) : <UserRound className={icon} />}
    </span>
  );
}

/* ── BalanceChip ── */
export function BalanceChip({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800 ring-1 ring-amber-200 ${className}`}
    >
      {formatKES(amount)}
    </span>
  );
}

/* ── Field ── */
export function Field({
  label,
  optionalLabel,
  required,
  children,
}: {
  label: string;
  optionalLabel?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between text-xs font-semibold text-slate-700">
        <span>
          {label}
          {required && (
            <span className="ml-0.5 text-red-500" aria-hidden>
              *
            </span>
          )}
        </span>
        {optionalLabel && <span className="font-normal text-slate-400">{optionalLabel}</span>}
      </span>
      {children}
    </label>
  );
}

/* ── Section ── */
export function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-1 flex min-h-9 items-center justify-between gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/* ── Stat ── */
export function Stat({
  label,
  value,
  onClick,
  active,
  className = '',
}: {
  label: string;
  value: string;
  onClick?: () => void;
  active?: boolean;
  className?: string;
}) {
  const body = (
    <>
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-0.5 truncate text-lg font-bold tabular-nums text-slate-950 xl:text-xl">{value}</p>
    </>
  );
  const base = `min-w-0 px-3 py-2.5 text-left lg:px-4 ${className}`;
  return onClick ? (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`${base} transition hover:bg-orange-50/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 ${
        active ? 'bg-orange-50' : ''
      }`}
    >
      {body}
    </button>
  ) : (
    <div className={base}>{body}</div>
  );
}

/* ── EmptyState ── */
export function EmptyState({
  icon,
  title,
  hint,
  action,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-1 rounded-2xl border border-dashed border-slate-300 bg-white/60 px-6 py-10 text-center">
      <div className="mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 text-slate-400">{icon}</div>
      <p className="text-sm font-semibold text-slate-800">{title}</p>
      {hint && <p className="max-w-xs text-xs text-slate-500">{hint}</p>}
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

/* ── DuplicateNotice ── */
export function DuplicateNotice({
  customer,
  onOpen,
  t,
}: {
  customer?: Customer;
  onOpen: (c: Customer) => void;
  t: T;
}) {
  if (!customer) return null;
  const label = usableNameOf(customer) || primaryPhoneOf(customer) || t.customerNoName;
  return (
    <div
      role="status"
      className="flex items-start gap-2 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-900 ring-1 ring-amber-200"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {t.uxDuplicate} <strong className="font-semibold">{label}</strong>.
      </span>
      <button type="button" onClick={() => onOpen(customer)} className="shrink-0 font-semibold underline">
        {t.uxOpen}
      </button>
    </div>
  );
}

/* ── OverflowMenu ── */
export function OverflowMenu({
  label,
  items,
}: {
  label: string;
  items: { label: string; hint?: string; onClick: () => void }[];
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent | TouchEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        className={iconBtn}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen(v => !v)}
      >
        <MoreVertical className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-50 mt-1 w-64 rounded-xl border border-slate-200 bg-white p-1 shadow-lg">
          {items.map(item => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              className="block w-full rounded-lg px-3 py-2.5 text-left hover:bg-slate-50"
              onClick={() => {
                setOpen(false);
                item.onClick();
              }}
            >
              <span className="block text-sm font-semibold text-slate-800">{item.label}</span>
              {item.hint && <span className="block text-xs text-slate-500">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
