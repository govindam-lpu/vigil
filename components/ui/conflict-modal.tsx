"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";

// Conflict resolution UI (DESIGN.md — Interaction Rules → Conflict Resolution).
// Operates on a single text field: shows "your version" vs the current saved
// version and lets the user keep theirs, overwrite, or merge manually.
export function ConflictModal({
  fieldLabel,
  yourValue,
  theirValue,
  savedByLabel,
  onKeepTheirs,
  onUseMine,
  onMerge,
  onClose
}: {
  fieldLabel: string;
  yourValue: string;
  theirValue: string;
  savedByLabel: string;
  onKeepTheirs: () => void;
  onUseMine: () => void;
  onMerge: (value: string) => void;
  onClose: () => void;
}) {
  const [merging, setMerging] = useState(false);
  const [merged, setMerged] = useState(`${yourValue}\n${theirValue}`.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-xl bg-white p-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-md font-semibold text-neutral-900">Someone else made changes</h2>
            <p className="mt-1 text-sm text-neutral-500">
              {fieldLabel} was changed while you were editing. Choose which version to keep.
            </p>
          </div>
          <button className="text-neutral-400 hover:text-neutral-900" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>

        {merging ? (
          <div className="mt-4">
            <span className="mb-1 block text-sm font-medium text-neutral-700">Merge both versions</span>
            <textarea
              className="min-h-40 w-full rounded border border-neutral-300 p-3 text-base"
              value={merged}
              onChange={(event) => setMerged(event.target.value)}
            />
            <div className="mt-3 flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setMerging(false)}>
                Back
              </Button>
              <Button onClick={() => onMerge(merged)}>Save merged version</Button>
            </div>
          </div>
        ) : (
          <>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div className="rounded-lg border border-brand-200 bg-brand-50 p-3">
                <p className="text-sm font-semibold text-neutral-900">Your version</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{yourValue || "(empty)"}</p>
              </div>
              <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-3">
                <p className="font-mono text-sm font-semibold text-neutral-900">{savedByLabel}</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-700">{theirValue || "(empty)"}</p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <Button variant="ghost" onClick={onKeepTheirs}>
                Keep their version
              </Button>
              <Button variant="secondary" onClick={() => setMerging(true)}>
                Edit manually
              </Button>
              <Button onClick={onUseMine}>Use my version</Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
