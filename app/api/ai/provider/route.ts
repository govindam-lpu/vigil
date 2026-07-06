import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { encryptSecret, lastFour } from "@/lib/ai/crypto";
import { createClient } from "@/lib/supabase/server";
import type { AiProviderConfig } from "@/lib/types";

function managedAvailable(): boolean {
  return process.env.MANAGED_AI_ENABLED === "true";
}

// The client never receives the ciphertext or the key — only provider + last-4 + flags.
function publicConfig(row: AiProviderConfig | null) {
  return {
    provider: row?.provider ?? null,
    keyLast4: row?.key_last4 ?? null,
    hasKey: Boolean(row?.encrypted_key),
    geminiFreeTierAck: row?.gemini_free_tier_ack ?? false,
    modelOverrides: row?.model_overrides ?? null,
    managedAvailable: managedAvailable()
  };
}

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "coordinator");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("ai_provider_configs")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return NextResponse.json({ config: publicConfig((data as AiProviderConfig | null) ?? null) });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

const putSchema = z.object({
  careCircleId: z.string().uuid(),
  provider: z.enum(["anthropic", "gemini", "managed"]),
  apiKey: z.string().min(8).optional(),
  geminiFreeTierAck: z.boolean().optional(),
  modelOverrides: z.record(z.string()).nullable().optional()
});

export async function PUT(request: NextRequest) {
  const parsed = putSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid AI provider payload" }, { status: 400 });

  const { careCircleId, provider, apiKey, geminiFreeTierAck, modelOverrides } = parsed.data;
  const context = await getRequestContext(careCircleId, "coordinator");
  if (context instanceof NextResponse) return context;

  if (provider === "managed" && !managedAvailable()) {
    return NextResponse.json({ error: "Managed AI is not available for this care circle." }, { status: 400 });
  }
  if (provider === "gemini" && !geminiFreeTierAck) {
    return NextResponse.json(
      { error: "Please acknowledge the Gemini free-tier data-use notice before enabling Gemini." },
      { status: 400 }
    );
  }

  try {
    const supabase = createClient();
    const { data: existing } = await supabase
      .from("ai_provider_configs")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .maybeSingle();
    const current = (existing as AiProviderConfig | null) ?? null;

    let encryptedKey: string | null = null;
    let keyLast4: string | null = null;

    if (provider === "managed") {
      encryptedKey = null;
      keyLast4 = null;
    } else if (apiKey) {
      encryptedKey = encryptSecret(apiKey);
      keyLast4 = lastFour(apiKey);
    } else if (current && current.provider === provider && current.encrypted_key) {
      // Keep the existing key when only toggling ack / overrides for the same provider.
      encryptedKey = current.encrypted_key;
      keyLast4 = current.key_last4;
    } else {
      return NextResponse.json({ error: "An API key is required to enable this provider." }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("ai_provider_configs")
      .upsert(
        {
          care_circle_id: careCircleId,
          provider,
          encrypted_key: encryptedKey,
          key_last4: keyLast4,
          gemini_free_tier_ack: provider === "gemini" ? Boolean(geminiFreeTierAck) : false,
          model_overrides: modelOverrides ?? null,
          updated_by: context.userId
        },
        { onConflict: "care_circle_id" }
      )
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    const saved = data as AiProviderConfig;
    await createAuditLog({
      careCircleId: saved.care_circle_id,
      actorId: context.userId,
      actionType: current ? "updated" : "created",
      objectType: "ai_provider_config",
      objectId: saved.id,
      diff: { provider, key_set: Boolean(encryptedKey) } // never logs the key itself
    });

    return NextResponse.json({ config: publicConfig(saved) });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "coordinator");
  if (context instanceof NextResponse) return context;

  try {
    const supabase = createClient();
    // Remove-key nulls the columns (no delete policy; the row is retained per soft-delete rule).
    const { data, error } = await supabase
      .from("ai_provider_configs")
      .update({
        provider: null,
        encrypted_key: null,
        key_last4: null,
        gemini_free_tier_ack: false,
        model_overrides: null,
        updated_by: context.userId
      })
      .eq("care_circle_id", careCircleId)
      .select("*")
      .maybeSingle();
    if (error) throw new Error(error.message);

    const row = (data as AiProviderConfig | null) ?? null;
    if (row) {
      await createAuditLog({
        careCircleId: row.care_circle_id,
        actorId: context.userId,
        actionType: "deleted",
        objectType: "ai_provider_config",
        objectId: row.id,
        diff: { removed: true }
      });
    }

    return NextResponse.json({ config: publicConfig(row) });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
