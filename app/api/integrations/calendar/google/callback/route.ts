import { NextResponse, type NextRequest } from "next/server";
import { encryptSecret } from "@/lib/ai/crypto";
import { getAuthenticatedUserId } from "@/lib/api/server";
import { checkMembership } from "@/lib/permissions/checkMembership";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

// GET /api/integrations/calendar/google/callback?code=&state= — OAuth redirect target.
// Exchanges the code for tokens, encrypts them (AI_KEY_ENC_SECRET), and stores the
// connection. Authored but not verifiable in-repo (needs Google credentials).
export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  const settingsUrl = new URL("/settings/integrations", request.url);

  const userId = await getAuthenticatedUserId();
  if (userId instanceof NextResponse) {
    return userId;
  }

  if (!code || !state) {
    settingsUrl.searchParams.set("error", "missing_code");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    await checkMembership(userId, state, "emergency");
  } catch {
    settingsUrl.searchParams.set("error", "not_a_member");
    return NextResponse.redirect(settingsUrl);
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) {
    settingsUrl.searchParams.set("error", "not_configured");
    return NextResponse.redirect(settingsUrl);
  }

  try {
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    const tokens = (await tokenResponse.json()) as {
      access_token?: string;
      refresh_token?: string;
      expires_in?: number;
    };

    if (!tokenResponse.ok || !tokens.access_token) {
      settingsUrl.searchParams.set("error", "token_exchange_failed");
      return NextResponse.redirect(settingsUrl);
    }

    const expiresAt = new Date(Date.now() + (tokens.expires_in ?? 3600) * 1000).toISOString();
    const payload: Record<string, string | null> = {
      care_circle_id: state,
      user_id: userId,
      provider: "google",
      encrypted_access_token: encryptSecret(tokens.access_token),
      token_expires_at: expiresAt
    };
    // Google only returns a refresh token on first consent (prompt=consent forces it);
    // never overwrite a stored refresh token with null.
    if (tokens.refresh_token) {
      payload.encrypted_refresh_token = encryptSecret(tokens.refresh_token);
    }

    const supabase = createClient();
    await supabase.from("calendar_connections").upsert(payload, { onConflict: "care_circle_id,user_id,provider" });

    settingsUrl.searchParams.set("connected", "1");
    return NextResponse.redirect(settingsUrl);
  } catch {
    settingsUrl.searchParams.set("error", "callback_failed");
    return NextResponse.redirect(settingsUrl);
  }
}
