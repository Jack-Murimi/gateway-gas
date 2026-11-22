import type { PaymentMethod } from '@/types';

export const fieldClass =
  'h-8 w-full rounded border border-slate-300 bg-white px-2 text-[13px] text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-orange-500 focus:ring-1 focus:ring-orange-500/30 disabled:bg-slate-100 disabled:text-slate-500';
export const labelClass = 'mb-0.5 block text-[10px] font-semibold uppercase tracking-wide text-slate-500';

export const CYLINDER_BRANDS = ['SAFE GAS', 'AFRIGAS', 'K-GAS', 'TOTAL', 'OLA', 'PROGAS', 'TOSHA', 'LAKE', 'HASHI', 'SUPA', 'JATEL', 'SEAGAS', 'RAHA', 'BONOKO', 'PURE', 'HUNKER', 'HASS'];
export const WATER_BRANDS = ['KERINGET', 'AQUAMIST'];

export const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'mpesa', label: 'M-Pesa' },
  { value: 'bank_transfer', label: 'Bank' },
  { value: 'pdq', label: 'Card' },
  { value: 'cheque', label: 'Cheque' },
];
