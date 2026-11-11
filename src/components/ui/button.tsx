import React from 'react';
import { Loader2 } from 'lucide-react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'destructive' | 'success' | 'ghost';
  size?: 'sm' | 'md' | 'lg' | 'icon';
  isLoading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', isLoading = false, disabled, children, ...props }, ref) => {
    const baseStyles =
      'inline-flex items-center justify-center font-bold rounded-2xl transition select-none focus:outline-none focus:ring-2 focus:ring-offset-2 active:scale-[0.98] disabled:opacity-50 disabled:pointer-events-none';

    const variants = {
      primary: 'bg-orange-600 hover:bg-orange-700 text-white shadow-md focus:ring-orange-500 border border-orange-500',
      secondary: 'bg-slate-900 hover:bg-slate-800 text-white shadow focus:ring-slate-900 border border-slate-800',
      outline: 'bg-white hover:bg-slate-100 text-slate-800 border-2 border-slate-300 focus:ring-slate-400',
      destructive: 'bg-red-600 hover:bg-red-700 text-white shadow-sm focus:ring-red-500',
      success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow focus:ring-emerald-500',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 focus:ring-slate-400',
    };

    // Strict 48px minimum touch height for East African field operations
    const sizes = {
      sm: 'min-h-[40px] px-3 py-1.5 text-sm',
      md: 'min-h-[48px] px-5 py-2.5 text-base',
      lg: 'min-h-[56px] px-6 py-3.5 text-lg tracking-wide',
      icon: 'min-h-[48px] min-w-[48px] p-2',
    };

    return (
      <button
        ref={ref}
        disabled={disabled || isLoading}
        className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${className}`}
        {...props}
      >
        {isLoading && <Loader2 className="w-5 h-5 mr-2 animate-spin" />}
        {children}
      </button>
    );
  }
);
Button.displayName = 'Button';
