"use client";

import { useEffect } from "react";

// Registers the offline service worker (Phase 4) via workbox-window. Production
// only: a fetch-intercepting service worker interferes with the dev server's HMR,
// so offline behavior is exercised against a production build (`npm run build && npm start`).
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;

    let cancelled = false;
    void (async () => {
      try {
        const { Workbox } = await import("workbox-window");
        if (cancelled) return;
        const workbox = new Workbox("/sw.js");
        await workbox.register();
      } catch {
        // Registration failed — the app still works while online.
      }
    })();

    const replayOnReconnect = () => {
      navigator.serviceWorker?.controller?.postMessage("vigil-replay");
    };
    window.addEventListener("online", replayOnReconnect);

    return () => {
      cancelled = true;
      window.removeEventListener("online", replayOnReconnect);
    };
  }, []);

  return null;
}
