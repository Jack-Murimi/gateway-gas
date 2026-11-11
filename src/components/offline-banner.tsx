'use client';

import React, { useState, useEffect } from 'react';
import { WifiOff, Wifi } from 'lucide-react';

export function OfflineBanner() {
  const [isOffline, setIsOffline] = useState(false);
  const [showRestored, setShowRestored] = useState(false);

  useEffect(() => {
    // ponytail: navigator.onLine is sufficient for field 3G/4G disconnects; upgrade to heartbeat ping if captive portals become an issue.
    const handleOnline = () => {
      setIsOffline(false);
      setShowRestored(true);
      const timer = setTimeout(() => setShowRestored(false), 3000);
      return () => clearTimeout(timer);
    };

    const handleOffline = () => {
      setIsOffline(true);
      setShowRestored(false);
    };

    if (typeof window !== 'undefined') {
      setIsOffline(!window.navigator.onLine);
      window.addEventListener('online', handleOnline);
      window.addEventListener('offline', handleOffline);
    }

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  if (!isOffline && !showRestored) return null;

  if (showRestored) {
    return (
      <div className="bg-emerald-600 text-white text-xs font-black py-1.5 px-4 text-center flex items-center justify-center gap-2 animate-in slide-in-from-top-1">
        <Wifi className="w-4 h-4 shrink-0" />
        <span>Connection Restored — Online</span>
      </div>
    );
  }

  return (
    <div className="bg-amber-600 text-white text-xs font-black py-2 px-4 text-center flex items-center justify-center gap-2 shadow-sm animate-in slide-in-from-top-1">
      <WifiOff className="w-4 h-4 shrink-0" />
      <span>Network Offline — Working locally. Data will sync when connection returns.</span>
    </div>
  );
}
