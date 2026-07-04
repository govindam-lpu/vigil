"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Calendar, CheckSquare, FileText, Pill, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LoadError } from "@/components/ui/load-error";
import { roleLabel } from "@/lib/permissions/roles";
import type { CareMode, DashboardChanges, MemberSummary, UserProfile } from "@/lib/types";
import { calculateAge, formatPersonName, relativeTime } from "@/lib/utils";
import { useActiveCircle } from "@/components/shell/active-circle-provider";

type DashboardViewProps = {
  profile: UserProfile;
};

const careModeVariant: Record<CareMode, "neutral" | "yellow" | "red"> = {
  normal: "neutral",
  elevated: "yellow",
  crisis: "red"
};

export function DashboardView({ profile }: DashboardViewProps) {
  const { activeCircle } = useActiveCircle();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [changes, setChanges] = useState<DashboardChanges | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    if (!activeCircle) {
      return;
    }

    let cancelled = false;

    const loadDashboard = async () => {
      if (!activeCircle.person) return;
      try {
        setError(null);
        const [memberResponse, changesResponse] = await Promise.all([
          fetch(`/api/memberships?careCircleId=${activeCircle.careCircle.id}`),
          fetch(`/api/dashboard/changes?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`)
        ]);
        if (!memberResponse.ok || !changesResponse.ok) throw new Error("Request failed");
        const result = (await memberResponse.json()) as { members?: MemberSummary[] };
        const changesResult = (await changesResponse.json()) as { changes?: DashboardChanges };

        if (!cancelled) {
          setMembers(result.members ?? []);
          setChanges(changesResult.changes ?? null);
        }
      } catch {
        if (!cancelled) {
          setError("We couldn't load your dashboard. Check your connection and try again.");
        }
      }
    };

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [activeCircle, reloadKey]);

  if (!activeCircle?.person) {
    return null;
  }

  const person = activeCircle.person;
  const personName = formatPersonName(person.first_name, person.last_name, person.preferred_name);
  const age = calculateAge(person.date_of_birth);

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="space-y-5">
          <Card>
            <CardContent className="space-y-4">
              <div>
                <h1 className="text-xl font-bold text-neutral-900">{personName}</h1>
                <p className="mt-1 text-sm text-neutral-500">{age !== null ? `${age} years old` : "Age not set"}</p>
                <div className="mt-3">
                  <Badge variant={careModeVariant[person.current_care_mode]}>
                    {person.current_care_mode[0].toUpperCase()}
                    {person.current_care_mode.slice(1)}
                  </Badge>
                </div>
              </div>
              <div className="h-px bg-neutral-200" />
              <div>
                <h2 className="mb-3 text-sm font-semibold text-neutral-900">Members</h2>
                <div className="space-y-3">
                  {members.map((member) => {
                    const displayName = member.profile?.display_name ?? "Unknown member";

                    return (
                      <div key={member.membership.id} className="flex items-center gap-3">
                        <Avatar name={displayName} src={member.profile?.avatar_url ?? null} className="h-8 w-8" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-900">{displayName}</p>
                          <p className="text-xs text-neutral-500">{roleLabel(member.membership.role)}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </aside>

        <section className="space-y-5">
          <div className="sticky top-14 z-10 -mx-2 bg-neutral-50 px-2 py-2">
            <h2 className="text-lg font-semibold text-neutral-900">Welcome back, {profile.display_name}</h2>
          </div>
          {error ? <LoadError message={error} onRetry={() => setReloadKey((key) => key + 1)} /> : null}
          {changes && changes.totalTimelineEntries > 0 ? (
            <ChangesCallout
              changes={changes}
              careCircleId={activeCircle.careCircle.id}
              onCaughtUp={() => setChanges(null)}
            />
          ) : null}
          <EmptyState
            icon={FileText}
            title="No activity recorded yet."
            body="Updates, tasks, and notes will appear here."
          />
          <EmptyState
            icon={CheckSquare}
            title="No tasks yet."
            body="Tasks make it clear who is responsible for what and when."
          />
          <EmptyState
            icon={Calendar}
            title="No appointments scheduled."
            body="Add appointments to track upcoming visits."
          />
        </section>

        <aside>
          <Card>
            <CardHeader>
              <CardTitle>Quick stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <StatLink href="/medications" icon={Pill} label="Medications" value="-" />
              <StatLink href="/documents" icon={FileText} label="Documents" value="-" />
              <StatLink href="/people" icon={Users} label="Members" value={String(members.length)} />
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function ChangesCallout({
  changes,
  careCircleId,
  onCaughtUp
}: {
  changes: DashboardChanges;
  careCircleId: string;
  onCaughtUp: () => void;
}) {
  const markCaughtUp = async () => {
    await fetch("/api/dashboard/changes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId })
    });
    onCaughtUp();
  };

  return (
    <div className="border-l-4 border-l-blue-600 bg-blue-50 p-4">
      <h3 className="text-base font-semibold text-neutral-900">
        Since your last visit ({relativeTime(changes.lastCaughtUpAt)}):
      </h3>
      <div className="mt-3 space-y-2 text-sm">
        <Link href="/timeline" className="block font-medium text-blue-700 hover:underline">
          {changes.totalTimelineEntries} new timeline entries
        </Link>
        <Link href="/tasks" className="block font-medium text-blue-700 hover:underline">
          {changes.tasksCompleted} tasks completed / {changes.tasksMissed} tasks missed
        </Link>
        <Link href="/documents" className="block font-medium text-blue-700 hover:underline">
          {changes.newDocuments} new documents
        </Link>
        <Link href="/notes" className="block font-medium text-blue-700 hover:underline">
          {changes.notesAdded} notes added
        </Link>
      </div>
      <Button className="mt-3" size="sm" variant="secondary" onClick={markCaughtUp}>
        Mark as caught up
      </Button>
    </div>
  );
}

type EmptyStateProps = {
  icon: LucideIcon;
  title: string;
  body: string;
};

function EmptyState({ icon: Icon, title, body }: EmptyStateProps) {
  return (
    <Card>
      <CardContent className="flex items-start gap-3">
        <div className="mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-neutral-100 text-neutral-500">
          <Icon className="h-5 w-5" aria-hidden="true" />
        </div>
        <div>
          <h3 className="text-base font-semibold text-neutral-900">{title}</h3>
          <p className="mt-1 text-base text-neutral-600">{body}</p>
        </div>
      </CardContent>
    </Card>
  );
}

type StatLinkProps = {
  href: string;
  icon: LucideIcon;
  label: string;
  value: string;
};

function StatLink({ href, icon: Icon, label, value }: StatLinkProps) {
  return (
    <Link
      href={href}
      className="flex h-11 items-center justify-between rounded-md px-2 text-sm hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
    >
      <span className="flex items-center gap-2 font-medium text-neutral-700">
        <Icon className="h-4 w-4 text-neutral-500" aria-hidden="true" />
        {label}
      </span>
      <span className="font-semibold text-neutral-900">{value}</span>
    </Link>
  );
}
