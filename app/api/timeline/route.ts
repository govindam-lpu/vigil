import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { HydratedTimelineEvent, TimelineEvent } from "@/lib/types";

const timelineUpdateSchema = z.object({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  title: z.string().min(1).optional(),
  body: z.string().nullable().optional(),
  archive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const eventGroup = request.nextUrl.searchParams.get("type") ?? "all";
  const authorId = request.nextUrl.searchParams.get("authorId");
  const linkedObjectId = request.nextUrl.searchParams.get("linkedObjectId");
  const from = request.nextUrl.searchParams.get("from");
  const to = request.nextUrl.searchParams.get("to");
  const offset = Number(request.nextUrl.searchParams.get("offset") ?? "0");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) return context;
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });

  try {
    const supabase = createClient();
    let query = supabase
      .from("timeline_events")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .order("occurred_at", { ascending: false })
      .range(offset, offset + 24);

    if (authorId) query = query.eq("author_id", authorId);
    if (linkedObjectId) query = query.eq("linked_object_id", linkedObjectId);
    if (from) query = query.gte("occurred_at", `${from}T00:00:00`);
    if (to) query = query.lte("occurred_at", `${to}T23:59:59`);
    if (eventGroup !== "all") {
      const eventTypes = eventTypesForGroup(eventGroup);
      if (eventTypes.length > 0) query = query.in("event_type", eventTypes);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const events = (data ?? []) as TimelineEvent[];
    const profiles = await getProfilesById(events.map((event) => event.author_id).filter((id): id is string => !!id));
    const titles = await getLinkedTitles(events);
    const hydrated: HydratedTimelineEvent[] = events.map((event) => ({
      ...event,
      author: event.author_id ? profiles.get(event.author_id) ?? null : null,
      linked_title: event.linked_object_id ? titles.get(event.linked_object_id) ?? null : null
    }));

    return NextResponse.json({ events: hydrated, hasMore: events.length === 25 });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = timelineUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid timeline payload" }, { status: 400 });

  const context = await getRequestContext(parsed.data.careCircleId, "caregiver");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    const { data: existing, error: existingError } = await supabase
      .from("timeline_events")
      .select("*")
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .maybeSingle();

    if (existingError || !existing) return NextResponse.json({ error: "Timeline event not found" }, { status: 404 });

    const event = existing as TimelineEvent;
    if (event.deleted_at) {
      return NextResponse.json({ error: "Timeline event not found" }, { status: 404 });
    }
    if (!event.is_editable || event.author_id !== context.userId) {
      return NextResponse.json({ error: "Only editable entries authored by you can be changed." }, { status: 403 });
    }

    // Soft-delete only: set deleted_at and leave is_editable untouched so the
    // author-editable RLS WITH CHECK still passes.
    const updatePayload: Partial<TimelineEvent> = {};
    if (parsed.data.archive) {
      updatePayload.deleted_at = new Date().toISOString();
    } else {
      if (parsed.data.title !== undefined) updatePayload.title = parsed.data.title;
      if (parsed.data.body !== undefined) updatePayload.body = parsed.data.body;
    }

    const { data, error } = await supabase
      .from("timeline_events")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    return NextResponse.json({ event: data as TimelineEvent });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function eventTypesForGroup(group: string): string[] {
  if (group === "updates") return ["user_entry"];
  if (group === "tasks") return ["task_completed", "task_missed"];
  if (group === "appointments") return ["appointment_created", "appointment_completed"];
  if (group === "documents") return ["document_uploaded"];
  if (group === "notes") return ["note_created"];
  if (group === "system") return ["system", "member_joined"];
  return [];
}

async function getLinkedTitles(events: TimelineEvent[]): Promise<Map<string, string>> {
  const supabase = createClient();
  const titles = new Map<string, string>();
  const byType = new Map<string, string[]>();

  for (const event of events) {
    if (event.linked_object_type && event.linked_object_id) {
      const existing = byType.get(event.linked_object_type) ?? [];
      existing.push(event.linked_object_id);
      byType.set(event.linked_object_type, existing);
    }
  }

  const tableByType: Record<string, string> = {
    task: "tasks",
    appointment: "appointments",
    document: "documents"
  };

  for (const [type, ids] of Array.from(byType.entries())) {
    const tableName = tableByType[type];
    if (!tableName) continue;
    const { data } = await supabase.from(tableName).select("id,title").in("id", ids);
    const rows = (data ?? []) as Array<{ id: string; title: string }>;
    for (const row of rows) {
      titles.set(row.id, row.title);
    }
  }

  return titles;
}
