import { NextResponse } from "next/server";
import { checkMembership } from "@/lib/permissions/checkMembership";
import {
  resolveEffectiveCapabilities,
  type Capability
} from "@/lib/permissions/capabilities";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Role } from "@/lib/types";

export type AuthenticatedRequestContext = {
  userId: string;
  membership: Membership;
};

export type CapabilityRequestContext = AuthenticatedRequestContext & {
  capabilities: Set<Capability>;
};

export async function getAuthenticatedUserId(): Promise<string | NextResponse> {
  const supabase = createClient();
  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return user.id;
}

export async function getRequestContext(
  careCircleId: string | null,
  minimumRole: Role = "emergency"
): Promise<AuthenticatedRequestContext | NextResponse> {
  if (!careCircleId) {
    return NextResponse.json({ error: "careCircleId is required" }, { status: 400 });
  }

  const userId = await getAuthenticatedUserId();

  if (userId instanceof NextResponse) {
    return userId;
  }

  try {
    const membership = await checkMembership(userId, careCircleId, minimumRole);
    return { userId, membership };
  } catch {
    return NextResponse.json({ error: "You do not have access to this care circle." }, { status: 403 });
  }
}

/**
 * Resolve a membership's effective capabilities (role default ± overrides). Runs
 * under the caller's session; RLS lets a user read overrides for their own
 * membership, so this works for the acting member's own enforcement.
 */
export async function getEffectiveCapabilitiesForMembership(
  membership: Membership
): Promise<Set<Capability>> {
  const supabase = createClient();
  const { data } = await supabase
    .from("membership_permission_overrides")
    .select("capability, granted")
    .eq("membership_id", membership.id);

  return resolveEffectiveCapabilities(membership.role, data ?? []);
}

/**
 * Capability-gated route context (Phase 5 — §3). Verifies the caller is a member of
 * the circle, resolves their effective capabilities, and requires `capability`.
 * Drop-in for `getRequestContext` on write routes: returns the same
 * `{ userId, membership }` plus the resolved capability set.
 */
export async function getCapabilityContext(
  careCircleId: string | null,
  capability: Capability
): Promise<CapabilityRequestContext | NextResponse> {
  if (!careCircleId) {
    return NextResponse.json({ error: "careCircleId is required" }, { status: 400 });
  }

  const userId = await getAuthenticatedUserId();

  if (userId instanceof NextResponse) {
    return userId;
  }

  let membership: Membership;
  try {
    membership = await checkMembership(userId, careCircleId, "emergency");
  } catch {
    return NextResponse.json(
      { error: "You do not have access to this care circle." },
      { status: 403 }
    );
  }

  const capabilities = await getEffectiveCapabilitiesForMembership(membership);

  if (!capabilities.has(capability)) {
    return NextResponse.json(
      { error: "You do not have permission to perform this action." },
      { status: 403 }
    );
  }

  return { userId, membership, capabilities };
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") {
      return message;
    }
  }

  return "Unexpected server error";
}
