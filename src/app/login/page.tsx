import { Suspense } from 'react';
import { LoginContent } from './LoginContent';

function LoginSkeleton() {
  return (
    <div
      className="flex min-h-[85vh] items-center justify-center px-4 py-8"
      aria-busy="true"
    >
      <div className="w-full max-w-md animate-pulse space-y-6 rounded-xl border border-slate-200 bg-white p-6 sm:p-8">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-lg bg-slate-200" />
          <div className="space-y-2">
            <div className="h-4 w-28 rounded bg-slate-200" />
            <div className="h-3 w-36 rounded bg-slate-100" />
          </div>
        </div>
        <div className="h-7 w-24 rounded bg-slate-200" />
        <div className="h-11 rounded-lg bg-slate-100" />
        <div className="h-11 rounded-lg bg-slate-100" />
        <div className="h-12 rounded-lg bg-slate-200" />
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<LoginSkeleton />}>
      <LoginContent />
    </Suspense>
  );
}
