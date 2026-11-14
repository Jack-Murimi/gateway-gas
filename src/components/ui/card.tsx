import React from 'react';

export interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  highlight?: boolean;
}

export function Card({ className = '', highlight = false, children, ...props }: CardProps) {
  return (
    <div
      className={`bg-white rounded-xl border transition-colors shadow-sm p-4 sm:p-5 ${
        highlight
          ? 'border-orange-400 ring-1 ring-orange-100'
          : 'border-slate-200 hover:border-slate-300'
      } ${className}`}
      {...props}
    >
      {children}
    </div>
  );
}

export function CardHeader({ className = '', children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={`border-b border-slate-100 pb-3 mb-3 flex items-center justify-between gap-3 ${className}`} {...props}>
      {children}
    </div>
  );
}

export function CardTitle({ className = '', children, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h3 className={`text-base sm:text-lg font-semibold tracking-tight text-slate-900 leading-tight ${className}`} {...props}>
      {children}
    </h3>
  );
}
