"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import { useCrisisMode } from "@/components/shell/crisis-mode-provider";
import type { MemberSummary, Task } from "@/lib/types";

type PendingTask = Task & { assigneeName: string | null };

// Deactivation flow (Phase 4 spec): summary step, then a continuity checklist of
// open tasks created during the crisis session (inline reassign), then the write.
export function DeactivateCrisisModal({ onClose }: { onClose: () => void }) {
  const { activeCircle } = useActiveCircle();
  const { refresh } = useCrisisMode();
  const careCircleId = activeCircle?.careCircle.id ?? null;
  const personId = activeCircle?.person?.id ?? null;

  const [step, setStep] = useState<"summary" | "checklist">("summary");
  const [summary, setSummary] = useState("");
  const [tasks, setTasks] = useState<PendingTask[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!careCircleId) return;
    let cancelled = false;

    const load = async () => {
      const [tasksResponse, membersResponse] = await Promise.all([
        fetch(`/api/crisis/pending-tasks?careCircleId=${careCircleId}`),
        fetch(`/api/memberships?careCircleId=${careCircleId}`)
      ]);
      const tasksJson = (await tasksResponse.json().catch(() => ({}))) as { tasks?: PendingTask[] };
      const membersJson = (await membersResponse.json().catch(() => ({}))) as { members?: MemberSummary[] };
      if (cancelled) return;
      setTasks(tasksJson.tasks ?? []);
      setMembers(membersJson.members ?? []);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [careCircleId]);

  const reassign = async (task: PendingTask, assigneeId: string) => {
    if (!careCircleId) return;
    const previous = tasks;
    const nextAssigneeName = members.find((member) => member.membership.user_id === assigneeId)?.profile?.display_name ?? null;
    setTasks((current) =>
      current.map((item) =>
        item.id === task.id ? { ...item, assignee_id: assigneeId || null, assigneeName: nextAssigneeName } : item
      )
    );

    const response = await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: task.id,
        careCircleId,
        personId: task.person_id,
        assigneeId: assigneeId || null
      })
    });

    if (!response.ok) {
      setTasks(previous);
      setError("We couldn't reassign that task. Please try again.");
    }
  };

  const deactivate = async () => {
    if (!careCircleId) return;
    setSaving(true);
    setError(null);
    const response = await fetch("/api/crisis/deactivate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, summary: summary.trim() || undefined })
    });

    if (response.ok) {
      await refresh();
      onClose();
      return;
    }

    setSaving(false);
    const json = (await response.json().catch(() => ({}))) as { error?: string };
    setError(json.error ?? "We couldn't end crisis mode. Please try again.");
  };

  const proceedFromSummary = () => {
    if (tasks.length > 0) {
      setStep("checklist");
    } else {
      void deactivate();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">End Crisis Mode</h2>

        {step === "summary" ? (
          <div className="mt-4 space-y-4">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-neutral-700">
                What happened? Add a summary for the care circle record. (optional)
              </span>
              <textarea
                className="min-h-28 w-full rounded border border-neutral-300 p-3 text-base"
                placeholder="Brief summary of what happened, what changed, and what's pending."
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>

            {tasks.length > 0 ? (
              <p className="text-sm text-neutral-500">
                {tasks.length} open task{tasks.length === 1 ? "" : "s"} {tasks.length === 1 ? "was" : "were"} created
                during this crisis — you&apos;ll review {tasks.length === 1 ? "it" : "them"} next.
              </p>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={proceedFromSummary} disabled={saving}>
                {tasks.length > 0 ? "Continue" : saving ? "Ending…" : "End Crisis Mode"}
              </Button>
            </div>
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-neutral-600">
              Before you close crisis mode, here {tasks.length === 1 ? "is" : "are"} {tasks.length} open task
              {tasks.length === 1 ? "" : "s"} created during this period:
            </p>

            <div className="space-y-3">
              {tasks.map((task) => (
                <div key={task.id} className="rounded-lg border border-neutral-200 p-3">
                  <p className="text-sm font-semibold text-neutral-900">{task.title}</p>
                  <p className="mt-1 text-xs text-neutral-500">
                    Due <span className="font-mono">{task.due_date ?? "—"}</span> · {task.assigneeName ?? "Unassigned"}
                  </p>
                  <label className="mt-2 block">
                    <span className="mb-1 block text-xs font-medium text-neutral-500">Reassign</span>
                    <select
                      className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm"
                      value={task.assignee_id ?? ""}
                      onChange={(event) => void reassign(task, event.target.value)}
                    >
                      <option value="">Unassigned</option>
                      {members.map((member) => (
                        <option key={member.membership.user_id} value={member.membership.user_id}>
                          {member.profile?.display_name ?? "Unknown member"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
              ))}
            </div>

            {error ? <p className="text-sm text-red-600">{error}</p> : null}

            <div className="flex justify-between gap-2">
              <Button variant="ghost" onClick={() => setStep("summary")} disabled={saving}>
                Back
              </Button>
              <Button className="bg-red-600 hover:bg-red-700" onClick={() => void deactivate()} disabled={saving}>
                {saving ? "Ending…" : "All looks good — end crisis mode"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
