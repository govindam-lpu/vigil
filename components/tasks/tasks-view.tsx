"use client";

import type { ReactNode } from "react";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { CheckSquare, Plus } from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LoadError } from "@/components/ui/load-error";
import { ConflictModal } from "@/components/ui/conflict-modal";
import { useActiveCircle } from "@/components/shell/active-circle-provider";
import type { HydratedTask, MemberSummary, Task, TaskPriority, TaskStatus } from "@/lib/types";
import { cn, formatDateTime, formatRelativeDueDate } from "@/lib/utils";

type RecurrenceFrequency = "daily" | "weekly" | "every_n_days" | "monthly";
type RecurrenceValue = { frequency: RecurrenceFrequency; interval: number } | null;

type TaskFilter = "all" | "mine" | "overdue" | "unassigned" | "week";
type TaskSort = "due" | "priority" | "assignee";

const priorityVariant: Record<TaskPriority, "neutral" | "yellow" | "red"> = {
  low: "neutral",
  normal: "neutral",
  high: "yellow",
  urgent: "red"
};

const statusVariant: Record<TaskStatus, "neutral" | "yellow" | "green" | "red"> = {
  open: "neutral",
  in_progress: "yellow",
  done: "green",
  missed: "red",
  cancelled: "neutral"
};

export function TasksView() {
  return (
    <Suspense fallback={<div className="p-6">Loading tasks…</div>}>
      <TasksContent />
    </Suspense>
  );
}

