"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Activity,
  Calendar,
  CheckSquare,
  Folder,
  Home,
  LayoutGrid,
  MoreHorizontal,
  Pill,
  Settings,
  Users,
  X
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrisisMode } from "./crisis-mode-provider";

type NavItem = { href: string; label: string; icon: LucideIcon };

// DESIGN — Mobile Navigation: bottom tab bar on the night surface, 4 tabs + More.
const primaryTabs: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/timeline", label: "Timeline", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/documents", label: "Documents", icon: Folder }
];

// In crisis mode the tabs prioritize phone-critical surfaces: contacts carry
// tap-to-call numbers, so Timeline moves into the More sheet.
const crisisTabs: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/medications", label: "Medications", icon: Pill },
  { href: "/documents", label: "Documents", icon: Folder },
  { href: "/people", label: "Contacts", icon: Users }
];

// The More sheet lists every destination so nothing is unreachable on mobile.
const sheetItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/timeline", label: "Timeline", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/medications", label: "Medications", icon: Pill },
  { href: "/documents", label: "Documents", icon: Folder },
  { href: "/people", label: "People & Roles", icon: Users },
  { href: "/workspaces", label: "Care circles", icon: LayoutGrid },
  { href: "/settings", label: "Settings", icon: Settings }
];

export function MobileNav() {
  const pathname = usePathname();
  const { crisisMode } = useCrisisMode();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Close the sheet whenever navigation happens (incl. back/forward).
  useEffect(() => {
    setSheetOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!sheetOpen) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSheetOpen(false);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  const tabs = crisisMode ? crisisTabs : primaryTabs;

  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-40 bg-night pb-[env(safe-area-inset-bottom)] lg:hidden"
      >
        <div className="grid h-16 grid-cols-5">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const active = isActive(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={cn(
                  "flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-white/55 transition-colors hover:text-white/80 focus-visible:outline-white",
                  active && "text-white"
                )}
              >
                <span
                  className={cn("ember-dot opacity-0", active && "opacity-100")}
                  aria-hidden="true"
                />
                <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                {tab.label}
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="More sections"
            aria-expanded={sheetOpen}
            className={cn(
              "flex flex-col items-center justify-center gap-1 text-[10.5px] font-medium text-white/55 transition-colors hover:text-white/80 focus-visible:outline-white",
              sheetOpen && "text-white"
            )}
          >
            <span className="ember-dot opacity-0" aria-hidden="true" />
            <MoreHorizontal className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
            More
          </button>
        </div>
      </nav>

      {sheetOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="All sections">
          <button
            type="button"
            aria-label="Close"
            onClick={() => setSheetOpen(false)}
            className="absolute inset-0 bg-neutral-900/40"
          />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-white p-4 pb-[calc(1.25rem+env(safe-area-inset-bottom))] shadow-pane">
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-semibold text-neutral-900">All sections</p>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-500 hover:bg-neutral-100 hover:text-neutral-900"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {sheetItems.map((item) => {
                const Icon = item.icon;
                const active = isActive(item.href);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSheetOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-xl border border-neutral-200 px-2 py-4 text-center text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50",
                      active && "border-brand-600 bg-brand-50 text-brand-700"
                    )}
                  >
                    <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden="true" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
