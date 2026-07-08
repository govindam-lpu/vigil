import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import {
  getEffectiveCapabilitiesForMembership,
  getErrorMessage,
  getRequestContext
} from "@/lib/api/server";
import {
  isCapability,
  getRoleCapabilities,
  resolveEffectiveCapabilities,
  type Capability
} from "@/lib/permissions/capabilities";
import { createClient } from "@/lib/supabase/server";
import type { Membership, MembershipPermissionOverride } from "@/lib/types";

async function loadTargetMembership(
  membershipId: string,
  careCircleId: string
): Promise<Membership | null> {
  const supabase = createClient();
  const { data } = await supabase
    .from("memberships")
    .select("*")
    .eq("id", membershipId)
    .eq("care_circle_id", careCircleId)
    .maybeSingle();

  return data ?? null;
}

async function loadOverrides(membershipId: string): Promise<MembershipPermissionOverride[]> {
  const supabase = createClient();
  const { data } = await supabase
    .from("membership_permission_overrides")
    .select("*")
    .eq("membership_id", membershipId)
    .order("capability", { ascending: true });

  return data ?? [];
}

// GET /api/memberships/permissions?careCircleId=&membershipId=
// Owner/coordinator only. Returns the target's role defaults, current overrides,
// resolved effective capabilities, and the acting user's own grantable capabilities.
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const membershipId = request.nextUrl.searchParams.get("membershipId");

  const context = await getRequestContext(careCircleId, "coordinator");
  if (context instanceof NextResponse) {
    return context;
  }

  if (!membershipId) {
    return NextResponse.json({ error: "membershipId is required" }, { status: 400 });
  }

  const target = await loadTargetMembership(membershipId, careCircleId as string);
  if (!target) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  const overrides = await loadOverrides(membershipId);
  const effective = resolveEffectiveCapabilities(target.role, overrides);
  const granterCapabilities = await getEffectiveCapabilitiesForMembership(context.membership);

  return NextResponse.json({
    membership: target,
    roleCapabilities: getRoleCapabilities(target.role),
    overrides,
    effectiveCapabilities: Array.from(effective),
    granter: {
      role: context.membership.role,
      capabilities: Array.from(granterCapabilities)
    }
  });
}

const putSchema = z.object({
  careCircleId: z.string().uuid(),
  membershipId: z.string().uuid(),
  capability: z.string(),
  granted: z.boolean()
});

// PUT /api/memberships/permissions
// Owner/coordinator only. Upserts a single capability override. Enforces
// "grant only up to your own level" and refuses to edit an owner membership.
export async function PUT(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const parsed = putSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request", details: parsed.error.flatten() }, { status: 400 });
  }

  const { careCircleId, membershipId, capability, granted } = parsed.data;

  if (!isCapability(capability)) {
    return NextResponse.json({ error: "Unknown capability" }, { status: 400 });
  }
  const typedCapability: Capability = capability;

  const context = await getRequestContext(careCircleId, "coordinator");
  if (context instanceof NextResponse) {
    return context;
  }

  const target = await loadTargetMembership(membershipId, careCircleId);
  if (!target) {
    return NextResponse.json({ error: "Membership not found" }, { status: 404 });
  }

  if (target.role === "owner") {
    return NextResponse.json(
      { error: "Owner permissions cannot be overridden." },
      { status: 400 }
    );
  }

  // Grant only up to your own level: the acting member must themselves hold a
  // capability in order to grant it to someone else.
  if (granted) {
    const granterCapabilities = await getEffectiveCapabilitiesForMembership(context.membership);
    if (!granterCapabilities.has(typedCapability)) {
      return NextResponse.json(
        { error: "You can only grant permissions you hold yourself." },
        { status: 403 }
      );
    }
  }

  const supabase = createClient();
  const { data: upserted, error } = await supabase
    .from("membership_permission_overrides")
    .upsert(
      { membership_id: membershipId, capability: typedCapability, granted },
      { onConflict: "membership_id,capability" }
    )
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    await createAuditLog({
      careCircleId,
      actorId: context.userId,
      actionType: "permission_changed",
      objectType: "membership",
      objectId: membershipId,
      diff: { capability: typedCapability, granted }
    });
  } catch (auditError) {
    return NextResponse.json({ error: getErrorMessage(auditError) }, { status: 500 });
  }

  const overrides = await loadOverrides(membershipId);
  const effective = resolveEffectiveCapabilities(target.role, overrides);

  return NextResponse.json({
    override: upserted,
    overrides,
    effectiveCapabilities: Array.from(effective)
  });
}
