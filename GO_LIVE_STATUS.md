# Vigil — Go-Live Status (2026-07-16)

Single source of truth for the deployment done this session. Read this first, then `DEPLOYMENT.md`
("Free launch plan") and `HANDOVER.md`. Work branch: **`go-live-config`** (off `main` — NOT yet merged).

## TL;DR

Vigil is **deployed to production** on the free tier for the first time. The web app, OCR worker, and
email Edge Function are all live and wired together. **One feature is confirmed broken (document OCR
completion) and one security step remains (disabling the leaked legacy Supabase key).** Voice is still
deferred.

## Live resources

| Piece | Where | URL / ID | Status |
|---|---|---|---|
| Web app | **Vercel Hobby** (team `govindams-projects-98768c22`, project `vigil`, GitHub `govindam-lpu/vigil` connected) | **https://care-vigil.vercel.app** | ✅ live, serving, middleware protects routes |
| DB/auth/storage | **Supabase** `ijnjrhnhzbkuyttpmudb` | `https://ijnjrhnhzbkuyttpmudb.supabase.co` | ✅ migrations `local==remote` through `202607080010` |
| OCR worker | **Google Cloud Run** (personal Gmail GCP `govindamvats.32@gmail.com`, project `bamboo-cocoa-502512-a4`, region `asia-northeast1`) | `https://vigil-worker-530081148928.asia-northeast1.run.app` | ✅ deployed/healthy · ⚠️ **OCR jobs don't complete** |
| Email | **Supabase Edge Function** `deliver-notifications` (`--no-verify-jwt`) + pg_cron every minute | `.../functions/v1/deliver-notifications` | ✅ pipeline runs · ⚠️ no real emails yet |
| Calendar | **Google Cloud OAuth** client (calendar.readonly, Testing mode) | redirect `https://care-vigil.vercel.app/api/integrations/calendar/google/callback` | ✅ vars deployed · ⏳ connect flow untested |

## Two platform changes from the original plan

