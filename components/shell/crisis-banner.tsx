"use client";

import { AlertTriangle, WifiOff } from "lucide-react";
import { useState } from "react";
import { DeactivateCrisisModal } from "@/components/crisis/deactivate-crisis-modal";
import { relativeTime } from "@/lib/utils";
import { useCrisisMode } from "./crisis-mode-provider";

// The persistent crisis strip (red-600) and the offline banner. Both sit in a
// fixed container directly below the 56px top bar; their combined height is the
// bannerOffsetPx that shifts the sidebar and main content down.
export function ShellBanners() {
  const { crisisMode, offline, session, activatedByName } = useCrisisMode();
  const [deactivateOpen, setDeactivateOpen] = useState(false);

  if (!crisisMode && !offline) {
    return null;
  }

  return (
    <>
      <div className="fixed left-0 right-0 top-14 z-20">
        {crisisMode ? (
          <div className="flex h-9 items-center justify-between gap-3 bg-red-600 px-4 text-white">
            <div className="flex min-w-0 items-center gap-2 text-sm">
              <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="truncate font-semibold">
                Crisis Mode Active
                {activatedByName ? ` · Activated by ${activatedByName}` : ""}
                {session ? ` · ${relativeTime(session.activated_at)}` : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDeactivateOpen(true)}
              className="shrink-0 text-sm font-medium text-white underline underline-offset-2 hover:text-red-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
            >
              Deactivate
            </button>
          </div>
        ) : null}
        {offline ? (
          <div className="flex h-9 items-center gap-2 bg-neutral-800 px-4 text-sm font-medium text-white">
            <WifiOff className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="truncate">You&apos;re offline — showing saved information. Changes sync when you reconnect.</span>
          </div>
        ) : null}
      </div>
      {deactivateOpen ? <DeactivateCrisisModal onClose={() => setDeactivateOpen(false)} /> : null}
    </>
  );
}
