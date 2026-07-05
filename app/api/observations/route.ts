import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getProfilesById } from "@/lib/api/records";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { createClient } from "@/lib/supabase/server";
import type { HydratedObservation, Observation } from "@/lib/types";

const observationTypeEnum = z.enum(["symptom", "vital", "behavior", "mood", "other"]);
const severityEnum = z.enum(["mild", "moderate", "severe"]);

const observationCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  observationType: observationTypeEnum.default("symptom"),
  body: z.string().min(1),
  severity: severityEnum.nullable().optional(),
  occurredAt: z.string().nullable().optional(),
  linkedObjectType: z.enum(["medication", "appointment"]).nullable().optional(),
  linkedObjectId: z.string().uuid().nullable().optional()
});

const observationUpdateSchema = z.object({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  observationType: observationTypeEnum.optional(),
  body: z.string().min(1).optional(),
  severity: severityEnum.nullable().optional(),
  occurredAt: z.string().optional(),
  archive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const linkedObjectId = request.nextUrl.searchParams.get("linkedObjectId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  try {
    const supabase = createClient();
    let query = supabase
      .from("observations")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null);

    if (linkedObjectId) {
      query = query.eq("linked_object_id", linkedObjectId);
    }

    const { data, error } = await query.order("occurred_at", { ascending: false }).limit(100);

    if (error) {
      throw new Error(error.message);
    }

    const observations = (data ?? []) as Observation[];
    const profiles = await getProfilesById(observations.map((observation) => observation.author_id));
    const hydrated: HydratedObservation[] = observations.map((observation) => ({
      ...observation,
      author: profiles.get(observation.author_id) ?? null
    }));

    return NextResponse.json({ observations: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = observationCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid observation payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "caregiver");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("observations")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        author_id: context.userId,
        observation_type: parsed.data.observationType,
        body: parsed.data.body,
        severity: parsed.data.severity ?? null,
        occurred_at: parsed.data.occurredAt ?? new Date().toISOString(),
        linked_object_type: parsed.data.linkedObjectType ?? null,
        linked_object_id: parsed.data.linkedObjectId ?? null,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const observation = data as Observation;

    await createAuditLog({
      careCircleId: observation.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "observation",
      objectId: observation.id,
      diff: { observation_type: observation.observation_type, severity: observation.severity }
    });

    await createTimelineEvent({
      careCircleId: observation.care_circle_id,
      personId: observation.person_id,
      eventType: "observation_logged",
      title: `${labelize(observation.observation_type)} logged`,
      body: observation.body,
      authorId: context.userId,
      linkedObjectType: observation.linked_object_type,
      linkedObjectId: observation.linked_object_id
    });

    return NextResponse.json({ observation });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = observationUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid observation update payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "caregiver");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<Observation> = {};

    if (parsed.data.observationType !== undefined) updatePayload.observation_type = parsed.data.observationType;
    if (parsed.data.body !== undefined) updatePayload.body = parsed.data.body;
    if (parsed.data.severity !== undefined) updatePayload.severity = parsed.data.severity;
    if (parsed.data.occurredAt !== undefined) updatePayload.occurred_at = parsed.data.occurredAt;
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("observations")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const observation = data as Observation;
    await createAuditLog({
      careCircleId: observation.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "observation",
      objectId: observation.id,
      diff: updatePayload
    });

    return NextResponse.json({ observation });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

function labelize(value: string): string {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}
