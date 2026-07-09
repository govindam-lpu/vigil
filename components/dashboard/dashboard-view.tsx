"use client";

import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { Activity, Calendar, CheckSquare, FileText, HeartPulse, Pill, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { LoadError } from "@/components/ui/load-error";
import { HandoffModal } from "@/components/dashboard/handoff-modal";
import { CheckInModal } from "@/components/shared/check-in-modal";
import { CrisisDashboard } from "@/components/crisis/crisis-dashboard";
import { useCrisisMode } from "@/components/shell/crisis-mode-provider";
import { roleLabel } from "@/lib/permissions/roles";
import type {
  CareMode,
  CheckInStatus,
  DashboardChanges,
  HydratedCheckIn,
  HydratedMedication,
  HydratedObservation,
  MemberSummary,
  ObservationSeverity,
  ObservationType,
  UserProfile
} from "@/lib/types";
import { calculateAge, formatPersonName, relativeTime, toDateTimeLocalValue } from "@/lib/utils";
import { useActiveCircle } from "@/components/shell/active-circle-provider";

type DashboardViewProps = {
  profile: UserProfile;
};

const careModeVariant: Record<CareMode, "neutral" | "yellow" | "red"> = {
  normal: "neutral",
  elevated: "yellow",
  crisis: "red"
};

const checkInVariant: Record<CheckInStatus, "green" | "yellow" | "red"> = {
  well: "green",
  concerning: "yellow",
  urgent: "red"
};

export function DashboardView({ profile }: DashboardViewProps) {
  const { activeCircle } = useActiveCircle();
  const { crisisMode } = useCrisisMode();
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [changes, setChanges] = useState<DashboardChanges | null>(null);
  const [checkIns, setCheckIns] = useState<HydratedCheckIn[]>([]);
  const [medications, setMedications] = useState<HydratedMedication[]>([]);
  const [observations, setObservations] = useState<HydratedObservation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [observationOpen, setObservationOpen] = useState(false);
  const [handoffOpen, setHandoffOpen] = useState(false);

  useEffect(() => {
    if (!activeCircle) {
      return;
    }

    let cancelled = false;

    const loadDashboard = async () => {
      if (!activeCircle.person) return;
      const circleId = activeCircle.careCircle.id;
      const personId = activeCircle.person.id;
      try {
        setError(null);
        const [memberResponse, changesResponse, checkInResponse, medicationResponse, observationResponse] = await Promise.all([
          fetch(`/api/memberships?careCircleId=${circleId}`),
          fetch(`/api/dashboard/changes?careCircleId=${circleId}&personId=${personId}`),
          fetch(`/api/check-ins?careCircleId=${circleId}&personId=${personId}`),
          fetch(`/api/medications?careCircleId=${circleId}&personId=${personId}`),
          fetch(`/api/observations?careCircleId=${circleId}&personId=${personId}`)
        ]);
        if (!memberResponse.ok || !changesResponse.ok || !checkInResponse.ok || !medicationResponse.ok || !observationResponse.ok) {
          throw new Error("Request failed");
        }
        const result = (await memberResponse.json()) as { members?: MemberSummary[] };
        const changesResult = (await changesResponse.json()) as { changes?: DashboardChanges };
        const checkInResult = (await checkInResponse.json()) as { checkIns?: HydratedCheckIn[] };
        const medicationResult = (await medicationResponse.json()) as { medications?: HydratedMedication[] };
        const observationResult = (await observationResponse.json()) as { observations?: HydratedObservation[] };

        if (!cancelled) {
          setMembers(result.members ?? []);
          setChanges(changesResult.changes ?? null);
          setCheckIns(checkInResult.checkIns ?? []);
          setMedications(medicationResult.medications ?? []);
          setObservations(observationResult.observations ?? []);
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

  // Crisis mode replaces the standard dashboard with the condensed crisis layout.
  if (crisisMode) {
    return <CrisisDashboard />;
  }

  const person = activeCircle.person;
  const personName = formatPersonName(person.first_name, person.last_name, person.preferred_name);
  const age = calculateAge(person.date_of_birth);
  const activeMedications = medications.filter((med) => med.status === "active");
  const refillsDue = activeMedications
    .map((med) => ({ med, days: refillDays(med) }))
    .filter((entry) => entry.days !== null && (entry.days as number) <= 14)
    .sort((a, b) => (a.days as number) - (b.days as number));
  const lastCheckIn = checkIns[0] ?? null;
  const reload = () => setReloadKey((key) => key + 1);

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="grid gap-6 lg:grid-cols-[240px_minmax(0,1fr)_280px]">
        <aside className="space-y-5">
          <Card>
            <CardContent className="space-y-4">
              <div>
                <h1 className="font-display text-xl font-semibold tracking-tight text-neutral-900">{personName}</h1>
                <p className="mt-1 font-mono text-sm text-neutral-500">{age !== null ? `${age} years old` : "Age not set"}</p>
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
          <div className="sticky top-14 z-10 -mx-2 flex items-end justify-between gap-2 bg-neutral-50 px-2 py-2">
            <div>
              <p className="flex items-center gap-2 font-mono text-xs text-neutral-500">
                <span className="ember-dot" aria-hidden="true" />
                {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
              </p>
              <h2 className="mt-1 font-display text-lg font-semibold tracking-tight text-neutral-900">
                Welcome back, {profile.display_name}
              </h2>
            </div>
            {activeCircle.membership.role === "owner" || activeCircle.membership.role === "coordinator" ? (
              <Button size="sm" variant="secondary" onClick={() => setHandoffOpen(true)}>
                Hand off responsibility
              </Button>
            ) : null}
          </div>
          {error ? <LoadError message={error} onRetry={reload} /> : null}
          {changes && changes.totalTimelineEntries > 0 ? (
            <ChangesCallout changes={changes} careCircleId={activeCircle.careCircle.id} personId={person.id} onCaughtUp={() => setChanges(null)} />
          ) : null}
          <EmptyState icon={FileText} title="No activity recorded yet." body="Updates, tasks, and notes will appear here." />
          <EmptyState icon={CheckSquare} title="No tasks yet." body="Tasks make it clear who is responsible for what and when." />
          <EmptyState icon={Calendar} title="No appointments scheduled." body="Add appointments to track upcoming visits." />
        </section>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle>Quick stats</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <StatLink href="/medications" icon={Pill} label="Active medications" value={String(activeMedications.length)} />
              <StatLink href="/documents" icon={FileText} label="Documents" value="-" />
              <StatLink href="/people" icon={Users} label="Members" value={String(members.length)} />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Last check-in</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {lastCheckIn ? (
                <div>
                  <div className="flex items-center gap-2">
                    <Badge variant={checkInVariant[lastCheckIn.status]}>{labelize(lastCheckIn.status)}</Badge>
                    <span className="font-mono text-xs text-neutral-400">{relativeTime(lastCheckIn.occurred_at)}</span>
                  </div>
                  <p className="mt-2 text-xs text-neutral-500">{lastCheckIn.author?.display_name ?? "Unknown member"}</p>
                  {lastCheckIn.notes ? <p className="mt-1 line-clamp-2 text-sm text-neutral-700">{lastCheckIn.notes}</p> : null}
                </div>
              ) : (
                <p className="text-sm text-neutral-500">No check-ins yet.</p>
              )}
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setCheckInOpen(true)}>
                <span className="ember-dot" aria-hidden="true" />
                Quick Check-in
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Medications needing refill</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {refillsDue.length === 0 ? (
                <p className="text-sm text-neutral-500">No refills due in the next 14 days.</p>
              ) : (
                refillsDue.map(({ med, days }) => (
                  <Link
                    key={med.id}
                    href={`/medications?medication=${med.id}`}
                    className="flex items-center justify-between rounded-md px-2 py-1 text-sm hover:bg-neutral-100"
                  >
                    <span className="font-medium text-neutral-800">{med.name}</span>
                    <span className={(days as number) < 7 ? "text-red-600" : "text-yellow-700"}>
                      {(days as number) < 0 ? "Overdue" : `${days}d`}
                    </span>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Observations</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {observations.length === 0 ? (
                <p className="text-sm text-neutral-500">No symptoms or observations logged.</p>
              ) : (
                observations.slice(0, 3).map((observation) => (
                  <div key={observation.id} className="border-l-2 border-l-neutral-200 pl-2">
                    <p className="font-mono text-xs font-medium text-neutral-500">
                      {labelize(observation.observation_type)}
                      {observation.severity ? ` · ${labelize(observation.severity)}` : ""} · {relativeTime(observation.occurred_at)}
                    </p>
                    <p className="line-clamp-2 text-sm text-neutral-700">{observation.body}</p>
                  </div>
                ))
              )}
              <Button size="sm" variant="secondary" className="w-full" onClick={() => setObservationOpen(true)}>
                <Activity className="h-4 w-4" aria-hidden="true" />
                Log observation
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>

      {checkInOpen ? (
        <CheckInModal
          careCircleId={activeCircle.careCircle.id}
          personId={person.id}
          onClose={() => setCheckInOpen(false)}
          onSaved={() => {
            setCheckInOpen(false);
            reload();
          }}
        />
      ) : null}

      {observationOpen ? (
        <ObservationModal
          careCircleId={activeCircle.careCircle.id}
          personId={person.id}
          medications={activeMedications}
          onClose={() => setObservationOpen(false)}
          onSaved={() => {
            setObservationOpen(false);
            reload();
          }}
        />
      ) : null}

      {handoffOpen ? (
        <HandoffModal
          careCircleId={activeCircle.careCircle.id}
          personId={person.id}
          currentUserId={activeCircle.membership.user_id}
          currentUserRole={activeCircle.membership.role}
          members={members}
          medications={activeMedications}
          checkIns={checkIns}
          onClose={() => setHandoffOpen(false)}
          onDone={() => {
            setHandoffOpen(false);
            reload();
          }}
        />
      ) : null}
    </div>
  );
}

function ObservationModal({
  careCircleId,
  personId,
  medications,
  onClose,
  onSaved
}: {
  careCircleId: string;
  personId: string;
  medications: HydratedMedication[];
  onClose: () => void;
  onSaved: () => void;
}) {
  const [observationType, setObservationType] = useState<ObservationType>("symptom");
  const [body, setBody] = useState("");
  const [severity, setSeverity] = useState<ObservationSeverity | "">("");
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocalValue(new Date().toISOString()));
  const [linkedMedicationId, setLinkedMedicationId] = useState("");
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/observations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId,
        personId,
        observationType,
        body,
        severity: severity || null,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null,
        linkedObjectType: linkedMedicationId ? "medication" : null,
        linkedObjectId: linkedMedicationId || null
      })
    });
    setSaving(false);
    if (response.ok) onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-pane">
        <h2 className="text-md font-semibold text-neutral-900">Log observation</h2>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Type</span>
          <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={observationType} onChange={(event) => setObservationType(event.target.value as ObservationType)}>
            {(["symptom", "vital", "behavior", "mood", "other"] as ObservationType[]).map((type) => (
              <option key={type} value={type}>
                {labelize(type)}
              </option>
            ))}
          </select>
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Observation (required)</span>
          <textarea className="min-h-24 w-full rounded border border-neutral-300 p-2 text-base" value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Severity (optional)</span>
          <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={severity} onChange={(event) => setSeverity(event.target.value as ObservationSeverity | "")}>
            <option value="">Not set</option>
            {(["mild", "moderate", "severe"] as ObservationSeverity[]).map((item) => (
              <option key={item} value={item}>
                {labelize(item)}
              </option>
            ))}
          </select>
        </label>
        {medications.length > 0 ? (
          <label className="mt-3 block">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Link to medication (optional)</span>
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={linkedMedicationId} onChange={(event) => setLinkedMedicationId(event.target.value)}>
              <option value="">None</option>
              {medications.map((med) => (
                <option key={med.id} value={med.id}>
                  {med.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Occurred at</span>
          <Input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !body.trim()}>
            Save observation
          </Button>
        </div>
      </div>
    </div>
  );
}

function ChangesCallout({
  changes,
  careCircleId,
  personId,
  onCaughtUp
}: {
  changes: DashboardChanges;
  careCircleId: string;
  personId: string;
  onCaughtUp: () => void;
}) {
  const [summary, setSummary] = useState<string | null>(null);
  const [showBullets, setShowBullets] = useState(false);

  // §4: when the member has been away > 48h with > 5 new events and a provider is configured,
  // the server returns an AI prose summary; otherwise this stays null and we render the bullets.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const response = await fetch(`/api/ai/summary?careCircleId=${careCircleId}&personId=${personId}`);
      if (!response.ok) return;
      const json = (await response.json()) as { eligible?: boolean; summary?: string | null };
      if (!cancelled && json.eligible && json.summary) setSummary(json.summary);
    })();
    return () => {
      cancelled = true;
    };
  }, [careCircleId, personId]);

  const markCaughtUp = async () => {
    await fetch("/api/dashboard/changes", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId })
    });
    onCaughtUp();
  };

  const bullets = (
    <div className="mt-3 space-y-2 text-sm">
      <Link href="/timeline" className="block font-medium text-brand-700 hover:underline">
        {changes.totalTimelineEntries} new timeline entries
      </Link>
      <Link href="/tasks" className="block font-medium text-brand-700 hover:underline">
        {changes.tasksCompleted} tasks completed / {changes.tasksMissed} tasks missed
      </Link>
      <Link href="/documents" className="block font-medium text-brand-700 hover:underline">
        {changes.newDocuments} new documents
      </Link>
      <Link href="/notes" className="block font-medium text-brand-700 hover:underline">
        {changes.notesAdded} notes added
      </Link>
    </div>
  );

  return (
    <div className="border-l-4 border-l-brand-600 bg-brand-50 p-4">
      <h3 className="text-base font-semibold text-neutral-900">
        Since your last visit ({relativeTime(changes.lastCaughtUpAt)}):
      </h3>
      {summary ? (
        <>
          <p className="mt-3 whitespace-pre-wrap text-sm text-neutral-800">{summary}</p>
          <button
            className="mt-2 text-sm font-medium text-brand-700 hover:underline"
            onClick={() => setShowBullets((value) => !value)}
          >
            {showBullets ? "Hide activity list" : "Show full activity list"}
          </button>
          {showBullets ? bullets : null}
        </>
      ) : (
        bullets
      )}
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
      className="flex h-11 items-center justify-between rounded-md px-2 text-sm hover:bg-neutral-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
    >
      <span className="flex items-center gap-2 font-medium text-neutral-700">
        <Icon className="h-4 w-4 text-neutral-500" aria-hidden="true" />
        {label}
      </span>
      <span className="font-mono font-semibold text-neutral-900">{value}</span>
    </Link>
  );
}

function refillDays(medication: HydratedMedication): number | null {
  if (!medication.next_refill_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${medication.next_refill_date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}
