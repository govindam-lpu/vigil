# Vigil — Deployment Runbook

> **Status (2026-07-08): NOTHING is deployed. Hosting/go-live is intentionally DEFERRED until
> after all phases (4, 5) are built** — to batch paid infra + DNS + secret rotation and avoid
> re-deploy churn as Phase 5 adds a job runner + notification providers + OAuth integrations.
> The app runs locally (`npm run dev`) against the **remote** Supabase project. This file is the
> running checklist so the final go-live is turnkey — **append each phase's deploy needs here.**

Merging each phase's PR into `main` is code consolidation, **not** a deploy — keep doing it.

## Architecture — 3 deployables

| Service | Path | Runtime | Powers | Deploy target (recommended) |
|---|---|---|---|---|
| **Web app** | repo root | Next.js 14 (Node) | whole UI; §2 extraction apply, §4 summary, §5 note→task (need only a provider key) | Vercel (Pro) or any Node host |
| **OCR worker** | `worker/` | Node + tsx | §1 document OCR + §2 extraction pass | Railway / Render / Fly (Docker) |
| **Transcription** | `transcription/` | Python + faster-whisper | §3 voice notes | Railway / Render / Fly (Docker) |

The browser only ever calls the **web app**; the web app calls the two services server-side with
a shared secret. **No CORS setup needed.** Both backend services have Dockerfiles + READMEs and
are **proven locally** (worker pipeline on a real PDF; faster-whisper on a TTS sample).

## Prerequisites already done (no action)
- Supabase project live; **all migrations applied** through `202607050001_phase_3_ai_capture.sql`.
- `AI_KEY_ENC_SECRET` set in `.env.local`; a Gemini BYOK key configured + verified for the test circle.

## Secrets to generate / rotate (at deploy time)
```bash
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # WORKER_SHARED_SECRET
node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"   # TRANSCRIPTION_SHARED_SECRET
```
- **`AI_KEY_ENC_SECRET`** — reuse the existing value; must be **identical** in the web app AND the worker (it decrypts each circle's BYOK key).
- **ROTATE `SUPABASE_SERVICE_ROLE_KEY`** in the Supabase dashboard (Settings → API → reset `service_role`) — it was pasted in chat. Use the new value only in the worker.

## Env var matrix

**Web app**
| Var | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from `.env.local` |
| `AI_KEY_ENC_SECRET` | same value as `.env.local` |
| `WORKER_URL`, `WORKER_SHARED_SECRET` | worker URL / generated secret |
| `TRANSCRIPTION_URL`, `TRANSCRIPTION_SHARED_SECRET` | transcription URL / generated secret |
| `NEXT_PUBLIC_TRANSCRIPTION_ENABLED` | `true` (reveals the voice-note button) |
| `MANAGED_AI_ENABLED` | leave unset (off) |

*(The web app does NOT need the service-role key.)*

**OCR worker** — `SUPABASE_URL` (= the Supabase project URL), `SUPABASE_SERVICE_ROLE_KEY` (rotated),
`AI_KEY_ENC_SECRET` (same as web), `WORKER_SHARED_SECRET` (same as web), `PORT` (host-provided).
Buildpack: build `npm ci`, start `npm run worker`. Docker: `docker build -f worker/Dockerfile .`.

**Transcription** — `TRANSCRIPTION_SHARED_SECRET` (same as web), `WHISPER_MODEL=base` (or `small`),
`PORT` (host-provided). Docker: `transcription/Dockerfile`. **Needs ≈1.5 GB RAM for `base` (~2 GB for `small`).**

## Order of operations
1. Rotate the service-role key.
2. Deploy **worker** → `GET <worker>/health` returns `{"ok":true}`.
3. Deploy **transcription** → `GET <svc>/health` returns `{"ok":true,...}`.
4. Deploy the **web app** with all env vars above.
5. Verify in prod: upload a PDF (→ Processing → Indexed → suggestion banner); record a voice note
   (→ transcribed); confirm extraction/summary/note→task (already work with the Gemini key).

## Gotchas
- **Voice on Vercel:** `/api/ai/transcribe` waits for transcription. Vercel **Hobby caps functions ≈10s**
  → longer notes time out. Use **Vercel Pro (60s)** or self-host the web app. (`maxDuration=120` is set
  but capped by plan.) OCR uploads are unaffected (they return on a fast worker ack).
- **Whisper RAM/cold start:** size the transcription host for the model; first request loads the model.
- **tesseract.js** (worker) downloads language data on the first *image* OCR (CDN) — first image is slow.
- No DB action at deploy — migrations already applied.

## Per-phase deploy additions
- **Phase 3 (done):** the two backend services above; `AI_KEY_ENC_SECRET`; the BYOK/worker/transcription env.
- **Phase 4 (TBD):** likely server-side Emergency-Packet PDF export + offline (service worker). Append when built.
- **Phase 5 (TBD):** **new infra** — background job runner (escalation firing, reminder delivery),
  notification providers (email/SMS/push — e.g. Resend/Twilio/FCM), OAuth integrations (calendar/email).
  This is the phase most likely to want a **staging deploy** to validate. Append when built.
