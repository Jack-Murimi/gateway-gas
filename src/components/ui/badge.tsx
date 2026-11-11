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
    default: 'bg-orange-100 text-orange-950 border-orange-300',
    success: 'bg-emerald-100 text-emerald-950 border-emerald-300',
    warning: 'bg-amber-100 text-amber-950 border-amber-300',
    danger: 'bg-rose-100 text-rose-950 border-rose-300',
    info: 'bg-blue-100 text-blue-950 border-blue-300',
    neutral: 'bg-slate-100 text-slate-800 border-slate-300',
    purple: 'bg-purple-100 text-purple-950 border-purple-300',
  };

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider border select-none ${variants[variant]} ${className}`}
      {...props}
    >
      {icon}
      <span>{children}</span>
    </span>
  );
}
