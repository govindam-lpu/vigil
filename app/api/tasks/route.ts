import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { createClient } from "@/lib/supabase/server";
import type { HydratedTask, Task, TaskComment, TaskPriority, TaskStatus, UserProfile } from "@/lib/types";

const taskCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  title: z.string().min(1),
  description: z.string().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal")
});

const taskUpdateSchema = z.object({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  dueDate: z.string().nullable().optional(),
  dueTime: z.string().nullable().optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  status: z.enum(["open", "in_progress", "done", "missed", "cancelled"]).optional(),
  archive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tasks")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .order("due_date", { ascending: true, nullsFirst: false })
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    const tasks = (data ?? []) as Task[];
    const taskIds = tasks.map((task) => task.id);
    const profileIds = tasks.flatMap((task) => [task.assignee_id, task.assigned_by]).filter((id): id is string => !!id);
    const [profiles, comments] = await Promise.all([getProfilesById(profileIds), getTaskComments(taskIds)]);

    const hydrated: HydratedTask[] = tasks.map((task) => ({
      ...task,
      assignee: task.assignee_id ? profiles.get(task.assignee_id) ?? null : null,
      assignedByProfile: task.assigned_by ? profiles.get(task.assigned_by) ?? null : null,
      comments: comments.get(task.id) ?? []
    }));

    return NextResponse.json({ tasks: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = taskCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid task payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("tasks")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        assignee_id: parsed.data.assigneeId ?? null,
        assigned_by: context.userId,
        due_date: parsed.data.dueDate ?? null,
        due_time: parsed.data.dueTime ?? null,
        priority: parsed.data.priority,
        status: "open",
        recurrence: null,
        linked_object_type: null,
        linked_object_id: null,
        tags: null,
        completed_at: null,
        completed_by: null,
        missed_at: null,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const task = data as Task;
    await createAuditLog({
      careCircleId: task.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "task",
      objectId: task.id,
      diff: { title: task.title, assignee_id: task.assignee_id, due_date: task.due_date }
    });

    await maybeCreateTaskReminder(task);
    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = taskUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid task update payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "contributor");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<Task> = {};

    if (parsed.data.title !== undefined) updatePayload.title = parsed.data.title;
    if (parsed.data.description !== undefined) updatePayload.description = parsed.data.description;
    if (parsed.data.assigneeId !== undefined) updatePayload.assignee_id = parsed.data.assigneeId;
    if (parsed.data.dueDate !== undefined) updatePayload.due_date = parsed.data.dueDate;
    if (parsed.data.dueTime !== undefined) updatePayload.due_time = parsed.data.dueTime;
    if (parsed.data.priority !== undefined) updatePayload.priority = parsed.data.priority as TaskPriority;
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    if (parsed.data.status !== undefined) {
      updatePayload.status = parsed.data.status as TaskStatus;
      if (parsed.data.status === "done") {
        updatePayload.completed_at = new Date().toISOString();
        updatePayload.completed_by = context.userId;
      }
      if (parsed.data.status === "missed") {
        updatePayload.missed_at = new Date().toISOString();
      }
      if (parsed.data.status === "open") {
        updatePayload.completed_at = null;
        updatePayload.completed_by = null;
        updatePayload.missed_at = null;
      }
    }

    const { data, error } = await supabase
      .from("tasks")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const task = data as Task;
    await createAuditLog({
      careCircleId: task.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "task",
      objectId: task.id,
      diff: updatePayload
    });

    if (parsed.data.status === "done") {
      await createTimelineEvent({
        careCircleId: task.care_circle_id,
        personId: task.person_id,
        eventType: "task_completed",
        title: `Task completed: ${task.title}`,
        body: task.description,
        authorId: context.userId,
        linkedObjectType: "task",
        linkedObjectId: task.id
      });
    }

    if (parsed.data.status === "missed") {
      await createTimelineEvent({
        careCircleId: task.care_circle_id,
        personId: task.person_id,
        eventType: "task_missed",
        title: `Task missed: ${task.title}`,
        body: task.description,
        authorId: context.userId,
        linkedObjectType: "task",
        linkedObjectId: task.id
      });
    }

    return NextResponse.json({ task });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function maybeCreateTaskReminder(task: Task) {
  if (!task.due_date || !task.assignee_id) {
    return;
  }

  const scheduledAt = new Date(`${task.due_date}T09:00:00`);
  scheduledAt.setDate(scheduledAt.getDate() - 1);
  const supabase = createClient();
  const { error } = await supabase.from("reminders").insert({
    care_circle_id: task.care_circle_id,
    person_id: task.person_id,
    linked_object_type: "task",
    linked_object_id: task.id,
    reminder_type: "task_due",
    scheduled_at: scheduledAt.toISOString(),
    message: `Task due: ${task.title}`,
    recipient_ids: [task.assignee_id],
    repeat_rule: null,
    acknowledgements: {},
    status: "pending",
    snooze_count: 0,
    snooze_until: null
  });

  if (error) {
    throw new Error(error.message);
  }
}

async function getTaskComments(taskIds: string[]) {
  if (taskIds.length === 0) {
    return new Map<string, Array<TaskComment & { author: UserProfile | null }>>();
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("task_comments")
    .select("*")
    .in("task_id", taskIds)
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const comments = (data ?? []) as TaskComment[];
  const profiles = await getProfilesById(comments.map((comment) => comment.author_id));
  const commentsByTask = new Map<string, Array<TaskComment & { author: UserProfile | null }>>();

  for (const comment of comments) {
    const existing = commentsByTask.get(comment.task_id) ?? [];
    existing.push({ ...comment, author: profiles.get(comment.author_id) ?? null });
    commentsByTask.set(comment.task_id, existing);
  }

  return commentsByTask;
}
