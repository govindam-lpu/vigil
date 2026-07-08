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

export function Sidebar() {
  const pathname = usePathname();
  const { crisisMode, bannerOffsetPx } = useCrisisMode();
  const [showAll, setShowAll] = useState(false);

  const condensed = crisisMode && !showAll;
  const items = condensed ? crisisItems : primaryItems;

  const renderItem = (item: NavItem) => {
    const Icon = item.icon;
    const active = pathname === item.href || pathname.startsWith(`${item.href}/`);

    return (
      <Link
        key={item.href}
        href={item.href}
        className={cn(
          "flex h-10 items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-200",
          active && "border-blue-600 bg-blue-50 text-blue-600 hover:bg-blue-50"
        )}
      >
        <Icon className="h-5 w-5" aria-hidden="true" />
        {item.label}
      </Link>
    );
  };

  return (
    <aside
      className="fixed bottom-0 left-0 hidden w-60 flex-col border-r border-neutral-200 bg-neutral-100 lg:flex"
      style={{ top: 56 + bannerOffsetPx }}
    >
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {items.map(renderItem)}
        <div className="flex-1" />

        {crisisMode ? (
          <button
            type="button"
            onClick={() => setShowAll((value) => !value)}
            className="flex h-10 items-center justify-between gap-3 rounded-md px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-200"
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
          <Link
            href="/settings"
            className={cn(
              "flex h-10 items-center gap-3 rounded-md border-l-[3px] border-transparent px-3 text-sm font-medium text-neutral-700 hover:bg-neutral-200",
              pathname.startsWith("/settings") && "border-blue-600 bg-blue-50 text-blue-600 hover:bg-blue-50"
            )}
          >
            <Settings className="h-5 w-5" aria-hidden="true" />
            Settings
          </Link>
        ) : null}
      </nav>
    </aside>
  );
}
