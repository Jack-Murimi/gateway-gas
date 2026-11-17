import type { Customer } from '@/types';

export const initials = (name: string) =>
  name.trim().split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]?.toUpperCase()).join('');

/** A "usable" name contains at least one letter (phone numbers saved as names don't count). */
export const usableNameOf = (c: Customer) => {
  const n = c.name?.trim() ?? '';
  return n && /\p{L}/u.test(n) ? n : '';
};

export const primaryPhoneOf = (c: Customer) => {
  const phones = c.phones || [];
  return phones.find(p => p.is_primary)?.phone_number || phones[0]?.phone_number || '';
};

export const defaultLocationOf = (c: Customer) => c.locations?.find(l => l.is_default) || c.locations?.[0];

export const formatLocation = (l?: { estate?: string | null; specific_address?: string | null }) =>
  l ? [l.estate, l.specific_address].filter(Boolean).join(', ') : '';

export function sameAsIdentity(value: string, name: string, phone: string) {
  const norm = (s: string) => s.toLowerCase().replace(/[\s,.-]/g, '');
  const v = norm(value);
  return !v || v === norm(name) || v === norm(phone);
}

/** Last 9 digits – matches 0712…, +254712…, 254712… as the same number. */
export const phoneKey = (value: string) => {
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
export const toneFor = (id: string) => {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
  return TONES[h % TONES.length];
};

export const extractId = (value: unknown): string | null =>
  value && typeof value === 'object' && 'id' in value && typeof (value as { id: unknown }).id === 'string'
    ? (value as { id: string }).id
    : null;
