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

  const { data, error } = await supabase
    .from("memberships")
    .select("*")
    .eq("care_circle_id", careCircleId)
    .eq("user_id", userId)
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
