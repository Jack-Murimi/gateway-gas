import { NextResponse, type NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // 1. Allow static assets, Next.js internal files, and APIs
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/api') ||
    pathname.startsWith('/static') ||
    pathname.includes('.') // images, fonts, icons, etc.
  ) {
    return NextResponse.next();
  }

  // 2. Read session state from cookies (set by demo mode and auth login)
  const role = request.cookies.get('gwg_role')?.value;
  const status = request.cookies.get('gwg_status')?.value;
  const userId = request.cookies.get('gwg_user_id')?.value;

  const isAuthRoute = pathname === '/login' || pathname === '/signup';
  const isAuthenticated = Boolean(userId && role);

  // 3. Unauthenticated -> allow / and auth pages, redirect rest to /login
  if (!isAuthenticated) {
    if (pathname === '/' || isAuthRoute) {
      return NextResponse.next();
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // 4. Pending or Rejected account status -> redirect to /pending
  if (status === 'pending' || status === 'rejected' || role === 'pending') {
    if (pathname === '/pending') {
      return NextResponse.next();
    }
    return NextResponse.redirect(new URL('/pending', request.url));
  }

  // 5. Approved user accessing /login, /signup, or /pending -> redirect to role home
  if (isAuthRoute || pathname === '/pending') {
    if (role === 'rider') return NextResponse.redirect(new URL('/rider', request.url));
    if (role === 'sales_rep') return NextResponse.redirect(new URL('/sales', request.url));
    if (role === 'operator') return NextResponse.redirect(new URL('/operations', request.url));
    return NextResponse.redirect(new URL('/', request.url));
  }

  // 6. Role-specific route enforcement (Redirect instead of "Access Restricted")
  if (role === 'rider') {
    if (pathname !== '/rider') {
      return NextResponse.redirect(new URL('/rider', request.url));
    }
  }

  if (role === 'sales_rep') {
    // Sales rep only has access to POS /sales and inventory lookup
    if (pathname === '/' || pathname === '/operations' || pathname === '/staff') {
      return NextResponse.redirect(new URL('/sales', request.url));
    }
  }

  if (role === 'operator') {
    // Operator has access to overview, operations desk, sales, and inventory, but not staff admin
    if (pathname === '/staff') {
      return NextResponse.redirect(new URL('/operations', request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico).*)'],
};
