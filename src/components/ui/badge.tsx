import React from 'react';

export type BadgeVariant =
  | 'default'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info'
  | 'neutral'
  | 'purple';

export interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: BadgeVariant;
  icon?: React.ReactNode;
}

export function Badge({ className = '', variant = 'default', icon, children, ...props }: BadgeProps) {
  const variants = {
    default: 'bg-orange-50 text-orange-800 ring-orange-600/20',
    success: 'bg-emerald-50 text-emerald-800 ring-emerald-600/20',
    warning: 'bg-amber-50 text-amber-800 ring-amber-600/20',
    danger: 'bg-rose-50 text-rose-800 ring-rose-600/20',
    info: 'bg-blue-50 text-blue-800 ring-blue-600/20',
    neutral: 'bg-slate-100 text-slate-700 ring-slate-500/20',
    purple: 'bg-purple-50 text-purple-800 ring-purple-600/20',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium uppercase tracking-wide ring-1 ring-inset select-none ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