function TasksContent() {
  const { activeCircle } = useActiveCircle();
  const searchParams = useSearchParams();
  const taskParam = searchParams.get("task");
  const [tasks, setTasks] = useState<HydratedTask[]>([]);
  const [members, setMembers] = useState<MemberSummary[]>([]);
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [sort, setSort] = useState<TaskSort>("due");
  const [selectedId, setSelectedId] = useState<string | null>(taskParam);
  const [modalOpen, setModalOpen] = useState(false);
  const [toast, setToast] = useState<{ task: HydratedTask; timeoutId: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selected = tasks.find((task) => task.id === selectedId) ?? tasks[0] ?? null;

  const load = async (isCancelled?: () => boolean) => {
    if (!activeCircle?.person) return;
    try {
      setError(null);
      const [taskResponse, memberResponse] = await Promise.all([
        fetch(`/api/tasks?careCircleId=${activeCircle.careCircle.id}&personId=${activeCircle.person.id}`),
        fetch(`/api/memberships?careCircleId=${activeCircle.careCircle.id}`)
      ]);
      if (!taskResponse.ok || !memberResponse.ok) throw new Error("Request failed");
      const taskJson = (await taskResponse.json()) as { tasks?: HydratedTask[] };
      const memberJson = (await memberResponse.json()) as { members?: MemberSummary[] };
      if (isCancelled?.()) return;
      setTasks(taskJson.tasks ?? []);
      setMembers(memberJson.members ?? []);
    } catch {
      if (isCancelled?.()) return;
      setError("We couldn't load tasks. Check your connection and try again.");
    }
  };

  useEffect(() => {
    let cancelled = false;
    void load(() => cancelled);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeCircle?.careCircle.id, activeCircle?.person?.id]);

  useEffect(() => {
    if (taskParam) setSelectedId(taskParam);
  }, [taskParam]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === "t" && !event.metaKey && !event.ctrlKey && !event.altKey) {
        const target = event.target as HTMLElement | null;
        if (target?.tagName !== "INPUT" && target?.tagName !== "TEXTAREA" && target?.tagName !== "SELECT") {
          setModalOpen(true);
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const visibleTasks = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    const week = new Date(now);
    week.setDate(week.getDate() + 7);
    const currentUserId = activeCircle?.membership.user_id;

    return [...tasks]
      .filter((task) => {
        const due = task.due_date ? new Date(`${task.due_date}T00:00:00`) : null;
        if (filter === "mine") return task.assignee_id === currentUserId;
        if (filter === "overdue") return !!due && due < now && task.status !== "done";
        if (filter === "unassigned") return !task.assignee_id;
        if (filter === "week") return !!due && due <= week && due >= now;
        return true;
      })
      .sort((a, b) => {
        if (sort === "priority") return priorityWeight(b.priority) - priorityWeight(a.priority);
        if (sort === "assignee") return (a.assignee?.display_name ?? "zz").localeCompare(b.assignee?.display_name ?? "zz");
        return (a.due_date ?? "9999-12-31").localeCompare(b.due_date ?? "9999-12-31");
      });
  }, [activeCircle?.membership.user_id, filter, sort, tasks]);

  const updateTask = async (payload: Partial<HydratedTask> & { id: string }) => {
    if (!activeCircle?.person) return;
    await fetch("/api/tasks", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: payload.id,
        careCircleId: activeCircle.careCircle.id,
        personId: activeCircle.person.id,
        title: payload.title,
        description: payload.description,
        assigneeId: payload.assignee_id,
        dueDate: payload.due_date,
        priority: payload.priority,
        status: payload.status,
        recurrence: payload.recurrence,
        archive: payload.deleted_at !== undefined
      })
    });
    await load();
  };

  const markCompleteWithUndo = async (task: HydratedTask) => {
    await updateTask({ id: task.id, status: "done" });
    const timeoutId = window.setTimeout(() => setToast(null), 5000);
    setToast({ task, timeoutId });
  };

  const undoComplete = async () => {
    if (!toast) return;
    window.clearTimeout(toast.timeoutId);
    await updateTask({ id: toast.task.id, status: "open" });
    setToast(null);
  };

  if (!activeCircle?.person) return null;

  return (
    <div className="mx-auto max-w-[1280px] p-6">
      <div className="sticky top-14 z-20 -mx-2 flex items-center justify-between border-b border-neutral-200 bg-neutral-50 px-2 py-3">
        <div>
          <h1 className="text-lg font-semibold text-neutral-900">Tasks</h1>
          <p className="text-sm text-neutral-500">Track ownership, due dates, and completion.</p>
        </div>
        <Button onClick={() => setModalOpen(true)}>
          <Plus className="h-4 w-4" aria-hidden="true" />
          Add Task
        </Button>
      </div>

      {error ? (
        <div className="mt-5">
          <LoadError message={error} onRetry={() => void load()} />
        </div>
      ) : null}

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 rounded-lg border border-neutral-200 bg-white">
          <div className="flex flex-wrap items-center gap-2 border-b border-neutral-200 p-3">
            {(["all", "mine", "overdue", "unassigned", "week"] as TaskFilter[]).map((item) => (
              <button
                key={item}
                className={cn(
                  "h-8 rounded-full border px-3 text-sm font-medium",
                  filter === item ? "border-blue-600 bg-blue-50 text-blue-600" : "border-neutral-200 text-neutral-600 hover:bg-neutral-100"
                )}
                onClick={() => setFilter(item)}
              >
                {filterLabel(item)}
              </button>
            ))}
            <div className="ml-auto flex items-center gap-2">
              <Label htmlFor="task-sort" className="text-xs text-neutral-500">
                Sort
              </Label>
              <select
                id="task-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as TaskSort)}
                className="h-8 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
              >
                <option value="due">Due date</option>
                <option value="priority">Priority</option>
                <option value="assignee">Assignee</option>
              </select>
            </div>
          </div>

          {visibleTasks.length === 0 ? (
            <div className="flex items-start gap-3 p-5 text-neutral-600">
              <CheckSquare className="mt-1 h-5 w-5 text-neutral-400" aria-hidden="true" />
              <p>No tasks yet. Tasks make it clear who is responsible for what and when.</p>
            </div>
          ) : (
            visibleTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selected?.id === task.id}
                onSelect={() => setSelectedId(task.id)}
                onComplete={() => markCompleteWithUndo(task)}
                onUpdate={updateTask}
              />
            ))
          )}
        </section>

        <TaskDetail task={selected} members={members} onUpdate={updateTask} onReload={load} />
      </div>

      {modalOpen ? (
        <TaskModal
          careCircleId={activeCircle.careCircle.id}
          personId={activeCircle.person.id}
          members={members}
          onClose={() => setModalOpen(false)}
          onSaved={async () => {
            setModalOpen(false);
            await load();
          }}
        />
      ) : null}

      {toast ? (
        <div className="fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 shadow-elevated">
          <span className="text-sm text-neutral-900">Task marked complete.</span>
          <button className="text-sm font-semibold text-blue-600" onClick={undoComplete}>
            Undo
          </button>
        </div>
      ) : null}
    </div>
  );
}

