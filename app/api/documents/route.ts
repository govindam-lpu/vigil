import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { createAuditLog } from "@/lib/api/audit";
import { getFoldersById, getProfilesById } from "@/lib/api/records";
import { getCapabilityContext, getErrorMessage, getRequestContext } from "@/lib/api/server";
import { createTimelineEvent } from "@/lib/api/timeline";
import { createClient } from "@/lib/supabase/server";
import type { Document, DocumentType, HydratedDocument } from "@/lib/types";

const documentCreateSchema = z.object({
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  description: z.string().nullable().optional(),
  documentType: z
    .enum(["medical_record", "insurance", "legal", "financial", "identification", "care_plan", "correspondence", "other"])
    .nullable()
    .optional(),
  fileUrl: z.string().min(1).nullable().optional(),
  storagePath: z.string().min(1),
  appointmentId: z.string().uuid().nullable().optional(),
  fileType: z.string().nullable().optional(),
  fileSizeBytes: z.number().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  sourceName: z.string().nullable().optional(),
  tags: z.array(z.string()).max(5).optional(),
  pinnedInCrisis: z.boolean().default(false)
});

const documentUpdateSchema = z.object({
  id: z.string().uuid(),
  careCircleId: z.string().uuid(),
  personId: z.string().uuid(),
  folderId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).optional(),
  description: z.string().nullable().optional(),
  documentType: z
    .enum(["medical_record", "insurance", "legal", "financial", "identification", "care_plan", "correspondence", "other"])
    .nullable()
    .optional(),
  sourceName: z.string().nullable().optional(),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
  pinnedInCrisis: z.boolean().optional(),
  tags: z.array(z.string()).max(5).optional(),
  dismissSuggestions: z.boolean().optional(),
  archive: z.boolean().optional()
});

