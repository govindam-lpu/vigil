"use client";

import { useState } from "react";
import { Check, Sparkles, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ExtractedMedication, HydratedDocument } from "@/lib/types";

// §2 — surfaces the worker's AI extraction as user-confirmed suggestions. Nothing here writes
// a record without an explicit click; appointments/tasks route through the existing create
// endpoints (which auto-create reminders = §6), and medications open an inline review form.
function toIso(value: string | null): string | null {
  if (!value) return null;
  const parsed = new Date(value.length <= 10 ? `${value}T00:00:00` : value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

export function SuggestionBanner({
  document,
  personName,
  currentUserId,
  canApply,
  onReload
}: {
  document: HydratedDocument;
  personName: string;
  currentUserId: string;
  canApply: boolean;
  onReload: () => Promise<void>;
}) {
  const suggestions = document.ai_suggestions;
  const [applied, setApplied] = useState<Set<string>>(new Set());
  const [apptSel, setApptSel] = useState<Set<number>>(new Set());
  const [taskSel, setTaskSel] = useState<Set<number>>(new Set());
  const [expiryHidden, setExpiryHidden] = useState(false);
  const [busy, setBusy] = useState(false);

  // Apply routes through contributor+ create endpoints — hide the banner for lower roles
  // rather than surface actions that would 403.
  if (!suggestions || document.ai_suggestions_dismissed_at || !canApply) return null;
  const appointments = suggestions.appointments;
  const medications = suggestions.medications;
  const tasks = suggestions.follow_up_tasks;
  const expiryDate = suggestions.expiry_date;
  const showExpiry = Boolean(expiryDate) && !document.expires_at && !expiryHidden;
  const hasAny = appointments.length > 0 || medications.length > 0 || tasks.length > 0 || showExpiry;
  if (!hasAny) return null;

  const markApplied = (key: string) => setApplied((prev) => new Set(prev).add(key));

  const toggle = (set: Set<number>, setter: (next: Set<number>) => void, index: number) => {
    const next = new Set(set);
    if (next.has(index)) next.delete(index);
    else next.add(index);
    setter(next);
  };

  const addAppointments = async () => {
    setBusy(true);
    for (const index of Array.from(apptSel)) {
      const appt = appointments[index];
      const scheduledAt = toIso(appt.date);
      if (!scheduledAt || applied.has(`appt-${index}`)) continue;
      const response = await fetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careCircleId: document.care_circle_id,
          personId: document.person_id,
          title: appt.provider ?? "Appointment",
          providerName: appt.provider,
          location: appt.location,
          scheduledAt,
          appointmentType: "medical",
          prepNotes: `Extracted from ${document.title}${appt.notes ? ` — ${appt.notes}` : ""}`,
          attendeeIds: [currentUserId]
        })
      });
      if (response.ok) markApplied(`appt-${index}`);
    }
    setApptSel(new Set());
    setBusy(false);
  };

  const addTasks = async () => {
    setBusy(true);
    for (const index of Array.from(taskSel)) {
      if (applied.has(`task-${index}`)) continue;
      const response = await fetch("/api/tasks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          careCircleId: document.care_circle_id,
          personId: document.person_id,
          title: tasks[index],
          linkedObjectType: "document",
          linkedObjectId: document.id
        })
      });
      if (response.ok) markApplied(`task-${index}`);
    }
    setTaskSel(new Set());
    setBusy(false);
  };

  const setExpiry = async () => {
    const iso = toIso(expiryDate);
    if (!iso) return;
    setBusy(true);
    await fetch("/api/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: document.id,
        careCircleId: document.care_circle_id,
        personId: document.person_id,
        expiresAt: iso.slice(0, 10)
      })
    });
    setBusy(false);
    await onReload();
  };

  const dismissAll = async () => {
    setBusy(true);
    await fetch("/api/documents", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: document.id,
        careCircleId: document.care_circle_id,
        personId: document.person_id,
        dismissSuggestions: true
      })
    });
    await onReload();
  };

  return (
    <div className="mt-4 rounded-r-lg border-l-4 border-l-brand-600 bg-brand-50 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 shrink-0 text-brand-600" aria-hidden="true" />
          <p className="text-sm font-semibold text-neutral-900">
            We found some information in this document. Add it to {personName}&apos;s record?
          </p>
        </div>
        <button
          aria-label="Dismiss suggestions"
          className="text-neutral-400 hover:text-neutral-700 disabled:opacity-40"
          onClick={() => void dismissAll()}
          disabled={busy}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {appointments.length > 0 ? (
        <div className="mt-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Appointments found</p>
          <div className="mt-2 space-y-1">
            {appointments.map((appt, index) => {
              const key = `appt-${index}`;
              const scheduledAt = toIso(appt.date);
              const done = applied.has(key);
              return (
                <label key={key} className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    disabled={done || !scheduledAt}
                    checked={apptSel.has(index)}
                    onChange={() => toggle(apptSel, setApptSel, index)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="font-medium text-neutral-900">{appt.provider ?? "Appointment"}</span>
                    {appt.date ? (
                      <span className="text-neutral-500"> · {appt.date}</span>
                    ) : (
                      <span className="text-neutral-400"> · no date</span>
                    )}
                    {appt.notes ? <span className="block text-neutral-500">{appt.notes}</span> : null}
                  </span>
                  {done ? (
                    <Badge variant="green">
                      <Check className="mr-1 h-3 w-3" />
                      Added
                    </Badge>
                  ) : null}
                </label>
              );
            })}
          </div>
          <Button size="sm" className="mt-2" onClick={() => void addAppointments()} disabled={busy || apptSel.size === 0}>
            Add selected appointments
          </Button>
        </div>
      ) : null}

      {medications.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Medications found</p>
          <div className="mt-2 space-y-2">
            {medications.map((med, index) => (
              <MedicationSuggestion
                key={`med-${index}`}
                med={med}
                done={applied.has(`med-${index}`)}
                careCircleId={document.care_circle_id}
                personId={document.person_id}
                onAdded={() => markApplied(`med-${index}`)}
              />
            ))}
          </div>
        </div>
      ) : null}

      {tasks.length > 0 ? (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">Follow-up tasks found</p>
          <div className="mt-2 space-y-1">
            {tasks.map((task, index) => {
              const key = `task-${index}`;
              const done = applied.has(key);
              return (
                <label key={key} className="flex items-start gap-2 rounded-md bg-white px-2 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-1 h-4 w-4"
                    disabled={done}
                    checked={taskSel.has(index)}
                    onChange={() => toggle(taskSel, setTaskSel, index)}
                  />
                  <span className="min-w-0 flex-1 text-neutral-900">{task}</span>
                  {done ? (
                    <Badge variant="green">
                      <Check className="mr-1 h-3 w-3" />
                      Added
                    </Badge>
                  ) : null}
                </label>
              );
            })}
          </div>
          <Button size="sm" className="mt-2" onClick={() => void addTasks()} disabled={busy || taskSel.size === 0}>
            Create tasks
          </Button>
        </div>
      ) : null}

      {showExpiry ? (
        <div className="mt-4 rounded-md bg-white p-2 text-sm">
          <p className="text-neutral-700">
            This document appears to expire on <span className="font-medium">{expiryDate}</span>. Set expiry?
          </p>
          <div className="mt-2 flex gap-2">
            <Button size="sm" onClick={() => void setExpiry()} disabled={busy}>
              Yes, set expiry
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setExpiryHidden(true)} disabled={busy}>
              No
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function MedicationSuggestion({
  med,
  done,
  careCircleId,
  personId,
  onAdded
}: {
  med: ExtractedMedication;
  done: boolean;
  careCircleId: string;
  personId: string;
  onAdded: () => void;
}) {
  const [name, setName] = useState(med.name ?? "");
  const [dosage, setDosage] = useState(med.dosage ?? "");
  const [frequency, setFrequency] = useState(med.frequency ?? "");
  const [instructions, setInstructions] = useState(med.instructions ?? "");
  const [busy, setBusy] = useState(false);

  const add = async () => {
    setBusy(true);
    const response = await fetch("/api/medications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId,
        personId,
        name: name.trim(),
        dosage: dosage.trim() || null,
        frequency: frequency.trim(),
        instructions: instructions.trim() || null
      })
    });
    setBusy(false);
    if (response.ok) onAdded();
  };

  if (done) {
    return (
      <div className="flex items-center justify-between rounded-md bg-white px-2 py-1.5 text-sm">
        <span className="font-medium text-neutral-900">{name || med.name}</span>
        <Badge variant="green">
          <Check className="mr-1 h-3 w-3" />
          Added
        </Badge>
      </div>
    );
  }

  return (
    <div className="rounded-md bg-white p-2">
      <p className="mb-1 text-xs text-neutral-500">Review before adding:</p>
      <div className="grid grid-cols-2 gap-2">
        <Input className="h-9" placeholder="Name" value={name} onChange={(event) => setName(event.target.value)} />
        <Input className="h-9" placeholder="Dosage" value={dosage} onChange={(event) => setDosage(event.target.value)} />
        <Input
          className="h-9"
          placeholder="Frequency (required)"
          value={frequency}
          onChange={(event) => setFrequency(event.target.value)}
        />
        <Input
          className="h-9"
          placeholder="Instructions"
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </div>
      <Button size="sm" className="mt-2" onClick={() => void add()} disabled={busy || !name.trim() || !frequency.trim()}>
        Add medication
      </Button>
    </div>
  );
}
