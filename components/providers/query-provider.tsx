"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";

// One client-side cache for all view data. Tab switches render the cached list
// instantly (no refetch inside staleTime; a background refetch beyond it), which is
// what makes navigation feel immediate instead of re-loading every screen from zero.
export function QueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60_000,
            gcTime: 30 * 60_000,
            retry: 1,
            refetchOnWindowFocus: true
          }
        }
      })
  );

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