function TaskRow({
  task,
  selected,
  onSelect,
  onComplete,
  onUpdate
}: {
  task: HydratedTask;
  selected: boolean;
  onSelect: () => void;
  onComplete: () => void;
  onUpdate: (payload: Partial<HydratedTask> & { id: string }) => Promise<void>;
}) {
  const due = formatRelativeDueDate(task.due_date);
  const overdue = due.overdue && task.status !== "done";

  return (
    <div
      className={cn(
        "grid cursor-pointer grid-cols-[44px_minmax(180px,1fr)_160px_100px_92px_92px_40px] items-center gap-3 border-b border-neutral-100 px-3 py-2 text-sm hover:bg-neutral-50",
        selected && "bg-blue-50",
        overdue && "border-l-4 border-l-red-600 bg-red-50"
      )}
      onClick={onSelect}
    >
      <button
        aria-label="Mark complete"
        className="flex h-10 w-10 items-center justify-center"
        onClick={(event) => {
          event.stopPropagation();
          onComplete();
        }}
      >
        <span className={cn("h-4 w-4 rounded border border-neutral-400", task.status === "done" && "border-green-600 bg-green-600")} />
      </button>
      <div className={cn("font-semibold text-neutral-900", task.status === "done" && "text-neutral-400 line-through")}>{task.title}</div>
      <button
        className="flex items-center gap-2 rounded-md px-2 py-1 text-left hover:bg-neutral-100"
        onClick={(event) => event.stopPropagation()}
      >
        {task.assignee ? <Avatar name={task.assignee.display_name} src={task.assignee.avatar_url} className="h-6 w-6" /> : null}
        <span className={cn("truncate", !task.assignee && "text-neutral-400")}>{task.assignee?.display_name ?? "Unassigned"}</span>
      </button>
      <span className={cn(due.overdue && task.status !== "done" ? "font-semibold text-red-600" : "text-neutral-600")}>{due.label}</span>
      <Badge variant={priorityVariant[task.priority]}>{labelize(task.priority)}</Badge>
      <Badge variant={statusVariant[task.status]}>{labelize(task.status)}</Badge>
      <select
        aria-label="Task actions"
        className="h-8 w-8 rounded-md border border-neutral-200 bg-white text-neutral-500"
        value=""
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => {
          const value = event.target.value;
          if (value === "complete") void onUpdate({ id: task.id, status: "done" });
          if (value === "missed") void onUpdate({ id: task.id, status: "missed" });
          if (value === "archive") void onUpdate({ id: task.id, deleted_at: new Date().toISOString() });
          event.target.value = "";
        }}
      >
        <option value="">
          ...
        </option>
        <option value="complete">Mark complete</option>
        <option value="missed">Mark missed</option>
        <option value="archive">Archive</option>
      </select>
    </div>
  );
}

