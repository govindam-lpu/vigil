import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// Service-role client — this is the ONE place Vigil uses the service role, and it lives only
// in the worker's env, never in the browser. Every write is scoped by the exact document id
// + care_circle_id the job was handed.
let cached: SupabaseClient | null = null;

export function serviceClient(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  }
  cached = createClient(url, key, { auth: { persistSession: false } });
  return cached;
}
