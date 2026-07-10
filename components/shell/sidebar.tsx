"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Activity,
  Calendar,
  CheckSquare,
  ChevronDown,
  ChevronRight,
  Folder,
  Home,
  Pill,
  Settings,
  Users
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useCrisisMode } from "./crisis-mode-provider";
import { Wordmark } from "./wordmark";

type NavItem = { href: string; label: string; icon: LucideIcon };

const primaryItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/timeline", label: "Timeline", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/medications", label: "Medications", icon: Pill },
  { href: "/documents", label: "Documents", icon: Folder },
  { href: "/people", label: "People & Roles", icon: Users }
];

// Crisis mode condenses navigation to five essentials (DESIGN: Crisis Mode Design).
// "Contacts" points at /people (which holds Care Team Contacts); "Documents" opens
// the Emergency-Packet-only view while crisis mode is active.
const crisisItems: NavItem[] = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/medications", label: "Medications", icon: Pill },
  { href: "/documents", label: "Documents", icon: Folder },
  { href: "/people", label: "Contacts", icon: Users },
  { href: "/timeline", label: "Timeline", icon: Activity }
];

const itemClasses =
  "relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white/90 focus-visible:outline-white";
const activeItemClasses = "bg-white/[0.07] text-white hover:bg-white/[0.07] hover:text-white";

// The ember lamp: marks the active page on the night rail (DESIGN — Visual Identity).
function EmberLamp() {
  return (
    <span
      className="absolute bottom-2 left-0 top-2 w-[3px] rounded-full bg-ember shadow-ember"
      aria-hidden="true"
    />
  );
}

// The night rail: full-height evergreen navigation surface (DESIGN — Visual Identity).
export function Sidebar() {
  const pathname = usePathname();
  const { crisisMode } = useCrisisMode();
  const [showAll, setShowAll] = useState(false);

  const condensed = crisisMode && !showAll;
  const items = condensed ? crisisItems : primaryItems;

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <Link key={item.href} href={item.href} className={cn(itemClasses, active && activeItemClasses)}>
        {active ? <EmberLamp /> : null}
        <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col bg-night lg:flex">
      <div className="flex h-14 shrink-0 items-center px-5">
        <Link
          href="/dashboard"
          className="rounded-md focus-visible:outline-white"
          aria-label="Vigil — go to dashboard"
        >
          <Wordmark className="text-[21px] text-white" />
        </Link>
      </div>
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map(renderItem)}
        <div className="flex-1" />

        {crisisMode ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="flex h-10 items-center justify-between gap-3 rounded-lg px-3 text-sm font-medium text-white/60 transition-colors hover:bg-white/5 hover:text-white/90 focus-visible:outline-white"
          >
            <span>{showAll ? "Crisis view" : "All sections"}</span>
            {showAll ? (
              <ChevronDown className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            )}
          </button>
        ) : null}

        {!condensed ? (
          <div className="border-t border-white/10 pt-3">
            <Link
              href="/settings"
              className={cn(itemClasses, pathname.startsWith("/settings") && activeItemClasses)}
            >
              {pathname.startsWith("/settings") ? <EmberLamp /> : null}
              <Settings className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden="true" />
              Settings
            </Link>
          </div>
        ) : null}
      </nav>
    </aside>
  );
}