function TaskDetail({
  task,
  members,
  onUpdate,
  onReload
}: {
  task: HydratedTask | null;
  members: MemberSummary[];
  onUpdate: (payload: Partial<HydratedTask> & { id: string }) => Promise<void>;
  onReload: () => Promise<void>;
}) {
  const [comment, setComment] = useState("");

  if (!task) {
    return (
      <Card className="hidden h-fit lg:block">
        <p className="text-sm text-neutral-500">Select a task to view details.</p>
      </Card>
    );
  }

  const submitComment = async () => {
    if (!comment.trim()) return;
    await fetch("/api/tasks/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId: task.care_circle_id, taskId: task.id, content: comment })
    });
    setComment("");
    await onReload();
  };

  return (
    <aside className="h-fit rounded-lg border border-neutral-200 bg-white p-4">
      <h2 className="text-md font-semibold text-neutral-900">{task.title}</h2>
      <DescriptionEditor key={task.id} task={task} onReload={onReload} />
      <div className="mt-4 space-y-3">
        <Field label="Assignee">
          <select
            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm"
            value={task.assignee_id ?? ""}
            onChange={(event) => onUpdate({ id: task.id, assignee_id: event.target.value || null })}
          >
            <option value="">Unassigned</option>
            {members.map((member) => (
              <option key={member.membership.user_id} value={member.membership.user_id}>
                {member.profile?.display_name ?? "Unknown member"}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Due date">
          <Input type="date" value={task.due_date ?? ""} onChange={(event) => onUpdate({ id: task.id, due_date: event.target.value || null })} />
        </Field>
        <Field label="Priority">
          <select
            className="h-9 w-full rounded-lg border border-neutral-300 bg-white px-2 text-sm"
            value={task.priority}
            onChange={(event) => onUpdate({ id: task.id, priority: event.target.value as TaskPriority })}
          >
            <option value="low">Low</option>
            <option value="normal">Normal</option>
            <option value="high">High</option>
            <option value="urgent">Urgent</option>
          </select>
        </Field>
        <RecurrenceControl value={parseRecurrence(task.recurrence)} onChange={(value) => onUpdate({ id: task.id, recurrence: value })} />
        <Badge variant={statusVariant[task.status]}>{labelize(task.status)}</Badge>
      </div>
      <div className="mt-5 flex flex-wrap gap-2">
        <Button size="sm" onClick={() => onUpdate({ id: task.id, status: "done" })}>
          Mark Complete
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onUpdate({ id: task.id, due_date: nextWeekDate() })}>
          Extend Due Date
        </Button>
        <Button size="sm" variant="secondary" onClick={() => onUpdate({ id: task.id, deleted_at: new Date().toISOString() })}>
          Archive
        </Button>
      </div>
      <div className="mt-5 border-t border-neutral-200 pt-4">
        <h3 className="text-sm font-semibold text-neutral-900">Comments</h3>
        <div className="mt-3 space-y-3">
          {task.comments.map((item) => (
            <div key={item.id} className="rounded-lg bg-neutral-50 p-3">
              <p className="text-sm font-semibold text-neutral-900">{item.author?.display_name ?? "Unknown member"}</p>
              <p className="mt-1 text-sm text-neutral-600">{item.content}</p>
            </div>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Add a comment" />
          <Button type="button" variant="secondary" onClick={submitComment}>
            Submit
          </Button>
        </div>
      </div>
    </aside>
  );
}

function TaskModal({
  careCircleId,
  personId,
  members,
  onClose,
  onSaved
}: {
  careCircleId: string;
  personId: string;
  members: MemberSummary[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [assigneeId, setAssigneeId] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("normal");
  const [recurrence, setRecurrence] = useState<RecurrenceValue>(null);

  const save = async () => {
    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ careCircleId, personId, title, dueDate: dueDate || null, assigneeId: assigneeId || null, priority, recurrence })
    });
    if (response.ok) await onSaved();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-neutral-900/70 p-4">
      <div className="w-full max-w-lg rounded-lg bg-white p-5">
        <h2 className="text-md font-semibold text-neutral-900">Add Task</h2>
        <div className="mt-4 space-y-4">
          <Field label="Title">
            <Input value={title} onChange={(event) => setTitle(event.target.value)} />
          </Field>
          <Field label="Due date">
            <Input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} />
          </Field>
          <Field label="Assignee">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value="">Unassigned</option>
              {members.map((member) => (
                <option key={member.membership.user_id} value={member.membership.user_id}>
                  {member.profile?.display_name ?? "Unknown member"}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Priority">
            <select className="h-10 w-full rounded-lg border border-neutral-300 bg-white px-3" value={priority} onChange={(event) => setPriority(event.target.value as TaskPriority)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </Field>
          <RecurrenceControl value={recurrence} onChange={setRecurrence} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={save} disabled={!title.trim()}>
            Add details later
          </Button>
          <Button onClick={save} disabled={!title.trim()}>
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-2 block text-sm font-medium text-neutral-700">{label}</span>
      {children}
    </label>
  );
}

function filterLabel(filter: TaskFilter): string {
  const labels: Record<TaskFilter, string> = {
    all: "All",
    mine: "Mine",
    overdue: "Overdue",
    unassigned: "Unassigned",
    week: "Due This Week"
  };
  return labels[filter];
}

function labelize(value: string): string {
  return value.replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function priorityWeight(priority: TaskPriority): number {
  return { low: 0, normal: 1, high: 2, urgent: 3 }[priority];
}

function nextWeekDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().slice(0, 10);
}

function DescriptionEditor({ task, onReload }: { task: HydratedTask; onReload: () => Promise<void> }) {
  const [value, setValue] = useState(task.description ?? "");
  const [conflict, setConflict] = useState<Task | null>(null);

  const save = async (force: boolean, override?: string) => {
    const description = override ?? value;
    const body: { id: string; careCircleId: string; personId: string; description: string; expectedUpdatedAt?: string } = {
      id: task.id,
      careCircleId: task.care_circle_id,
      personId: task.person_id,
      description
    };
    if (!force) body.expectedUpdatedAt = task.updated_at;
    const response = await fetch("/api/tasks", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.status === 409) {
      const json = (await response.json()) as { current?: Task };
      if (json.current) setConflict(json.current);
      return;
    }
    await onReload();
  };

  return (
    <div className="mt-3">
      <span className="mb-1 block text-sm font-medium text-neutral-700">Description</span>
      <textarea
        className="min-h-20 w-full rounded border border-neutral-300 p-2 text-base text-neutral-700"
        value={value}
        placeholder="No description yet."
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => {
          if (value !== (task.description ?? "")) void save(false);
        }}
      />
      {conflict ? (
        <ConflictModal
          fieldLabel="Task description"
          yourValue={value}
          theirValue={conflict.description ?? ""}
          savedByLabel={`Current version (saved ${formatDateTime(conflict.updated_at)})`}
          onKeepTheirs={() => {
            setValue(conflict.description ?? "");
            setConflict(null);
            void onReload();
          }}
          onUseMine={() => {
            void save(true);
            setConflict(null);
          }}
          onMerge={(merged) => {
            setValue(merged);
            void save(true, merged);
            setConflict(null);
          }}
          onClose={() => setConflict(null)}
        />
      ) : null}
    </div>
  );
}

function RecurrenceControl({ value, onChange }: { value: RecurrenceValue; onChange: (value: RecurrenceValue) => void }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-medium text-neutral-700">
        <input
          type="checkbox"
          checked={value !== null}
          onChange={(event) => onChange(event.target.checked ? { frequency: "weekly", interval: 1 } : null)}
        />
        Repeats
      </label>
      {value ? (
        <div className="mt-2 flex items-center gap-2">
          <select
            className="h-9 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
            value={value.frequency}
            onChange={(event) => onChange({ ...value, frequency: event.target.value as RecurrenceFrequency })}
          >
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="every_n_days">Every N days</option>
            <option value="monthly">Monthly</option>
          </select>
          <span className="text-sm text-neutral-500">every</span>
          <input
            type="number"
            min="1"
            className="h-9 w-16 rounded-lg border border-neutral-300 bg-white px-2 text-sm"
            value={value.interval}
            onChange={(event) => onChange({ ...value, interval: Math.max(1, Number(event.target.value) || 1) })}
          />
        </div>
      ) : null}
    </div>
  );
}

function parseRecurrence(value: unknown): RecurrenceValue {
  if (value && typeof value === "object" && "frequency" in value) {
    const record = value as { frequency?: string; interval?: number };
    if (
      record.frequency === "daily" ||
      record.frequency === "weekly" ||
      record.frequency === "every_n_days" ||
      record.frequency === "monthly"
    ) {
      return { frequency: record.frequency, interval: record.interval ?? 1 };
    }
  }
  return null;
}
