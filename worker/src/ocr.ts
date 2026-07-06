import { extractText, getDocumentProxy } from "unpdf";
import { createWorker } from "tesseract.js";

// PDFs with a text layer extract via unpdf (a Node/serverless-friendly pdf.js build — no
// native canvas dep). Scanned/image-only PDFs return little/no text here; rasterize-then-OCR
// is a future enhancement (noted in worker/README).
export async function extractPdfText(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

export async function extractImageText(buffer: Buffer): Promise<string> {
  const worker = await createWorker("eng");
  try {
    const { data } = await worker.recognize(buffer);
    return data.text ?? "";
  } finally {
    await worker.terminate();
  }
}

export function isPdf(fileType: string | null, path: string): boolean {
  if (fileType === "application/pdf") return true;
  return path.toLowerCase().endsWith(".pdf");
}

export function isImage(fileType: string | null, path: string): boolean {
  if (fileType && fileType.startsWith("image/")) return true;
  return /\.(png|jpe?g|webp|gif|bmp|tiff?)$/i.test(path);
}
