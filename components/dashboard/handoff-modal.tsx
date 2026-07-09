"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { HydratedAppointment, HydratedCheckIn, HydratedMedication, HydratedTask, MemberSummary, Role } from "@/lib/types";
import { formatDateTime } from "@/lib/utils";

export function HandoffModal({
  careCircleId,
  personId,
  currentUserId,
  currentUserRole,
  members,
  medications,
  checkIns,
  onClose,
  onDone
}: {
  careCircleId: string;
  personId: string;
  currentUserId: string;
  currentUserRole: Role;
  members: MemberSummary[];
  medications: HydratedMedication[];
  checkIns: HydratedCheckIn[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [summary, setSummary] = useState("");
  const [recipientId, setRecipientId] = useState("");
  const [until, setUntil] = useState("");
  const [elevate, setElevate] = useState(false);
  const [openTasks, setOpenTasks] = useState<HydratedTask[]>([]);
  const [appointments, setAppointments] = useState<HydratedAppointment[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [taskResponse, appointmentResponse] = await Promise.all([
        fetch(`/api/tasks?careCircleId=${careCircleId}&personId=${personId}`),
        fetch(`/api/appointments?careCircleId=${careCircleId}&personId=${personId}`)
      ]);
      const taskJson = (await taskResponse.json()) as { tasks?: HydratedTask[] };
      const appointmentJson = (await appointmentResponse.json()) as { appointments?: HydratedAppointment[] };
      if (cancelled) return;
      setOpenTasks((taskJson.tasks ?? []).filter((task) => task.status === "open" || task.status === "in_progress"));
      const now = Date.now();
      setAppointments(
        (appointmentJson.appointments ?? [])
          .filter((appointment) => appointment.status === "scheduled" && new Date(appointment.scheduled_at).getTime() >= now)
          .slice(0, 3)
      );
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [careCircleId, personId]);

  const refillsDue = medications.filter((med) => med.status === "active" && refillDays(med) !== null && (refillDays(med) as number) <= 14);
  const urgentCheckIns = checkIns.filter((checkIn) => checkIn.status === "urgent");
  const recipients = members.filter((member) => member.membership.user_id !== currentUserId);

  const confirm = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/handoff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId,
        personId,
        summary,
        recipientId,
        until: until || null,
        elevateRole: elevate && !!until
      })
    });
    setSaving(false);
    if (response.ok) {
      onDone();
      return;
    }
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setError(json.error ?? "We couldn't complete the handoff.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Hand off responsibility</h2>
        <p className="mt-1 text-sm text-neutral-500">Step {step} of 2 — {step === 1 ? "Summary" : "Transfer"}</p>

        {step === 1 ? (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Current status (required)</span>
              <textarea
                className="min-h-28 w-full rounded border border-neutral-300 p-3 text-base"
                placeholder="What is happening now and what needs attention?"
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>

            <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
              <p className="text-sm font-semibold text-neutral-900">Active items</p>
              <ul className="mt-2 space-y-1 text-sm text-neutral-700">
                <li>{openTasks.length} open task{openTasks.length === 1 ? "" : "s"}</li>
                <li>{appointments.length} upcoming appointment{appointments.length === 1 ? "" : "s"}</li>
                <li>{refillsDue.length} medication{refillsDue.length === 1 ? "" : "s"} needing refill</li>
                <li>{urgentCheckIns.length} urgent check-in{urgentCheckIns.length === 1 ? "" : "s"}</li>
              </ul>
              {appointments.length > 0 ? (
                <p className="mt-2 text-xs text-neutral-500">
                  Next: {appointments[0].title} · <span className="font-mono">{formatDateTime(appointments[0].scheduled_at)}</span>
                </p>
              ) : null}
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose}>
                Cancel
              </Button>
              <Button onClick={() => setStep(2)} disabled={!summary.trim()}>
                Next
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Who is taking over (required)</span>
              <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={recipientId} onChange={(event) => setRecipientId(event.target.value)}>
                <option value="">Select a member…</option>
                {recipients.map((member) => (
                  <option key={member.membership.user_id} value={member.membership.user_id}>
                    {member.profile?.display_name ?? "Unknown member"}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">Until (optional — indefinitely if blank)</span>
              <Input type="date" value={until} onChange={(event) => setUntil(event.target.value)} />
            </label>

            {currentUserRole === "owner" && until ? (
              <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
                <input type="checkbox" checked={elevate} onChange={(event) => setElevate(event.target.checked)} />
                Temporarily elevate this member to Coordinator until <span className="font-mono">{until}</span>
              </label>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep(1)}>
                Back
              </Button>
              <Button onClick={confirm} disabled={saving || !recipientId}>
                Confirm handoff
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function refillDays(medication: HydratedMedication): number | null {
  if (!medication.next_refill_date) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(`${medication.next_refill_date}T00:00:00`);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}
