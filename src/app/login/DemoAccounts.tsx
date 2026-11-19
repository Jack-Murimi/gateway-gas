'use client';

import React from 'react';
import {
  Bike,
  Briefcase,
  Clock,
  Package,
  ShieldCheck,
  ShoppingCart,
  XCircle,
  Zap,
} from 'lucide-react';
import type { StaffProfile } from '@/types';

type Config = {
  roleKey: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
  status?: 'pending' | 'rejected';
};

const CONFIGS: Config[] = [
  {
    roleKey: 'admin',
    label: 'Admin',
    icon: ShieldCheck,
    color: 'bg-purple-50 text-purple-900 border-purple-200',
  },
  {
    roleKey: 'director',
    label: 'Director',
    icon: Briefcase,
    color: 'bg-indigo-50 text-indigo-900 border-indigo-200',
  },
  {
    roleKey: 'operator',
    label: 'Operator',
    icon: Package,
    color: 'bg-blue-50 text-blue-900 border-blue-200',
  },
  {
    roleKey: 'sales_rep',
    label: 'Sales Rep',
    icon: ShoppingCart,
    color: 'bg-emerald-50 text-emerald-900 border-emerald-200',
  },
  {
    roleKey: 'rider',
    label: 'Rider',
    icon: Bike,
    color: 'bg-amber-50 text-amber-900 border-amber-200',
  },
  {
    roleKey: 'pending',
    label: 'Pending',
    icon: Clock,
    color: 'bg-zinc-50 text-zinc-900 border-zinc-200',
    status: 'pending',
  },
  {
    roleKey: 'rejected',
    label: 'Rejected',
    icon: XCircle,
    color: 'bg-red-50 text-red-900 border-red-200',
    status: 'rejected',
  },
];

type Props = { staffList: StaffProfile[]; onSelect: (user: StaffProfile) => void };

export function DemoAccounts({ staffList, onSelect }: Props) {
  const accounts = CONFIGS.flatMap((cfg) => {
    const user = staffList.find((u) =>
      cfg.status
        ? u.approval_status === cfg.status
        : u.role === cfg.roleKey && u.approval_status === 'approved'
    );
    return user ? [{ cfg, user }] : [];
  });

  if (accounts.length === 0) return null;

  return (
    <details className="group rounded-lg border border-amber-200 bg-amber-50/50 p-3">
      <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-medium text-amber-900">
        <Zap className="h-4 w-4 text-amber-600" aria-hidden="true" />
        Quick demo sign-in
        <span className="ml-auto text-xs text-amber-700 group-open:hidden">Show</span>
      </summary>

      <div className="mt-3 grid grid-cols-2 gap-2">
        {accounts.map(({ cfg, user }) => {
          const Icon = cfg.icon;
          return (
            <button
              key={cfg.label}
              type="button"
              onClick={() => onSelect(user)}
              aria-label={`Sign in as ${cfg.label} demo account`}
              className={`flex min-h-[48px] items-center gap-2.5 rounded-lg border p-2.5 text-left transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 ${cfg.color}`}
            >
              <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block text-xs font-semibold leading-tight">{cfg.label}</span>
                <span className="block truncate text-[11px] opacity-80">
                  {user.full_name.split(' ')[0]}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </details>
  );
}
