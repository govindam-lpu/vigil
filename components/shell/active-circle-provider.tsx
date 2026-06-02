"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { CircleSummary } from "@/lib/types";

type ActiveCircleContextValue = {
  circles: CircleSummary[];
  activeCircle: CircleSummary | null;
  activeCareCircleId: string | null;
  setActiveCareCircleId: (careCircleId: string) => void;
};

const ActiveCircleContext = createContext<ActiveCircleContextValue | null>(null);

export function ActiveCircleProvider({
  circles,
  children
}: {
  circles: CircleSummary[];
  children: React.ReactNode;
}) {
  const [activeCareCircleId, setActiveCareCircleIdState] = useState<string | null>(circles[0]?.careCircle.id ?? null);

  useEffect(() => {
    const stored = window.localStorage.getItem("vigil.activeCareCircleId");
    const storedIsAvailable = circles.some((circle) => circle.careCircle.id === stored);

    if (stored && storedIsAvailable) {
      setActiveCareCircleIdState(stored);
      return;
    }

    if (circles[0]) {
      window.localStorage.setItem("vigil.activeCareCircleId", circles[0].careCircle.id);
      setActiveCareCircleIdState(circles[0].careCircle.id);
    }
  }, [circles]);

  const setActiveCareCircleId = (careCircleId: string) => {
    window.localStorage.setItem("vigil.activeCareCircleId", careCircleId);
    setActiveCareCircleIdState(careCircleId);
  };

  const activeCircle = useMemo(() => {
    return circles.find((circle) => circle.careCircle.id === activeCareCircleId) ?? circles[0] ?? null;
  }, [activeCareCircleId, circles]);

  const value = useMemo(
    () => ({
      circles,
      activeCircle,
      activeCareCircleId: activeCircle?.careCircle.id ?? null,
      setActiveCareCircleId
    }),
    [activeCircle, circles]
  );

  return <ActiveCircleContext.Provider value={value}>{children}</ActiveCircleContext.Provider>;
}

export function useActiveCircle() {
  const context = useContext(ActiveCircleContext);

  if (!context) {
    throw new Error("useActiveCircle must be used inside ActiveCircleProvider.");
  }

  return context;
}
