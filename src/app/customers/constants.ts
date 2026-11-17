import type { Customer } from '@/types';

/* ── Shared types ── */
export type Filter = 'all' | 'balance' | 'noName' | 'multiPhone';
export type Sort = 'default' | 'name' | 'balance';
export type Mode = 'view' | 'edit' | 'add';
export type T = Record<string, string>;
export type FormValues = { name: string; phone: string; estate: string; address: string };
export type FindDuplicate = (phone: string, excludeId?: string) => Customer | undefined;

/**
 * The page is an "app screen": it fills the viewport between your top header and
 * (on mobile) your bottom navigation, and only the customer list scrolls.
 * If your shell uses different heights, change these two numbers only.
 */
export const SHELL_VARS = '[--app-top:56px] sm:[--app-top:64px] [--app-bottom:80px] lg:[--app-bottom:0px]';

export const baseInput =
  'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:text-sm';
export const primaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 active:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
export const secondaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50';
export const iconBtn =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400';

export const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
