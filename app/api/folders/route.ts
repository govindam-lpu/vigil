import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import type { Document, Folder } from "@/lib/types";

export type FolderWithCount = Folder & {
  item_count: number;
};

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) {
    return context;
  }

  if (!personId) {
    return NextResponse.json({ error: "personId is required" }, { status: 400 });
  }

  try {
    const supabase = createClient();
    const [{ data: folders, error: folderError }, { data: documents, error: documentError }] = await Promise.all([
      supabase
        .from("folders")
        .select("*")
        .eq("care_circle_id", careCircleId)
        .eq("person_id", personId)
        .order("folder_type", { ascending: true })
        .order("created_at", { ascending: true }),
      supabase
        .from("documents")
        .select("folder_id")
        .eq("care_circle_id", careCircleId)
        .eq("person_id", personId)
        .is("deleted_at", null)
    ]);

    if (folderError) throw new Error(folderError.message);
    if (documentError) throw new Error(documentError.message);

    const docs = (documents ?? []) as Pick<Document, "folder_id">[];
    const counts = new Map<string, number>();
    for (const document of docs) {
      if (document.folder_id) {
        counts.set(document.folder_id, (counts.get(document.folder_id) ?? 0) + 1);
      }
    }

    const withCounts: FolderWithCount[] = ((folders ?? []) as Folder[]).map((folder) => ({
      ...folder,
      item_count: counts.get(folder.id) ?? 0
    }));

    return NextResponse.json({ folders: withCounts });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
