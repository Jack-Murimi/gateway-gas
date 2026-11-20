'use client';

import React, { memo } from 'react';
import { MapPin, Phone } from 'lucide-react';
import type { Customer } from '@/types';
import type { T } from '../constants';
import { usableNameOf, primaryPhoneOf, defaultLocationOf, formatLocation, sameAsIdentity } from '../helpers';
import { Avatar, BalanceChip, Highlight } from './ui';

export const CustomerRow = memo(function CustomerRow({
  customer: c,
  balance,
  query,
  selected,
  onOpen,
  onDoubleClick,
  t,
}: {
  customer: Customer;
  balance: number | undefined;
  query: string;
  selected: boolean;
  onOpen: (c: Customer) => void;
  onDoubleClick?: (c: Customer) => void;
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
        onDoubleClick={() => onDoubleClick?.(c)}
        title="Double-click to open full customer profile"
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
