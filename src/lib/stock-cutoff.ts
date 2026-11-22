/**
 * Stock Cutover Date helpers (East Africa Time, UTC+03:00).
 * Transactions dated strictly before a branch's stock_cutoff_at record financial/customer/supplier
 * history without modifying live branch_inventory.
 */

const EAT_OFFSET_MS = 3 * 60 * 60 * 1000;

/** Extract YYYY-MM-DD in East Africa Time (+03:00) from an ISO timestamp. */
export function cutoffDateEAT(cutoffAt?: string | null): string | null {
  if (!cutoffAt) return null;
  const ms = new Date(cutoffAt).getTime();
  if (Number.isNaN(ms)) return null;
  const eat = new Date(ms + EAT_OFFSET_MS);
  const y = eat.getUTCFullYear();
  const m = String(eat.getUTCMonth() + 1).padStart(2, '0');
  const d = String(eat.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Extract HH:mm in East Africa Time (+03:00) from an ISO timestamp. */
export function cutoffTimeEAT(cutoffAt?: string | null): string {
  if (!cutoffAt) return '00:01';
  const ms = new Date(cutoffAt).getTime();
  if (Number.isNaN(ms)) return '00:01';
  const eat = new Date(ms + EAT_OFFSET_MS);
  const h = String(eat.getUTCHours()).padStart(2, '0');
  const mi = String(eat.getUTCMinutes()).padStart(2, '0');
  return `${h}:${mi}`;
}

/** Build an ISO timestamp in EAT (+03:00) from YYYY-MM-DD and HH:mm. */
export function buildCutoffTimestampEAT(dateStr: string, timeStr = '00:01'): string {
  const cleanTime = /^\d{2}:\d{2}$/.test(timeStr) ? timeStr : '00:01';
  return new Date(`${dateStr}T${cleanTime}:00+03:00`).toISOString();
}

/** True when a YYYY-MM-DD date string is strictly before the branch's cutover date (in EAT). */
export function isDateBeforeStockCutoff(dateStr?: string | null, cutoffAt?: string | null): boolean {
  const cutDate = cutoffDateEAT(cutoffAt);
  if (!dateStr || !cutDate) return false;
  return dateStr.slice(0, 10) < cutDate;
}

/**
 * Build a deterministic sale `created_at` ISO timestamp for a chosen receipt date (YYYY-MM-DD)
 * so that:
 * - Dates before the cutover date always fall strictly before `cutoffAt` (EAT).
 * - The cutover date itself always falls on or after `cutoffAt` (never accidentally 00:00 before 00:01).
 * - Today uses the current timestamp.
 */
export function buildSaleCreatedAt(
  receiptDate: string,
  cutoffAt?: string | null,
  now: Date = new Date(),
): string {
  const eatNow = new Date(now.getTime() + EAT_OFFSET_MS);
  const todayEAT = [
    eatNow.getUTCFullYear(),
    String(eatNow.getUTCMonth() + 1).padStart(2, '0'),
    String(eatNow.getUTCDate()).padStart(2, '0'),
  ].join('-');

  if (!/^\d{4}-\d{2}-\d{2}$/.test(receiptDate) || receiptDate === todayEAT) {
    return now.toISOString();
  }

  const hh = String(eatNow.getUTCHours()).padStart(2, '0');
  const mm = String(eatNow.getUTCMinutes()).padStart(2, '0');
  const ss = String(eatNow.getUTCSeconds()).padStart(2, '0');
  const candidate = new Date(`${receiptDate}T${hh}:${mm}:${ss}+03:00`);

  if (cutoffAt) {
    const cutoffMs = new Date(cutoffAt).getTime();
    const cutDate = cutoffDateEAT(cutoffAt);
    if (!Number.isNaN(cutoffMs) && cutDate) {
      if (receiptDate === cutDate && candidate.getTime() < cutoffMs) {
        return new Date(cutoffMs).toISOString();
      }
      if (receiptDate < cutDate && candidate.getTime() >= cutoffMs) {
        return new Date(cutoffMs - 60_000).toISOString();
      }
    }
  }

  return candidate.toISOString();
}

/** Human-readable EAT label like "19 Nov 2026, 00:01". */
export function formatCutoffLabel(cutoffAt?: string | null): string {
  if (!cutoffAt) return 'Not set';
  const d = new Date(cutoffAt);
  if (Number.isNaN(d.getTime())) return 'Not set';
  return d.toLocaleString('en-KE', {
    timeZone: 'Africa/Nairobi',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}
