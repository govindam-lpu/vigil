"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

// "Record update" quick action in crisis mode — writes a user_entry timeline event.
export function RecordUpdateModal({
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
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/timeline", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, personId, title: title.trim(), body: body.trim() || null })
    });

    if (response.ok) {
      onSaved();
      return;
    }

    setSaving(false);
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setError(json.error ?? "We couldn't save that update. Please try again.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Record update</h2>
        <p className="mt-1 text-sm text-neutral-500">Add a note to the timeline for the care circle.</p>
        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Title (required)</span>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="e.g. Update from the ER" />
        </label>
        <label className="mt-3 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">Details (optional)</span>
          <textarea
            className="min-h-24 w-full rounded border border-neutral-300 p-2 text-base"
            value={body}
            onChange={(event) => setBody(event.target.value)}
          />
        </label>
        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={save} disabled={saving || !title.trim()}>
            {saving ? "Saving…" : "Save update"}
          </Button>
        </div>
      </div>
    </div>
  );
}
