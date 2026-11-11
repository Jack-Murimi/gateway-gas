'use client';

import React from 'react';
import { ShoppingCart, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { formatKES } from '@/lib/formatters';

interface PosStickySummaryProps {
  itemCount: number;
  totalKes: number;
  isSubmitting: boolean;
  onCompleteSale: () => void;
  canComplete: boolean;
}

export function PosStickySummary({
  itemCount,
  totalKes,
  isSubmitting,
  onCompleteSale,
  canComplete,
}: PosStickySummaryProps) {
  return (
    <div className="fixed bottom-16 lg:bottom-0 left-0 right-0 z-20 bg-white/95 backdrop-blur border-t-2 border-slate-300 shadow-2xl p-3 sm:p-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between gap-4">
        {/* Total & Items Count */}
        <div className="text-left">
          <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
            <ShoppingCart className="w-3.5 h-3.5 text-orange-600" />
            <span>Ticket: {itemCount} {itemCount === 1 ? 'item' : 'items'}</span>
          </div>
          <div className="text-xl sm:text-2xl font-black text-slate-900 leading-tight">
            {formatKES(totalKes)}
          </div>
        </div>

        {/* Big Complete Button */}
        <Button
          onClick={onCompleteSale}
          isLoading={isSubmitting}
          disabled={!canComplete || isSubmitting}
          size="lg"
          className="min-h-[52px] sm:min-h-[56px] px-6 sm:px-8 text-base sm:text-lg font-black shadow-lg"
        >
          <span>Complete Sale</span>
          <ArrowRight className="w-5 h-5 ml-2" />
        </Button>
      </div>
    </div>
  );
}
