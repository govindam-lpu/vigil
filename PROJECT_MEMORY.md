# Vigil Project Memory

Use this as the short-form memory for a new session.

## Non-Negotiable Rules

- README.md and DESIGN.md are source of truth.
- Ask before inventing anything outside the specs or current phase prompt.
- Enforce permissions server-side on every care-circle API route.
- Every care-circle query must verify membership and filter by `care_circle_id`.
- No TypeScript `any`.
- Soft-delete only. Use `deleted_at`; do not hard-delete.
- Audit log every create/update/archive/delete/permission write.
- RLS on every Supabase table.
- Migrations only in `supabase/migrations`.
- Follow DESIGN.md tokens and Inter font.
- Do not build future-phase features early.
- Provide a completion checklist after each phase.

## Current Status

- **REDESIGN IN PROGRESS (branch `redesign`, off `main`).** Front-end-only visual redesign — the
  **"Night Watch"** identity (see DESIGN.md "Visual Identity"). No security/RLS/API/data-model changes.
  Foundation: three type voices (**Spline Sans** UI / **Spline Sans Mono** record-data / **Literata**
  serif for the person + wordmark + page titles), a green-cast stone neutral scale (`neutral-50` porcelain
  → `900` ink), **evergreen brand** (`brand-600` #2E5A4A, replacing the old `blue-600`), a **night rail**
  navigation surface (`night` #12211C sidebar + mobile bottom nav), and the **ember** signature accent
  (`#E8A33D` — the "keeping watch" lamp: wordmark, active-nav bar, today markers, quick check-in only;
  never status). Tokens live in `tailwind.config.ts`; ember/scrollbar/reduced-motion CSS in
  `app/globals.css`; fonts in `app/layout.tsx`. New shell files: `components/shell/wordmark.tsx` +
  `mobile-nav.tsx` (bottom tab bar + More sheet). Login/onboarding = a night/daylight "threshold" split.
  Timeline gained a real spine (mono date rail + connective line + per-entry node). Recharts palette in
  `analytics-charts.tsx` moved off blue onto evergreen+stone (status hues unchanged). **All 4 static gates
  green; live-verified in the browser desktop + 375px mobile (login, dashboard, timeline, More sheet).**
  Crisis red semantics deliberately untouched. NOT yet merged to `main`/PR'd — on `redesign` branch.
- **HARDENING PASS DONE (branch `hardening-pass`, off Phase 5 HEAD).** Full record in `HARDENING_PASS_REPORT.md`. Security audit (4 subagents + live PostgREST probe under a real coordinator JWT) found + fixed **3 confirmed privilege escalations that were API-enforced but not DB-enforced**: coordinator→owner role change, permission-override self-grant/owner-tamper, and `care_circles.owner_id` hijack. Fixed via BEFORE-trigger guards in **migration `202607080009` (AUTHORED — USER MUST APPLY)**, verified in a rolled-back transaction (6 exploits blocked, legit flows intact). Also: `202607080010` (notification `action_url` same-origin DB CHECK); code fixes for `checkMembership` deleted_at/expires_at, `documents.delete`/`notes.private` enforcement, signed Google-OAuth `state` (was CSRF), `.ics` size/event caps, tasks/comments audit, handoff.until validation. Perf: Recharts code-split on `/settings/analytics` (~214→107 kB), removed per-nav memberships COUNT in middleware, search-on-submit, Settings loading-flash fix + `Skeleton`. All 4 gates green; live-verified in browser. **Migrations `202607080009`+`202607080010` APPLIED + re-probed (0 VULN — all 4 escalations blocked `P0001`); `migration list` local==remote through 10. PENDING USER ACTIONS: (1) rotate `SUPABASE_SERVICE_ROLE_KEY`; (2) plan Next 16 upgrade for the `npm audit` highs (Next 14.2.35 is latest 14.2.x — no non-breaking fix; DoS/cache advisories only matter once deployed). DEFERRED: TanStack Query adoption (tab-switch cache), remaining views' loading-flash, `/api/workspaces` N+1 RPC, notes-branch GIN index. THEN: DESIGN.md redesign of Phase 5 UI.**
- **Phases 0–5 ALL COMPLETE + merged to `main` (2026-07-08).** Phase 5 = Advanced Collaboration (`PHASE_5_PLAN.md`); migrations `202607080003`–`202607080008` authored + applied (new session: confirm via `npx supabase migration list`). **No more feature phases.** **Next: a security-audit + performance + bug-fix hardening pass, then redesign — full brief in `NEXT_SESSION_HANDOFF.md`.**
- **Phase 4 (Crisis & Continuity):** crisis-mode UI lens, Emergency Packet PDF, in-app notifications + pg_cron reminder job, offline service worker. Migrations `202607080001` (APPLIED, pg_cron enabled) + `202607080002` (reminder-job hardening — confirm applied). Live e2e 36/37. Full record in `PHASE_4_PLAN.md`.
- **Phase 3 (AI-Assisted Capture):** 3a (BYOK AI — Anthropic + Gemini provider abstraction, AES-256-GCM key storage, OCR worker, doc extraction→suggestions, dashboard summary, note→task) + 3b (voice notes via self-hosted faster-whisper). Migration `202607050001_phase_3_ai_capture.sql` APPLIED. Full record in `PHASE_3_PLAN.md`; deploy runbook in `DEPLOYMENT.md`.
- **Verified live:** Gemini extraction/summary/note-task; full OCR pipeline on a real PDF (worker); faster-whisper on a TTS sample. Static gates green (typecheck / lint / build + `npm run typecheck:worker`).
- **App is now 3 deployables** — Next app + `worker/` (Node OCR) + `transcription/` (Python Whisper) — but **NOTHING is deployed: hosting DEFERRED to after all phases** (user's call). App runs locally against remote Supabase.
- Dev command: `npm run dev -- --hostname 127.0.0.1 --port 3000`. Worker: `npm run worker`. Verify: `npm run typecheck`, `npm run lint`, `npm run build`, `npm run typecheck:worker` (all pass).

## Completed Phase 0

- Auth with Supabase email/password and Google OAuth.
- Auth callback.
- Middleware redirects.
- Onboarding via secure RPC.
- Care circle/person/owner membership/default folders.
- App shell, dashboard, stubs.
- Core Phase 0 tables and RLS.

## Completed Phase 1

- Tables: tasks, appointments, notes, timeline_events, reminders, documents, task_comments.
- `memberships.last_caught_up_at`.
- Functions: `create_timeline_event`, `search_phase1`, `mark_membership_caught_up`.
- APIs for tasks, task comments, appointments, documents, folders, notes, timeline, search, dashboard changes.
- UI for timeline, tasks, calendar, documents, notes, search, dashboard catch-up.
- Supabase Storage bucket `documents`.

## Phase 1 Debt Paid Down (2026-07-03) — migration `202607030001`

- Timeline: real soft-delete via `timeline_events.deleted_at` (old redact path also fixed a latent RLS failure).
- Documents: private bucket + per-circle storage RLS (closes a cross-circle file leak); `storage_path` column; 60s signed URLs via `GET /api/documents/signed-url` for all file access.
- Appointments: formal `documents.appointment_id` FK; attachments listed on the appointment detail.
- Document tags surfaced (add modal + editable chips in detail + row chips).

## Phase 0/1 Audit Fixes (2026-07-03) — migration `202607030002` + code

- CRITICAL: private notes now author-only at the DB layer (was API-masked only; readable via direct PostgREST).
- HIGH: `caregiver` can now create notes/comments (`can_log_care` helper); Inter font actually applied; detail-pane inputs reset on selection (`key`); stored XSS in search snippets fixed (sentinel delimiters + client escaping).
- MED: profiles read respects membership expiry; `create_timeline_event` forces `auth.uid()`; `documents.is_private` DB guard.
- LOW: yellow-600 on-token; top-bar dead `all` param cleaned.

## Completed Phase 2 (2026-07-04) — migration `202607040001`

- New tables (RLS on all, no DELETE policy): contacts, medications, medication_administration_logs, check_ins, observations, escalation_rules, crisis_mode_sessions (inert Phase-4 groundwork — user approved).
- Enums: reminder_type +`medication_refill`; timeline event_type +`check_in`/+`medication_changed`/+`observation_logged`. Columns: notes.note_type, memberships.original_role + elevation_expires_at, appointments.provider_contact_id, escalation_rules.target_role. RPC `complete_task` (caregiver completion + recurring next-instance spawn).
- APIs (new): contacts, medications (+/administrations), check-ins, observations, escalation-rules, handoff. Enhanced: tasks (recurrence + RPC completion + description conflict), appointments (follow-up tasks + provider contact), persons (PATCH + conflict), notes (content edit + conflict), timeline (linkedObjectId filter).
- UI (new): /medications, /people (contacts + person profile edit), /settings (escalation rules); dashboard modules (quick check-in, refills-due, observations logger, handoff); shared ConflictModal; recurring-task + visit-summary follow-up UI.
- Scope decisions the user made: build inert crisis_mode_sessions table; INCLUDE symptom/observation logging (README P2 item the spec omitted; observations table designed here); INCLUDE medication_administration_logs.
- Deviations: reminder recurrence NOT built (task recurrence only); escalation firing + handoff role-elevation auto-revert deferred to Phase 4; recurrence-on-completion lives in the `complete_task` RPC (RLS-safe for caregivers) not the API; medications not added to global search; caregiver task-*description* edit 403s silently (completion works).

## Completed Phase 3 (2026-07-05..08) — migration `202607050001`

- **3a (BYOK AI):** provider abstraction (`lib/ai/*`: Anthropic + Gemini, thinking-off, JSON-normalize), AES-256-GCM BYOK key storage (`ai_provider_configs`, member-scoped `get_ai_runtime_config` accessor), per-circle 20/hr rate limit + `ai_usage_logs`, cost estimator, AI settings screen (Gemini health-data ack gate).
- **§1 OCR** `worker/` (Node, `unpdf` + `tesseract.js`) + `POST /api/documents` trigger + Indexed/Processing/Failed badges + `search_phase1` over `extracted_text`. **§2** extraction → suggestion banner (appointments/meds/tasks/expiry; nothing auto-committed). **§4** dashboard AI summary (`care_circle_summaries` cache). **§5** note→task toast/panel. **§6** reminders via existing create endpoints.
- **3b (voice):** `transcription/` (Python, faster-whisper) + `POST /api/ai/transcribe` proxy + `VoiceRecorder` in Add Note (gated by `NEXT_PUBLIC_TRANSCRIPTION_ENABLED`).
- New tables (RLS, no DELETE): `ai_provider_configs`, `ai_usage_logs`, `care_circle_summaries`; `documents` +`ai_suggestions`/`ai_suggestions_dismissed_at`/`processing_status`.
- Deviations: BYOK/provider-abstraction/cost/managed-flag net-new vs README; `claude-sonnet-5` default (not `4-6`); self-hosted Whisper (not "on-device"); `unpdf` (not `pdf-parse`); §2 meds via inline review form; DB rate-limit (no Redis); removed a per-request `users_profiles` upsert from middleware (perf). Full list in `PHASE_3_PLAN.md`.

## Completed Phase 4 (2026-07-08) — migrations `202607080001` + `202607080002`

- **Crisis & Continuity Mode.** New table `notifications` (RLS recipient-only; inserts via SECURITY DEFINER only; no delete). New private bucket `emergency-packets` (coordinator+). Enum `timeline_events.event_type` +crisis_activated/+crisis_deactivated. SECURITY DEFINER fns `activate_crisis_mode`/`deactivate_crisis_mode` (atomic flags + `crisis_mode_sessions` + timeline via `create_timeline_event` + immediate notifications; deactivate → duration + `note_type='handoff'` continuity note) and `process_due_reminders` (reminder→notification delivery + unack re-notify + escalation firing; **pg_cron every 5 min**; in-app only).
- APIs: `/api/crisis/activate|deactivate|status|pending-tasks`, `/api/emergency-packet`, `/api/notifications` (GET/PATCH), **`POST /api/timeline`** (user_entry). UI: app-wide `CrisisModeProvider` (30s poll) → red strip + condensed 5-item sidebar + offline banner; crisis dashboard; Emergency Packet modal (pdfkit, 24h signed link); packet-only crisis Documents; continuity-checklist deactivate; functional notification bell (60s poll). Offline: self-hosted `public/sw.js` (SWR 5 critical reads + IndexedDB write-queue) via `workbox-window` (prod-only, cleared on logout). Deps: pdfkit, @types/pdfkit, workbox-window.
- Decisions (user chose all recommended): pg_cron + SQL job; pdfkit + linked pinned docs; spec dashboard layout; Emergency-Packet-only crisis Documents.
- Deviations: crisis alert = immediate notifications (not a queued reminder → avoids cron double-notify); `notify_emergency_contact` no-op in-app (Phase 5); hand-authored SW (not full Workbox runtime); emergency-strip border DESIGN red-400 (prompt said red-200); reminder-unack hours in `care_circles.settings` (default 4). Added `POST /api/timeline` (backfills a Phase-1 gap).
- **Verified:** live e2e 36/37 (authenticated test account, isolated throwaway circle, torn down clean); static gates green (typecheck/lint/build 49 pages/worker). `202607080001` APPLIED + pg_cron ON; `202607080002` (hardening) authored — confirm applied.

## Remaining Known Deviations (flagged, not fixed)

- `caregiver` complete-tasks: **DONE in Phase 2** (`complete_task` RPC).
- No storage `DELETE` policy on `documents` bucket → archived docs leave orphaned files (no purge path). Storage-lifecycle pass for a later phase.
- Pre-existing Phase 1 dashboard gap: center column still shows static empty states (Upcoming/Open tasks/recent activity not wired to real data); Documents stat still `-`.
- Notification *delivery* (email/push/SMS) unbuilt — reminders are just rows. Notes not in primary sidebar (matches DESIGN nav); `task_comments` append-only; TanStack Query unused; minor RLS edges (see HANDOVER).

## Completed Phase 5 (2026-07-08) — migrations `202607080003`–`202607080008` (authored, await apply)

- **Advanced Collaboration** on `phase-5-checkpoint`. Full record: `PHASE_5_PLAN.md`.
- §1 multi-circle UX (`/workspaces` + switcher metadata); §3 additive capability layer + per-membership permission overrides (Settings→Members) enforced on resource-write/crisis/circle.settings/export routes; §2 external delivery (per-category/channel prefs + `create_notification` for assign/handoff + Deno delivery Edge Function for Resend/FCM — authored, not deployed); §4 analytics (coordinator-only SQL aggregates + Recharts); §5 export (JSON zip + Care Summary PDF); §6 calendar import (.ics built; Google OAuth authored/unverifiable; no write-back); §7 daily pg_cron lifecycle (expiry downgrade/remove + handoff-elevation revert; `memberships.deleted_at`); §8 multi-household (Locations tab; access notes coordinator-only via DB-enforced companion table).
- New deps: `jszip`, `recharts`. Excluded per spec: SMS, Gmail import, Drive/Dropbox sync, calendar write-back. Deviations + tech debt: `PHASE_5_PLAN.md`.

## Next Step

**All 6 phases (0–5) complete + merged to `main`.** **Next session = hardening pass (NOT features):** security
audit of the whole app (authorization/RLS cross-circle + capability-override enforcement, private-notes +
household access-notes isolation, auth/401, XSS + `.ics` parser, secrets/crypto incl. the Google OAuth
`state` CSRF gap, `npm audit`) — test via API **and** direct PostgREST under a user JWT — plus performance
(slow tab switching → adopt the installed-but-unused TanStack Query + skeletons; the Settings "no details
found" loading-flash; ~1s `/api/search`; N+1s; heavy Recharts bundle) and bug fixes. **Then** a DESIGN
redesign pass on the Phase 5 UI. Full brief: **`NEXT_SESSION_HANDOFF.md`**. Then deployment (see
`DEPLOYMENT.md` "Phase 5 (done)": rotate `service_role`, deploy the notification Edge Function +Resend/FCM,
Google OAuth client, client FCM, staging). Older note (superseded): (Phase 5 = Advanced Collaboration: multi-circle UX + workspace switcher, granular per-record permissions, workload/accountability analytics, full care-history export PDF/JSON, calendar + email/Drive integrations, notification channel prefs email/SMS/push, multi-household — cross-check any spec against README "Phase 5 — Advanced Collaboration" and flag scope before writing code). Groundwork already shipped: app is architecturally multi-circle; Phase 4 gave the in-app notification center + a pg_cron job runner (Phase 5 adds *external* channels + prefs on top). **Hosting/deployment is intentionally DEFERRED to after all phases** — see `DEPLOYMENT.md`; `service_role` key still needs rotating before deploy. Standing test login in `.env.local` (`VIGIL_TEST_EMAIL`/`VIGIL_TEST_PASSWORD`).

