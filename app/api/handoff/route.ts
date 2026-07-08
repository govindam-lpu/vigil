import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { roleMeetsMinimum } from "@/lib/permissions/roles";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Note, Role } from "@/lib/types";

const handoffSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  summary: z.string().min(1),
  recipientId: z.string().uuid(),
  until: z.string().nullable().optional(),
  elevateRole: z.boolean().optional()
});

export async function POST(request: NextRequest) {
  const parsed = handoffSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid handoff payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "coordinator");

  if (context instanceof NextResponse) {
    return context;
  }

  const { careCircleId, personId, summary, recipientId, until, elevateRole } = parsed.data;

  if (elevateRole && context.membership.role !== "owner") {
    return NextResponse.json({ error: "Only an owner can elevate a member's role during handoff." }, { status: 403 });
  }

  if (elevateRole && !until) {
    return NextResponse.json({ error: "Set an end date to temporarily elevate the recipient's role." }, { status: 400 });
  }

  try {
    const supabase = createClient();

    const { data: recipientMembership, error: recipientError } = await supabase
      .from("memberships")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("user_id", recipientId)
      .maybeSingle();

    if (recipientError) {
      throw new Error(recipientError.message);
    }

    if (!recipientMembership) {
      return NextResponse.json({ error: "The selected recipient is not a member of this care circle." }, { status: 400 });
    }

    const profiles = await getProfilesById([context.userId, recipientId]);
    const actorName = profiles.get(context.userId)?.display_name ?? "A coordinator";
    const recipientName = profiles.get(recipientId)?.display_name ?? "a member";

    const { data: noteData, error: noteError } = await supabase
      .from("notes")
      .insert({
        care_circle_id: careCircleId,
        person_id: personId,
        author_id: context.userId,
        content: summary,
        is_private: false,
        note_type: "handoff",
        linked_object_type: null,
        linked_object_id: null,
        pinned_in_crisis: false,
        tags: null,
        deleted_at: null
      })
      .select("*")
      .single();

    if (noteError) {
      throw new Error(noteError.message);
    }

    const note = noteData as Note;

    await createAuditLog({
      careCircleId,
      actorId: context.userId,
      actionType: "created",
      objectType: "handoff",
      objectId: note.id,
      diff: { recipient_id: recipientId, until: until ?? null, elevate_role: elevateRole ?? false }
    });

    await createTimelineEvent({
      careCircleId,
      personId,
      eventType: "system",
      title: `Responsibility handed off to ${recipientName} by ${actorName}`,
      body: summary,
      authorId: context.userId,
      linkedObjectType: "note",
      linkedObjectId: note.id
    });

    // Immediate in-app notification for the recipient (the delivery Edge Function fans
    // it out to email/push per their "Handoffs" preference). Replaces the prior queued
    // reminder so the handoff lands immediately and in the correct preference category.
    const { error: notifyError } = await supabase.rpc("create_notification", {
      target_care_circle_id: careCircleId,
      recipient_ids: [recipientId],
      notification_title: `Handoff from ${actorName}`,
      notification_body: summary,
      notification_category: "handoffs",
      notification_type: "handoff",
      action_url: "/timeline"
    });

    if (notifyError) {
      throw new Error(notifyError.message);
    }

    let elevated = false;
    const recipient = recipientMembership as Membership;
    if (elevateRole && until && !roleMeetsMinimum(recipient.role, "coordinator")) {
      const previousRole: Role = recipient.role;
      const { error: elevationError } = await supabase
        .from("memberships")
        .update({
          role: "coordinator",
          original_role: previousRole,
          elevation_expires_at: until
        })
        .eq("care_circle_id", careCircleId)
        .eq("user_id", recipientId);

      if (elevationError) {
        throw new Error(elevationError.message);
      }

      elevated = true;
      await createAuditLog({
        careCircleId,
        actorId: context.userId,
        actionType: "role_changed",
        objectType: "membership",
        objectId: recipient.id,
        diff: { user_id: recipientId, from: previousRole, to: "coordinator", elevation_expires_at: until }
      });
    }

    return NextResponse.json({ note, elevated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
