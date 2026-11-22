import { NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeDarajaPayload, type DarajaC2BPayload } from '@/lib/mpesa';

function isAuthorizedWebhook(req: Request): boolean {
  const secret = process.env.MPESA_WEBHOOK_SECRET;
  if (!secret) return true;
  const url = new URL(req.url);
  const token = url.searchParams.get('token') || req.headers.get('x-mpesa-webhook-secret');
  return token === secret;
}

export async function POST(req: Request) {
  if (!isAuthorizedWebhook(req)) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Unauthorized' }, { status: 403 });
  }

  let body: DarajaC2BPayload;
  try {
    body = (await req.json()) as DarajaC2BPayload;
  } catch {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Invalid JSON payload' }, { status: 400 });
  }

  const normalized = normalizeDarajaPayload(body);
  if (!normalized) {
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Missing required transaction fields' }, { status: 400 });
  }

  try {
    const admin = createAdminClient();

    // Auto-resolve branch ONLY when a single active branch uses this shortcode.
    // Shared tills (e.g. Kileleshwa + Jamhuri) leave branch_id null so both branches can match it.
    const { data: matchingBranches } = await admin
      .from('branches')
      .select('id')
      .eq('is_active', true)
      .eq('mpesa_shortcode', normalized.business_short_code);

    const branchId = matchingBranches && matchingBranches.length === 1 ? matchingBranches[0].id : null;

    const { error } = await admin
      .from('mpesa_transactions')
      .upsert(
        {
          trans_id: normalized.trans_id,
          trans_time: normalized.trans_time,
          trans_amount: normalized.trans_amount,
          business_short_code: normalized.business_short_code,
          bill_ref_number: normalized.bill_ref_number,
          msisdn: normalized.msisdn,
          payer_name: normalized.payer_name,
          branch_id: branchId,
          raw_payload: body,
        },
        { onConflict: 'trans_id', ignoreDuplicates: true },
      );

    if (error) {
      console.error('M-Pesa confirmation insert error:', error.message);
      return NextResponse.json({ ResultCode: 1, ResultDesc: 'Storage error' }, { status: 500 });
    }

    return NextResponse.json({ ResultCode: 0, ResultDesc: 'Accepted' });
  } catch (err) {
    console.error('M-Pesa confirmation handler failed:', err);
    return NextResponse.json({ ResultCode: 1, ResultDesc: 'Server configuration error' }, { status: 500 });
  }
}
