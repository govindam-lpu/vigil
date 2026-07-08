"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CheckInStatus } from "@/lib/types";
import { toDateTimeLocalValue } from "@/lib/utils";

// Quick check-in (Phase 2), shared by the dashboard and the crisis dashboard.
export function CheckInModal({
  careCircleId,
  personId,
  onClose,
  onSaved
}: {
  careCircleId: string;
  personId: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [status, setStatus] = useState<CheckInStatus>("well");
  const [notes, setNotes] = useState("");
  const [occurredAt, setOccurredAt] = useState(toDateTimeLocalValue(new Date().toISOString()));
  const [saving, setSaving] = useState(false);
  const needsNotes = status !== "well";

  const save = async () => {
    setSaving(true);
    const response = await fetch("/api/check-ins", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        careCircleId,
        personId,
        status,
        notes: notes.trim() || null,
        occurredAt: occurredAt ? new Date(occurredAt).toISOString() : null
      })
    });
    setSaving(false);
    if (response.ok) onSaved();
  };

  const options: { value: CheckInStatus; label: string }[] = [
    { value: "well", label: "Well" },
    { value: "concerning", label: "Concerning" },
    { value: "urgent", label: "Urgent" }
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Quick Check-in</h2>
        <div className="mt-4 flex gap-2">
          {options.map((option) => (
            <button
              key={option.value}
              className={
                status === option.value
                  ? "flex-1 rounded-lg border-2 border-blue-600 bg-blue-50 py-2 text-sm font-semibold text-neutral-900"
                  : "flex-1 rounded-lg border border-neutral-200 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100"
              }
              onClick={() => setStatus(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">
            Notes{needsNotes ? " (required)" : " (optional)"}
          </span>
          <textarea
            className="min-h-24 w-full rounded border border-neutral-300 p-2 text-base"
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Occurred at</span>
          <Input type="datetime-local" value={occurredAt} onChange={(event) => setOccurredAt(event.target.value)} />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || (needsNotes && !notes.trim())}>
            Save check-in
          </Button>
        </div>
      </div>
    </div>
  );
}
