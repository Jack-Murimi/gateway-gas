'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { translations, Locale } from '@/lib/i18n';
import {
  Flame,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Receipt,
  Send,
  Bike,
  Users,
  LogOut,
  MoreHorizontal,
  X,
  Languages,
  FileText,
  ChevronDown,
  Banknote,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

function initialsOf(name?: string | null) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'GG';
  return (parts[0][0] + (parts[1]?.[0] || '')).toUpperCase();
}

export function Navbar() {
  const { currentUser, logout } = useStore();
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [showAccountMenu, setShowAccountMenu] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
  const accountMenuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem('gwg_locale') as Locale | null;
    if (saved === 'sw' || saved === 'en') setLocale(saved);
  }, []);

  useEffect(() => {
    if (!showMoreDrawer) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowMoreDrawer(false);
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showMoreDrawer]);

  useEffect(() => {
    if (!showAccountMenu) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (accountMenuRef.current && !accountMenuRef.current.contains(event.target as Node)) {
        setShowAccountMenu(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setShowAccountMenu(false);
    };
    document.addEventListener('mousedown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showAccountMenu]);

  useEffect(() => {
    setShowMoreDrawer(false);
    setShowAccountMenu(false);
  }, [pathname]);

  const toggleLocale = () => {
    const next: Locale = locale === 'en' ? 'sw' : 'en';
    setLocale(next);
    localStorage.setItem('gwg_locale', next);
  };

  if (!currentUser) return null;

  const t = translations[locale];
  const allNavLinks = [
    { href: '/', label: t.navOverview, icon: LayoutDashboard, roles: ['admin', 'director', 'operator'] },
    { href: '/sales', label: t.navPOS, icon: ShoppingCart, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/inventory', label: t.navStock, icon: Package, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/customers', label: 'Customers', icon: Users, roles: ['admin', 'director', 'operator'] },
    { href: '/purchases', label: 'Purchases', icon: Receipt, roles: ['admin', 'director', 'operator'] },
    { href: '/expenses', label: t.navExpenses, icon: Banknote, roles: ['admin', 'director'] },
    { href: '/operations', label: t.navDispatch, icon: Send, roles: ['admin', 'director', 'operator'] },
    { href: '/reports', label: t.navReports, icon: FileText, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/rider', label: t.navDeliveries, icon: Bike, roles: ['rider', 'admin'] },
    { href: '/staff', label: t.navStaff, icon: Users, roles: ['admin', 'director'] },
  ];

  const roleLinks = allNavLinks.filter(
    (link) => currentUser.approval_status === 'approved' && link.roles.includes(currentUser.role)
  );

  const isOverflow = roleLinks.length > 4;
  const primaryMobileTabs = isOverflow ? roleLinks.slice(0, 3) : roleLinks;
  const overflowMobileTabs = isOverflow ? roleLinks.slice(3) : [];
  const isActive = (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
  const isOverflowActive = overflowMobileTabs.some((link) => isActive(link.href));

  const roleLabel = currentUser.role.replace('_', ' ');
  const firstName = currentUser.full_name?.trim().split(/\s+/)[0] || 'Account';

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto max-w-[1440px] px-3 sm:px-4 lg:px-5">
          <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
            {/* Brand */}
            <Link
              href={currentUser.role === 'sales_rep' ? '/sales' : currentUser.role === 'rider' ? '/rider' : '/'}
              aria-label="Gateway Gas home"
              className="flex shrink-0 items-center gap-2 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-600 text-white sm:h-9 sm:w-9">
                <Flame className="h-4 w-4 sm:h-5 sm:w-5" aria-hidden="true" />
              </span>
              <span className="leading-none">
                <span className="block whitespace-nowrap text-sm font-bold tracking-tight text-slate-900">
                  Gateway Gas
                </span>
                <span className="mt-0.5 hidden text-[9px] font-semibold uppercase tracking-[0.14em] text-slate-400 2xl:block">
                  Operations
                </span>
              </span>
            </Link>

            {/* Primary Desktop Nav */}
            <nav
              aria-label="Main navigation"
              className="hidden min-w-0 flex-1 items-center justify-center gap-0.5 overflow-x-auto px-1 lg:flex xl:gap-1"
            >
              {roleLinks.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-xs font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 xl:px-2.5 xl:py-2 xl:text-[13px] ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0 xl:h-4 xl:w-4" aria-hidden="true" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>

            {/* Compact Account Menu (contains Language switch + Profile + Sign out) */}
            <div ref={accountMenuRef} className="relative shrink-0">
              <button
                type="button"
                onClick={() => setShowAccountMenu((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={showAccountMenu}
                className="flex h-9 items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-2.5 text-left transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-900 text-[11px] font-bold text-white">
                  {initialsOf(currentUser.full_name)}
                </span>
                <span className="hidden max-w-[96px] truncate text-xs font-semibold text-slate-800 sm:block">
                  {firstName}
                </span>
                <ChevronDown className={`h-3.5 w-3.5 text-slate-400 transition-transform ${showAccountMenu ? 'rotate-180' : ''}`} />
              </button>

              {showAccountMenu && (
                <div
                  role="menu"
                  className="absolute right-0 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-xl ring-1 ring-slate-950/5"
                >
                  <div className="border-b border-slate-100 px-2.5 py-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-bold text-slate-900">{currentUser.full_name}</p>
                      <Badge variant={currentUser.role === 'admin' ? 'purple' : currentUser.role === 'rider' ? 'warning' : 'default'}>
                        {roleLabel}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-slate-500">{currentUser.email}</p>
                  </div>

                  <div className="mt-1 space-y-0.5">
                    <button
                      type="button"
                      role="menuitem"
                      onClick={toggleLocale}
                      className="flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-xs font-semibold text-slate-700 transition hover:bg-slate-100"
                    >
                      <span className="flex items-center gap-2">
                        <Languages className="h-4 w-4 text-orange-600" aria-hidden="true" />
                        Language
                      </span>
                      <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-800">
                        {locale === 'en' ? 'English → SW' : 'Kiswahili → EN'}
                      </span>
                    </button>

                    <button
                      type="button"
                      role="menuitem"
                      onClick={logout}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-xs font-semibold text-rose-700 transition hover:bg-rose-50"
                    >
                      <LogOut className="h-4 w-4" aria-hidden="true" />
                      Sign out
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-stretch border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur lg:hidden"
      >
        {primaryMobileTabs.map((link) => {
          const Icon = link.icon;
          const active = isActive(link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              aria-current={active ? 'page' : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 ${
                active ? 'text-orange-700' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <span className={`flex h-8 w-10 items-center justify-center rounded-xl transition-colors ${active ? 'bg-orange-50' : ''}`}>
                <Icon className="h-5 w-5" aria-hidden="true" />
              </span>
              <span className="max-w-full truncate leading-tight">{link.label}</span>
            </Link>
          );
        })}

        {isOverflow && (
          <button
            type="button"
            onClick={() => setShowMoreDrawer(true)}
            aria-haspopup="dialog"
            aria-expanded={showMoreDrawer}
            className={`flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 py-2 text-[10px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-orange-500 ${
              isOverflowActive || showMoreDrawer ? 'text-orange-700' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            <span className={`flex h-8 w-10 items-center justify-center rounded-xl ${isOverflowActive || showMoreDrawer ? 'bg-orange-50' : ''}`}>
              <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
            </span>
            <span>More</span>
          </button>
        )}
      </nav>

      {showMoreDrawer && (
        <div className="fixed inset-0 z-50 flex flex-col justify-end lg:hidden">
          <button
            type="button"
            aria-label="Close navigation menu"
            className="absolute inset-0 bg-slate-950/50 backdrop-blur-[2px]"
            onClick={() => setShowMoreDrawer(false)}
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="mobile-more-title"
            className="relative max-h-[80vh] overflow-y-auto rounded-t-3xl border-t border-slate-200 bg-white px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-4 shadow-2xl"
          >
            <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-slate-300" />
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h2 id="mobile-more-title" className="text-sm font-bold text-slate-900">
                  More destinations
                </h2>
                <p className="mt-0.5 text-xs text-slate-500">Management and account pages</p>
              </div>
              <button
                type="button"
                onClick={() => setShowMoreDrawer(false)}
                aria-label="Close menu"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-slate-100 text-slate-600 transition hover:bg-slate-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {overflowMobileTabs.map((link) => {
                const Icon = link.icon;
                const active = isActive(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setShowMoreDrawer(false)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex min-h-12 items-center gap-3 rounded-xl border px-3.5 py-3 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${
                      active
                        ? 'border-slate-900 bg-slate-900 text-white'
                        : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </section>
        </div>
      )}
    </>
  );
}
