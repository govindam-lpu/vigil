# Phase 3 — AI-Assisted Capture (Build Plan)

Status: **in progress** (Phase 3a). Branch: `phase-3-ai-capture`.
Source of truth: README "Phase 3 — AI-Assisted Capture" + the user's revised Phase 3 prompt (BYOK).
All AI output is a **user-confirmed suggestion** — nothing is auto-committed to a DB row.

## Approved decisions (2026-07-05)

- **Compute:** Next.js stays serverless; **one worker service** (`/worker`, deployed to Fly/Railway/Render)
  owns the heavy async pipeline (OCR + document extraction). Next owns config, cost estimate,
  dashboard summary, and note→task (fast inline LLM calls).
- **Sequencing:** ship **3a** (foundation + §1 OCR + §2 extraction + §4 summary + §5 note→task + §6 reminders)
  first; **3b** = §3 voice notes (self-hosted Whisper) as a follow-up.
- **Providers:** Anthropic **and** Gemini behind one abstraction, both in v1 (incl. the Gemini
  free-tier "Google may train on your health documents" disclosure + acknowledgment gate).
- **Key encryption:** app-level **AES-256-GCM** envelope encryption. Master key `AI_KEY_ENC_SECRET`
  in server/worker env only; DB stores ciphertext only; RLS restricts config to circle admins.
- **Models (config-overridable):** extraction/summary → `claude-sonnet-5` (structured outputs +
  quality; Sonnet 4.6 lacks structured outputs); note→task → `claude-haiku-4-5`; Gemini → `gemini-2.5-flash`.

## Trust boundary / flags

- The **worker uses the Supabase service-role key** (worker env only — never the browser). This is the
  first use of the service role in Vigil; Phases 0–2 ran entirely under the user session. The worker
  only ever writes the exact `document.id` + `care_circle_id` it was handed.
- BYOK key ciphertext is opaque without the server-only master key. `get_ai_runtime_config()` (SECURITY
  DEFINER, membership-checked) hands the ciphertext to a member's server call at inference time so the
  config table itself stays admin-only. The config API never returns the ciphertext or key (only
  provider + last-4). Key set/replace/remove is audit-logged with the key scrubbed from the diff.
- Deviation vs README: README says voice = "on-device transcription preferred"; we use **self-hosted
  Whisper** (3b) — audio stays on our infra, the practical reading of that intent.
- Deviation vs README: **BYOK / provider abstraction / cost estimation / managed-key flag** are net-new
  vs README's Phase 3 (which only specifies OCR/voice/extraction/suggestions). Built per the revised
  prompt. The `managed` path is flag-gated dead code (no billing/app-tier model exists yet).
- Deviation vs prompt: `dismissed_at` is a dedicated column `documents.ai_suggestions_dismissed_at`
  (not a key inside the jsonb) — functionally identical, suggestion data retained.

## Data model (migration `202607050001_phase_3_ai_capture.sql`)

- `documents` + `ai_suggestions jsonb`, `ai_suggestions_dismissed_at timestamptz`, `processing_status`
  ('pending'|'processing'|'indexed'|'failed'). (`extracted_text` already existed from Phase 1.)
- `ai_provider_configs` (new) — per-circle BYOK config; RLS admin-only (owner/coordinator); no delete.
- `ai_usage_logs` (new) — per-call metadata (no key, no content); rate-limit source; members read/insert; append-only.
- `care_circle_summaries` (new) — per-user cached §4 summary; owner-scoped RLS.
- `get_ai_runtime_config()` (SECURITY DEFINER) — member-scoped runtime key accessor.
- `search_phase1()` — documents branch now indexes `extracted_text`; + GIN fts index on documents.

## `lib/ai/` (shared by Next routes + worker)

- `crypto.ts` — AES-256-GCM encrypt/decrypt (master key via `AI_KEY_ENC_SECRET`).
- `models.ts` — model ids + per-MTok prices + per-op token assumptions (drives the estimator).
- `provider.ts` + `anthropic.ts` + `gemini.ts` — `AIProvider.complete()`; `getProviderForCircle()`.
  `expectJson` → native structured output (Anthropic `output_config.format` / Gemini `responseSchema`),
  fence-strip fallback. Returns `{ text, inputTokens, outputTokens }`.
- `usage.ts` — `assertAiRateLimit(circleId)` (20/hr via `ai_usage_logs`) + `logAiUsage(...)`.
- `config.ts` — `getCircleAiConfig()` (runtime provider/key resolution + decrypt).

## API routes (Next)