1. **Supabase legacy keys are non-rotatable in 2026.** We did NOT "reset service_role". Instead created new
   **publishable** (`sb_publishable_…`, now the web app's `NEXT_PUBLIC_SUPABASE_ANON_KEY`) + **secret**
   (`sb_secret_…`, on the worker + Edge Function) keys. The dashboard has a **single toggle that disables both
   legacy keys together** → the leaked legacy `service_role` gets killed by disabling legacy keys as the LAST
   step (see Open item #2), once nothing depends on them.
2. **Hugging Face Docker Spaces became PRO-only** → OCR worker went to **Cloud Run** instead. `--allow-
   unauthenticated` (protected by `x-worker-secret`), `--no-cpu-throttling`, `--max-instances 2`, scales to zero.
   Deployed from repo root via a root **`Dockerfile`** (`gcloud run deploy vigil-worker --source .`). gcloud only
   works from **PowerShell**, not the Git-Bash tool.

## Env var inventory

**Vercel (web app)** — 8 vars, Production+Preview: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
(= publishable), `AI_KEY_ENC_SECRET`, `WORKER_URL`, `WORKER_SHARED_SECRET`, `GOOGLE_CLIENT_ID`,
`GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`. (Transcription + `MANAGED_AI_ENABLED` intentionally unset.)

**Cloud Run worker** — `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` (= `sb_secret_`), `AI_KEY_ENC_SECRET`,
`WORKER_SHARED_SECRET`.

**Edge Function** — `SERVICE_ROLE_KEY` (= `sb_secret_`; code prefers it, falls back to auto-injected legacy),
`RESEND_API_KEY`, `RESEND_FROM` (= `onboarding@resend.dev`), `DELIVER_SHARED_SECRET`. (`SUPABASE_URL`
auto-injected.)

`AI_KEY_ENC_SECRET` and each shared secret must be **byte-identical** across the places listed.

## What's verified

- Web app builds + serves; `/login` 200; `/dashboard` `/tasks` `/` → 307 → `/login` (middleware live).
- Publishable key authenticates against GoTrue + PostgREST.
- Worker `/health` → `{"ok":true}`; `/process-document` → 401 without `x-worker-secret`.
- Edge Function → 401 without `x-deliver-secret`; pg_cron fires it (notifications show `delivery_processed_at` set).
- Migrations through `202607080010`, no drift.

## OPEN ITEMS (priority order)

### 1. ⚠️ OCR jobs don't complete (TOP)
An uploaded PDF ("GovindamVatsResume") stays `processing_status = pending` with no extracted text. The worker
logs `POST 202 /process-document` (the app reached it) but the fire-and-forget `processDocument` never flips the
row to `processing`. **Config is correct** (`cpu-throttling=false`, all 4 secrets set, revision `vigil-worker-00002`+).
`worker/src/process.ts` was **swallowing all errors silently** — now fixed to log each step (commit `1031181`,
redeployed). **Next step:** upload one PDF, then:
```
gcloud run services logs read vigil-worker --region asia-northeast1 --project bamboo-cocoa-502512-a4 --limit 60
```
- If you see `[worker] processDocument start …` then an error → it's a storage/DB write issue (the log names it).
- If you see NO `[worker] processDocument start` after the 202 → Cloud Run killed the instance before the
  background work ran (scale-to-zero + fire-and-forget). Fixes: `--min-instances 1` (leaves the free tier, ~$/mo)
  or an async refactor (enqueue → separate request processes it). This is the same class of issue as voice.

### 2. 🔒 Disable the legacy Supabase keys (kills the leaked `service_role`)
The `service_role` key pasted in an old chat is **still live** (legacy keys still enabled). Once OCR + email are
verified on the new keys: Supabase → Settings → **API Keys** → disable legacy keys (single toggle for both).
Then re-verify: web app (publishable), worker + Edge Function (`sb_secret_`) all still work. Do NOT do this before
OCR is confirmed working on `sb_secret_` — if the worker's writes are failing *because* of the `sb_secret_` key
(see #1), that must be solved first.

### 3. Remaining live verification (needs a logged-in browser — user does these)
Log in at care-vigil.vercel.app, then: `.ics` import, Google Calendar connect (approve the "unverified app"
notice), in-app notification bell, crisis activate/deactivate, and the **Emergency Packet PDF** (see #5).

### 4. Real email to family members
Resend free + `onboarding@resend.dev` only delivers to the owner's own Resend signup address. To email other
members, verify a domain in Resend and set `RESEND_FROM` to an address on it.

### 5. `iconv-lite` build warning
Vercel build warns `Can't resolve 'iconv-lite'` from `pdfkit`/`fontkit` (Emergency Packet PDF, `/api/emergency-packet`).
Build succeeds; the PDF may still work for standard fonts. Verify the packet generates; if it fails, `npm i iconv-lite`.

### 6. Voice still deferred; merge + teardown
Voice = async-transcription refactor (host TBD now that HF Docker is paid — Cloud Run is a candidate). Merge
`go-live-config` → `main` (user merges; Vercel will then auto-deploy `main`). Tear down the demo circle
"Chen Family Care" on the test account when done. Local `main` is stale (behind `origin/main`) — `git pull`.

## Deploy/verify command cheat-sheet (run from PowerShell)
```
# worker logs / health / config
gcloud run services logs read vigil-worker --region asia-northeast1 --project bamboo-cocoa-502512-a4 --limit 60
gcloud run services describe vigil-worker --region asia-northeast1 --project bamboo-cocoa-502512-a4 --format=json
# web redeploy (env changes need a redeploy)
npx vercel --prod --yes --scope govindams-projects-98768c22
npx vercel env ls --scope govindams-projects-98768c22
# worker redeploy (NEVER re-pass --set-env-vars — it would reset the real secrets to placeholders)
gcloud run deploy vigil-worker --source . --region asia-northeast1 --no-cpu-throttling --project bamboo-cocoa-502512-a4 --quiet
# edge function
npx supabase functions deploy deliver-notifications --project-ref ijnjrhnhzbkuyttpmudb --no-verify-jwt
```
