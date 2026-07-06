import { NextResponse, type NextRequest } from "next/server";
import { getErrorMessage, getRequestContext } from "@/lib/api/server";

// Voice-note transcription proxy (§3). Membership-checked, then forwards the audio to the
// self-hosted faster-whisper service. Audio is never persisted; the caller reviews the text
// and saves it via POST /api/notes. Transcription is a blocking feature — on any failure we
// return the spec's actionable message so the user can type the note instead.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const careCircleId = request.nextUrl.searchParams.get("careCircleId");
  const context = await getRequestContext(careCircleId, "caregiver");
  if (context instanceof NextResponse) return context;

  const transcriptionUrl = process.env.TRANSCRIPTION_URL;
  const secret = process.env.TRANSCRIPTION_SHARED_SECRET;
  if (!transcriptionUrl || !secret) {
    return NextResponse.json({ error: "Transcription is not configured." }, { status: 503 });
  }

  try {
    const inbound = await request.formData();
    const audio = inbound.get("audio");
    if (!(audio instanceof File)) {
      return NextResponse.json({ error: "audio file is required" }, { status: 400 });
    }

    const outbound = new FormData();
    outbound.append("file", audio, audio.name || "note.webm");

    const response = await fetch(`${transcriptionUrl.replace(/\/$/, "")}/transcribe`, {
      method: "POST",
      headers: { "x-worker-secret": secret },
      body: outbound,
      signal: AbortSignal.timeout(115000)
    });
    if (!response.ok) {
      throw new Error(`Transcription service responded ${response.status}`);
    }
    const json = (await response.json()) as { text?: string };
    return NextResponse.json({ text: json.text ?? "" });
  } catch (error) {
    return NextResponse.json(
      { error: "Transcription failed — please type your note instead.", detail: getErrorMessage(error) },
      { status: 502 }
    );
  }
}
