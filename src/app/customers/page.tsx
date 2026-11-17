'use client';

import React, {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { useRouter } from 'next/navigation';
import { useVirtualizer } from '@tanstack/react-virtual';
import {
  AlertCircle,
  ArrowUpRight,
  Check,
  Copy,
  MapPin,
  MoreVertical,
  Pencil,
  Phone,
  Plus,
  RefreshCw,
  Search,
  UserRound,
  Users,
  WifiOff,
  X,
} from 'lucide-react';
import { useStore } from '@/context/store-context';
import { useToast } from '@/components/ui/toast';
import { formatKES } from '@/lib/formatters';
import { createClient } from '@/lib/supabase/client';
import { rankCustomerSearch } from '@/lib/customer-cache';
import { translations, type Locale } from '@/lib/i18n';
import type { Customer } from '@/types';

/* ────────────────────────────────────────────────────────────────────────────
   Types & constants
──────────────────────────────────────────────────────────────────────────── */
type Filter = 'all' | 'balance' | 'noName' | 'multiPhone';
type Sort = 'default' | 'name' | 'balance';
type Mode = 'view' | 'edit' | 'add';
type T = Record<string, string>;
type FormValues = { name: string; phone: string; estate: string; address: string };
type FindDuplicate = (phone: string, excludeId?: string) => Customer | undefined;

/**
 * The page is an "app screen": it fills the viewport between your top header and
 * (on mobile) your bottom navigation, and only the customer list scrolls.
 * If your shell uses different heights, change these two numbers only.
 */
const SHELL_VARS = '[--app-top:56px] sm:[--app-top:64px] [--app-bottom:80px] lg:[--app-bottom:0px]';

const baseInput =
  'min-h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-base text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-400 focus:ring-2 focus:ring-orange-100 sm:text-sm';
const primaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 active:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50';
const secondaryBtn =
  'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 transition hover:bg-slate-50 active:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 disabled:cursor-not-allowed disabled:opacity-50';
const iconBtn =
  'inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-slate-500 transition hover:bg-slate-100 active:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400';

const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });

/** Strings introduced by this redesign (en + sw). Existing keys in lib/i18n always win. */
const ux: Record<string, T> = {
  en: {
    uxNewCustomer: 'New customer',
    uxEditCustomer: 'Edit customer',
    uxEditHint: 'To change phones or locations, add new ones from the customer details.',
    uxSelectPrompt: 'Select a customer to view details',
    uxSelectHint: 'Pick someone from the list, or add a new customer.',
    uxCall: 'Call',
    uxNoBalance: 'No outstanding balance',
    uxBalanceStale: 'Balance may be out of date (offline)',
    uxInactive: 'Inactive',
    uxInactiveNotice: 'This customer is inactive.',
    uxConfirmDeactivate: 'Deactivate this customer?',
    uxConfirm: 'Confirm',
    uxCancel: 'Cancel',
    uxDeactivated: 'Customer deactivated',
    uxActivated: 'Customer activated',
    uxCopied: 'Copied',
    uxCopyFailed: 'Could not copy',
    uxSort: 'Sort',
    uxSortDefault: 'Default',
    uxSortName: 'Name A–Z',
    uxSortBalance: 'Highest balance',
    uxSortDisabled: 'Results are ranked by relevance while searching',
    uxClearFilters: 'Clear search & filters',
    uxNoCustomersYet: 'No customers yet',
    uxNoCustomersHint: 'Add your first customer to get started.',
    uxDuplicate: 'This number is already saved for',
    uxOpen: 'Open',
    uxOptional: 'optional',
    uxMore: 'More options',
    uxClose: 'Close',
    uxDefault: 'Default',
    uxShortcutHint: 'Press / to search · Esc to close',
  },
  sw: {
    uxNewCustomer: 'Mteja mpya',
    uxEditCustomer: 'Hariri mteja',
    uxEditHint: 'Ili kubadili simu au maeneo, ongeza mapya kutoka kwenye maelezo ya mteja.',
    uxSelectPrompt: 'Chagua mteja kuona maelezo',
    uxSelectHint: 'Chagua mteja kwenye orodha, au ongeza mteja mpya.',
    uxCall: 'Piga simu',
    uxNoBalance: 'Hana deni',
    uxBalanceStale: 'Deni linaweza kuwa limepitwa na wakati (nje ya mtandao)',
    uxInactive: 'Amezimwa',
    uxInactiveNotice: 'Mteja huyu amezimwa.',
    uxConfirmDeactivate: 'Zima mteja huyu?',
    uxConfirm: 'Thibitisha',
    uxCancel: 'Ghairi',
    uxDeactivated: 'Mteja amezimwa',
    uxActivated: 'Mteja amewashwa',
    uxCopied: 'Imenakiliwa',
    uxCopyFailed: 'Imeshindwa kunakili',
    uxSort: 'Panga',
    uxSortDefault: 'Kawaida',
    uxSortName: 'Jina A–Z',
    uxSortBalance: 'Deni kubwa zaidi',
    uxSortDisabled: 'Matokeo yanapangwa kwa ulinganifu wakati wa kutafuta',
    uxClearFilters: 'Futa utafutaji na vichujio',
    uxNoCustomersYet: 'Hakuna wateja bado',
    uxNoCustomersHint: 'Ongeza mteja wako wa kwanza ili kuanza.',
    uxDuplicate: 'Nambari hii tayari imehifadhiwa kwa',
    uxOpen: 'Fungua',
    uxOptional: 'si lazima',
    uxMore: 'Chaguo zaidi',
    uxClose: 'Funga',
    uxDefault: 'Kawaida',
    uxShortcutHint: 'Bonyeza / kutafuta · Esc kufunga',
  },
};

/* ────────────────────────────────────────────────────────────────────────────
   Helpers
──────────────────────────────────────────────────────────────────────────── */
const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');

