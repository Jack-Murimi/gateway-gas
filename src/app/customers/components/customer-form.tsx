'use client';

import React, { useState } from 'react';
import type { Customer } from '@/types';
import type { T, FormValues, FindDuplicate } from '../constants';
import { baseInput, primaryBtn, secondaryBtn } from '../constants';
import { Field, DuplicateNotice } from './ui';

export function CustomerForm({
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
