# Vigil transcription service (self-hosted Whisper)

A small stateless FastAPI service that transcribes a voice note with **faster-whisper** and
returns the text. Runs as its own service because faster-whisper (Python + CTranslate2) can't
live in the Node OCR worker or a serverless function.

## Why separate / how it fits

Phase 3b voice-note flow:

1. Browser records via `MediaRecorder` → a short webm/opus blob.
2. Browser → `POST /api/ai/transcribe` (Next; membership-checked) with the audio.
3. Next forwards the audio here (`POST /transcribe`, shared-secret auth).
4. This service transcribes and returns `{ text }`. **Audio is never persisted** — it's
   transcribed in memory and discarded (it never leaves our infrastructure).
5. The user reviews/edits the text and saves it through the normal `POST /api/notes`.

## Run locally

```bash
cd transcription
pip install -r requirements.txt
export TRANSCRIPTION_SHARED_SECRET=dev-secret WHISPER_MODEL=base
uvicorn main:app --port 8000
# GET  http://localhost:8000/health
# POST http://localhost:8000/transcribe  (multipart 'file', header x-worker-secret)
```

## Deploy

Docker (Railway/Render/Fly): the included `Dockerfile` installs ffmpeg + deps and pre-downloads
the model. Set `TRANSCRIPTION_SHARED_SECRET` (and optionally `WHISPER_MODEL`). Then on the Next
app set `TRANSCRIPTION_URL` (this service's URL), the same `TRANSCRIPTION_SHARED_SECRET`, and
`NEXT_PUBLIC_TRANSCRIPTION_ENABLED=true` to reveal the voice-note UI.

## Notes

- `base` is a good CPU default for short notes. Larger models are more accurate but need more
  RAM/CPU. Set `WHISPER_DEVICE=cuda` + `WHISPER_COMPUTE_TYPE=float16` on a GPU host.
- Not built (per spec): real-time transcription, speaker detection, live captions.