/** A "usable" name contains at least one letter (phone numbers saved as names don't count). */
const usableNameOf = (c: Customer) => {
  const n = c.name?.trim() ?? '';
  return n && /\p{L}/u.test(n) ? n : '';
};
const primaryPhoneOf = (c: Customer) => {
  const phones = c.phones || [];
  return phones.find(p => p.is_primary)?.phone_number || phones[0]?.phone_number || '';
};
const defaultLocationOf = (c: Customer) => c.locations?.find(l => l.is_default) || c.locations?.[0];
const formatLocation = (l?: { estate?: string | null; specific_address?: string | null }) =>
  l ? [l.estate, l.specific_address].filter(Boolean).join(', ') : '';

function sameAsIdentity(value: string, name: string, phone: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s,.-]/g, '');
  const v = norm(value);
  return !v || v === norm(name) || v === norm(phone);
}

/** Last 9 digits – matches 0712…, +254712…, 254712… as the same number. */
const phoneKey = (value: string) => {
  const digits = value.replace(/\D/g, '');
  return digits.length >= 9 ? digits.slice(-9) : '';
};

const TONES = [
  'bg-orange-100 text-orange-700',
  'bg-sky-100 text-sky-700',
  'bg-emerald-100 text-emerald-700',
  'bg-violet-100 text-violet-700',
  'bg-rose-100 text-rose-700',
  'bg-amber-100 text-amber-800',
  'bg-teal-100 text-teal-700',
  'bg-indigo-100 text-indigo-700',
];
const toneFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

const extractId = (value: unknown): string | null =>
  value && typeof value === 'object' && 'id' in value && typeof (value as { id: unknown }).id === 'string'
    ? (value as { id: string }).id
    : null;

function useMediaQuery(query: string) {
  const subscribe = useCallback(
    (cb: () => void) => {
      const m = window.matchMedia(query);
      m.addEventListener('change', cb);
      return () => m.removeEventListener('change', cb);
    },
    [query],
  );
  return useSyncExternalStore(subscribe, () => window.matchMedia(query).matches, () => false);
}

