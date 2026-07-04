import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { EscalationRule } from "@/lib/types";

const triggerTypeEnum = z.enum(["task_missed", "reminder_unacknowledged", "checkin_skipped", "custom"]);
const actionEnum = z.enum(["notify_role", "notify_user", "notify_emergency_contact"]);
const roleEnum = z.enum(["owner", "coordinator", "contributor", "caregiver", "viewer", "emergency"]);

const ruleCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  triggerType: triggerTypeEnum,
  triggerObjectId: z.string().uuid().nullable().optional(),
  triggerCondition: z.record(z.number()).nullable().optional(),
  action: actionEnum,
  targetIds: z.array(z.string().uuid()).nullable().optional(),
  targetRole: roleEnum.nullable().optional(),
  message: z.string().nullable().optional(),
  isActive: z.boolean().optional()
});

const ruleUpdateSchema = ruleCreateSchema.partial().extend({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  archive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "coordinator");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("escalation_rules")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(error.message);
    }

    return NextResponse.json({ rules: (data ?? []) as EscalationRule[] });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = ruleCreateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid escalation rule payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "coordinator");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("escalation_rules")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        trigger_type: parsed.data.triggerType,
        trigger_object_id: parsed.data.triggerObjectId ?? null,
        trigger_condition: parsed.data.triggerCondition ?? null,
        action: parsed.data.action,
        target_ids: parsed.data.targetIds ?? null,
        target_role: parsed.data.targetRole ?? null,
        message: parsed.data.message ?? null,
        is_active: parsed.data.isActive ?? true,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const rule = data as EscalationRule;
    await createAuditLog({
      careCircleId: rule.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "escalation_rule",
      objectId: rule.id,
      diff: { trigger_type: rule.trigger_type, action: rule.action }
    });

    return NextResponse.json({ rule });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = ruleUpdateSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid escalation rule update payload" }, { status: 400 });
  }

  const context = await getRequestContext(parsed.data.careCircleId, "coordinator");

  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<EscalationRule> = {};

    if (parsed.data.triggerType !== undefined) updatePayload.trigger_type = parsed.data.triggerType;
    if (parsed.data.triggerObjectId !== undefined) updatePayload.trigger_object_id = parsed.data.triggerObjectId;
    if (parsed.data.triggerCondition !== undefined) updatePayload.trigger_condition = parsed.data.triggerCondition;
    if (parsed.data.action !== undefined) updatePayload.action = parsed.data.action;
    if (parsed.data.targetIds !== undefined) updatePayload.target_ids = parsed.data.targetIds;
    if (parsed.data.targetRole !== undefined) updatePayload.target_role = parsed.data.targetRole;
    if (parsed.data.message !== undefined) updatePayload.message = parsed.data.message;
    if (parsed.data.isActive !== undefined) updatePayload.is_active = parsed.data.isActive;
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("escalation_rules")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .select("*")
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const rule = data as EscalationRule;
    await createAuditLog({
      careCircleId: rule.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "escalation_rule",
      objectId: rule.id,
      diff: updatePayload
    });

    return NextResponse.json({ rule });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
