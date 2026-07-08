import { NextResponse, type NextRequest } from "next/server";
import JSZip from "jszip";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getCapabilityContext, getErrorMessage } from "@/lib/api/server";
import { createClient } from "@/lib/supabase/server";
import { toArrayBuffer } from "@/lib/utils";
import type { Document } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const bodySchema = z.object({ careCircleId: z.string().uuid() });

// POST /api/export/json — full care-circle data export (Owner or export.all).
// Returns a zip: care_circle.json (structured data) + documents/signed-urls.json
// (time-limited download links, not the files). Notes exclude other members' private
// notes (RLS already strips them for the acting user). Audit-logged.
export async function POST(request: NextRequest) {
  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "careCircleId is required" }, { status: 400 });
  }

  const { careCircleId } = parsed.data;
  const context = await getCapabilityContext(careCircleId, "export.all");
  if (context instanceof NextResponse) {
    return context;
  }

  try {
    const supabase = createClient();

    const [
      careCircle,
      persons,
      tasks,
      appointments,
      medications,
      documents,
      notes,
      timelineEvents,
      contacts,
      checkIns,
      auditLogs
    ] = await Promise.all([
      supabase.from("care_circles").select("*").eq("id", careCircleId).maybeSingle(),
      supabase.from("persons").select("*").eq("care_circle_id", careCircleId),
      supabase.from("tasks").select("*").eq("care_circle_id", careCircleId),
      supabase.from("appointments").select("*").eq("care_circle_id", careCircleId),
      supabase.from("medications").select("*").eq("care_circle_id", careCircleId),
      supabase.from("documents").select("*").eq("care_circle_id", careCircleId),
      supabase.from("notes").select("*").eq("care_circle_id", careCircleId),
      supabase.from("timeline_events").select("*").eq("care_circle_id", careCircleId),
      supabase.from("contacts").select("*").eq("care_circle_id", careCircleId),
      supabase.from("check_ins").select("*").eq("care_circle_id", careCircleId),
      supabase.from("audit_logs").select("*").eq("care_circle_id", careCircleId)
    ]);

    const documentRows = (documents.data ?? []) as Document[];
    const docsWithPath = documentRows.filter((document) => Boolean(document.storage_path));
    const paths = docsWithPath.map((document) => document.storage_path as string);

    let signedList: Array<{ id: string; title: string; storagePath: string; signedUrl: string | null }> = [];
    if (paths.length > 0) {
      const { data: signed } = await supabase.storage.from("documents").createSignedUrls(paths, 86400);
      signedList = docsWithPath.map((document, index) => ({
        id: document.id,
        title: document.title,
        storagePath: document.storage_path as string,
        signedUrl: signed?.[index]?.signedUrl ?? null
      }));
    }

    const payload = {
      exportedAt: new Date().toISOString(),
      exportedBy: context.userId,
      careCircle: careCircle.data ?? null,
      persons: persons.data ?? [],
      tasks: tasks.data ?? [],
      appointments: appointments.data ?? [],
      medications: medications.data ?? [],
      documents: documentRows,
      notes: notes.data ?? [],
      timeline_events: timelineEvents.data ?? [],
      contacts: contacts.data ?? [],
      check_ins: checkIns.data ?? [],
      audit_logs: auditLogs.data ?? []
    };

    const zip = new JSZip();
    zip.file("care_circle.json", JSON.stringify(payload, null, 2));
    zip.folder("documents")?.file("signed-urls.json", JSON.stringify(signedList, null, 2));
    const archive = await zip.generateAsync({ type: "uint8array" });

    await createAuditLog({
      careCircleId,
      actorId: context.userId,
      actionType: "export",
      objectType: "care_circle",
      objectId: careCircleId,
      diff: { format: "json" }
    });

    const filename = `vigil-export-${careCircleId}.zip`;
    return new NextResponse(toArrayBuffer(archive), {
      status: 200,
      headers: {
        "Content-Type": "application/zip",
        "Content-Disposition": `attachment; filename="${filename}"`
      }
    });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
