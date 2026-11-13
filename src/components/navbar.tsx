'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { translations, Locale } from '@/lib/i18n';
import {
  Flame,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Send,
  Bike,
  Users,
  LogOut,
  MoreHorizontal,
  X,
  Languages,
  FileText,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function Navbar() {
  const { currentUser, logout } = useStore();
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
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
    setShowMoreDrawer(false);
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

  return (
    <>
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-white/90">
        <div className="mx-auto max-w-[1440px] px-3 sm:px-5 lg:px-7">
          <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
            <div className="flex min-w-0 items-center gap-5">
              <Link
                href={currentUser.role === 'sales_rep' ? '/sales' : currentUser.role === 'rider' ? '/rider' : '/'}
                aria-label="Gateway Gas home"
                className="flex shrink-0 items-center gap-2.5 rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
              >
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-orange-600 text-white shadow-sm sm:h-10 sm:w-10">
                  <Flame className="h-5 w-5 sm:h-6 sm:w-6" aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block whitespace-nowrap text-base font-black leading-tight tracking-tight text-slate-900 sm:text-lg">
                    GATEWAY GAS
                  </span>
                  <span className="block text-[9px] font-bold uppercase leading-tight tracking-[0.16em] text-orange-700 sm:text-[10px]">
                    Nairobi Station
                  </span>
                </span>
              </Link>

              <nav aria-label="Main navigation" className="hidden items-center gap-1 xl:flex">
                {roleLinks.map((link) => {
                  const Icon = link.icon;
                  const active = isActive(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      className={`flex items-center gap-2 whitespace-nowrap rounded-lg px-2.5 py-2 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2 2xl:px-3 2xl:text-sm ${
                        active
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:bg-slate-100 hover:text-slate-950'
                      }`}
                    >
                      <Icon className="h-4 w-4 shrink-0" aria-hidden="true" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 sm:gap-2.5">
              <button
                type="button"
                onClick={toggleLocale}
                aria-label={locale === 'en' ? 'Switch language to Swahili' : 'Switch language to English'}
                title="Badili lugha / Toggle language"
                className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 focus-visible:ring-offset-2"
              >
                <Languages className="h-4 w-4 text-orange-600" aria-hidden="true" />
                <span>{locale === 'en' ? 'SW' : 'EN'}</span>
              </button>

              <div className="hidden min-w-0 items-center gap-2 sm:flex">
                <Badge variant={currentUser.role === 'admin' ? 'purple' : currentUser.role === 'rider' ? 'warning' : 'default'}>
                  {roleLabel}
                </Badge>
                <span className="max-w-[150px] truncate text-sm font-semibold text-slate-700 2xl:max-w-[210px]">
                  {currentUser.full_name}
                </span>
              </div>

              <button
                type="button"
                onClick={logout}
                aria-label="Sign out"
                title="Sign out"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-500 transition hover:bg-red-50 hover:text-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
              >
                <LogOut className="h-5 w-5" aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      </header>

      <nav
        aria-label="Mobile navigation"
        className="fixed inset-x-0 bottom-0 z-40 flex min-h-16 items-stretch border-t border-slate-200 bg-white/95 px-1 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgba(15,23,42,0.08)] backdrop-blur xl:hidden"
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
        <div className="fixed inset-0 z-50 flex flex-col justify-end xl:hidden">
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
