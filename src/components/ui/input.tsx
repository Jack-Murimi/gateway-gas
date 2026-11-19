import React, { useId } from 'react';

export interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  helperText?: string;
  leftIcon?: React.ReactNode;
  /** Decorative, non-interactive icon. */
  rightIcon?: React.ReactNode;
  /** Interactive element (e.g. show/hide button). Gets a 40px hit area. */
  rightElement?: React.ReactNode;
  /** Rendered on the label row, right-aligned (e.g. "Forgot password?"). */
  labelAction?: React.ReactNode;
}

export const Input = React.forwardRef<HTMLInputElement, InputProps>(
  (
    {
      className = '',
      label,
      error,
      helperText,
      leftIcon,
      rightIcon,
      rightElement,
      labelAction,
      id,
      'aria-describedby': ariaDescribedBy,
      'aria-invalid': ariaInvalid,
      ...props
    },
    ref
  ) => {
    const autoId = useId();
    const inputId = id ?? autoId;
    const errorId = error ? `${inputId}-error` : undefined;
    const helperId = helperText && !error ? `${inputId}-helper` : undefined;
    const describedBy =
      [ariaDescribedBy, errorId, helperId].filter(Boolean).join(' ') || undefined;

    return (
      <div className="w-full space-y-1.5 text-left">
        {(label || labelAction) && (
          <div className="flex items-center justify-between gap-2">
            {label && (
              <label htmlFor={inputId} className="block text-sm font-medium text-slate-700">
                {label}
              </label>
            )}
            {labelAction}
          </div>
        )}

        <div className="relative flex items-center">
          {leftIcon && (
            <div className="pointer-events-none absolute left-3 flex items-center text-slate-400">
              {leftIcon}
            </div>
          )}

          <input
            {...props}
            id={inputId}
            ref={ref}
            aria-invalid={error ? true : ariaInvalid}
            aria-describedby={describedBy}
            className={`min-h-[44px] w-full rounded-lg border bg-white px-3 py-2 text-base text-slate-900 transition-colors placeholder:text-slate-400 focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-500 ${
              leftIcon ? 'pl-10' : ''
            } ${rightElement ? 'pr-12' : rightIcon ? 'pr-10' : ''} ${
              error
                ? 'border-red-400 focus:border-red-500 focus-visible:ring-red-200'
                : 'border-slate-300 hover:border-slate-400 focus:border-orange-500 focus-visible:ring-orange-100'
            } ${className}`}
          />

          {rightIcon && !rightElement && (
            <div className="pointer-events-none absolute right-3 flex items-center text-slate-400">
              {rightIcon}
            </div>
          )}
          {rightElement && (
            <div className="absolute right-1 flex items-center">{rightElement}</div>
          )}
        </div>

        {error && (
          <p id={errorId} className="text-xs font-medium text-red-600">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p id={helperId} className="text-xs text-slate-500">
            {helperText}
          </p>
        )}
      </div>
    );
  }
);
Input.displayName = 'Input';
