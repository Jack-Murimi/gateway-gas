'use client';

import React, { createContext, useContext, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

export type ToastType = 'success' | 'error' | 'info';

interface ToastMessage {
  id: string;
  type: ToastType;
  message: string;
}

interface ToastContextType {
  toast: (message: string, type?: ToastType) => void;
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const toast = useCallback(
    (message: string, type: ToastType = 'info') => {
      const id = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
      setToasts((prev) => [...prev, { id, type, message }]);
      setTimeout(() => removeToast(id), 4000);
    },
    [removeToast]
  );

  const showSuccess = useCallback((message: string) => toast(message, 'success'), [toast]);
  const showError = useCallback((message: string) => toast(message, 'error'), [toast]);

  return (
    <ToastContext.Provider value={{ toast, showSuccess, showError }}>
      {children}
      {/* Toast Container - Mobile bottom / Desktop top-right */}
      <div className="fixed bottom-20 sm:bottom-6 right-4 left-4 sm:left-auto sm:w-96 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => {
          const isSuccess = t.type === 'success';
          const isError = t.type === 'error';
          return (
            <div
              key={t.id}
              className={`pointer-events-auto p-4 rounded-2xl border-2 shadow-xl flex items-center justify-between gap-3 text-sm font-bold animate-in slide-in-from-bottom duration-200 ${
                isSuccess
                  ? 'bg-emerald-950 text-emerald-100 border-emerald-500'
                  : isError
                  ? 'bg-red-950 text-red-100 border-red-500'
                  : 'bg-slate-900 text-slate-100 border-slate-700'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                {isSuccess && <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />}
                {isError && <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />}
                {!isSuccess && !isError && <Info className="w-5 h-5 text-sky-400 shrink-0" />}
                <span className="truncate">{t.message}</span>
              </div>
              <button
                onClick={() => removeToast(t.id)}
                className="w-7 h-7 flex items-center justify-center rounded-lg hover:bg-white/10 shrink-0"
              >
                <X className="w-4 h-4 opacity-75" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      toast: (msg: string) => console.log(msg),
      showSuccess: (msg: string) => console.log('Success:', msg),
      showError: (msg: string) => console.error('Error:', msg),
    };
  }
  return ctx;
}
