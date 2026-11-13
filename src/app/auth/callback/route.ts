import { createServerClient } from '@supabase/ssr';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const tokenHash = requestUrl.searchParams.get('token_hash');
  const type = requestUrl.searchParams.get('type');
  const requestedNext = requestUrl.searchParams.get('next') || '/';
  const nextPath = requestedNext.startsWith('/') && !requestedNext.startsWith('//')
    ? requestedNext
    : '/reset-password';

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const redirectWithError = (message: string) => {
    const errorUrl = new URL('/login', request.url);
    errorUrl.searchParams.set('error', message);
    return NextResponse.redirect(errorUrl);
  };

  if (!supabaseUrl || !supabaseKey) {
    return redirectWithError('Authentication is not configured. Please contact the administrator.');
  }

  if (!code && !(tokenHash && type === 'recovery')) {
    return redirectWithError('The password reset link is invalid or incomplete. Request a fresh link.');
  }

  const response = NextResponse.redirect(new URL(nextPath, request.url));
  const supabase = createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet: { name: string; value: string; options?: any }[]) {
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: 'recovery' });

  if (error) {
    return redirectWithError('That password reset link is invalid or has expired. Request a fresh one.');
  }

  return response;
}
