import { NextResponse, type NextRequest } from "next/server";
import { getRequestContext } from "@/lib/api/server";

// GET /api/integrations/calendar/google/connect?careCircleId= — start the Google OAuth
// consent flow (calendar.readonly). Requires GOOGLE_CLIENT_ID + GOOGLE_REDIRECT_URI.
// Authored but not verifiable in-repo (needs a Google Cloud OAuth client + hosted
// redirect URI).
export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "emergency");
  if (context instanceof NextResponse) {
    return context;
  }

  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Google Calendar integration is not configured." }, { status: 501 });
  }

  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "https://www.googleapis.com/auth/calendar.readonly");
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", careCircleId as string);

  return NextResponse.redirect(url.toString());
}
