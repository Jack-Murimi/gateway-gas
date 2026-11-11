'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { translations, Locale } from '@/lib/i18n';
import {
  Flame,
  LayoutDashboard,
  ShoppingCart,
  Package,
  Send, // Distinct icon for Dispatch (not Bike!)
  Bike, // Distinct icon for Rider Deliveries
  Users,
  LogOut,
  MoreHorizontal,
  X,
  Languages,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';

export function Navbar() {
  const { currentUser, logout } = useStore();
  const [showMoreDrawer, setShowMoreDrawer] = useState(false);
  const [locale, setLocale] = useState<Locale>('en');
  const pathname = usePathname();

  useEffect(() => {
    const saved = localStorage.getItem('gwg_locale') as Locale | null;
    if (saved === 'sw' || saved === 'en') {
      setLocale(saved);
    }
  }, []);

  const toggleLocale = () => {
    const next: Locale = locale === 'en' ? 'sw' : 'en';
    setLocale(next);
    localStorage.setItem('gwg_locale', next);
  };

  const t = translations[locale];

  if (!currentUser) return null;

  // Master link definitions with distinct icons & localized labels
  const allNavLinks = [
    { href: '/', label: t.navOverview, icon: LayoutDashboard, roles: ['admin', 'director', 'operator'] },
    { href: '/sales', label: t.navPOS, icon: ShoppingCart, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/inventory', label: t.navStock, icon: Package, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/operations', label: t.navDispatch, icon: Send, roles: ['admin', 'director', 'operator'] },
    { href: '/rider', label: t.navDeliveries, icon: Bike, roles: ['rider', 'admin'] },
    { href: '/staff', label: t.navStaff, icon: Users, roles: ['admin', 'director'] },
  ];

  // Filter links authorized for current role
  const roleLinks = allNavLinks.filter(
    (l) => currentUser.approval_status === 'approved' && l.roles.includes(currentUser.role)
  );

  // Mobile Bottom Navigation:
  // - Riders see only their delivery page (1-2 tabs)
  // - Sales Reps see POS & Stock (2 tabs)
  // - If <= 4 links, render all directly with zero "More" drawer!
  // - If > 4 links (Admins), show top 3 + More sheet
  const isOverflow = roleLinks.length > 4;
  const primaryMobileTabs = isOverflow ? roleLinks.slice(0, 3) : roleLinks;
  const overflowMobileTabs = isOverflow ? roleLinks.slice(3) : [];
  const isOverflowActive = isOverflow && overflowMobileTabs.some((t) => t.href === pathname);

  return (
    <>
      {/* 1. TOP HEADER (Desktop + Mobile clean utility bar) */}
      <header className="sticky top-0 z-30 bg-white/95 backdrop-blur border-b-2 border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Brand Logo */}
            <div className="flex items-center gap-6">
              <Link href={currentUser.role === 'sales_rep' ? '/sales' : currentUser.role === 'rider' ? '/rider' : '/'} className="flex items-center gap-2.5">
                <div className="w-9 h-9 sm:w-10 sm:h-10 rounded-2xl bg-orange-600 flex items-center justify-center text-white shadow-md">
                  <Flame className="w-5 h-5 sm:w-6 sm:h-6" />
                </div>
                <div>
                  <span className="font-black text-lg sm:text-xl tracking-tight text-slate-900 block leading-tight">
                    GATEWAY GAS
                  </span>
                  <span className="text-[10px] font-bold uppercase tracking-wider text-orange-600 block">
                    Nairobi Station
                  </span>
                </div>
              </Link>

              {/* Desktop Nav Links */}
              <nav className="hidden lg:flex items-center space-x-1.5 ml-6">
                {roleLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-bold transition ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right: User Role & Sign Out */}
            <div className="flex items-center gap-2.5">
              <button
                type="button"
                onClick={toggleLocale}
                className="min-h-[40px] px-2.5 py-1 rounded-xl border-2 border-slate-200 hover:border-slate-300 bg-slate-50 text-xs font-black text-slate-800 transition flex items-center gap-1.5"
                title="Badili Lugha / Toggle English & Swahili"
              >
                <Languages className="w-3.5 h-3.5 text-orange-600" />
                <span>{locale === 'en' ? 'SW' : 'EN'}</span>
              </button>

              <div className="flex items-center gap-2">
                <Badge variant={currentUser.role === 'admin' ? 'purple' : currentUser.role === 'rider' ? 'warning' : 'default'}>
                  {currentUser.role.replace('_', ' ')}
                </Badge>
                <span className="hidden sm:inline text-sm font-bold text-slate-800">
                  {currentUser.full_name}
                </span>
              </div>

              <button
                onClick={logout}
                title="Sign out"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition"
              >
                <LogOut className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* 2. MOBILE BOTTOM NAVIGATION (Ergonomic 56px touch bar at thumb reach) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 h-16 bg-white/95 backdrop-blur border-t-2 border-slate-200 z-30 flex items-center justify-around px-2 shadow-xl">
        {primaryMobileTabs.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-bold transition select-none active:scale-95 ${
                isActive ? 'text-orange-600' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <div
                className={`p-1.5 rounded-xl transition ${
                  isActive ? 'bg-orange-100 text-orange-600' : ''
                }`}
              >
                <Icon className="w-5 h-5" />
              </div>
              <span className="truncate max-w-[76px] mt-0.5 leading-tight">{link.label}</span>
            </Link>
          );
        })}

        {/* More tab for Admin overflow */}
        {isOverflow && (
          <button
            type="button"
            onClick={() => setShowMoreDrawer(true)}
            className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-xs font-bold transition select-none ${
              isOverflowActive || showMoreDrawer ? 'text-orange-600' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <div
              className={`p-1.5 rounded-xl transition ${
                isOverflowActive || showMoreDrawer ? 'bg-orange-100 text-orange-600' : ''
              }`}
            >
              <MoreHorizontal className="w-5 h-5" />
            </div>
            <span className="truncate max-w-[76px] mt-0.5 leading-tight">More</span>
          </button>
        )}
      </nav>

      {/* 3. MOBILE OVERFLOW DRAWER */}
      {showMoreDrawer && (
        <div className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end">
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm"
            onClick={() => setShowMoreDrawer(false)}
          />
          <div className="relative bg-white rounded-t-3xl border-t-2 border-slate-300 shadow-2xl p-5 pb-8 space-y-4 max-h-[75vh] overflow-y-auto animate-in slide-in-from-bottom duration-200">
            <div className="w-12 h-1.5 bg-slate-300 rounded-full mx-auto" />
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <h3 className="text-sm font-black text-slate-800 uppercase tracking-wider">
                Management Destinations
              </h3>
              <button
                onClick={() => setShowMoreDrawer(false)}
                className="w-8 h-8 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-2 pt-1">
              {overflowMobileTabs.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setShowMoreDrawer(false)}
                    className={`flex items-center gap-3 p-3.5 rounded-2xl text-base font-bold transition border-2 ${
                      isActive
                        ? 'bg-slate-900 text-white border-slate-900'
                        : 'bg-slate-50 text-slate-800 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
