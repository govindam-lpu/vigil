"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

// Mobile companion to the desktop detail pane. Two-pane master/detail layouts hide
// the detail below the list on a phone, so tapping a row looked like nothing
// happened — this presents the same detail content as a bottom sheet instead
// (mirrors the mobile nav's "More" sheet). Render it alongside the desktop aside;
// it only ever shows below lg.
export function DetailSheet({
  open,
  onClose,
  title,
  children
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label={title}>
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-neutral-900/40"
      />
      <div className="absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-2xl bg-white shadow-pane">
        <div className="flex shrink-0 items-center justify-between rounded-t-2xl border-b border-neutral-200 bg-white px-4 py-3">
          <p className="min-w-0 truncate text-sm font-semibold text-neutral-900">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
        <div className="min-h-0 overflow-y-auto p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))]">{children}</div>
      </div>
    </div>
  );
}
