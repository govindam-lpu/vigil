# Vigil OCR / extraction worker

A small standalone service that does the heavy, long-running work the serverless Next app
can't: **OCR** (§1) and **AI structured extraction** (§2) on uploaded documents.

## Why a separate service

`unpdf`, `tesseract.js` (and, later, self-hosted Whisper for voice notes) need a
long-running container with real CPU/RAM — they don't fit serverless function limits or
Supabase Edge Functions (Deno). Next stays serverless and delegates here.

## Flow

1. A document is uploaded → `POST /api/documents` (Next) inserts the row with
   `processing_status = 'pending'` and calls `POST /process-document` here (shared-secret auth).
2. The worker acks `202` immediately, then in the background: downloads the file (service role),
   extracts text (`unpdf` for PDFs, `tesseract.js` for images), writes `extracted_text` and
   `processing_status = 'indexed'`.
3. If the circle has an AI provider configured and is under the 20/hr rate limit, it runs the
   §2 extraction pass through the shared `lib/ai` provider abstraction and writes `ai_suggestions`.
4. The document UI polls the row and swaps Processing → Indexed (or Failed).

Nothing here writes user-facing records — extraction only produces **suggestions** the user
later confirms in the app.

## Run locally

From the repo root (the worker shares the root `node_modules` and imports the pure
`lib/ai/*` modules directly):

```bash
# set the env (see .env.example) — same AI_KEY_ENC_SECRET as the Next app
npm run worker          # tsx worker/src/index.ts
npm run typecheck:worker
```

`GET /health` → `{ ok: true }`.

## Deploy

Deploy the **repo** (the worker imports `../lib/ai`, so it isn't self-contained):

- **Railway / Render:** build `npm ci`, start `npm run worker`, set the env vars from
  `.env.example`. Point the Next app's `WORKER_URL` at the service URL and set the same
  `WORKER_SHARED_SECRET` on both.
- **Fly.io:** add a Dockerfile that copies the repo, runs `npm ci`, and `CMD ["npm","run","worker"]`.

Required env: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `AI_KEY_ENC_SECRET` (identical to
the app), `WORKER_SHARED_SECRET`. Optional: `MANAGED_AI_ENABLED` + `MANAGED_ANTHROPIC_API_KEY`, `PORT`.

## Known limitation

Scanned / image-only PDFs (no text layer) yield little text from `unpdf`. A
rasterize-pages-then-Tesseract path is a future enhancement; image uploads OCR fine today.
