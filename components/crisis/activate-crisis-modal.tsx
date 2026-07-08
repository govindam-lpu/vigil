"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useCrisisMode } from "@/components/shell/crisis-mode-provider";

// Activation modal (Phase 4 spec). Owner/Coordinator only — the trigger button is
// gated in the top bar and the API re-checks server-side.
export function ActivateCrisisModal({
  careCircleId,
  onClose
}: {
  careCircleId: string;
  onClose: () => void;
}) {
  const { refresh } = useCrisisMode();
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activate = async () => {
    setSaving(true);
    setError(null);
    const response = await fetch("/api/crisis/activate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, reason: reason.trim() || undefined })
    });

    if (response.ok) {
      await refresh();
      onClose();
      return;
    }

    setSaving(false);
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setError(json.error ?? "We couldn't activate crisis mode. Please try again.");
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-md rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Activate Crisis Mode</h2>
        <p className="mt-1 text-sm text-neutral-600">
          This will alert all care circle members and surface emergency information.
        </p>

        <label className="mt-4 block">
          <span className="mb-1 block text-sm font-medium text-neutral-700">
            What&apos;s happening? (optional but helpful)
          </span>
          <textarea
            className="min-h-24 w-full rounded border border-neutral-300 p-3 text-base"
            placeholder="e.g. Chest pain, transported to Northwestern ER"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
          />
        </label>

        {error ? <p className="mt-2 text-sm text-red-600">{error}</p> : null}

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="bg-red-600 hover:bg-red-700" onClick={activate} disabled={saving}>
            {saving ? "Activating…" : "Activate Crisis Mode"}
          </Button>
        </div>
      </div>
    </div>
  );
}
