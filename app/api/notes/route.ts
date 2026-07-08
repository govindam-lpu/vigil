import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getCapabilityContext, getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { roleMeetsMinimum } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/server";
import type { HydratedNote, Note } from "@/lib/types";

const noteCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  content: z.string().min(1),
  isPrivate: z.boolean().default(false),
  linkedObjectType: z.string().nullable().optional(),
  linkedObjectId: z.string().uuid().nullable().optional()
});

const noteUpdateSchema = z.object({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  content: z.string().min(1).optional(),
  isPrivate: z.boolean().optional(),
  pinnedInCrisis: z.boolean().optional(),
  expectedUpdatedAt: z.string().optional(),
  archive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) return context;
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });

  try {
    const supabase = createClient();
    // Private notes are excluded for non-authors (DESIGN.md: only rendered for
    // the author). RLS enforces this too; the explicit filter keeps intent clear.
    const { data, error } = await supabase
      .from("notes")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .or(`is_private.eq.false,author_id.eq.${context.userId}`)
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    const notes = (data ?? []) as Note[];
    const profiles = await getProfilesById(notes.map((note) => note.author_id));
    const hydrated: HydratedNote[] = notes.map((note) => ({
      ...note,
      author: profiles.get(note.author_id) ?? null
    }));

    return NextResponse.json({ notes: hydrated, currentUserId: context.userId, currentRole: context.membership.role });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = noteCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid note payload" }, { status: 400 });

  const context = await getCapabilityContext(parsed.data.careCircleId, "notes.write");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("notes")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        author_id: context.userId,
        content: parsed.data.content,
        is_private: parsed.data.isPrivate,
        linked_object_type: parsed.data.linkedObjectType ?? null,
        linked_object_id: parsed.data.linkedObjectId ?? null,
        pinned_in_crisis: false,
        tags: null,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const note = data as Note;
    await createAuditLog({
      careCircleId: note.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "note",
      objectId: note.id,
      diff: { is_private: note.is_private }
    });
    await createTimelineEvent({
      careCircleId: note.care_circle_id,
      personId: note.person_id,
      eventType: "note_created",
      title: note.is_private ? "Private note added" : "Note added",
      body: note.is_private ? null : note.content,
      authorId: context.userId,
      linkedObjectType: "note",
      linkedObjectId: note.id
    });

    return NextResponse.json({ note });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = noteUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid note update payload" }, { status: 400 });

  const context = await getCapabilityContext(parsed.data.careCircleId, "notes.write");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    const { data: existing, error: existingError } = await supabase
      .from("notes")
      .select("*")
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .maybeSingle();

    if (existingError || !existing) return NextResponse.json({ error: "Note not found" }, { status: 404 });

    const note = existing as Note;
    if (note.author_id !== context.userId && !roleMeetsMinimum(context.membership.role, "coordinator")) {
      return NextResponse.json({ error: "Only the author or a coordinator can update this note." }, { status: 403 });
    }

    if (parsed.data.pinnedInCrisis !== undefined && !roleMeetsMinimum(context.membership.role, "coordinator")) {
      return NextResponse.json({ error: "Only coordinators can pin notes to crisis." }, { status: 403 });
    }

    // Optimistic-lock conflict detection on content edits (DESIGN: conflict resolution).
    if (parsed.data.expectedUpdatedAt && parsed.data.content !== undefined && note.updated_at !== parsed.data.expectedUpdatedAt) {
      return NextResponse.json({ conflict: true, current: note }, { status: 409 });
    }

    const updatePayload: Partial<Note> = {};
    if (parsed.data.content !== undefined) updatePayload.content = parsed.data.content;
    if (parsed.data.isPrivate !== undefined) updatePayload.is_private = parsed.data.isPrivate;
    if (parsed.data.pinnedInCrisis !== undefined) updatePayload.pinned_in_crisis = parsed.data.pinnedInCrisis;
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("notes")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const updatedNote = data as Note;
    await createAuditLog({
      careCircleId: updatedNote.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "note",
      objectId: updatedNote.id,
      diff: updatePayload
    });

    return NextResponse.json({ note: updatedNote });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
