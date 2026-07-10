"use client";

import Link from "next/link";
import { AlertTriangle, Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
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
import { Wordmark } from "./wordmark";

type TopBarProps = {
  profile: UserProfile;
  email: string;
};

// Sits on the porcelain field (no white slab); on desktop it begins to the
// right of the night rail, which carries the wordmark there.
export function TopBar({ profile, email }: TopBarProps) {
  const router = useRouter();
  const { activeCircle } = useActiveCircle();
  const { crisisMode } = useCrisisMode();
  const [query, setQuery] = useState("");
  const [activateOpen, setActivateOpen] = useState(false);

  const role = activeCircle?.membership.role;
  const canActivateCrisis = Boolean(role && roleMeetsMinimum(role, "coordinator"));

  // Search on submit (Enter), not per keystroke — the previous debounced effect fired a
  // full /search navigation + /api/search fetch on every character (min-length 2), which
  // is what made typing an email hit the API repeatedly. The /search page keeps its own
  // live refine. Global search defaults to the active Person (spec: within-Person scope).
  const submitSearch = (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!activeCircle?.person || trimmed.length < 2) {
      return;
    }
    const params = new URLSearchParams({
      q: trimmed,
      careCircleId: activeCircle.careCircle.id,
      personId: activeCircle.person.id,
      all: "false"
    });
    router.push(`/search?${params.toString()}`);
  };

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
      <header className="fixed left-0 right-0 top-0 z-30 flex h-14 items-center gap-2 border-b border-neutral-200 bg-neutral-50/95 px-3 backdrop-blur sm:px-4 lg:left-60">
        <Link
          href="/dashboard"
          className="mr-1 shrink-0 rounded-md lg:hidden"
          aria-label="Vigil — go to dashboard"
        >
          <Wordmark className="text-[19px] text-neutral-900" />
        </Link>
        <div className="flex min-w-0 flex-1 items-center gap-4">
          <PersonSwitcher />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <form role="search" onSubmit={submitSearch} className="hidden md:block">
            <label className="flex h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3.5 text-sm text-neutral-500 transition-colors focus-within:border-brand-600">
              <Search className="h-4 w-4" aria-hidden="true" />
              <input
                aria-label="Search"
                type="search"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the record"
                className="w-44 bg-transparent text-sm text-neutral-900 outline-none transition-all placeholder:text-neutral-400 focus:w-72"
              />
            </label>
          </form>
          <button
            type="button"
            onClick={() => router.push("/search")}
            aria-label="Search"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 md:hidden"
          >
            <Search className="h-[18px] w-[18px]" aria-hidden="true" />
          </button>
          {!crisisMode && canActivateCrisis ? (
            <button
              type="button"
              onClick={() => setActivateOpen(true)}
              aria-label="Activate crisis mode"
              className="inline-flex h-9 items-center gap-2 rounded-full border border-neutral-200 bg-white px-3 text-sm font-medium text-neutral-700 transition-colors hover:border-red-300 hover:bg-red-50 hover:text-red-700"
            >
              <AlertTriangle className="h-4 w-4" aria-hidden="true" />
              <span className="hidden sm:inline">Crisis Mode</span>
            </button>
          ) : null}
          <NotificationBell careCircleId={activeCircle?.careCircle.id ?? null} />
          <DropdownMenu>
            <DropdownMenuTrigger className="rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600">
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
