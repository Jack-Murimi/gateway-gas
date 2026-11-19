import { useCallback, useEffect, useRef, useState } from 'react';

export function useLockout(max = 5, seconds = 30) {
  const attempts = useRef(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => {
      const t = Date.now();
      setNow(t);
      if (t >= lockedUntil) {
        setLockedUntil(null);
        attempts.current = 0;
      }
    }, 500);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const remaining = lockedUntil ? Math.max(0, Math.ceil((lockedUntil - now) / 1000)) : 0;

  /** Returns true if this failure triggered a lockout. */
  const registerFailure = useCallback(() => {
    attempts.current += 1;
    if (attempts.current >= max) {
      const t = Date.now();
      setNow(t);
      setLockedUntil(t + seconds * 1000);
      return true;
    }
    return false;
  }, [max, seconds]);

  const reset = useCallback(() => {
    attempts.current = 0;
  }, []);

  return { isLocked: remaining > 0, remaining, registerFailure, reset };
}
