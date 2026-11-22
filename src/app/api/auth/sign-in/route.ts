import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { normalizeKenyanPhone } from '@/lib/formatters';

const PHONE_LIKE = /^\+?[0-9\s-]{9,15}$/;
const INVALID = { error: 'Incorrect email/phone or password.' };

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  const identifier = typeof body?.identifier === 'string' ? body.identifier.trim() : '';
  const password = typeof body?.password === 'string' ? body.password : '';

  if (!identifier || !password || identifier.length > 254 || password.length > 256) {
    return NextResponse.json(
      { error: 'Please provide your email/phone and password.' },
      { status: 400 }
    );
  }

  let email = identifier.toLowerCase();

  if (PHONE_LIKE.test(identifier)) {
    const admin = createAdminClient();
    const { data } = await admin
      .from('profiles')
      .select('email')
      .eq('phone', normalizeKenyanPhone(identifier))
      .maybeSingle();

    // Same response as a wrong password: don't reveal which numbers exist.
    if (!data?.email) return NextResponse.json(INVALID, { status: 401 });
    email = data.email.toLowerCase();
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error || !data.user) {
    if (error?.status === 429) {
      return NextResponse.json(
        { error: 'Too many attempts. Please wait a moment.' },
        { status: 429 }
      );
    }
    if (error?.status && error.status >= 500) {
      return NextResponse.json(
        { error: 'Sign-in service is unavailable. Try again shortly.' },
        { status: 502 }
      );
    }
    return NextResponse.json(INVALID, { status: 401 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('id, email, full_name, phone, role, approval_status, vehicle_plate, branch_id, national_id, notes')
    .eq('id', data.user.id)
    .maybeSingle();

  if (!profile) {
    await supabase.auth.signOut();
    return NextResponse.json(
      { error: 'Your staff profile was not found. Please contact administration.' },
      { status: 403 }
    );
  }

  return NextResponse.json({ profile });
}