export async function GET(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const personId = request.nextUrl.searchParams.get("personId");
  const id = request.nextUrl.searchParams.get("id");
  const folderId = request.nextUrl.searchParams.get("folderId");
  const appointmentId = request.nextUrl.searchParams.get("appointmentId");
  const smartView = request.nextUrl.searchParams.get("smartView");
  const context = await getRequestContext(careCircleId, "emergency");

  if (context instanceof NextResponse) return context;
  if (!personId) return NextResponse.json({ error: "personId is required" }, { status: 400 });

  try {
    const supabase = createClient();
    let query = supabase
      .from("documents")
      .select("*")
      .eq("care_circle_id", careCircleId)
      .eq("person_id", personId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false });

    // A single-id lookup (deep links from timeline/search) resolves the record
    // and its folder; still scoped by care_circle_id + person_id + membership.
    if (id) query = query.eq("id", id);
    if (folderId) query = query.eq("folder_id", folderId);
    if (appointmentId) query = query.eq("appointment_id", appointmentId);
    if (smartView === "expiring") {
      const soon = new Date();
      soon.setDate(soon.getDate() + 30);
      query = query.not("expires_at", "is", null).lte("expires_at", soon.toISOString().slice(0, 10));
    }
    if (smartView === "added") {
      const week = new Date();
      week.setDate(week.getDate() - 7);
      query = query.gte("created_at", week.toISOString());
    }
    if (smartView === "pinned") query = query.eq("pinned_in_crisis", true);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const documents = (data ?? []) as Document[];
    const [folders, profiles] = await Promise.all([
      getFoldersById(documents.map((document) => document.folder_id).filter((id): id is string => !!id)),
      getProfilesById(documents.map((document) => document.uploaded_by).filter((id): id is string => !!id))
    ]);
    const hydrated: HydratedDocument[] = documents.map((document) => ({
      ...document,
      folder: document.folder_id ? folders.get(document.folder_id) ?? null : null,
      uploader: document.uploaded_by ? profiles.get(document.uploaded_by) ?? null : null
    }));

    return NextResponse.json({ documents: hydrated });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const parsed = documentCreateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid document payload" }, { status: 400 });

  const context = await getCapabilityContext(parsed.data.careCircleId, "documents.upload");
  if (context instanceof NextResponse) return context;

  const workerUrl = process.env.WORKER_URL;
  const workerSecret = process.env.WORKER_SHARED_SECRET;
  const workerConfigured = Boolean(workerUrl && workerSecret);

  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("documents")
      .insert({
        care_circle_id: parsed.data.careCircleId,
        person_id: parsed.data.personId,
        folder_id: parsed.data.folderId ?? null,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        document_type: parsed.data.documentType ?? "other",
        file_url: parsed.data.fileUrl ?? null,
        storage_path: parsed.data.storagePath,
        appointment_id: parsed.data.appointmentId ?? null,
        file_type: parsed.data.fileType ?? null,
        file_size_bytes: parsed.data.fileSizeBytes ?? null,
        uploaded_by: context.userId,
        issued_at: parsed.data.issuedAt ?? null,
        expires_at: parsed.data.expiresAt ?? null,
        source_name: parsed.data.sourceName ?? null,
        tags: parsed.data.tags ?? null,
        extracted_text: null,
        processing_status: workerConfigured ? "pending" : null,
        is_private: false,
        pinned_in_crisis: parsed.data.pinnedInCrisis,
        deleted_at: null
      })
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const document = data as Document;
    await createAuditLog({
      careCircleId: document.care_circle_id,
      actorId: context.userId,
      actionType: "created",
      objectType: "document",
      objectId: document.id,
      diff: { title: document.title, document_type: document.document_type }
    });
    await createTimelineEvent({
      careCircleId: document.care_circle_id,
      personId: document.person_id,
      eventType: "document_uploaded",
      title: `Document uploaded: ${document.title}`,
      body: document.description,
      authorId: context.userId,
      linkedObjectType: "document",
      linkedObjectId: document.id
    });

    // Kick off background OCR + extraction (§1/§2). We await only the worker's fast 202 ack;
    // the client polls processing_status. A missing or failing worker never blocks the upload.
    if (workerConfigured && workerUrl && workerSecret) {
      try {
        const response = await fetch(`${workerUrl.replace(/\/$/, "")}/process-document`, {
          method: "POST",
          headers: { "content-type": "application/json", "x-worker-secret": workerSecret },
          body: JSON.stringify({ documentId: document.id, careCircleId: document.care_circle_id }),
          signal: AbortSignal.timeout(8000)
        });
        if (!response.ok) throw new Error(`Worker responded ${response.status}`);
      } catch {
        await supabase
          .from("documents")
          .update({ processing_status: "failed" })
          .eq("id", document.id)
          .eq("care_circle_id", document.care_circle_id);
      }
    }

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const parsed = documentUpdateSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Invalid document update payload" }, { status: 400 });

  const context = await getCapabilityContext(parsed.data.careCircleId, "documents.upload");
  if (context instanceof NextResponse) return context;

  // Archiving is a destructive action gated by the distinct documents.delete capability
  // (owner/coordinator by default; contributors have documents.upload but not delete).
  if (parsed.data.archive && !context.capabilities.has("documents.delete")) {
    return NextResponse.json({ error: "You do not have permission to delete documents." }, { status: 403 });
  }

  try {
    const supabase = createClient();
    const updatePayload: Partial<Document> = {};
    if (parsed.data.folderId !== undefined) updatePayload.folder_id = parsed.data.folderId;
    if (parsed.data.title !== undefined) updatePayload.title = parsed.data.title;
    if (parsed.data.description !== undefined) updatePayload.description = parsed.data.description;
    if (parsed.data.documentType !== undefined) updatePayload.document_type = parsed.data.documentType as DocumentType | null;
    if (parsed.data.sourceName !== undefined) updatePayload.source_name = parsed.data.sourceName;
    if (parsed.data.issuedAt !== undefined) updatePayload.issued_at = parsed.data.issuedAt;
    if (parsed.data.expiresAt !== undefined) updatePayload.expires_at = parsed.data.expiresAt;
    if (parsed.data.pinnedInCrisis !== undefined) updatePayload.pinned_in_crisis = parsed.data.pinnedInCrisis;
    if (parsed.data.tags !== undefined) updatePayload.tags = parsed.data.tags;
    if (parsed.data.dismissSuggestions) updatePayload.ai_suggestions_dismissed_at = new Date().toISOString();
    if (parsed.data.archive) updatePayload.deleted_at = new Date().toISOString();

    const { data, error } = await supabase
      .from("documents")
      .update(updatePayload)
      .eq("id", parsed.data.id)
      .eq("care_circle_id", parsed.data.careCircleId)
      .eq("person_id", parsed.data.personId)
      .select("*")
      .single();

    if (error) throw new Error(error.message);

    const document = data as Document;
    await createAuditLog({
      careCircleId: document.care_circle_id,
      actorId: context.userId,
      actionType: parsed.data.archive ? "archived" : "updated",
      objectType: "document",
      objectId: document.id,
      diff: updatePayload
    });

    return NextResponse.json({ document });
  } catch (error) {
    return NextResponse.json({ error: getErrorMessage(error) }, { status: 500 });
  }
}
