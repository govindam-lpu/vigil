import { createHmac, randomBytes, timingSafeEqual } from "crypto";

// Signed, expiring OAuth `state` bound to the initiating user.
//
// The Google Calendar connect flow previously used `state = careCircleId` — a value every
// circle member knows — which provides no CSRF protection: an attacker could forge the
// callback (their own auth `code` + a victim's careCircleId) and get the victim's session
// to link the attacker's calendar. Binding `state` to the initiating user id + a nonce +
// timestamp, signed with a server-only key, makes it unforgeable and single-purpose.
//
// The HMAC key is derived from AI_KEY_ENC_SECRET (server/worker only) via a distinct label
// so it never collides with the envelope-encryption key.

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes to complete consent.

function stateKey(): Buffer {
  const secret = process.env.AI_KEY_ENC_SECRET;
  if (!secret) {
    throw new Error("AI_KEY_ENC_SECRET is not configured");
  }
  return createHmac("sha256", secret).update("vigil-oauth-state-v1").digest();
}

function sign(payload: string): string {
  return createHmac("sha256", stateKey()).update(payload).digest("base64url");
}

export function createOAuthState(careCircleId: string, userId: string): string {
  const body = { c: careCircleId, u: userId, n: randomBytes(9).toString("base64url"), t: Date.now() };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

/**
 * Verify a state token against the authenticated user. Returns the bound careCircleId, or
 * null if the signature is invalid, the state is expired, or it was issued to another user.
 */
export function verifyOAuthState(state: string, userId: string): { careCircleId: string } | null {
  const [payload, sig] = state.split(".");
  if (!payload || !sig) {
    return null;
  }

  const expected = sign(payload);
  const provided = Buffer.from(sig);
  const computed = Buffer.from(expected);
  if (provided.length !== computed.length || !timingSafeEqual(provided, computed)) {
    return null;
  }

  let body: { c?: unknown; u?: unknown; t?: unknown };
  try {
    body = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof body.c !== "string" || typeof body.u !== "string" || typeof body.t !== "number") {
    return null;
  }
  if (body.u !== userId) {
    return null;
  }
  if (Date.now() - body.t > STATE_TTL_MS) {
    return null;
  }

  return { careCircleId: body.c };
}
