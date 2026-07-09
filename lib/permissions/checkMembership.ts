import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Role } from "@/lib/types";
import { roleMeetsMinimum } from "./roles";

export class ForbiddenResponseError extends Error {
  response: NextResponse;

  constructor(message = "Forbidden") {
    super(message);
    this.name = "ForbiddenResponseError";
    this.response = NextResponse.json({ error: message }, { status: 403 });
  }
}

export async function checkMembership(
  userId: string,
  careCircleId: string,
  minimumRole: Role = "emergency"
): Promise<Membership> {
  const supabase = createClient();

  // Match the DB helpers (is_care_circle_member / has_care_circle_role, hardened in
  // 202607080006): a soft-removed or time-expired membership grants no access, so the
  // route gate must exclude them too — not rely on downstream RLS to fail closed.
  const { data, error } = await supabase
    .from("memberships")
    .select("*")
    .eq("care_circle_id", careCircleId)
    .eq("user_id", userId)
    .is("deleted_at", null)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .maybeSingle();

  if (error || !data || !roleMeetsMinimum(data.role, minimumRole)) {
    throw new ForbiddenResponseError("You do not have access to this care circle.");
  }

  return data;
}

export function forbiddenResponseFrom(error: unknown): NextResponse | null {
  if (error instanceof ForbiddenResponseError) {
    return error.response;
  }

  return null;
}
