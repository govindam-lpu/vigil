# Vigil — Deployment Runbook

> **Status (2026-07-11): GO-LIVE IS ACTIVE. Nothing is deployed yet; deploying is the current job.**
> All phases + hardening + the redesign are merged to `main`; all migrations are applied through
> `202607080010`. See the **Free launch plan** immediately below — it is the chosen path and overrides
> the older "recommended hosts" (Railway / Vercel Pro) further down.

## Free launch plan (2026-07-11) — the chosen path

User constraint: **free tier only, always-on** (no self-host — the laptop can't stay on; no budget until scale).

| Piece | Free host | Notes |
|---|---|---|
| **Web app** (Next.js) | **Vercel Hobby (free)** | Always-on. Hobby is *non-commercial* per Vercel ToS → upgrade to Pro when monetized. The ~10 s function cap is a non-issue at launch because the only >10 s path (voice) is deferred. |
| **DB / auth / storage** | **Supabase** (already live, free) | Migrations applied through `202607080010` — **verify, don't re-apply.** pg_cron already runs the reminder + lifecycle jobs. |
| **Email delivery** | **Resend free** (100/day, 3k/mo) | Via the `deliver-notifications` **Supabase Edge Function** (free) + a pg_cron→pg_net trigger (~1 min). Needs a Resend account + a verified sender (or `onboarding@resend.dev` for first tests). |
| **Google Calendar import** | **free** Google Cloud OAuth client | `calendar.readonly` scope + `GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`. `.ics` import already works with no config. |
| **Document OCR** (`worker/`) | **Hugging Face Docker Space** (free, CPU basic ≈ 16 GB RAM) | **Included at launch (Option A).** Async — the web app gets a fast ack and OCR runs in the background — so the Vercel Hobby ~10 s cap is irrelevant. Web app: `WORKER_URL` (Space URL) + `WORKER_SHARED_SECRET`. Space secrets: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (rotated), `AI_KEY_ENC_SECRET` (== web), `WORKER_SHARED_SECRET` (== web). Free Spaces sleep after ~48 h idle → first doc after a quiet spell cold-starts, but that's invisible (doc uploads/views at once; the Indexed badge just lags). |
| **Notification / lifecycle crons** | **pg_cron** in Supabase (free) | Already scheduled by the migrations; runs in the live DB. |

**Voice notes (`transcription/`) — DEFERRED, and the reason is NOT Hugging Face cost.** `/api/ai/transcribe`
is **synchronous** (`export const maxDuration = 120`, it awaits the whole transcription) but **Vercel Hobby caps
functions at ~10 s and ignores `maxDuration`**, so a voice note times out on the free web tier no matter how
fast/free the HF transcription Space is. **Option A (chosen): launch WITHOUT voice** — leave
`NEXT_PUBLIC_TRANSCRIPTION_ENABLED` unset (button hidden) and `TRANSCRIPTION_URL` unset (the route 503s
gracefully → "type your note instead"). **The IMMEDIATE next task after go-live is an async-transcription
refactor** (upload audio → return at once → poll/callback for the text) so voice then works on free Vercel + a
free HF transcription Space. **FCM web-push and the Next 16 upgrade are also deferred** (not selected; Next 16 is
a recommended fast-follow — the `npm audit` highs are DoS/cache advisories, low practical risk for a small family app).

**Order of operations (free launch):**
1. **User rotates `SUPABASE_SERVICE_ROLE_KEY`** (Supabase → Settings → API → reset `service_role`) — it was
   pasted in chat. New value goes into the **Edge Function secrets** AND the **OCR HF Space secrets**; the web app never needs it.
2. Verify migrations: `npx supabase migration list --db-url "<SESSION_POOLER from .env.local>"` == local through 10.
3. **User** creates the Vercel, Resend, Google Cloud, and Hugging Face accounts and authenticates the `vercel` + `supabase` CLIs. Generate the shared secrets (below).
4. Deploy the **OCR worker** as a Hugging Face Docker Space (`worker/Dockerfile`); set its Space secrets; confirm `GET <space>/health` → `{"ok":true}`.
5. Deploy the **web app** to Vercel Hobby (env matrix below, **including** `WORKER_URL` + `WORKER_SHARED_SECRET`; **excluding** the transcription vars).
6. Register the **Google OAuth client**; add the 3 `GOOGLE_*` web env vars; redirect URI `<web-origin>/api/integrations/calendar/google/callback`.
7. Deploy the **`deliver-notifications` Edge Function** with its secrets; schedule it via pg_cron→pg_net.
8. Verify live: sign in on the deployed origin; upload a PDF → Processing → Indexed → suggestion banner; create a task assigned to a 2nd member → email arrives; import a `.ics`; connect Google Calendar; confirm in-app notifications + crisis flow.
9. **Next task (not launch): async-transcription refactor, then a free HF transcription Space, then flip `NEXT_PUBLIC_TRANSCRIPTION_ENABLED` on.**

**Role boundary (safety):** the agent CANNOT create accounts, type secrets/API keys into dashboards, or buy
infra — those are the user's actions. The agent prepares configs, the Edge Function, env templates, and the
pg_cron SQL; deploys via the user-authenticated CLIs; and verifies. Secrets never pass through the agent.

---

*(The sections below are the original full runbook — still accurate for the 3-service architecture, env-var
matrix, and the deferred worker/transcription services when you add them. The "recommended hosts" there are
superseded by the free plan above.)*

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
- **Phase 4 (done — Crisis & Continuity):** **no new deployable service** (Emergency-Packet PDF runs in the web app via `pdfkit`; the offline service worker is the static `public/sw.js`). Deploy needs:
  - **Apply migrations `202607080001_phase_4_crisis_continuity.sql` + `202607080002_harden_reminder_job.sql`** (first adds `notifications`, the `emergency-packets` storage bucket, and the crisis + reminder-delivery functions; second revokes user `execute` on the reminder job so only pg_cron runs it).
  - **Enable `pg_cron`** in Supabase (Dashboard → Database → Extensions) so the reminder-delivery job runs. The migration self-schedules `vigil-process-reminders` every 5 min; if pg_cron wasn't enabled first, the migration still applies (fail-soft) and you schedule it manually afterward: `select cron.schedule('vigil-process-reminders','*/5 * * * *','select public.process_due_reminders();');`. pg_cron runs inside the live DB, so reminders/notifications work even before the app is hosted.
  - **No new env vars.** The web app does NOT need the service-role key for any Phase 4 feature (packet signing + notifications run under the user session / SECURITY DEFINER functions).
  - **Vercel note:** `/api/emergency-packet` is a Node function (`runtime = "nodejs"`, uses `pdfkit`) — fine on Vercel/any Node host; do not force it to the Edge runtime.
  - **Reminder-unack window** is configurable per circle via `care_circles.settings.reminder_unack_hours` (default 4).
- **Phase 5 (done — Advanced Collaboration):** full record in `PHASE_5_PLAN.md`. Deploy needs:
  - **Apply migrations `202607080003` → `202607080008`** (6 files, in order): permission overrides,
    households, analytics fn, membership-lifecycle (adds `memberships.deleted_at` + daily pg_cron
    `vigil-enforce-membership-lifecycle` + revises the RLS access helpers), notifications, calendar.
    **The web app's write routes query `membership_permission_overrides`, so the app is broken until
    at least `202607080003` is applied.** pg_cron self-schedules the lifecycle job (fail-soft; schedule
    manually if pg_cron wasn't enabled: `select cron.schedule('vigil-enforce-membership-lifecycle','0 3 * * *','select public.enforce_membership_lifecycle();');`).
  - **New deployable — the notification delivery Edge Function** (`supabase/functions/deliver-notifications`,
    Deno). Deploy with `supabase functions deploy deliver-notifications`. Env (function secrets):
    `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (rotated — service role stays out of the web app),
    `RESEND_API_KEY`, `RESEND_FROM`, `FCM_SERVER_KEY`, `DELIVER_SHARED_SECRET`. Trigger it every ~1 min via
    pg_cron→pg_net (`select cron.schedule('deliver-notifications','* * * * *', $$select net.http_post(url:='<fn-url>', headers:=jsonb_build_object('x-deliver-secret','<secret>'))$$);`)
    or a Supabase Database Webhook on inserts to `public.notifications`.
  - **New deps:** `jszip`, `recharts` (`npm ci` picks them up).
  - **New web env vars:** `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`
    (`<web-origin>/api/integrations/calendar/google/callback`) for Google Calendar import — **register a
    Google Cloud OAuth client** with the `calendar.readonly` scope + that redirect URI. `AI_KEY_ENC_SECRET`
    (already set) also encrypts the stored calendar tokens. `.ics` import needs no config.
  - **Client push (FCM) is not wired yet:** the token-registration endpoint + `user_device_tokens` table +
    the Edge Function's FCM send exist, but browser token acquisition (Firebase Web SDK + a messaging
    service worker) must be added at deploy time. Email delivery works without it.
  - **Export routes** (`/api/export/json` uses jszip, `/api/export/pdf` uses pdfkit) are Node functions
    (`runtime = "nodejs"`) — fine on Vercel/any Node host; don't force Edge.
  - This is the phase to stand up a **staging deploy** to validate email delivery + the Google OAuth
    round-trip before production.
