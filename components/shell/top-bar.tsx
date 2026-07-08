"use client";

import { AlertTriangle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ActivateCrisisModal } from "@/components/crisis/activate-crisis-modal";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { Avatar } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from "@/components/ui/dropdown-menu";
import { roleMeetsMinimum } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/client";
import type { UserProfile } from "@/lib/types";
import { useActiveCircle } from "./active-circle-provider";
import { useCrisisMode } from "./crisis-mode-provider";
import { PersonSwitcher } from "./person-switcher";

type TopBarProps = {
  profile: UserProfile;
  email: string;
};

export function TopBar({ profile, email }: TopBarProps) {
  const router = useRouter();
  const { activeCircle } = useActiveCircle();
  const { crisisMode } = useCrisisMode();
  const [query, setQuery] = useState("");
  const [activateOpen, setActivateOpen] = useState(false);

  const role = activeCircle?.membership.role;
  const canActivateCrisis = Boolean(role && roleMeetsMinimum(role, "coordinator"));

  useEffect(() => {
    if (!activeCircle?.person || query.trim().length < 2) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      // Global search defaults to the active Person (spec: within-Person scope
      // by default; the Search page has its own cross-circle toggle).
      const params = new URLSearchParams({
        q: query.trim(),
        careCircleId: activeCircle.careCircle.id,
        personId: activeCircle.person?.id ?? "",
        all: "false"
      });
      router.push(`/search?${params.toString()}`);
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [activeCircle?.careCircle.id, activeCircle?.person, activeCircle?.person?.id, query, router]);

  const signOut = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    try {
      // Clear the offline caches so this device retains no PHI after sign-out.
      navigator.serviceWorker?.controller?.postMessage("vigil-clear");
    } catch {
      // no-op
    }
    router.push("/login");
    router.refresh();
  };

  return (
    <>
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center border-b border-neutral-200 bg-white px-4">
      <div className="flex w-60 shrink-0 items-center">
        <span className="text-lg font-semibold text-blue-600">Vigil</span>
      </div>
      <div className="flex flex-1 items-center gap-4">
        <PersonSwitcher />
      </div>
      <div className="flex items-center gap-2">
        <label className="hidden h-10 items-center gap-2 rounded-lg border border-neutral-300 bg-white px-3 text-sm text-neutral-500 focus-within:border-blue-600 md:flex">
          <Search className="h-4 w-4" aria-hidden="true" />
          <input
            aria-label="Search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search"
            className="w-56 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 focus:w-80"
          />
        </label>
        {!crisisMode && canActivateCrisis ? (
          <button
            type="button"
            onClick={() => setActivateOpen(true)}
            aria-label="Activate crisis mode"
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-neutral-300 px-3 text-sm font-medium text-neutral-700 hover:border-red-300 hover:bg-red-50 hover:text-red-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <AlertTriangle className="h-4 w-4" aria-hidden="true" />
            <span className="hidden sm:inline">Crisis Mode</span>
          </button>
        ) : null}
        <NotificationBell careCircleId={activeCircle?.careCircle.id ?? null} />
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600">
            <Avatar name={profile.display_name} src={profile.avatar_url} />
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-64">
            <div className="px-3 py-2">
              <p className="text-sm font-semibold text-neutral-900">{profile.display_name}</p>
              <p className="text-sm text-neutral-500">{email}</p>
            </div>
            <DropdownMenuSeparator className="my-1 h-px bg-neutral-200" />
            <DropdownMenuItem onSelect={signOut}>Sign out</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      </header>
      {activateOpen && activeCircle ? (
        <ActivateCrisisModal careCircleId={activeCircle.careCircle.id} onClose={() => setActivateOpen(false)} />
      ) : null}
    </>
  );
}
