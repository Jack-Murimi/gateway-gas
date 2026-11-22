import type { MpesaTransaction } from '@/types';

export interface DarajaC2BPayload {
  TransactionType?: string;
  TransID?: string;
  TransTime?: string;
  TransAmount?: string | number;
  BusinessShortCode?: string | number;
  BillRefNumber?: string;
  InvoiceNumber?: string;
  OrgAccountBalance?: string | number;
  ThirdPartyTransID?: string;
  MSISDN?: string;
  FirstName?: string;
  MiddleName?: string;
  LastName?: string;
}

export interface NormalizedMpesaTx {
  trans_id: string;
  trans_time: string;
  trans_amount: number;
  business_short_code: string;
  bill_ref_number: string | null;
  msisdn: string | null;
  payer_name: string | null;
}

/**
 * Parse Safaricom Daraja TransTime (YYYYMMDDHHmmss in EAT UTC+3) into an ISO-8601 timestamp.
 */
export function parseDarajaTransTime(raw?: string | null): string {
  if (!raw) return new Date().toISOString();
  const s = String(raw).trim();
  const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (m) {
    const [, y, mo, d, h, mi, sec] = m;
    const iso = `${y}-${mo}-${d}T${h}:${mi}:${sec}+03:00`;
    const parsed = new Date(iso);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const fallback = new Date(s);
  return Number.isNaN(fallback.getTime()) ? new Date().toISOString() : fallback.toISOString();
}

export function normalizeDarajaPayload(payload: DarajaC2BPayload): NormalizedMpesaTx | null {
  const transId = String(payload.TransID ?? '').trim().toUpperCase();
  const amount = Number(payload.TransAmount);
  const shortCode = String(payload.BusinessShortCode ?? '').trim();
  if (!transId || !Number.isFinite(amount) || amount <= 0 || !shortCode) {
    return null;
  }

  const nameParts = [payload.FirstName, payload.MiddleName, payload.LastName]
    .map((part) => (typeof part === 'string' ? part.trim() : ''))
    .filter(Boolean);

  return {
    trans_id: transId,
    trans_time: parseDarajaTransTime(payload.TransTime),
    trans_amount: Number(amount.toFixed(2)),
    business_short_code: shortCode,
    bill_ref_number: payload.BillRefNumber ? String(payload.BillRefNumber).trim() || null : null,
    msisdn: payload.MSISDN ? String(payload.MSISDN).trim() || null : null,
    payer_name: nameParts.length > 0 ? nameParts.join(' ') : null,
  };
}

/**
 * Rank unmatched M-Pesa transactions for a given target amount & optional branch/shortcode.
 * Exact amount matches appear first, then recent transactions.
 */
export function rankMpesaCandidates(
  transactions: MpesaTransaction[],
  targetAmountKes: number,
  branchId?: string | null,
  branchShortcode?: string | null,
): Array<MpesaTransaction & { exactAmount: boolean; branchMatch: boolean }> {
  return transactions
    .filter((tx) => tx.status === 'unmatched')
    .map((tx) => {
      const exactAmount = Math.abs(Number(tx.trans_amount) - targetAmountKes) < 0.01;
      const branchMatch = Boolean(
        (branchId && tx.branch_id === branchId) ||
          (branchShortcode && tx.business_short_code === branchShortcode),
      );
      return { ...tx, exactAmount, branchMatch };
    })
    .sort((a, b) => {
      if (a.exactAmount !== b.exactAmount) return a.exactAmount ? -1 : 1;
      if (a.branchMatch !== b.branchMatch) return a.branchMatch ? -1 : 1;
      return new Date(b.trans_time).getTime() - new Date(a.trans_time).getTime();
    });
}
