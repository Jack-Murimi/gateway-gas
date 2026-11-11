'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/context/store-context';
import { Flame, ShieldCheck, UserCheck, Users, Package, ShoppingCart, Bike, LogOut, ChevronDown, CheckCircle2 } from 'lucide-react';

export function Navbar() {
  const { currentUser, setCurrentUser, staffList, logout } = useStore();
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);
  const pathname = usePathname();

  if (!currentUser) return null;

  const roleColors: Record<string, string> = {
    admin: 'bg-purple-100 text-purple-800 border-purple-200',
    director: 'bg-indigo-100 text-indigo-800 border-indigo-200',
    operator: 'bg-blue-100 text-blue-800 border-blue-200',
    sales_rep: 'bg-emerald-100 text-emerald-800 border-emerald-200',
    rider: 'bg-amber-100 text-amber-800 border-amber-200',
    pending: 'bg-zinc-100 text-zinc-700 border-zinc-200',
  };

  const navLinks = [
    { href: '/', label: 'Dashboard', icon: ShieldCheck, roles: ['admin', 'director', 'operator', 'sales_rep', 'rider'] },
    { href: '/sales', label: 'POS & Orders', icon: ShoppingCart, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/inventory', label: 'Stock & Branches', icon: Package, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/operations', label: 'Dispatch & Riders', icon: Bike, roles: ['admin', 'director', 'operator'] },
    { href: '/rider', label: 'My Deliveries', icon: Bike, roles: ['rider', 'admin'] },
    { href: '/staff', label: 'Staff & Approvals', icon: Users, roles: ['admin', 'director'] },
  ];

  const visibleLinks = navLinks.filter((l) => currentUser.approval_status === 'approved' && l.roles.includes(currentUser.role));

  return (
    <header className="sticky top-0 z-50 bg-white border-b border-slate-200 shadow-sm">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Logo & Brand */}
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2 group">
              <div className="w-9 h-9 rounded-lg bg-orange-600 flex items-center justify-center text-white shadow-md group-hover:bg-orange-700 transition">
                <Flame className="w-5 h-5" />
              </div>
              <div>
                <span className="font-bold text-lg tracking-tight text-slate-900 block leading-tight">GATEWAY GAS</span>
                <span className="text-[10px] font-semibold uppercase tracking-wider text-orange-600 block">Internal Operations</span>
              </div>
            </Link>

            {/* Nav links */}
            <nav className="hidden md:flex items-center space-x-1">
              {visibleLinks.map((link) => {
                const Icon = link.icon;
                const isActive = pathname === link.href;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{link.label}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Action: User & Quick Switcher */}
          <div className="flex items-center gap-3">
            {/* Quick Testing Switcher */}
            <div className="relative">
              <button
                onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
                className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-medium text-slate-700 transition"
                title="Switch active user to test RBAC roles"
              >
                <div className="text-left">
                  <div className="font-semibold text-slate-800">{currentUser.full_name}</div>
                  <div className="flex items-center gap-1">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${roleColors[currentUser.role] || 'bg-slate-100'}`}>
                      {currentUser.role.replace('_', ' ')}
                    </span>
                    {currentUser.approval_status === 'pending' && (
                      <span className="text-[10px] text-amber-600 font-bold">(Pending)</span>
                    )}
                  </div>
                </div>
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              </button>

              {/* Dropdown for role switching */}
              {showRoleSwitcher && (
                <div className="absolute right-0 mt-2 w-72 bg-white rounded-xl shadow-xl border border-slate-200 py-2 z-50">
                  <div className="px-3 py-1.5 border-b border-slate-100 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
                    Test RBAC As:
                  </div>
                  <div className="max-h-72 overflow-y-auto">
                    {staffList.map((staff) => (
                      <button
                        key={staff.id}
                        onClick={() => {
                          setCurrentUser(staff);
                          setShowRoleSwitcher(false);
                        }}
                        className={`w-full text-left px-3 py-2 flex items-center justify-between hover:bg-slate-50 transition text-xs ${
                          currentUser.id === staff.id ? 'bg-orange-50 font-semibold' : ''
                        }`}
                      >
                        <div>
                          <div className="text-slate-800">{staff.full_name}</div>
                          <div className="text-[10px] text-slate-500">{staff.email}</div>
                        </div>
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border uppercase ${roleColors[staff.role]}`}>
                          {staff.role.replace('_', ' ')}
                        </span>
                      </button>
                    ))}
                  </div>
                  <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-xl">
                    <Link
                      href="/signup"
                      onClick={() => setShowRoleSwitcher(false)}
                      className="block text-center text-xs text-orange-600 font-semibold hover:underline"
                    >
                      + Test New Staff Signup
                    </Link>
                  </div>
                </div>
              )}
            </div>

            {/* Logout button */}
            <button
              onClick={logout}
              title="Logout"
              className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile Navigation bar */}
        <div className="md:hidden flex items-center space-x-1 py-2 overflow-x-auto border-t border-slate-100">
          {visibleLinks.map((link) => {
            const Icon = link.icon;
            const isActive = pathname === link.href;
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1 px-2.5 py-1.5 rounded text-xs font-medium whitespace-nowrap ${
                  isActive ? 'bg-slate-900 text-white' : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{link.label}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </header>
  );
}
