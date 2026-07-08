"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { CrisisModeSession } from "@/lib/types";
import { useActiveCircle } from "./active-circle-provider";

// A crisis banner (36px) and the offline banner (36px) each shift the content
// area down by this many pixels. Shared by the sidebar top offset and main padding.
export const CRISIS_BANNER_HEIGHT = 36;

type CrisisModeContextValue = {
  crisisMode: boolean;
  session: CrisisModeSession | null;
  activatedByName: string | null;
  offline: boolean;
  bannerOffsetPx: number;
  refresh: () => Promise<void>;
};

const CrisisModeContext = createContext<CrisisModeContextValue | null>(null);

type CrisisStatusResponse = {
  crisisMode: boolean;
  session: CrisisModeSession | null;
  activatedByName: string | null;
};

// Crisis mode is a top-level UI state (DESIGN: "a lens applied over the existing
// app"). This provider seeds from the active care circle, then re-evaluates on
// every active-circle change and on a 30s poll so a crisis activated by another
// member surfaces for everyone.
export function CrisisModeProvider({ children }: { children: React.ReactNode }) {
  const { activeCircle, activeCareCircleId } = useActiveCircle();
  const [crisisMode, setCrisisMode] = useState<boolean>(activeCircle?.careCircle.crisis_mode ?? false);
  const [session, setSession] = useState<CrisisModeSession | null>(null);
  const [activatedByName, setActivatedByName] = useState<string | null>(null);
  const [offline, setOffline] = useState<boolean>(false);

  const refresh = useCallback(async () => {
    if (!activeCareCircleId) {
      return;
    }

    try {
      const response = await fetch(`/api/crisis/status?careCircleId=${activeCareCircleId}`, { cache: "no-store" });
      if (!response.ok) {
        return;
      }
      const data = (await response.json()) as CrisisStatusResponse;
      setCrisisMode(data.crisisMode);
      setSession(data.session);
      setActivatedByName(data.activatedByName);
    } catch {
      // Offline or transient failure — keep the last known crisis state.
    }
  }, [activeCareCircleId]);

  useEffect(() => {
    setCrisisMode(activeCircle?.careCircle.crisis_mode ?? false);
    void refresh();
    const interval = window.setInterval(() => {
      void refresh();
    }, 30000);
    return () => window.clearInterval(interval);
  }, [activeCircle?.careCircle.crisis_mode, refresh]);

  useEffect(() => {
    const update = () => setOffline(!navigator.onLine);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);

  const bannerOffsetPx = (crisisMode ? CRISIS_BANNER_HEIGHT : 0) + (offline ? CRISIS_BANNER_HEIGHT : 0);

  const value = useMemo<CrisisModeContextValue>(
    () => ({ crisisMode, session, activatedByName, offline, bannerOffsetPx, refresh }),
    [crisisMode, session, activatedByName, offline, bannerOffsetPx, refresh]
  );

  return <CrisisModeContext.Provider value={value}>{children}</CrisisModeContext.Provider>;
}

export function useCrisisMode() {
  const context = useContext(CrisisModeContext);

  if (!context) {
    throw new Error("useCrisisMode must be used inside CrisisModeProvider.");
  }

  return context;
}
