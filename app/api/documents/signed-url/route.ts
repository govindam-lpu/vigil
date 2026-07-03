import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { Document } from "@/lib/types";

const SIGNED_URL_TTL_SECONDS = 60;

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const id = request.nextUrl.searchParams.get("id");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) return context;
  if (!personId || !id) return NextResponse.json({ error: "id and personId are required" }, { status: 400 });

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("documents")
      .select("storage_path")
      .eq("id", id)
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .maybeSingle();

    if (error) throw new Error(error.message);

    const document = data as Pick<Document, "storage_path"> | null;
    if (!document?.storage_path) {
      return NextResponse.json({ error: "Document file not found" }, { status: 404 });
    }

    const { data: signed, error: signError } = await supabase.storage
      .from("documents")
      .createSignedUrl(document.storage_path, SIGNED_URL_TTL_SECONDS);

    if (signError || !signed) throw new Error(signError?.message ?? "Could not generate signed URL");

    return NextResponse.json({ url: signed.signedUrl });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
