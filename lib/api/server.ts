import { NextResponse } from "next/server";
import { checkMembership } from "@/lib/permissions/checkMembership";
import { createClient } from "@/lib/supabase/server";
import type { Membership, Role } from "@/lib/types";

export type AuthenticatedRequestContext = {
  userId: string;
  membership: Membership;
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
