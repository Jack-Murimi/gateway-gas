/**
 * Currency, phone, and date formatters tailored for Kenyan LPG & retail operations
 */

export function formatKES(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return 'KES 0';
  return `KES ${Math.round(amount).toLocaleString('en-KE')}`;
}

/**
 * Compact KES for chart axes/tooltips (e.g. 1.2K, 45K, 3.4M).
 */
export function formatKESCompact(amount: number): string {
  if (isNaN(amount) || amount === null || amount === undefined) return '0';
  const sign = amount < 0 ? '-' : '';
  const abs = Math.abs(amount);
  const format = (n: number, suffix: string) => {
    const rounded = n >= 100 ? Math.round(n).toString() : n.toFixed(1).replace(/\.0$/, '');
    return `${sign}${rounded}${suffix}`;
  };
  if (abs >= 1_000_000) return format(abs / 1_000_000, 'M');
  if (abs >= 1_000) return format(abs / 1_000, 'K');
  return `${sign}${Math.round(abs)}`;
}

/**
 * Standardize any Kenyan phone input into international E.164 (+254...)
 * Handles: 0712345678 -> +254712345678, 254712345678 -> +254712345678, 712345678 -> +254712345678
 */
export function normalizeKenyanPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 10) {
    return `+254${digits.slice(1)}`;
  }
  if (digits.startsWith('254') && digits.length === 12) {
    return `+${digits}`;
  }
  if (digits.length === 9) {
    return `+254${digits}`;
  }
  return phone.startsWith('+') ? phone : `+${digits}`;
}

/**
 * Human-readable phone display (+254 712 345 678)
 */
export function displayKenyanPhone(phone?: string | null): string {
  if (!phone) return '—';
  const clean = normalizeKenyanPhone(phone);
  if (clean.startsWith('+254') && clean.length === 13) {
    return `+254 ${clean.slice(4, 7)} ${clean.slice(7, 10)} ${clean.slice(10)}`;
  }
  return clean;
}

export function formatShortDate(dateStr?: string | null): string {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return dateStr;
  }
}

export function formatRelativeMinutes(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hrs = Math.floor(minutes / 60);
  const rem = minutes % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

/**
 * Determines whether a product tracks returnable empty container shells.
 * Gas cylinders and 20L returnable bottles (Keringet/Aquamist) track empty tares.
 * Japeli water is disposable; accessories are direct purchase items (no empty state).
 */
export function hasEmptyState(product: {
  category: string;
  refill_price_kes?: number | null;
  brand?: string | null;
}): boolean {
  if (product.category === 'cylinder') return true;
  if (product.category === 'water') {
    return (product.refill_price_kes || 0) > 0 && product.brand?.toLowerCase() !== 'japeli';
  }
  return false;
}
