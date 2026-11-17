'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUpRight, Check, Copy, MapPin, Pencil, Phone, Plus, WifiOff } from 'lucide-react';
import { useToast } from '@/components/ui/toast';
import { formatKES } from '@/lib/formatters';
import type { Customer } from '@/types';
import type { T, FindDuplicate } from '../constants';
import { baseInput, primaryBtn, secondaryBtn, iconBtn } from '../constants';
import { usableNameOf, primaryPhoneOf, formatLocation } from '../helpers';
import { Avatar, Section, DuplicateNotice } from './ui';

export function CustomerDetails({
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
