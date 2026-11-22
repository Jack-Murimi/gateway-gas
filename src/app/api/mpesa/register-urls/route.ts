import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function POST(req: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role, approval_status')
    .eq('id', auth.user.id)
    .maybeSingle();

  if (!profile || profile.approval_status !== 'approved' || !['admin', 'director'].includes(profile.role)) {
    return NextResponse.json({ error: 'Admin or Director permission required.' }, { status: 403 });
  }

  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  const defaultShortcode = process.env.MPESA_SHORTCODE;
  const envBase =
    process.env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';

  if (
    !consumerKey ||
    !consumerSecret ||
    consumerKey.startsWith('your_') ||
    consumerSecret.startsWith('your_')
  ) {
    return NextResponse.json(
      { error: 'Daraja API credentials (MPESA_CONSUMER_KEY / MPESA_CONSUMER_SECRET) are not configured yet.' },
      { status: 400 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as {
    shortCode?: string;
    baseUrl?: string;
  };
  const shortCode = (body.shortCode || defaultShortcode || '').trim();
  const origin = (body.baseUrl || process.env.NEXT_PUBLIC_APP_URL || new URL(req.url).origin).replace(/\/$/, '');
  const secretSuffix = process.env.MPESA_WEBHOOK_SECRET
    ? `?token=${encodeURIComponent(process.env.MPESA_WEBHOOK_SECRET)}`
    : '';

  if (!shortCode) {
    return NextResponse.json({ error: 'Provide a ShortCode / Till number to register.' }, { status: 400 });
  }

  try {
    const authHeader = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const tokenRes = await fetch(`${envBase}/oauth/v1/generate?grant_type=client_credentials`, {
      headers: { Authorization: `Basic ${authHeader}` },
      cache: 'no-store',
    });
    const tokenJson = (await tokenRes.json().catch(() => ({}))) as { access_token?: string; errorMessage?: string };
    if (!tokenRes.ok || !tokenJson.access_token) {
      return NextResponse.json(
        { error: tokenJson.errorMessage || 'Failed to obtain Daraja OAuth token.' },
        { status: 502 },
      );
    }

    const regRes = await fetch(`${envBase}/mpesa/c2b/v1/registerurl`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${tokenJson.access_token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ShortCode: shortCode,
        ResponseType: 'Completed',
        ConfirmationURL: `${origin}/api/mpesa/c2b/confirmation${secretSuffix}`,
        ValidationURL: `${origin}/api/mpesa/c2b/validation${secretSuffix}`,
      }),
    });
    const regJson = await regRes.json().catch(() => ({}));
    if (!regRes.ok) {
      return NextResponse.json({ error: 'Daraja URL registration failed.', details: regJson }, { status: 502 });
    }
    return NextResponse.json({ ok: true, shortCode, details: regJson });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Daraja registration failed.' },
      { status: 502 },
    );
  }
}
