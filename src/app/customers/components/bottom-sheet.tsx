'use client';

import React, { useId, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { iconBtn } from '../constants';

export function BottomSheet({
  title,
  closeLabel,
  onClose,
  children,
}: {
  title: string;
  closeLabel: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const panelRef = useRef<HTMLElement>(null);
  const startY = useRef(0);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const titleId = useId();

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    if (panelRef.current && !panelRef.current.contains(document.activeElement)) panelRef.current.focus();
    return () => {
      document.body.style.overflow = prevOverflow;
      previouslyFocused?.focus?.();
    };
  }, []);

  const trapTab = (e: React.KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    const nodes = panelRef.current?.querySelectorAll<HTMLElement>(
      'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])',
    );
    if (!nodes || nodes.length === 0) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panelRef.current)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-slate-950/50 sm:items-center sm:p-4"
      onClick={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        onKeyDown={trapTab}
        style={{
          transform: dragY ? `translateY(${dragY}px)` : undefined,
          transition: dragging ? 'none' : 'transform 200ms ease',
        }}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl outline-none sm:rounded-3xl"
      >
        <div
          className="shrink-0 touch-none px-4 pt-2"
          onTouchStart={e => {
            startY.current = e.touches[0].clientY;
            setDragging(true);
          }}
          onTouchMove={e => setDragY(Math.max(0, e.touches[0].clientY - startY.current))}
          onTouchEnd={() => {
            setDragging(false);
            if (dragY > 110) onClose();
            else setDragY(0);
          }}
        >
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-slate-300 sm:hidden" />
          <div className="flex items-center justify-between gap-3 pb-2">
            <h2 id={titleId} className="truncate text-lg font-bold text-slate-950">
              {title}
            </h2>
            <button type="button" onClick={onClose} aria-label={closeLabel} className={`${iconBtn} bg-slate-100`}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-[calc(env(safe-area-inset-bottom)+20px)] pt-2">
          {children}
        </div>
      </section>
    </div>
  );
}