- `GET/PUT/DELETE /api/ai/provider` — config CRUD (admin-gated; audit-logged; never returns key).
- `GET /api/ai/cost-estimate` — 30-day activity → estimated monthly cost.
- `GET /api/ai/summary` — §4 dashboard prose (cached in `care_circle_summaries`; rate-limited).
- `POST /api/ai/note-task-suggestions` — §5 (note id → ≤3 task titles; rate-limited; fail-open).
- §2 apply reuses existing `POST /api/appointments|medications|tasks` (which already create reminders =
  §6) + `PATCH /api/documents` (expiry + dismiss).
- `POST /api/documents` gains a worker notify (sets `processing_status='pending'`).

## Worker (`/worker`, separate deploy)

- `POST /process-document` (shared-secret auth): service-role load → signed URL → `unpdf`/`tesseract.js`
  → write `extracted_text` + `processing_status` → if provider configured & under rate limit → §2
  extraction via `lib/ai` → write `ai_suggestions` + `logAiUsage`. Failures → `processing_status='failed'`.

## UI (Next)

- `/settings/ai` (admin) — provider choice, key paste + last-4, replace/remove, Gemini health-data
  warning + ack gate, cost estimate + baseline copy, "AI key needs attention" banner.
- Document Indexed/Processing/Failed badges (poll the row).
- §2 suggestion banner (appointments / medications / follow-up tasks / expiry) with checkboxes + apply/dismiss.
- §4 dashboard prose summary + "Show full activity list".
- §5 post-save toast → suggestions panel → pre-filled quick-add task.
- Graceful "Enable AI features" prompts wherever a provider is unconfigured (§0d).

## Env / deps

- Deps: `@anthropic-ai/sdk`, `@google/genai` (Next + worker); `unpdf`, `tesseract.js` (worker).
- Env: `AI_KEY_ENC_SECRET`; worker-only `SUPABASE_SERVICE_ROLE_KEY`; `WORKER_URL` + `WORKER_SHARED_SECRET`;
  `MANAGED_AI_ENABLED` (off) + optional app key; Groq off (3b).

## Checklist

### 3a
- [x] Migration `202607050001_phase_3_ai_capture.sql` — **authored; awaits user apply**
- [x] `lib/ai/` foundation (crypto, models, provider+anthropic+gemini, usage, config) + types
- [x] `GET/PUT/DELETE /api/ai/provider` + `GET /api/ai/cost-estimate`
- [x] AI settings section in Settings (provider choice, key entry, Gemini ack, cost estimate) + `config.ts` graceful null (§0)
- [x] Worker service (`worker/`: OCR via unpdf/tesseract **+ the §2 extraction pass**) + `POST /api/documents` trigger + Indexed/Processing/Failed badges + polling + search index (§1). **Awaits user deploy + `WORKER_URL`/`WORKER_SHARED_SECRET`.**
- [x] §2 suggestion banner (`suggestion-banner.tsx`) + apply actions + dismiss (`PATCH /api/documents`)
- [x] §6 reminder auto-gen on confirmed extractions (appointments/meds routed through existing create endpoints)
- [x] §4 dashboard AI summary (`GET /api/ai/summary`) + `care_circle_summaries` cache + "show full activity list"
- [x] §5 note→task suggestions (`POST /api/ai/note-task-suggestions`) + toast/panel
- [x] Static gates green (typecheck / lint / build / worker typecheck)

## Completion checklist — Phase 3a (built 2026-07-05)

**Verification status:** static gates green (typecheck/lint/build + worker typecheck). **No runtime e2e yet**
(per plan to test at the end). The worker needs deployment to exercise §1/§2 live.

### Built
- **Migration** `202607050001_phase_3_ai_capture.sql` (applied by user): documents `ai_suggestions`,
  `ai_suggestions_dismissed_at`, `processing_status`; tables `ai_provider_configs`, `ai_usage_logs`,
  `care_circle_summaries`; `get_ai_runtime_config()`; `search_phase1` + GIN index over `extracted_text`.
- **`lib/ai/`**: `crypto` (AES-256-GCM), `models` (ids/prices/estimator), `provider` + `anthropic` + `gemini`
  (abstraction, thinking disabled, JSON normalization), `usage` (20/hr limit + logging), `config` (runtime resolve).
- **Types**: `AiProvider`, `AiFeature`, `DocumentProcessingStatus`, `DocumentAiSuggestions`,
  `ExtractedAppointment/Medication`, `AiProviderConfig`, `AiUsageLog`, `CareCircleSummary`; `Document` extended.