/* ────────────────────────────────────────────────────────────────────────────
   Small presentational pieces
──────────────────────────────────────────────────────────────────────────── */
function Highlight({ text, query }: { text: string; query: string }) {
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

function Avatar({ customer, size }: { customer: Customer; size: 'sm' | 'lg' }) {
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

function BalanceChip({ amount, className = '' }: { amount: number; className?: string }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold tabular-nums text-amber-800 ring-1 ring-amber-200 ${className}`}
    >
      {formatKES(amount)}
    </span>
  );
}

function Field({
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

function Section({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
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

function Stat({
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

function EmptyState({
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

function DuplicateNotice({
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

/* ────────────────────────────────────────────────────────────────────────────
   Overflow menu (header)
──────────────────────────────────────────────────────────────────────────── */
function OverflowMenu({
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

/* ────────────────────────────────────────────────────────────────────────────
   Bottom sheet (mobile / small tablets)
──────────────────────────────────────────────────────────────────────────── */
function BottomSheet({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 200ms ease',
        }}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl"
      >
        <div
          className="shrink-0 touch-none px-4 pt-2"
          onTouchStart={e => {
            startY.current = e.touches[0].clientY;
            setDragging(true);
          }}
          onTouchMove={e => setDragY(Math.max(0, e.touches[0].clientY - startY.current))}
          onTouchEnd={() => {
            setDragging(false);
            if (dragY > 110) onClose();
            else setDragY(0);
          }}
        >
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
          <div className="flex items-center justify-between gap-3 pb-2">
            <h2 id={titleId} className="truncate text-lg font-bold text-slate-950">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label={closeLabel} className={`${iconBtn} bg-slate-100`}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2">
          {children}
        </div>
      </section>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Customer row
──────────────────────────────────────────────────────────────────────────── */
const CustomerRow = memo(function CustomerRow({
  customer: c,
  balance,
  query,
  selected,
  onOpen,
  t,
}: {
  customer: Customer;
  balance: number | undefined;
  query: string;
  selected: boolean;
  onOpen: (c: Customer) => void;
  t: T;
}) {
  const primary = primaryPhoneOf(c);
  const phoneCount = c.phones?.length ?? 0;
  const location = formatLocation(defaultLocationOf(c));
  const name = usableNameOf(c);
  const title = name || primary || t.customerNoName;
  const phoneAsTitle = !name && !!primary;
  const inactive = c.is_active === false;
  const showLocation = !!location && !sameAsIdentity(location, c.name || '', primary);
  const owes = (balance ?? 0) > 0;
  const extras =
    phoneCount > 1 ? (
      <span className="shrink-0 rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
        +{phoneCount - 1}
      </span>
    ) : null;

  return (
    <div
      className={`flex items-center rounded-2xl border transition-colors lg:rounded-xl ${
        selected
          ? 'border-orange-300 bg-orange-50/70 ring-1 ring-orange-200'
          : 'border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/30'
      } ${inactive ? 'opacity-70' : ''}`}
    >
      <button
        type="button"
        onClick={() => onOpen(c)}
        aria-current={selected || undefined}
        className="flex min-h-[82px] min-w-0 flex-1 items-center gap-3 rounded-2xl p-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-400 lg:min-h-[66px] lg:rounded-xl lg:p-2.5"
      >
        <Avatar customer={c} size="sm" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-semibold text-slate-900">
              <Highlight text={title} query={query} />
            </span>
            {!name && (
              <span className="shrink-0 text-[10px] font-medium text-slate-400">{t.customerNoNameSaved}</span>
            )}
            {phoneAsTitle && extras}
            {inactive && (
              <span className="shrink-0 rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {t.uxInactive}
              </span>
            )}
          </span>
          {!phoneAsTitle && (
            <span className="mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-slate-600">
              <Phone className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="truncate tabular-nums">
                {primary ? <Highlight text={primary} query={query} /> : '—'}
              </span>
              {extras}
            </span>
          )}
          {(showLocation || owes) && (
            <span className="mt-1 flex min-w-0 items-center gap-2">
              {showLocation && (
                <span className="flex min-w-0 items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3 shrink-0" />
                  <span className="truncate">{location}</span>
                </span>
              )}
              {owes && <BalanceChip amount={balance!} className="lg:hidden" />}
            </span>
          )}
        </span>
        {owes && (
          <span className="hidden shrink-0 lg:block">
            <BalanceChip amount={balance!} />
          </span>
        )}
      </button>
      {primary && (
        <a
          href={`tel:${primary}`}
          aria-label={`${t.customerCall}: ${primary}`}
          className="mr-3 flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700 transition hover:bg-emerald-100 active:bg-emerald-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 lg:mr-2.5 lg:h-9 lg:w-9"
        >
          <Phone className="h-4 w-4" />
        </a>
      )}
    </div>
  );
});

/* ────────────────────────────────────────────────────────────────────────────
   Add / edit form
──────────────────────────────────────────────────────────────────────────── */
function CustomerForm({
  mode,
  initialName = '',
  saving,
  onSubmit,
  onCancel,
  findDuplicate,
  onOpenExisting,
  t,
}: {
  mode: 'add' | 'edit';
  initialName?: string;
  saving: boolean;
  onSubmit: (values: FormValues) => Promise<void>;
  onCancel: () => void;
  findDuplicate: FindDuplicate;
  onOpenExisting: (c: Customer) => void;
  t: T;
}) {
  const [v, setV] = useState<FormValues>({ name: initialName, phone: '', estate: '', address: '' });
  const set = (key: keyof FormValues) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setV(prev => ({ ...prev, [key]: e.target.value }));
  const dup = mode === 'add' ? findDuplicate(v.phone) : undefined;

  return (
    <form
      className="space-y-4"
      onSubmit={e => {
        e.preventDefault();
        void onSubmit({ name: v.name.trim(), phone: v.phone.trim(), estate: v.estate.trim(), address: v.address.trim() });
      }}
    >
      {mode === 'add' && (
        <div className="space-y-2">
          <Field label={t.customerPhone} required>
            <input
              className={baseInput}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              required
              autoFocus
              value={v.phone}
              onChange={set('phone')}
            />
          </Field>
          <DuplicateNotice customer={dup} onOpen={onOpenExisting} t={t} />
        </div>
      )}

      <Field label={t.customerName} optionalLabel={mode === 'add' ? t.uxOptional : undefined}>
        <input
          className={baseInput}
          autoComplete="off"
          autoFocus={mode === 'edit'}
          value={v.name}
          onChange={set('name')}
        />
      </Field>

      {mode === 'add' && (
        <>
          <Field label={t.customerLocation} required>
            <input
              className={baseInput}
              list="customer-estates"
              autoComplete="off"
              required
              value={v.estate}
              onChange={set('estate')}
            />
          </Field>
          <Field label={t.customerAddress} optionalLabel={t.uxOptional}>
            <input className={baseInput} autoComplete="off" value={v.address} onChange={set('address')} />
          </Field>
        </>
      )}

      {mode === 'edit' && <p className="text-xs text-slate-500">{t.uxEditHint}</p>}

      <div className="flex gap-2 pt-1">
        <button type="button" className={`${secondaryBtn} flex-1`} onClick={onCancel} disabled={saving}>
          {t.uxCancel}
        </button>
        <button type="submit" className={`${primaryBtn} flex-[2]`} disabled={saving}>
          {saving ? t.customerSaving : t.customerSave}
        </button>
      </div>
    </form>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Customer details
──────────────────────────────────────────────────────────────────────────── */
function CustomerDetails({
  customer,
  balance,
  balanceStale,
  saving,
  onEdit,
  onStartSale,
  onAddPhone,
  onAddLocation,
  onToggleActive,
  findDuplicate,
  onOpenExisting,
  t,
}: {
  customer: Customer;
  balance: number | undefined;
  balanceStale: boolean;
  saving: boolean;
  onEdit: () => void;
  onStartSale: () => void;
  onAddPhone: (phone: string) => Promise<boolean>;
  onAddLocation: (estate: string, address: string) => Promise<boolean>;
  onToggleActive: () => Promise<void>;
  findDuplicate: FindDuplicate;
  onOpenExisting: (c: Customer) => void;
  t: T;
}) {
  const { showError } = useToast();
  const name = usableNameOf(customer);
  const primary = primaryPhoneOf(customer);
  const inactive = customer.is_active === false;
  const owes = (balance ?? 0) > 0;
  const phones = useMemo(
    () => [...(customer.phones || [])].sort((a, b) => Number(!!b.is_primary) - Number(!!a.is_primary)),
    [customer.phones],
  );
  const locations = customer.locations || [];

  const [phoneOpen, setPhoneOpen] = useState(false);
  const [phoneValue, setPhoneValue] = useState('');
  const [locOpen, setLocOpen] = useState(false);
  const [estate, setEstate] = useState('');
  const [address, setAddress] = useState('');
  const [confirmOff, setConfirmOff] = useState(false);
  const [copied, setCopied] = useState('');
  const copyTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(copyTimer.current), []);

  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      window.clearTimeout(copyTimer.current);
      copyTimer.current = window.setTimeout(() => setCopied(''), 1500);
    } catch {
      showError(t.uxCopyFailed);
    }
  };

  const addAction = (onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex min-h-9 items-center gap-1 rounded-full px-2.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400"
    >
      <Plus className="h-3.5 w-3.5" />
      {t.customerAdd}
    </button>
  );

  return (
    <div className="space-y-5">
      {/* Identity */}
      <div className="flex items-center gap-3">
        <Avatar customer={customer} size="lg" />
        <div className="min-w-0">
          <p className="break-words text-lg font-bold leading-tight text-slate-950">
            {name || primary || t.customerNoName}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
            {!name && <span>{t.customerNoNameSaved}</span>}
            {name && primary && <span className="tabular-nums">{primary}</span>}
            {inactive && (
              <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                {t.uxInactive}
              </span>
            )}
          </p>
        </div>
      </div>

      {inactive && (
        <p className="rounded-xl bg-slate-100 px-3 py-2 text-xs font-medium text-slate-600">{t.uxInactiveNotice}</p>
      )}

      {/* Balance */}
      <div
        className={`rounded-2xl p-4 ring-1 ${
          balance === undefined
            ? 'bg-slate-50 ring-slate-200'
            : owes
              ? 'bg-amber-50 ring-amber-200'
              : 'bg-emerald-50 ring-emerald-200'
        }`}
      >
        <p className="text-xs font-medium text-slate-600">{t.customerOutstanding}</p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${
            balance === undefined ? 'text-slate-400' : owes ? 'text-amber-900' : 'text-emerald-800'
          }`}
        >
          {balance === undefined ? '—' : formatKES(balance)}
        </p>
        {balance !== undefined && !owes && <p className="mt-0.5 text-xs text-emerald-700">{t.uxNoBalance}</p>}
        {balanceStale && (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] text-amber-700">
            <WifiOff className="h-3 w-3" />
            {t.uxBalanceStale}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className={`${primaryBtn} col-span-2`} onClick={onStartSale}>
          <ArrowUpRight className="h-4 w-4" />
          {t.customerStartSale}
        </button>
        {primary ? (
          <a href={`tel:${primary}`} className={secondaryBtn}>
            <Phone className="h-4 w-4 text-emerald-600" />
            {t.uxCall}
          </a>
        ) : (
          <button type="button" className={secondaryBtn} disabled>
            <Phone className="h-4 w-4" />
            {t.uxCall}
          </button>
        )}
        <button type="button" className={secondaryBtn} onClick={onEdit}>
          <Pencil className="h-4 w-4" />
          {t.customerEdit}
        </button>
      </div>

      {/* Phones */}
      <Section title={t.customerPhones} action={!phoneOpen && addAction(() => setPhoneOpen(true))}>
        {phones.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">—</p>
        ) : (
          <ul>
            {phones.map(p => (
              <li key={p.id} className="flex min-h-12 items-center gap-1 border-b border-slate-100 last:border-0">
                <a
                  href={`tel:${p.phone_number}`}
                  className="flex min-h-11 min-w-0 flex-1 items-center gap-2 text-sm font-medium text-slate-800 hover:text-orange-700"
                >
                  <Phone className="h-4 w-4 shrink-0 text-slate-400" />
                  <span className="truncate tabular-nums">{p.phone_number}</span>
                  {p.is_primary && (
                    <span className="shrink-0 rounded-full bg-orange-50 px-2 py-0.5 text-[10px] font-semibold text-orange-700">
                      {t.customerPrimary}
                    </span>
                  )}
                </a>
                <button
                  type="button"
                  className={iconBtn}
                  onClick={() => void copy(p.id, p.phone_number)}
                  aria-label={t.customerCopy}
                >
                  {copied === p.id ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
                </button>
                <span role="status" className="sr-only">
                  {copied === p.id ? t.uxCopied : ''}
                </span>
              </li>
            ))}
          </ul>
        )}
        {phoneOpen && (
          <form
            className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3"
            onSubmit={async e => {
              e.preventDefault();
              if (!phoneValue.trim()) return;
              if (await onAddPhone(phoneValue)) {
                setPhoneValue('');
                setPhoneOpen(false);
              }
            }}
          >
            <input
              className={baseInput}
              type="tel"
              inputMode="tel"
              autoComplete="off"
              autoFocus
              value={phoneValue}
              onChange={e => setPhoneValue(e.target.value)}
              placeholder={t.customerPhone}
              aria-label={t.customerAddPhone}
            />
            <DuplicateNotice customer={findDuplicate(phoneValue, customer.id)} onOpen={onOpenExisting} t={t} />
            <div className="flex gap-2">
              <button
                type="button"
                className={`${secondaryBtn} flex-1`}
                onClick={() => {
                  setPhoneOpen(false);
                  setPhoneValue('');
                }}
              >
                {t.uxCancel}
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`} disabled={saving || !phoneValue.trim()}>
                {t.customerAdd}
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* Locations */}
      <Section title={t.customerLocations} action={!locOpen && addAction(() => setLocOpen(true))}>
        {locations.length === 0 ? (
          <p className="py-2 text-sm text-slate-400">—</p>
        ) : (
          <ul>
            {locations.map(l => (
              <li key={l.id} className="flex min-h-12 items-center gap-2 border-b border-slate-100 py-2 last:border-0">
                <MapPin className="h-4 w-4 shrink-0 text-slate-400" />
                <span className="min-w-0 flex-1 break-words text-sm text-slate-700">
                  {formatLocation(l) || '—'}
                </span>
                {l.is_default && (
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {t.uxDefault}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        {locOpen && (
          <form
            className="mt-2 space-y-2 rounded-xl bg-slate-50 p-3"
            onSubmit={async e => {
              e.preventDefault();
              if (!estate.trim()) return;
              if (await onAddLocation(estate, address)) {
                setEstate('');
                setAddress('');
                setLocOpen(false);
              }
            }}
          >
            <input
              className={baseInput}
              list="customer-estates"
              autoComplete="off"
              autoFocus
              value={estate}
              onChange={e => setEstate(e.target.value)}
              placeholder={t.customerLocation}
              aria-label={t.customerLocation}
            />
            <input
              className={baseInput}
              autoComplete="off"
              value={address}
              onChange={e => setAddress(e.target.value)}
              placeholder={t.customerAddress}
              aria-label={t.customerAddress}
            />
            <div className="flex gap-2">
              <button
                type="button"
                className={`${secondaryBtn} flex-1`}
                onClick={() => {
                  setLocOpen(false);
                  setEstate('');
                  setAddress('');
                }}
              >
                {t.uxCancel}
              </button>
              <button type="submit" className={`${primaryBtn} flex-1`} disabled={saving || !estate.trim()}>
                {t.customerAdd}
              </button>
            </div>
          </form>
        )}
      </Section>

      {/* Activate / deactivate */}
      <div className="border-t border-slate-100 pt-3">
        {inactive ? (
          <button type="button" className={`${secondaryBtn} w-full`} disabled={saving} onClick={() => void onToggleActive()}>
            {t.customerActivate}
          </button>
        ) : confirmOff ? (
          <div role="alertdialog" aria-label={t.uxConfirmDeactivate} className="space-y-2 rounded-xl bg-red-50 p-3 ring-1 ring-red-200">
            <p className="text-sm font-semibold text-red-900">{t.uxConfirmDeactivate}</p>
            <div className="flex gap-2">
              <button type="button" className={`${secondaryBtn} flex-1`} onClick={() => setConfirmOff(false)}>
                {t.uxCancel}
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={async () => {
                  await onToggleActive();
                  setConfirmOff(false);
                }}
                className="inline-flex min-h-11 flex-1 items-center justify-center rounded-xl bg-red-600 px-3 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t.uxConfirm}
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="min-h-11 w-full rounded-xl text-xs font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-700"
            onClick={() => setConfirmOff(true)}
          >
            {t.customerDeactivate}
          </button>
        )}
      </div>
    </div>
  );
}

/* ────────────────────────────────────────────────────────────────────────────
   Page
──────────────────────────────────────────────────────────────────────────── */
export default function CustomersPage() {
  const router = useRouter();
  const {
    currentUser,
    customers,
    customersLoading,
    customersError,
    refreshCustomers,
    customerSyncProgress,
    customerCacheAvailable,
    createCustomer,
    updateCustomer,
    setCustomerActive,
    addCustomerPhone,
    addCustomerLocation,
  } = useStore();
  const { showError, showSuccess } = useToast();
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  const [locale, setLocale] = useState<Locale>('en');
  const t = useMemo<T>(() => ({ ...(ux[locale] ?? ux.en), ...translations[locale] }), [locale]);

  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('default');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mode, setMode] = useState<Mode>('view');
  const [saving, setSaving] = useState(false);
  const [balances, setBalances] = useState<Record<string, number>>({});
  const [balanceUpdated, setBalanceUpdated] = useState<Date | null>(null);
  const [balanceOffline, setBalanceOffline] = useState(false);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const listParent = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  /* ── locale ── */
  useEffect(() => {
    const read = () => {
      const value = localStorage.getItem('gwg_locale');
      if (value === 'sw' || value === 'en') setLocale(value);
    };
    read();
    window.addEventListener('storage', read);
    return () => window.removeEventListener('storage', read);
  }, []);

  /* ── debounced search (clearing is instant) ── */
  useEffect(() => {
    if (!query) {
      setDebounced('');
      return;
    }
    const id = window.setTimeout(() => setDebounced(query), 150);
    return () => window.clearTimeout(id);
  }, [query]);

  /* ── balances ── */
  const loadBalances = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setBalanceOffline(true);
      return;
    }
    setBalancesLoading(true);
    try {
      const supabase = createClient();
      const { data, error } = await supabase.from('customer_outstanding_balances').select('customer_id,balance_kes');
      if (error) throw error;
      const next: Record<string, number> = {};
      ((data || []) as { customer_id: string; balance_kes: number | string | null }[]).forEach(row => {
        next[row.customer_id] = Number(row.balance_kes || 0);
      });
      setBalances(next);
      setBalanceUpdated(new Date());
      setBalanceOffline(false);
    } catch (error) {
      console.warn('Could not refresh customer balances', error);
      setBalanceOffline(true);
    } finally {
      setBalancesLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadBalances();
    const timer = window.setInterval(() => void loadBalances(), 5 * 60 * 1000);
    const refresh = () => void loadBalances();
    window.addEventListener('focus', refresh);
    window.addEventListener('online', refresh);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      window.removeEventListener('online', refresh);
    };
  }, [loadBalances]);

  const refreshAll = useCallback(async () => {
    await Promise.allSettled([refreshCustomers(), loadBalances()]);
  }, [refreshCustomers, loadBalances]);

  /* ── derived data ── */
  const balanceLoaded = balanceUpdated !== null;
  const totalBalance = useMemo(() => Object.values(balances).reduce((s, v) => s + v, 0), [balances]);
  const withBalanceCount = useMemo(() => Object.values(balances).filter(v => v > 0).length, [balances]);
  const counts = useMemo(() => {
    let noName = 0;
    let multi = 0;
    for (const c of customers) {
      if (!usableNameOf(c)) noName++;
      if ((c.phones || []).length > 1) multi++;
    }
    return { noName, multi };
  }, [customers]);

  const matching = useMemo(() => {
    let rows = rankCustomerSearch(customers, debounced);
    if (filter === 'balance') rows = rows.filter(c => (balances[c.id] || 0) > 0);
    else if (filter === 'noName') rows = rows.filter(c => !usableNameOf(c));
    else if (filter === 'multiPhone') rows = rows.filter(c => (c.phones || []).length > 1);

    const effectiveSort: Sort = sort !== 'default' ? sort : filter === 'balance' ? 'balance' : 'default';
    if (!debounced.trim() && effectiveSort !== 'default') {
      if (effectiveSort === 'balance') {
        rows = [...rows].sort((a, b) => (balances[b.id] || 0) - (balances[a.id] || 0));
      } else {
        const keys = new Map<string, string>();
        for (const c of rows) keys.set(c.id, usableNameOf(c));
        rows = [...rows].sort((a, b) => {
          const an = keys.get(a.id)!;
          const bn = keys.get(b.id)!;
          if (!an && !bn) return 0;
          if (!an) return 1;
          if (!bn) return -1;
          return collator.compare(an, bn);
        });
      }
    }
    return rows;
  }, [customers, debounced, filter, sort, balances]);

  const selected = useMemo(
    () => (selectedId ? customers.find(c => c.id === selectedId) ?? null : null),
    [customers, selectedId],
  );
  const panelOpen = mode === 'add' || !!selected;

  const estates = useMemo(() => {
    const freq = new Map<string, number>();
    for (const c of customers)
      for (const l of c.locations || []) {
        const e = l.estate?.trim();
        if (e) freq.set(e, (freq.get(e) || 0) + 1);
      }
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 200).map(([e]) => e);
  }, [customers]);

  const phoneIndex = useMemo(() => {
    const map = new Map<string, Customer>();
    for (const c of customers)
      for (const p of c.phones || []) {
        const k = phoneKey(p.phone_number);
        if (k && !map.has(k)) map.set(k, c);
      }
    return map;
  }, [customers]);
  const findDuplicate = useCallback<FindDuplicate>(
    (phone, excludeId) => {
      const k = phoneKey(phone);
      if (!k) return undefined;
      const hit = phoneIndex.get(k);
      return hit && hit.id !== excludeId ? hit : undefined;
    },
    [phoneIndex],
  );

  /* ── virtualizer ── */
  const virtualizer = useVirtualizer({
    count: matching.length,
    getScrollElement: () => listParent.current,
    estimateSize: () => (isDesktop ? 76 : 96),
    overscan: 8,
    paddingEnd: isDesktop ? 8 : 84, // leaves room for the mobile FAB
    getItemKey: index => matching[index]?.id ?? index,
  });
  useEffect(() => {
    virtualizer.scrollToOffset(0);
  }, [debounced, filter, sort, virtualizer]);
  useEffect(() => {
    virtualizer.measure();
  }, [isDesktop, virtualizer]);

  /* ── panel actions ── */
  const closePanel = useCallback(() => {
    setSelectedId(null);
    setMode('view');
  }, []);
  const openDetails = useCallback((c: Customer) => {
    setSelectedId(c.id);
    setMode('view');
  }, []);
  const openExisting = (c: Customer) => {
    openDetails(c);
    const idx = matching.findIndex(m => m.id === c.id);
    if (idx >= 0) virtualizer.scrollToIndex(idx, { align: 'center' });
  };
  const beginAdd = () => {
    setSelectedId(null);
    setMode('add');
  };

  /* ── keyboard: "/" focuses search, Esc closes panel / clears search ── */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing =
        !!target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable);
      if (e.key === 'Escape') {
        if (target === searchRef.current && searchRef.current?.value) {
          setQuery('');
          return;
        }
        if (panelOpen) closePanel();
      } else if (e.key === '/' && !typing && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [panelOpen, closePanel]);

  /* ── mutations ── */
  const handleSubmit = async (v: FormValues) => {
    setSaving(true);
    try {
      if (mode === 'add') {
        if (!v.phone || !v.estate) throw new Error(t.customerPhoneLocationRequired);
        const created: unknown = await createCustomer(v.name, v.phone, v.estate, v.address);
        await refreshCustomers();
        showSuccess(t.customerAdded);
        const id = extractId(created);
        if (id) {
          setSelectedId(id);
          setMode('view');
        } else {
          closePanel();
        }
      } else if (mode === 'edit' && selected) {
        await updateCustomer(selected.id, v.name);
        await refreshCustomers();
        showSuccess(t.customerSaved);
        setMode('view');
      }
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  const handleAddPhone = async (phone: string) => {
    if (!selected || !phone.trim()) return false;
    setSaving(true);
    try {
      await addCustomerPhone(selected.id, phone.trim());
      await refreshCustomers();
      showSuccess(t.customerPhoneAdded);
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddLocation = async (estate: string, address: string) => {
    if (!selected || !estate.trim()) return false;
    setSaving(true);
    try {
      await addCustomerLocation(selected.id, estate.trim(), address.trim());
      await refreshCustomers();
      showSuccess(t.customerLocationAdded);
      return true;
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async () => {
    if (!selected) return;
    const activating = selected.is_active === false;
    setSaving(true);
    try {
      await setCustomerActive(selected.id, activating);
      await refreshCustomers();
      showSuccess(activating ? t.uxActivated : t.uxDeactivated);
      if (!activating) closePanel();
    } catch (error) {
      showError(error instanceof Error ? error.message : t.customerSaveFailed);
    } finally {
      setSaving(false);
    }
  };

  /* ── access guard (after all hooks) ── */
  if (
    !currentUser ||
    !['admin', 'director', 'operator'].includes(currentUser.role) ||
    currentUser.approval_status !== 'approved'
  ) {
    return (
      <main className="mx-auto max-w-xl px-4 py-16 text-center">
        <h1 className="text-lg font-semibold">{t.customerRestricted}</h1>
      </main>
    );
  }

  /* ── view pieces ── */
  const filters: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: t.customerAll },
    { id: 'balance', label: t.customerWithBalance, count: withBalanceCount },
    { id: 'noName', label: t.customerNoName, count: counts.noName },
    { id: 'multiPhone', label: t.customerMultiplePhones, count: counts.multi },
  ];
  const isFiltered = !!query || filter !== 'all';
  const clearAll = () => {
    setQuery('');
    setFilter('all');
    setSort('default');
  };
  const refreshing = customersLoading || balancesLoading;
  const showSkeleton = (customersLoading || !!customerSyncProgress?.initial) && customers.length === 0;

  const panelTitle = mode === 'add' ? t.uxNewCustomer : mode === 'edit' && selected ? t.uxEditCustomer : t.customerDetails;

  const panelBody =
    mode === 'add' ? (
      <CustomerForm
        key="add"
        mode="add"
        saving={saving}
        onSubmit={handleSubmit}
        onCancel={closePanel}
        findDuplicate={findDuplicate}
        onOpenExisting={openExisting}
        t={t}
      />
    ) : selected && mode === 'edit' ? (
      <CustomerForm
        key={`edit-${selected.id}`}
        mode="edit"
        initialName={usableNameOf(selected)}
        saving={saving}
        onSubmit={handleSubmit}
        onCancel={() => setMode('view')}
        findDuplicate={findDuplicate}
        onOpenExisting={openExisting}
        t={t}
      />
    ) : selected ? (
      <CustomerDetails
        key={selected.id}
        customer={selected}
        balance={balanceLoaded ? balances[selected.id] ?? 0 : undefined}
        balanceStale={balanceOffline}
        saving={saving}
        onEdit={() => setMode('edit')}
        onStartSale={() => router.push(`/sales?customerId=${encodeURIComponent(selected.id)}`)}
        onAddPhone={handleAddPhone}
        onAddLocation={handleAddLocation}
        onToggleActive={handleToggleActive}
        findDuplicate={findDuplicate}
        onOpenExisting={openExisting}
        t={t}
      />
    ) : null;

  return (
    <main
      className={`mx-auto flex h-[calc(100dvh_-_var(--app-top)_-_var(--app-bottom))] min-h-[520px] w-full max-w-3xl flex-col px-3 pb-2 pt-3 sm:px-5 sm:pt-5 lg:max-w-[1440px] lg:px-7 lg:pb-5 ${SHELL_VARS}`}
    >
      <datalist id="customer-estates">
        {estates.map(e => (
          <option key={e} value={e} />
        ))}
      </datalist>

      {/* ── Header ── */}
      <header className="mb-3 flex shrink-0 items-center justify-between gap-3 lg:mb-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-slate-500">{t.customerAccounts}</p>
          <h1 className="truncate text-2xl font-bold tracking-tight text-slate-950">{t.customerTitle}</h1>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            className={iconBtn}
            onClick={() => void refreshAll()}
            aria-label={t.customerRefresh}
            title={t.customerRefresh}
          >
            <RefreshCw className={`h-[18px] w-[18px] ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <OverflowMenu
            label={t.uxMore}
            items={[
              {
                label: t.customerRedownload,
                hint: t.customerRepair,
                onClick: () => {
                  if (window.confirm(t.customerRedownload + '?')) void refreshCustomers(true);
                },
              },
            ]}
          />
          <button
            type="button"
            onClick={beginAdd}
            className="ml-1 hidden min-h-10 items-center gap-1.5 rounded-full bg-orange-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 sm:inline-flex"
          >
            <Plus className="h-4 w-4" />
            {t.uxNewCustomer}
          </button>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 gap-5">
        {/* ── List column ── */}
        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          {/* Stats */}
          <section
            aria-label={t.customerTitle}
            className="mb-3 grid shrink-0 grid-cols-2 divide-x divide-slate-200 overflow-hidden rounded-2xl border border-slate-200 bg-white lg:grid-cols-4"
          >
            <Stat label={t.customerTotal} value={customers.length.toLocaleString()} />
            <Stat label={t.customerOutstanding} value={balanceLoaded ? formatKES(totalBalance) : '—'} />
            <Stat
              className="hidden lg:block"
              label={t.customerWithBalance}
              value={withBalanceCount.toLocaleString()}
              active={filter === 'balance'}
              onClick={() => setFilter(f => (f === 'balance' ? 'all' : 'balance'))}
            />
            <Stat className="hidden lg:block" label={t.customerMatching} value={matching.length.toLocaleString()} />
          </section>

          {/* Search + filters */}
          <section className="shrink-0 space-y-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                type="text"
                inputMode="search"
                enterKeyHint="search"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                className={`${baseInput} pl-10 pr-11`}
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder={t.customerSearch}
                aria-label={t.customerSearch}
              />
              {query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery('');
                    searchRef.current?.focus();
                  }}
                  aria-label={t.customerClearSearch}
                  className="absolute right-1.5 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border border-slate-200 bg-slate-50 px-1.5 text-[11px] font-medium text-slate-400 lg:block">
                  /
                </kbd>
              )}
            </div>

            <div
              role="group"
              className="-mx-3 flex gap-2 overflow-x-auto px-3 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden"
            >
              {filters.map(item => {
                const active = filter === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setFilter(item.id)}
                    className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 lg:min-h-9 ${
                      active
                        ? 'border-orange-600 bg-orange-600 text-white'
                        : 'border-slate-200 bg-white text-slate-600 hover:border-orange-200 hover:bg-orange-50/50'
                    }`}
                  >
                    {item.label}
                    {!!item.count && item.count > 0 && item.id !== 'all' && (
                      <span
                        className={`rounded-full px-1.5 text-[10px] font-bold tabular-nums ${
                          active ? 'bg-white/25 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {item.count.toLocaleString()}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Status bar */}
          <div className="flex shrink-0 items-center justify-between gap-3 py-2 text-xs text-slate-500">
            <span aria-live="polite">
              {t.customerShowing} {matching.length.toLocaleString()} {t.customerOf} {customers.length.toLocaleString()}
            </span>
            <span className="flex items-center gap-3">
              {balanceOffline ? (
                <span className="inline-flex items-center gap-1 text-amber-700" title={t.customerOfflineBalances}>
                  <WifiOff className="h-3.5 w-3.5" />
                  <span className="hidden sm:inline">{t.customerOfflineBalances}</span>
                </span>
              ) : balanceUpdated ? (
                <span className="inline-flex items-center gap-1.5" title={t.customerUpdatedNow}>
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span className="hidden sm:inline">{t.customerUpdatedNow}</span>
                </span>
              ) : null}
              <label className="inline-flex items-center gap-1.5" title={debounced ? t.uxSortDisabled : undefined}>
                <span className="sr-only sm:not-sr-only">{t.uxSort}</span>
                <select
                  value={sort}
                  onChange={e => setSort(e.target.value as Sort)}
                  disabled={!!debounced}
                  className="min-h-9 rounded-lg border border-slate-200 bg-white py-1 pl-2 pr-6 text-xs font-medium text-slate-700 outline-none focus:border-orange-400 disabled:opacity-50"
                >
                  <option value="default">{t.uxSortDefault}</option>
                  <option value="name">{t.uxSortName}</option>
                  <option value="balance">{t.uxSortBalance}</option>
                </select>
              </label>
            </span>
          </div>

          {/* Banners */}
          {!customerCacheAvailable && (
            <p className="mb-2 shrink-0 rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">
              {t.customerCacheUnavailable}
            </p>
          )}
          {customerSyncProgress?.initial && (
            <div className="mb-2 shrink-0 rounded-xl bg-orange-50 px-3 py-3 text-xs text-orange-800">
              <div className="mb-2 flex justify-between gap-2">
                <span>{t.customerDownloading}</span>
                <span className="tabular-nums">
                  {customerSyncProgress.done.toLocaleString()} {t.customerOf} {customerSyncProgress.total.toLocaleString()}
                </span>
              </div>
              <div
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={customerSyncProgress.total}
                aria-valuenow={customerSyncProgress.done}
                className="h-1.5 overflow-hidden rounded-full bg-orange-100"
              >
                <div
                  className="h-full rounded-full bg-orange-600 transition-[width]"
                  style={{
                    width: `${customerSyncProgress.total ? Math.min(100, (customerSyncProgress.done / customerSyncProgress.total) * 100) : 0}%`,
                  }}
                />
              </div>
            </div>
          )}
          {customersError && (
            <div
              role="alert"
              className="mb-2 flex shrink-0 items-center justify-between gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              <span className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0" />
                {t.customerLoadFailed}
              </span>
              <button type="button" className="shrink-0 font-semibold underline" onClick={() => void refreshCustomers()}>
                {t.customerRetry}
              </button>
            </div>
          )}

          {/* List (scroll container is always mounted so the virtualizer never loses it) */}
          <div
            ref={listParent}
            role={matching.length ? 'list' : undefined}
            aria-label={t.customerDirectory}
            className="min-h-[240px] flex-1 overflow-y-auto overscroll-contain"
          >
            {showSkeleton ? (
              <div className="space-y-2" aria-busy="true">
                {Array.from({ length: 8 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex h-[82px] animate-pulse items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 lg:h-[66px] lg:rounded-xl lg:p-2.5"
                  >
                    <div className="h-11 w-11 rounded-full bg-slate-200 lg:h-9 lg:w-9" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/5 rounded bg-slate-200" />
                      <div className="h-3 w-3/5 rounded bg-slate-100" />
                    </div>
                  </div>
                ))}
              </div>
            ) : matching.length === 0 ? (
              customers.length === 0 ? (
                customersError ? null : (
                  <EmptyState
                    icon={<Users className="h-6 w-6" />}
                    title={t.uxNoCustomersYet}
                    hint={t.uxNoCustomersHint}
                    action={
                      <button type="button" className={primaryBtn} onClick={beginAdd}>
                        <Plus className="h-4 w-4" />
                        {t.uxNewCustomer}
                      </button>
                    }
                  />
                )
              ) : (
                <EmptyState
                  icon={<Search className="h-6 w-6" />}
                  title={t.customerEmpty}
                  hint={t.customerEmptyHint}
                  action={
                    isFiltered ? (
                      <button type="button" className={secondaryBtn} onClick={clearAll}>
                        {t.uxClearFilters}
                      </button>
                    ) : undefined
                  }
                />
              )
            ) : (
              <div style={{ height: virtualizer.getTotalSize(), width: '100%', position: 'relative' }}>
                {virtualizer.getVirtualItems().map(item => {
                  const c = matching[item.index];
                  if (!c) return null;
                  return (
                    <div
                      key={item.key}
                      ref={virtualizer.measureElement}
                      data-index={item.index}
                      role="listitem"
                      aria-setsize={matching.length}
                      aria-posinset={item.index + 1}
                      className="absolute left-0 top-0 w-full pb-2"
                      style={{ transform: `translateY(${item.start}px)` }}
                    >
                      <CustomerRow
                        customer={c}
                        balance={balanceLoaded ? balances[c.id] ?? 0 : undefined}
                        query={debounced}
                        selected={selectedId === c.id}
                        onOpen={openDetails}
                        t={t}
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* ── Desktop detail pane ── */}
        <aside
          aria-label={t.customerDetails}
          className="hidden w-[400px] shrink-0 flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm lg:flex xl:w-[440px]"
        >
          {isDesktop &&
            (panelOpen ? (
              <>
                <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
                  <h2 className="truncate text-base font-bold text-slate-950">{panelTitle}</h2>
                  <button type="button" onClick={closePanel} aria-label={t.uxClose} className={`${iconBtn} h-9 w-9 bg-slate-100`}>
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto p-5">{panelBody}</div>
              </>
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-100">
                  <Users className="h-7 w-7 text-slate-400" />
                </div>
                <p className="text-sm font-semibold text-slate-700">{t.uxSelectPrompt}</p>
                <p className="max-w-[260px] text-xs text-slate-500">{t.uxSelectHint}</p>
                <button type="button" className={`${secondaryBtn} mt-1`} onClick={beginAdd}>
                  <Plus className="h-4 w-4" />
                  {t.uxNewCustomer}
                </button>
                <p className="mt-4 text-[11px] text-slate-400">{t.uxShortcutHint}</p>
              </div>
            ))}
        </aside>
      </div>

      {/* ── Mobile: floating add button ── */}
      {!panelOpen && (
        <button
          type="button"
          onClick={beginAdd}
          className="fixed right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-orange-600 px-5 text-sm font-semibold text-white shadow-lg shadow-orange-900/20 transition active:scale-95 active:bg-orange-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-400 focus-visible:ring-offset-2 bottom-[calc(var(--app-bottom)_+_env(safe-area-inset-bottom)_+_16px)] sm:hidden"
        >
          <Plus className="h-5 w-5" />
          {t.customerAdd}
        </button>
      )}

      {/* ── Mobile / tablet: bottom sheet ── */}
      {!isDesktop && panelOpen && (
        <BottomSheet title={panelTitle} closeLabel={t.uxClose} onClose={closePanel}>
          {panelBody}
        </BottomSheet>
      )}
    </main>
  );
}