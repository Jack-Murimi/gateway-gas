'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useStore } from '@/context/store-context';
import {
  Flame,
  ShieldCheck,
  Users,
  Package,
  ShoppingCart,
  Bike,
  LogOut,
  ChevronDown,
  LayoutDashboard,
  Briefcase,
  Clock,
} from 'lucide-react';

const roleConfig: Record<
  string,
  {
    bg: string;
    border: string;
    text: string;
    badge: string;
    icon: React.ComponentType<{ className?: string }>;
    label: string;
  }
> = {
  admin: {
    bg: 'bg-purple-100',
    border: 'border-purple-300',
    text: 'text-purple-700',
    badge: 'bg-purple-600',
    icon: ShieldCheck,
    label: 'Admin',
  },
  director: {
    bg: 'bg-indigo-100',
    border: 'border-indigo-300',
    text: 'text-indigo-700',
    badge: 'bg-indigo-600',
    icon: Briefcase,
    label: 'Director',
  },
  operator: {
    bg: 'bg-blue-100',
    border: 'border-blue-300',
    text: 'text-blue-700',
    badge: 'bg-blue-600',
    icon: Package,
    label: 'Operator',
  },
  sales_rep: {
    bg: 'bg-emerald-100',
    border: 'border-emerald-300',
    text: 'text-emerald-700',
    badge: 'bg-emerald-600',
    icon: ShoppingCart,
    label: 'Sales Rep',
  },
  rider: {
    bg: 'bg-amber-100',
    border: 'border-amber-300',
    text: 'text-amber-700',
    badge: 'bg-amber-600',
    icon: Bike,
    label: 'Rider',
  },
  pending: {
    bg: 'bg-zinc-100',
    border: 'border-zinc-300',
    text: 'text-zinc-700',
    badge: 'bg-zinc-500',
    icon: Clock,
    label: 'Pending',
  },
};

