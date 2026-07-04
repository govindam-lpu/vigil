import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { createClient } from "@/lib/supabase/server";
import type { CheckIn, HydratedCheckIn } from "@/lib/types";

const checkInCreateSchema = z
  .object({
    careCircleId: z.string().uuid(),
    personId: z.string().uuid(),
    status: z.enum(["well", "concerning", "urgent"]),
    notes: z.string().nullable().optional(),
    occurredAt: z.string().nullable().optional()
  })
  .refine((value) => value.status === "well" || !!value.notes?.trim(), {
    message: "Notes are required for concerning and urgent check-ins",
    path: ["notes"]
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
      .from("check_ins")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .order("occurred_at", { ascending: false })
      .limit(50);

    if (error) {
      throw new Error(error.message);
    }

    const checkIns = (data ?? []) as CheckIn[];
    const profiles = await getProfilesById(checkIns.map((checkIn) => checkIn.author_id));
    const hydrated: HydratedCheckIn[] = checkIns.map((checkIn) => ({
      ...checkIn,
      author: profiles.get(checkIn.author_id) ?? null
    }));

    return NextResponse.json({ checkIns: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = checkInCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid check-in payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "caregiver");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("check_ins")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        author_id: context.userId,
        status: parsed.data.status,
        notes: parsed.data.notes ?? null,
        occurred_at: parsed.data.occurredAt ?? new Date().toISOString()
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const checkIn = data as CheckIn;

    await createAuditLog({
      careCircleId: checkIn.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "check_in",
      objectId: checkIn.id,
      diff: { status: checkIn.status }
    });

    await createTimelineEvent({
      careCircleId: checkIn.care_circle_id,
      personId: checkIn.person_id,
      eventType: "check_in",
      title: `Check-in: ${labelize(checkIn.status)}`,
      body: checkIn.notes,
      authorId: context.userId,
      linkedObjectType: "check_in",
      linkedObjectId: checkIn.id
    });

    if (checkIn.status === "urgent") {
      await notifyCoordinatorsOfUrgentCheckIn(checkIn, context.userId);
    }

    return NextResponse.json({ checkIn });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

async function notifyCoordinatorsOfUrgentCheckIn(checkIn: CheckIn, actorId: string) {
  const supabase = createClient();
  const { data: coordinators, error: membershipError } = await supabase
    .from("memberships")
    .select("user_id")
    .eq("care_circle_id", checkIn.care_circle_id)
    .in("role", ["owner", "coordinator"]);

  if (membershipError) {
    throw new Error(membershipError.message);
  }

  const recipientIds = (coordinators ?? []).map((member) => member.user_id);

  if (recipientIds.length === 0) {
    return;
  }

  const profiles = await getProfilesById([actorId]);
  const actorName = profiles.get(actorId)?.display_name ?? "A caregiver";

  const { error } = await supabase.from("reminders").insert({
    care_circle_id: checkIn.care_circle_id,
    person_id: checkIn.person_id,
    linked_object_type: "check_in",
    linked_object_id: checkIn.id,
    reminder_type: "custom",
    scheduled_at: new Date().toISOString(),
    message: `Urgent check-in recorded by ${actorName}: ${checkIn.notes ?? ""}`.trim(),
    recipient_ids: recipientIds,
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

function labelize(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
