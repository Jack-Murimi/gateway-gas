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
      'inline-flex items-center justify-center gap-2 font-medium rounded-lg transition-colors duration-150 select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 active:translate-y-px disabled:opacity-50 disabled:pointer-events-none';

    const variants = {
      primary: 'bg-orange-600 hover:bg-orange-700 text-white shadow-sm focus-visible:ring-orange-500 border border-orange-600',
      secondary: 'bg-slate-900 hover:bg-slate-800 text-white shadow-sm focus-visible:ring-slate-900 border border-slate-900',
      outline: 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 focus-visible:ring-slate-400',
      destructive: 'bg-red-600 hover:bg-red-700 text-white shadow-sm focus-visible:ring-red-500 border border-red-600',
      success: 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm focus-visible:ring-emerald-500 border border-emerald-600',
      ghost: 'bg-transparent hover:bg-slate-100 text-slate-700 focus-visible:ring-slate-400',
    };

    // Accessible touch targets
    const sizes = {
      sm: 'min-h-[36px] px-3 py-1.5 text-sm',
      md: 'min-h-[44px] px-4 py-2 text-sm sm:text-base',
      lg: 'min-h-[48px] px-5 py-2.5 text-base',
      icon: 'min-h-[44px] min-w-[44px] p-2',
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