function RoleAvatar({
  role,
  name,
  avatarUrl,
  size = 'md',
}: {
  role: string;
  name: string;
  avatarUrl?: string | null;
  size?: 'sm' | 'md';
}) {
  const cfg = roleConfig[role] || roleConfig.pending;
  const Icon = cfg.icon;
  const sizeClass = size === 'sm' ? 'w-7 h-7' : 'w-8 h-8 sm:w-9 sm:h-9';
  const iconSize = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';

  if (avatarUrl) {
    return (
      <div className={`relative ${sizeClass} rounded-full overflow-hidden border-2 ${cfg.border} shrink-0`}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={avatarUrl} alt={name} className="w-full h-full object-cover" />
        <span className={`absolute bottom-0 right-0 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${cfg.badge} border-2 border-white`} />
      </div>
    );
  }

  return (
    <div
      className={`relative ${sizeClass} rounded-full flex items-center justify-center font-bold ${cfg.bg} ${cfg.text} border-2 ${cfg.border} shadow-sm shrink-0`}
      title={`${name} (${cfg.label})`}
    >
      <Icon className={iconSize} />
      <span className={`absolute -bottom-0.5 -right-0.5 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full ${cfg.badge} border-2 border-white`} />
    </div>
  );
}

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
    { href: '/', label: 'Overview', icon: LayoutDashboard, roles: ['admin', 'director', 'operator', 'sales_rep', 'rider'] },
    { href: '/sales', label: 'POS Sale', icon: ShoppingCart, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/inventory', label: 'Stock', icon: Package, roles: ['admin', 'director', 'operator', 'sales_rep'] },
    { href: '/operations', label: 'Dispatch', icon: Bike, roles: ['admin', 'director', 'operator'] },
    { href: '/rider', label: 'Deliveries', icon: Bike, roles: ['rider', 'admin'] },
    { href: '/staff', label: 'Staff', icon: Users, roles: ['admin', 'director'] },
  ];

  const visibleLinks = navLinks.filter(
    (l) => currentUser.approval_status === 'approved' && l.roles.includes(currentUser.role)
  );

  return (
    <>
      {/* Top Navbar */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-14 sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-4">
              <Link href="/" className="flex items-center gap-2 group">
                <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-orange-600 flex items-center justify-center text-white shadow-md group-hover:bg-orange-700 transition">
                  <Flame className="w-4 h-4 sm:w-5 sm:h-5" />
                </div>
                <div>
                  <span className="font-extrabold text-base sm:text-lg tracking-tight text-slate-900 block leading-tight">
                    GATEWAY GAS
                  </span>
                  <span className="text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-orange-600 block">
                    Internal Ops
                  </span>
                </div>
              </Link>

              {/* Desktop Nav links */}
              <nav className="hidden md:flex items-center space-x-1 ml-4">
                {visibleLinks.map((link) => {
                  const Icon = link.icon;
                  const isActive = pathname === link.href;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition ${
                        isActive
                          ? 'bg-slate-900 text-white shadow-sm'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{link.label}</span>
                    </Link>
                  );
                })}
              </nav>
            </div>

            {/* Right: Switcher & Logout */}
            <div className="flex items-center gap-1.5 sm:gap-2">
              <div className="relative">
                <button
                  onClick={() => setShowRoleSwitcher(!showRoleSwitcher)}
                  className="min-h-[40px] flex items-center gap-1.5 sm:gap-2 p-1 sm:px-2.5 sm:py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition"
                  aria-label="User profile and role menu"
                >
                  <RoleAvatar
                    role={currentUser.role}
                    name={currentUser.full_name}
                    avatarUrl={currentUser.avatar_url}
                    size="md"
                  />

                  {/* Desktop text details: hidden on small screen to eliminate text truncation */}
                  <div className="hidden sm:block text-left">
                    <div className="font-bold text-xs text-slate-800 leading-tight">
                      {currentUser.full_name}
                    </div>
                    <span
                      className={`inline-block px-1.5 py-0.2 rounded text-[9px] font-extrabold border uppercase mt-0.5 ${
                        roleColors[currentUser.role] || 'bg-slate-100'
                      }`}
                    >
                      {currentUser.role.replace('_', ' ')}
                    </span>
                  </div>

                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                </button>

                {showRoleSwitcher && (
                  <div className="absolute right-0 mt-2 w-72 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50">
                    <div className="px-3 py-1.5 border-b border-slate-100 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                      Switch Role Simulation:
                    </div>
                    <div className="max-h-64 overflow-y-auto">
                      {staffList.map((staff) => (
                        <button
                          key={staff.id}
                          onClick={() => {
                            setCurrentUser(staff);
                            setShowRoleSwitcher(false);
                          }}
                          className={`w-full text-left px-3 py-2 flex items-center gap-2.5 hover:bg-slate-50 transition text-xs ${
                            currentUser.id === staff.id ? 'bg-orange-50 font-bold' : ''
                          }`}
                        >
                          <RoleAvatar
                            role={staff.role}
                            name={staff.full_name}
                            avatarUrl={staff.avatar_url}
                            size="sm"
                          />
                          <div className="flex-1 min-w-0">
                            <div className="text-slate-800 truncate font-semibold">{staff.full_name}</div>
                            <div className="text-[10px] text-slate-400 truncate">{staff.email}</div>
                          </div>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold border uppercase shrink-0 ${
                              roleColors[staff.role]
                            }`}
                          >
                            {staff.role.replace('_', ' ')}
                          </span>
                        </button>
                      ))}
                    </div>
                    <div className="p-2 border-t border-slate-100 bg-slate-50 rounded-b-2xl">
                      <Link
                        href="/signup"
                        onClick={() => setShowRoleSwitcher(false)}
                        className="block text-center text-xs text-orange-600 font-bold hover:underline"
                      >
                        + Test New Staff Signup
                      </Link>
                    </div>
                  </div>
                )}
              </div>

              <button
                onClick={logout}
                title="Logout"
                className="w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xl transition shrink-0"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile Fixed Bottom Navigation Bar (Thumb Zone Friendly) */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 h-14 bg-white/95 backdrop-blur border-t border-slate-200 z-50 flex items-center justify-around px-2 shadow-lg">
        {visibleLinks.map((link) => {
          const Icon = link.icon;
          const isActive = pathname === link.href;
          return (
            <Link
              key={link.href}
              href={link.href}
              className={`flex flex-col items-center justify-center flex-1 h-full py-1 text-[10px] font-bold transition ${
                isActive ? 'text-orange-600' : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <div
                className={`p-1 rounded-lg transition ${
                  isActive ? 'bg-orange-100/70 text-orange-600' : ''
                }`}
              >
                <Icon className="w-4 h-4" />
              </div>
              <span className="truncate max-w-[64px] mt-0.5">{link.label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
