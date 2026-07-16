"use client";

import { useCrisisMode } from "./crisis-mode-provider";

// The main content region. Its top padding tracks the 56px top bar plus any
// active banners (crisis / offline), so content is never hidden underneath them.
// Bottom padding on mobile clears the fixed bottom tab bar. overflow-x-clip (not
// -hidden, which would create a scroll container and break sticky headers) stops
// any over-wide child from making the whole page pan sideways on phones.
export function ShellMain({ children }: { children: React.ReactNode }) {
  const { bannerOffsetPx } = useCrisisMode();

  return (
    <main
      className="min-h-screen overflow-x-clip bg-neutral-50 pb-24 lg:pb-0 lg:pl-60"
      style={{ paddingTop: 56 + bannerOffsetPx }}
    >
      {children}
    </main>
  );
}
