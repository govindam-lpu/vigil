"""Vigil transcription service — self-hosted Whisper (faster-whisper).

A tiny stateless FastAPI app: receives an audio file, transcribes it with faster-whisper,
returns the text. It never persists audio (transcribe-and-discard) and never touches the
database — the Next app forwards the audio and saves the resulting Note. Runs as its own
service because faster-whisper (Python + CTranslate2) can't live in the Node worker or a
serverless function. Auth: a shared secret in the x-worker-secret header.
"""
import io
import os

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

SHARED_SECRET = os.environ.get("TRANSCRIPTION_SHARED_SECRET")
MODEL_SIZE = os.environ.get("WHISPER_MODEL", "base")
# int8 on CPU keeps memory + latency reasonable for short voice notes.
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE_TYPE", "int8")
DEVICE = os.environ.get("WHISPER_DEVICE", "cpu")
MAX_AUDIO_BYTES = int(os.environ.get("MAX_AUDIO_BYTES", str(25 * 1024 * 1024)))

app = FastAPI(title="Vigil Transcription")

# Loaded once at startup; the first request would otherwise pay the model-load cost.
model = WhisperModel(MODEL_SIZE, device=DEVICE, compute_type=COMPUTE_TYPE)


@app.get("/health")
def health() -> dict:
    return {"ok": True, "model": MODEL_SIZE}


@app.post("/transcribe")
async def transcribe(
    file: UploadFile = File(...),
    x_worker_secret: str | None = Header(default=None),
) -> dict:
    if not SHARED_SECRET or x_worker_secret != SHARED_SECRET:
        raise HTTPException(status_code=401, detail="Unauthorized")

    audio_bytes = await file.read()
    if not audio_bytes:
        raise HTTPException(status_code=400, detail="Empty audio")
    if len(audio_bytes) > MAX_AUDIO_BYTES:
        raise HTTPException(status_code=413, detail="Audio too large")

    try:
        # faster-whisper decodes the container (webm/opus/wav/...) via PyAV internally.
        segments, _info = model.transcribe(io.BytesIO(audio_bytes), beam_size=1)
        text = " ".join(segment.text.strip() for segment in segments).strip()
    except Exception as error:  # noqa: BLE001 — surface a clean 500 to the caller
        raise HTTPException(status_code=500, detail=f"Transcription failed: {error}")

    return {"text": text}
