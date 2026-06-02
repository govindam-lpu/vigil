"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  Calendar,
  CheckSquare,
  Folder,
  Home,
  Pill,
  Settings,
  Users
} from "lucide-react";
import { cn } from "@/lib/utils";

const primaryItems = [
  { href: "/dashboard", label: "Dashboard", icon: Home },
  { href: "/timeline", label: "Timeline", icon: Activity },
  { href: "/tasks", label: "Tasks", icon: CheckSquare },
  { href: "/calendar", label: "Calendar", icon: Calendar },
  { href: "/medications", label: "Medications", icon: Pill },
  { href: "/documents", label: "Documents", icon: Folder },
  { href: "/people", label: "People & Roles", icon: Users }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="fixed bottom-0 left-0 top-14 hidden w-60 flex-col border-r border-neutral-200 bg-neutral-100 lg:flex">
      <nav className="flex flex-1 flex-col gap-1 p-3">
        {primaryItems.map((item) => {
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
        })}
        <div className="flex-1" />
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
      </nav>
    </aside>
  );
}
