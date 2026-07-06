import { runExtraction } from "./ai";
import { extractImageText, extractPdfText, isImage, isPdf } from "./ocr";
import { serviceClient } from "./supabase";

type DocumentRow = {
  id: string;
  care_circle_id: string;
  person_id: string;
  storage_path: string | null;
  file_type: string | null;
  title: string;
};

async function setStatus(documentId: string, careCircleId: string, status: "processing" | "failed"): Promise<void> {
  const supabase = serviceClient();
  await supabase
    .from("documents")
    .update({ processing_status: status })
    .eq("id", documentId)
    .eq("care_circle_id", careCircleId);
}

// OCR (§1) then structured extraction (§2), both writing back to the document row via the
// service role. Extraction is best-effort — a provider error never fails the OCR result.
export async function processDocument(documentId: string, careCircleId: string): Promise<void> {
  const supabase = serviceClient();
  await setStatus(documentId, careCircleId, "processing");

  const { data, error } = await supabase
    .from("documents")
    .select("id, care_circle_id, person_id, storage_path, file_type, title")
    .eq("id", documentId)
    .eq("care_circle_id", careCircleId)
    .maybeSingle();

  const document = (data as DocumentRow | null) ?? null;
  if (error || !document || !document.storage_path) {
    await setStatus(documentId, careCircleId, "failed");
    return;
  }

  try {
    const download = await supabase.storage.from("documents").download(document.storage_path);
    if (download.error || !download.data) {
      throw new Error("Failed to download document from storage");
    }
    const buffer = Buffer.from(await download.data.arrayBuffer());

    let text = "";
    if (isPdf(document.file_type, document.storage_path)) {
      text = await extractPdfText(buffer);
    } else if (isImage(document.file_type, document.storage_path)) {
      text = await extractImageText(buffer);
    }
    text = text.trim();

    await supabase
      .from("documents")
      .update({ extracted_text: text.length > 0 ? text : null, processing_status: "indexed" })
      .eq("id", documentId)
      .eq("care_circle_id", careCircleId);

    if (text.length > 0) {
      const suggestions = await runExtraction(careCircleId, text);
      if (suggestions) {
        await supabase
          .from("documents")
          .update({ ai_suggestions: suggestions })
          .eq("id", documentId)
          .eq("care_circle_id", careCircleId);
      }
    }
  } catch {
    await setStatus(documentId, careCircleId, "failed");
  }
}
