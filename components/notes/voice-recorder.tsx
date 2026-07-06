"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Mic, Square } from "lucide-react";
import { Button } from "@/components/ui/button";

type Phase = "idle" | "recording" | "transcribing" | "error";

// §3 record → transcribe → hand text back. Audio is captured with MediaRecorder and posted to
// /api/ai/transcribe; the parent (Add Note) drops the returned text into the note for review.
export function VoiceRecorder({
  careCircleId,
  onTranscribed,
  onClose
}: {
  careCircleId: string;
  onTranscribed: (text: string) => void;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const transcribe = async (blob: Blob) => {
    try {
      const formData = new FormData();
      formData.append("audio", blob, "note.webm");
      const response = await fetch(`/api/ai/transcribe?careCircleId=${careCircleId}`, {
        method: "POST",
        body: formData
      });
      const json = (await response.json()) as { text?: string; error?: string };
      if (!response.ok) throw new Error(json.error ?? "failed");
      onTranscribed(json.text ?? "");
    } catch {
      setError("Transcription failed — please type your note instead.");
      setPhase("error");
    }
  };

  const start = async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        void transcribe(new Blob(chunksRef.current, { type: recorder.mimeType || "audio/webm" }));
      };
      recorder.start();
      recorderRef.current = recorder;
      setSeconds(0);
      setPhase("recording");
      timerRef.current = setInterval(() => setSeconds((value) => value + 1), 1000);
    } catch {
      setError("We couldn't access your microphone. Check permissions and try again.");
      setPhase("error");
    }
  };

  const stop = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    recorderRef.current?.stop();
    setPhase("transcribing");
  };

  const mmss = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

  return (
    <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
      {phase === "idle" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-neutral-600">Record a voice note and we&apos;ll transcribe it.</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={() => void start()}>
              <Mic className="h-4 w-4" aria-hidden="true" />
              Start recording
            </Button>
          </div>
        </div>
      ) : null}

      {phase === "recording" ? (
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="h-3 w-3 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
            <span className="text-sm font-medium text-neutral-900">Recording… {mmss}</span>
          </div>
          <Button size="sm" variant="destructive" onClick={stop}>
            <Square className="h-4 w-4" aria-hidden="true" />
            Stop
          </Button>
        </div>
      ) : null}

      {phase === "transcribing" ? (
        <div className="flex items-center gap-2 text-sm text-neutral-600">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          Transcribing…
        </div>
      ) : null}

      {phase === "error" ? (
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm text-red-600">{error}</p>
          <div className="flex gap-2">
            <Button size="sm" variant="ghost" onClick={onClose}>
              Close
            </Button>
            <Button size="sm" onClick={() => void start()}>
              Retry
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
