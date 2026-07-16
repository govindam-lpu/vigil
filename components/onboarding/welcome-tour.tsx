"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity, AlertTriangle, Calendar, CheckSquare, Folder, Home, Pill, Users } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wordmark } from "@/components/shell/wordmark";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { useCrisisMode } from "@/components/shell/crisis-mode-provider";
import { cn } from "@/lib/utils";

// First-run guided tour: one short step per surface, shown once per user per
// device (localStorage, keyed by user id + tour version so a future major
// change can re-run it). Replayable any time from the user menu. Never shows
// during crisis mode — nothing may stand between a caregiver and the record.
const TOUR_VERSION = "v1";
const REPLAY_EVENT = "vigil:replay-tour";

function storageKey(userId: string): string {
  return `vigil.tour.${TOUR_VERSION}.${userId}`;
}

export function requestTourReplay(): void {
  window.dispatchEvent(new Event(REPLAY_EVENT));
}

type TourStep = {
  icon: LucideIcon | null;
  iconTone?: "brand" | "red";
  title: string;
  body: string;
};

export function WelcomeTour({ userId }: { userId: string }) {
  const { activeCircle } = useActiveCircle();
  const { crisisMode } = useCrisisMode();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(0);
  const nextButtonRef = useRef<HTMLButtonElement | null>(null);

  const person = activeCircle?.person ?? null;
  const personName = person ? person.preferred_name ?? person.first_name : null;
  const name = personName ?? "the person you care for";

  const steps = useMemo<TourStep[]>(
    () => [
      {
        icon: Home,
        title: "Keep watch, together.",
        body: `Everything about caring for ${name} lives in one shared record — updates, tasks, medications, documents — kept by everyone who helps. This is the Dashboard: what changed while you were away, what's due next, and one-tap Quick Check-ins.`
      },
      {
        icon: Activity,
        title: "The story so far.",
        body: "The Timeline is the running record — notes from family, completed tasks, appointment outcomes, newest first. Filter by type, author, or date to catch up quickly after time away."
      },
      {
        icon: CheckSquare,
        title: "Who's doing what.",
        body: "Tasks make responsibility clear: assign someone, set a due date, or have it repeat on a schedule. Anything overdue is flagged red so it can't quietly slip."
      },
      {
        icon: Calendar,
        title: "Visits, and what came of them.",
        body: "Keep appointments with doctors and providers in one calendar. After a visit, record the outcome and turn any follow-ups into tasks in one step."
      },
      {
        icon: Pill,
        title: "Doses, schedules, refills.",
        body: "Each medication lives here with its dose and schedule. Vigil flags refills before they run out, and every dose given can be logged — so nothing is doubled or missed."
      },
      {
        icon: Folder,
        title: "One safe place for paperwork.",
        body: "Store medical records, insurance, and legal documents in folders. Pin the critical ones to the Emergency Packet so they're in hand if a crisis ever comes."
      },
      {
        icon: Users,
        title: "The circle around them.",
        body: `See everyone in the care circle and their roles, keep ${name}'s profile up to date, and save care-team contacts — doctor, pharmacy — one tap from a call.`
      },
      {
        icon: AlertTriangle,
        iconTone: "red",
        title: "If a crisis comes.",
        body: "Crisis Mode refocuses the whole app on what matters right now — emergency contacts, active medications, pinned documents — and alerts the circle. Owners and coordinators can activate it from the top bar."
      },
      {
        icon: null,
        title: "Begin the watch.",
        body: "You know the map now. A few good first steps:"
      }
    ],
    [name]
  );

  const isLast = step === steps.length - 1;

  // First visit: open once the shell has painted. Deliberately not shown again
  // after any dismissal (Skip, Esc, or finishing) — replay lives in the user menu.
  useEffect(() => {
    if (!userId) return;
    try {
      if (window.localStorage.getItem(storageKey(userId))) return;
    } catch {
      return;
    }
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, [userId]);

  useEffect(() => {
    const onReplay = () => {
      setStep(0);
      setOpen(true);
    };
    window.addEventListener(REPLAY_EVENT, onReplay);
    return () => window.removeEventListener(REPLAY_EVENT, onReplay);
  }, []);

  const dismiss = () => {
    setOpen(false);
    try {
      window.localStorage.setItem(storageKey(userId), new Date().toISOString());
    } catch {
      // Storage unavailable (private mode) — the tour will simply offer itself again.
    }
  };

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") dismiss();
      if (event.key === "ArrowRight" && step < steps.length - 1) setStep((value) => value + 1);
      if (event.key === "ArrowLeft" && step > 0) setStep((value) => value - 1);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step, steps.length]);

  useEffect(() => {
    if (open) nextButtonRef.current?.focus();
  }, [open, step]);

  // Crisis mode always wins the screen. Not marking the tour done here means it
  // offers itself again once things are calm.
  if (!open || crisisMode) return null;

  const current = steps[step];
  const Icon = current.icon;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-night/75 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-tour-title"
    >
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-pane">
        <div className="flex items-center justify-between bg-night px-5 py-3.5">
          <Wordmark className="text-[17px] text-white" />
          {!isLast ? (
            <button
              type="button"
              onClick={dismiss}
              className="text-sm font-medium text-white/60 transition-colors hover:text-white"
            >
              Skip tour
            </button>
          ) : null}
        </div>

        <div className="min-h-[224px] px-5 pb-2 pt-5" aria-live="polite">
          {Icon ? (
            <span
              className={cn(
                "inline-flex h-10 w-10 items-center justify-center rounded-lg",
                current.iconTone === "red" ? "bg-red-50 text-red-600" : "bg-brand-50 text-brand-600"
              )}
            >
              <Icon className="h-5 w-5" aria-hidden="true" />
            </span>
          ) : null}
          <h2
            id="welcome-tour-title"
            className={cn("font-display text-lg font-semibold tracking-tight text-neutral-900", Icon ? "mt-3" : "mt-1")}
          >
            {current.title}
          </h2>
          <p className="mt-2 text-base leading-relaxed text-neutral-600">{current.body}</p>

          {isLast ? (
            <div className="mt-4 space-y-2">
              <Link
                href="/dashboard"
                onClick={dismiss}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
              >
                <span className="ember-dot" aria-hidden="true" />
                Log a quick check-in
              </Link>
              <Link
                href="/medications"
                onClick={dismiss}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
              >
                <Pill className="h-4 w-4 text-brand-600" aria-hidden="true" />
                {personName ? `Add ${personName}'s medications` : "Add medications"}
              </Link>
              <Link
                href="/tasks"
                onClick={dismiss}
                className="flex items-center gap-3 rounded-lg border border-neutral-200 px-3 py-2.5 text-sm font-medium text-neutral-800 transition-colors hover:bg-neutral-50"
              >
                <CheckSquare className="h-4 w-4 text-brand-600" aria-hidden="true" />
                Create your first task
              </Link>
            </div>
          ) : null}
        </div>

        <div className="flex items-center justify-between px-5 py-4">
          <div className="flex items-center gap-1.5" aria-label={`Step ${step + 1} of ${steps.length}`}>
            {steps.map((_, index) => (
              <button
                key={index}
                type="button"
                aria-label={`Go to step ${index + 1}`}
                onClick={() => setStep(index)}
                className={cn(
                  "h-1.5 rounded-full transition-all",
                  index === step ? "w-4 bg-brand-600" : "w-1.5 bg-neutral-200 hover:bg-neutral-300"
                )}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className={cn(step === 0 && "invisible")}
              onClick={() => setStep((value) => Math.max(0, value - 1))}
            >
              Back
            </Button>
            {isLast ? (
              <Button ref={nextButtonRef} size="sm" onClick={dismiss}>
                Done
              </Button>
            ) : (
              <Button ref={nextButtonRef} size="sm" onClick={() => setStep((value) => value + 1)}>
                Next
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