- **API**: `GET/PUT/DELETE /api/ai/provider`, `GET /api/ai/cost-estimate`, `GET /api/ai/summary`,
  `POST /api/ai/note-task-suggestions`; enhanced `POST /api/documents` (worker trigger + status),
  `PATCH /api/documents` (dismiss).
- **Worker** `worker/` (index/supabase/ocr/ai/process + tsconfig/.env.example/README) + root `worker`/`typecheck:worker` scripts.
- **UI**: Settings → AI Features (`ai-settings.tsx`); document Indexed/Processing/Failed badges + polling;
  §2 suggestion banner; §4 dashboard prose summary; §5 note→task toast/panel.
- **Deps**: `@anthropic-ai/sdk`, `@google/genai`, `fastify`, `unpdf`, `tesseract.js`, `tsx`.

### Intentionally excluded
- §3 voice notes → **Phase 3b** (needs self-hosted Whisper), deferred per user.
- Managed-key **billing** — only the flag + code path built (per spec).
- All Phase 4+ (crisis UI, emergency packet, offline, calendar, analytics).

### Deviations (flagged)
1. BYOK / provider abstraction / cost estimation / managed flag are **net-new vs README's Phase 3**
   (per the revised prompt); README specced only OCR/voice/extraction/suggestions.
2. On-device transcription (README) → **self-hosted Whisper** (3b), privacy-intent-preserving.
3. Anthropic Sonnet default = **`claude-sonnet-5`** (prompt said `claude-sonnet-4-6`) for structured-output
   support + quality; config-overridable.
4. Rate limit via **DB** (`ai_usage_logs` count), not Redis (no Redis in stack). Spec allowed DB.
5. §2 `dismissed_at` = dedicated column `documents.ai_suggestions_dismissed_at` (not a jsonb key); data retained.
6. §2 medications: inline **review-and-confirm form** per med (editable, posts to `/api/medications`) instead of
   "opens the add-medication modal pre-filled" — same review+confirm guarantee, no cross-view nav.
7. §2 appointments-from-extraction set the confirming user as an **attendee** so the §6 48h reminder fires
   (existing reminder logic requires an attendee).
8. **Known limitation:** the §2 banner and §5 panel render for any member who can view the doc/note, but the
   apply endpoints require contributor+ (appointments/meds/tasks). A caregiver/viewer clicking "apply" will
   get a silent 403 — consistent with existing create-permission gaps (README: caregivers can't add meds/docs).
   Could gate the apply UI by role later.
9. Cost estimator's `summaries30d` is a heuristic (`members × 4`); no historical summary count to project from.

### 3b (deferred)
- [ ] §3 voice notes: self-hosted Whisper service + record→transcribe→review→save-as-Note

## Testing (2026-07-05) — live, with the circle's real Gemini key

All exercised against the live remote DB + real Gemini (`gemini-2.5-flash`) via authenticated
throwaway scripts (since removed), then test rows cleaned up:

- **§0 / crypto**: sign-in, `ai_provider_configs` admin-only RLS, `get_ai_runtime_config` accessor,
  and AES-256-GCM decrypt of the stored BYOK key — all ✓.
- **§2 extraction / §4 summary / §5 note→task**: live Gemini calls returned correct structured JSON /
  prose / task titles ✓.
- **§1 OCR → §2 (full worker pipeline)**: uploaded a real PDF → `processDocument` →
  `processing_status='indexed'`, `extracted_text` populated, `ai_suggestions` correct, `ai_usage_logs`
  row written (extraction, gemini-2.5-flash, ~$0.0006) ✓. Bad-file path → `processing_status='failed'` ✓.

**Change during testing:** swapped the worker's PDF text extractor from `pdf-parse@1.1.1` (ancient
bundled pdf.js — threw `Command token too long` on real PDFs) to **`unpdf`** (Node/serverless-friendly
pdf.js, no native canvas dep). `tesseract.js` unchanged for images.

**Perf fix (tab slowness):** the middleware ran a `users_profiles` upsert (a DB write) on *every*
navigation and API call; removed it (the `(app)` layout already creates the profile on entry, now with
OAuth name/avatar). Remaining dev-only lag is route compilation; the deeper prod lever is client-side
caching (TanStack Query, installed but unused) — a separate follow-up.

**Not runtime-tested:** the browser auto-login hit a preview-harness hydration quirk with the controlled
form (not a product bug — normal login works); UI flows are build-verified + the APIs are proven via the
scripts above.
