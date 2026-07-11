# Vigil Handover

Last updated: 2026-07-08

This file is the project handover for a new session. Treat it as operational memory, not as a replacement for the source-of-truth specs.

## Source Of Truth

The user provided two specification files before development began:

- `C:/Users/govin/Downloads/README.md`
- `C:/Users/govin/Downloads/DESIGN.md`

These two files define Vigil completely. If a future prompt contradicts them, flag the contradiction before proceeding. If a detail is not in those files or the current phase prompt, ask before inventing it.

## Product Summary

Vigil is a shared operational memory and coordination system for families managing one dependent person's life. It is Person-centric and Care Circle-scoped. The core goal is reliable shared context, clear responsibility, auditability, and continuity for caregiving work.

## Stack

- Frontend: Next.js 14 App Router, TypeScript, Tailwind CSS, shadcn-style primitives
- Auth/database/storage: Supabase
- Server state: intended TanStack Query v5, though current implementation mostly uses local `fetch`/state
- API: Next.js API routes under `app/api`
- Runtime env: `D:\Vigil\.env.local` contains Supabase public URL and anon key. Do not commit or expose secrets.

## Standing Rules From User

These apply to every phase.

1. Enforce permissions server-side on every API route. Never trust client-side state for access control. Use a reusable middleware/helper that checks `care_circle_id` membership before reading or writing care-circle data.
2. Never use `any` in TypeScript. Define explicit types for every object. Types should match README data model.
3. Every database query touching care-circle data must filter by `care_circle_id` and verify the requesting user is a member of that circle.
4. Soft-delete only. Never hard-delete a record without explicit Owner confirmation and a second confirmation step. Deleted records use `deleted_at` and default queries exclude them.
5. Write an audit log entry for every write operation: create, update, delete/archive, permission changes.
6. Follow `DESIGN.md` exactly. Use tokens: `neutral-50` `#F9FAFB`, `blue-600` `#2563EB`, `red-600` `#DC2626`, `green-600` `#16A34A`, `yellow-600` `#D97706`. Font is Inter via `next/font`.
7. RLS policies must be written for every Supabase table.
8. Every Supabase migration must be a versioned `.sql` file in `/supabase/migrations`. Do not use the dashboard for schema changes.
9. Do not build features from future phases. Check README before adding anything not explicitly requested for the current phase.
10. After each phase, produce a checklist of what was built, what was intentionally excluded, and any deviations from spec with reasoning.

## Current Project State

Implemented phases (all merged to remote `main`):

- Phase 0: complete
- Phase 1: complete (PRs #1 + #2)
- Phase 2: complete — Care Operations (PR #3)
- Phase 3: complete — **AI-Assisted Capture** (branch `phase-3-ai-capture`, merged 2026-07-08). 3a = BYOK AI (Anthropic + Gemini provider abstraction, AES-256-GCM key storage, OCR worker, doc extraction→suggestions, dashboard summary, note→task); 3b = voice notes (self-hosted faster-whisper). Migration `202607050001_phase_3_ai_capture.sql` applied. **Full Phase 3 record: `PHASE_3_PLAN.md`.**
- Phase 4: complete — **Crisis & Continuity Mode** (branch `phase-4-checkpoint`, merged 2026-07-08). Crisis-mode UI lens, Emergency Packet PDF export, in-app notifications + reminder-delivery job (pg_cron), offline service worker. Migrations `202607080001` (applied) + `202607080002` (reminder-job hardening). Live e2e 36/37. **Full Phase 4 record: `PHASE_4_PLAN.md`.**

- Phase 5: **BUILT on `phase-5-checkpoint`** — Advanced Collaboration. Static gates green
  (typecheck/lint/build/typecheck:worker). **6 migrations authored (`202607080003`–`202607080008`),
  awaiting user apply; live e2e pending apply.** Full record: `PHASE_5_PLAN.md`.

**IMPORTANT — the app is broken against the pre-Phase-5 DB until migrations are applied:** the
write routes now query `membership_permission_overrides` (added by `202607080003`). Apply all six
in order, then run the e2e.

**The app is now 3 deployables** — the Next web app + `worker/` (Node OCR/extraction) + `transcription/` (Python faster-whisper). **Nothing is deployed: hosting is intentionally DEFERRED to after all phases** (see `DEPLOYMENT.md`). The app runs locally (`npm run dev`) against the remote Supabase. All Supabase migrations are applied through `202607050001`. Secrets note: `AI_KEY_ENC_SECRET` lives in `.env.local`; the `service_role` key was shared in chat and **must be rotated before/at deploy**; never copy secrets into docs or commits.

## Commands

Run the app:

```powershell
cd D:\Vigil
npm run dev -- --hostname 127.0.0.1 --port 3000
```

Open:

```text
http://127.0.0.1:3000/login
```

Verification commands:

```powershell
npm run typecheck
npm run lint
npm run build
```

Important: stop the running dev server before `npm run build` if `.next/trace` is locked.

## Phase 0 Completed

Database tables:

- `users_profiles`
- `care_circles`
- `persons`
- `memberships`
- `folders`
- `audit_logs`
- `invitations`

Phase 0 migrations:

- `supabase/migrations/202605210001_phase_0_foundation.sql`
- `supabase/migrations/202606090001_onboarding_rpc.sql`

Important database functions:

- `create_default_folders(person_id uuid, care_circle_id uuid)`
- `create_onboarding_care_circle(...)`

The onboarding RPC was added after the original RLS bootstrap failed. It atomically creates care circle, person, owner membership, folders, and audit logs under controlled `auth.uid()` checks.

Phase 0 app/API:

- Supabase email/password + Google OAuth login
- Auth callback at `/auth/callback`
- Middleware redirects unauthenticated users to `/login`
- Middleware redirects authenticated users without memberships to `/onboarding`
- Onboarding creates care circle/person/owner membership/default folders
- App shell: top bar, person switcher, sidebar, user menu
- Dashboard with person snapshot, member list, empty-state modules, quick stats
- Stub pages for non-Phase-0 sections
- API routes:
  - `GET/POST /api/care-circles`
  - `GET /api/persons`
  - `GET /api/memberships`

Phase 0 verification completed:

- `npm run typecheck` passed
- `npm run lint` passed
- `npm run build` passed
- Runtime onboarding was manually tested after migrations were applied

## Phase 1 Completed

Phase 1 migration:

- `supabase/migrations/202606090002_phase_1_shared_memory.sql`

New database tables:

- `tasks`
- `appointments`
- `notes`
- `timeline_events`
- `reminders`
- `documents`
- `task_comments`

Altered table:

- `memberships.last_caught_up_at`

New database functions:

- `create_timeline_event(...)`
- `search_phase1(...)`
- `mark_membership_caught_up(...)`

Storage:

- Supabase Storage bucket `documents` is created by migration.

RLS:

- All Phase 1 tables have RLS enabled.
- Policies follow the Phase 0 care-circle membership pattern.
- Select requires membership.
- Operational create/update generally requires contributor+ where appropriate.
- Notes are author/coordinator constrained.
- Task comments require membership and author ownership on insert.

Shared server helpers added:

- `lib/api/server.ts`
- `lib/api/audit.ts`
- `lib/api/timeline.ts`
- `lib/api/records.ts`

Types updated:

- `lib/types/core.ts`
- `lib/types/database.ts`
- `lib/types/index.ts`

Utilities updated:

- `lib/utils.ts`

New/updated API routes:

- `GET/POST/PATCH /api/tasks`
- `POST /api/tasks/comments`
- `GET/POST/PATCH /api/appointments`
- `GET/POST/PATCH /api/documents`
- `GET /api/folders`
- `GET/POST/PATCH /api/notes`
- `GET/PATCH /api/timeline`
- `GET /api/search`
- `GET/PATCH /api/dashboard/changes`

New/updated UI:

- `/timeline`
- `/tasks`
- `/calendar`
- `/documents`
- `/notes`
- `/search`
- Functional top-bar search
- Dashboard "Since your last visit" callout

New major component files:

- `components/tasks/tasks-view.tsx`
- `components/timeline/timeline-view.tsx`
- `components/appointments/appointments-view.tsx`
- `components/documents/documents-view.tsx`
- `components/notes/notes-view.tsx`
- `components/search/search-view.tsx`

Phase 1 verification completed:

- `npm run typecheck` passed
- `npm run lint` passed with no warnings/errors
- `npm run build` passed
- HTTP smoke check:
  - `/login` returned `200`
  - protected pages `/tasks`, `/timeline`, `/calendar`, `/documents`, `/notes`, `/search` returned redirects when unauthenticated

## Phase 1 Intentional Exclusions

Not built because they are future phases or explicitly excluded:

- Medications
- Recurring schedules
- Check-ins
- Visit summaries
- Symptoms/observations
- Escalation rules
- Responsibility handoff flow
- Conflict resolution UI
- OCR
- AI features
- Crisis mode
- Invite UI flow
- Notification delivery via email/push/SMS

## ✅ Migrations Applied (2026-07-04)

Both previously-pending migrations are now **applied to the remote Supabase DB** — pushed via `npx supabase db push --db-url "<session pooler>"`. `npx supabase migration list` confirms local == remote for all five migrations:

- `202605210001`, `202606090001`, `202606090002`, `202607030001`, `202607030002` — all present remotely. **No pending migrations.**

The two applied this session:

1. `supabase/migrations/202607030001_phase_1_debt.sql` — applied
2. `supabase/migrations/202607030002_phase_1_audit_fixes.sql` — applied

## Phase 1 Debt Paydown (2026-07-03) — migration `202607030001`

Fixed:

- **Timeline soft-delete.** Added `timeline_events.deleted_at`. `PATCH /api/timeline` archive now sets `deleted_at` (was redacting title/body + setting `is_editable=false`, which also violated the `timeline_update_author_editable` RLS WITH CHECK — the old archive path was effectively broken under RLS). GET filters `deleted_at is null`; `search_phase1` recreated to exclude soft-deleted timeline rows.
- **Signed document URLs + storage security.** Added `documents.storage_path` (backfilled from `file_url`); made `file_url` nullable. The `documents` storage bucket is now **private**, and the previous wide-open storage RLS (any authenticated user could read any circle's files; public bucket meant anyone with the URL could too — a real cross-circle leak) is replaced with per-care-circle policies using `is_care_circle_member` / `can_insert_into_circle` on the first path segment. New `GET /api/documents/signed-url` returns a 60-second signed URL after a membership check; document preview/open/download and appointment attachments all go through it. Signing runs as the user session (anon key + RLS) — no service-role key needed. Runtime note: confirm user-scoped `createSignedUrl` works against the live project.
- **Formal appointment↔document link.** Added `documents.appointment_id` FK (indexed). `POST /api/documents` accepts `appointmentId`; `GET /api/documents` supports an `appointmentId` filter. The appointment detail pane now lists linked attachments (opened via signed URL) instead of a fire-and-forget uploader.
- **Document tags surfaced in UI.** Tags input in the Add Document modal; tag chips shown + editable in the detail pane and shown on list rows. `PATCH /api/documents` now accepts `tags`.

## Phase 0/1 Audit (2026-07-03) — migration `202607030002` + code

Full review of Phase 0 + Phase 1 (server routes, permission helpers, middleware, RLS/migrations, and UI). Fixed:

- **[CRITICAL] Private notes were readable at the DB layer.** `notes_select_members` checked only membership; the API merely masked `content` in JS. Because the app runs under the anon key + the user's session token, any member could read other members' private-note content directly via PostgREST. RLS SELECT now enforces `is_private = false OR author_id = auth.uid()`; the notes API also filters (and no longer returns masked private notes — per DESIGN they're excluded for non-authors).
- **[HIGH] `caregiver` note creation was broken.** API allowed caregivers to POST notes but RLS required contributor+ → insert failed. Added `can_log_care()` helper (owner/coordinator/contributor/caregiver); notes-insert and task-comment-insert now use it. Task-comment POST min role raised from `emergency` to `caregiver` (read-only roles shouldn't write).
- **[HIGH] Inter font was never applied.** `font-sans` wasn't mapped to the loaded font var; whole app rendered in the system font. Added `fontFamily.sans → var(--font-inter)` in `tailwind.config.ts`.
- **[HIGH] Detail-pane inputs didn't reset on selection change.** Uncontrolled `defaultValue` fields with no `key` in Appointment/Document detail panes could overwrite the wrong record after switching selection. Added `key={selected.id}` so the pane remounts.
- **[HIGH] Stored XSS in search snippets.** `search-view` rendered `ts_headline` output via `dangerouslySetInnerHTML`; Postgres doesn't escape source text. `search_phase1` now emits non-HTML `@@HL@@` sentinels; the client escapes the snippet then converts sentinels to `<mark>`.
- **[MEDIUM] `users_profiles` cross-member read ignored membership expiry.** Expired members could still read co-members' profiles/phone. Policy now checks `expires_at`.
- **[MEDIUM] `create_timeline_event` trusted a caller-supplied `author_id`** (attribution spoofing via direct RPC). Now forces `auth.uid()`.
- **[MEDIUM] `documents.is_private` had no DB guard.** Added author-only SELECT parity with notes (no-op today since the API never sets private docs; future-proofs the flag).
- **[LOW] `yellow-600` off-token** (rendered Tailwind `#CA8A04` vs DESIGN `#D97706`) → yellow scale remapped in Tailwind config. **[LOW] top-bar dead `all` ternary** (`> 1 ? "false" : "false"`) cleaned to the spec-correct within-Person default.

Positive confirmations: RLS enabled on every care-circle table; **no DELETE policy anywhere** (hard-delete impossible); all CHECK enums match the TS unions with zero drift; SECURITY DEFINER helpers pin `search_path` and check `auth.uid()`; every policy targets `authenticated`.

## Pre-Phase-2 Debt Paydown (2026-07-04) — code only, no migration

Fixed this session (in the working tree — confirm whether committed):

- **[FIXED] Deep links now select the target record.** `/tasks`, `/calendar`, `/documents` read `?task` / `?appointment` / `?document` via `useSearchParams` and select that record. Each view is wrapped in `<Suspense>` (mirroring `search-view`) for the hook. Documents resolves the doc's folder first via a new **scoped `?id` filter added to `GET /api/documents`** (still filters `care_circle_id` + `person_id` + membership).
- **[FIXED] List/dashboard loads now cancel + surface errors.** All six loads (tasks, appointments, documents, notes, timeline, dashboard) guard state writes behind a `cancelled` flag (no more wrong-Person flash on fast circle-switch) and check `response.ok`, surfacing a retry-able banner via the new shared `components/ui/load-error.tsx` (DESIGN tokens: red-400 border, red-50 bg, red-600 text) instead of silently rendering empty.
- Static gates green after these changes; **live e2e passed** (see below).

## Phase 2 Completed (2026-07-04) — migration `202607040001_phase_2_care_operations.sql`

**Applied to remote** via `npx supabase db push --db-url "<session pooler>"`; `npx supabase migration list` shows local == remote for all six migrations. Schema verified directly (11/11 checks) and an **authenticated e2e passed 16/16** (signed in as the test account via a throwaway `supabase-js` script; exercised RLS + new enums + `complete_task` RPC under real `auth.uid()`, then cleaned up every test row). Static gates green (typecheck / lint / build, 38/38). Committed `0d3fb53` on `phase-2-checkpoint`, pushed to GitHub.

New tables (RLS on all; **no DELETE policy anywhere**): `contacts`, `medications`, `medication_administration_logs`, `check_ins`, `observations`, `escalation_rules`, `crisis_mode_sessions` (inert Phase-4 groundwork — user approved).

Enum extensions: `reminders.reminder_type` +`medication_refill`; `timeline_events.event_type` +`check_in`/`medication_changed`/`observation_logged`. New columns: `notes.note_type`, `memberships.original_role`+`elevation_expires_at`, `appointments.provider_contact_id`, `escalation_rules.target_role`. RPC `complete_task(task_id)` — caregiver completion + recurring next-instance spawn (SECURITY DEFINER, `search_path` pinned, `can_log_care` gate).

New API routes: `/api/contacts`, `/api/medications`, `/api/medications/administrations`, `/api/check-ins`, `/api/observations`, `/api/escalation-rules`, `/api/handoff`. Enhanced: tasks (recurrence + RPC completion + description conflict), appointments (follow-up tasks + provider contact), persons (added PATCH + conflict), notes (content edit + conflict), timeline (`linkedObjectId` filter).

New UI: `/medications`, `/people` (members + Care Team Contacts + Person profile edit), `/settings` (escalation rules); dashboard modules (quick check-in, refills-due, observations logger, hand-off); shared `components/ui/conflict-modal.tsx`; recurring-task + visit-summary follow-up UI.

Scope decisions (user-approved when flagged): built the inert `crisis_mode_sessions` table; INCLUDED symptom/observation logging (a README Phase-2 item the spec omitted — the `observations` table was designed here); INCLUDED `medication_administration_logs`.

Phase 2 deviations (flagged): reminder recurrence not built (task recurrence only); escalation-rule *firing* and handoff role-elevation *auto-revert* deferred to Phase 4 (need background jobs); recurrence-on-completion lives in the `complete_task` RPC (not the API) so caregiver completions recur RLS-safely; medications not added to global search (`search_phase1` unchanged); caregiver task-*description* edits 403 silently (completion works, editing is contributor+).

## Remaining Known Deviations / Technical Debt

Still open (design decisions or lower priority):

- **`caregiver` cannot mark tasks complete.** Both the tasks API and RLS require contributor+ (consistent — a capability gap, not a broken flow). Spec says caregivers can complete tasks. Correct fix is a constrained `complete_task(task_id)` SECURITY DEFINER RPC (column-level restriction isn't expressible in RLS). **Deferred into Phase 2** (belongs with care-ops / task work).
- **No storage `DELETE` policy on the `documents` bucket.** Archiving a document soft-deletes the row, but its storage object is never removed and can't be removed via a user session (no delete policy). Files accumulate as orphans; there's no purge path even on hard-delete. Consistent with soft-delete-only, but worth a storage-lifecycle pass later. (Confirmed live: user-session storage DELETE returns 400.)
- Notes page exists at `/notes` but isn't in the primary sidebar (`DESIGN.md` primary nav omits Notes — intentional).
- `task_comments` is append-only (no UPDATE policy / no `deleted_at`) — assumed intentional.
- Server state uses local fetch/state, not TanStack Query (installed but unused).
- Minor: notes UPDATE policy still lets a coordinator soft-delete another member's private note via direct PostgREST (can't read it, only delete). `audit_logs` rows with null `care_circle_id` are unreadable. Storage path RLS `::uuid` cast throws on non-UUID first segments (all app paths are UUID-prefixed).

## Important Implementation Notes

- `checkMembership(userId, careCircleId, minimumRole?)` lives in `lib/permissions/checkMembership.ts`.
- Role hierarchy lives in `lib/permissions/roles.ts`: `owner > coordinator > contributor > caregiver > viewer > emergency`.
- API routes must call server-side auth/membership checks before touching care-circle data.
- Audit logging helper is `createAuditLog(...)`.
- Timeline creation helper is `createTimelineEvent(...)`, which calls the explicit DB function. Do not create timeline rows via triggers.
- Default operational queries should include:
  - `care_circle_id`
  - `person_id` where relevant
  - `deleted_at is null` for soft-deletable tables
- Avoid hard deletes.
- For new migrations, use versioned filenames under `supabase/migrations`.
- Remote migrations were pushed with `npx supabase db push --db-url ...`.

## Current Main Files

Root/config:

- `package.json`
- `package-lock.json`
- `next.config.mjs`
- `tsconfig.json`
- `tailwind.config.ts`
- `postcss.config.mjs`
- `.env.local` exists locally and is ignored

App shell/auth:

- `middleware.ts`
- `app/layout.tsx`
- `app/(auth)/login/page.tsx`
- `app/(auth)/onboarding/page.tsx`
- `app/auth/callback/route.ts`
- `components/shell/*`

Core pages:

- `app/(app)/dashboard/page.tsx`
- `app/(app)/timeline/page.tsx`
- `app/(app)/tasks/page.tsx`
- `app/(app)/calendar/page.tsx`
- `app/(app)/documents/page.tsx`
- `app/(app)/notes/page.tsx`
- `app/(app)/search/page.tsx`

## Live e2e Verification (2026-07-04)

Ran headlessly against the live project (Preview browser, logged in as the test account `govindam@mridangamedia.com`, circle "MM Care" — an empty circle that was seeded with throwaway data and then cleaned up):

- **Signed URLs ✅** — uploaded to the private bucket → created the doc via `POST /api/documents` → `GET /api/documents/signed-url` returned a signed URL → fetched it (bytes matched) → unsigned public URL rejected (`400`). User-scoped `createSignedUrl` through the private bucket works, and the bucket is genuinely private (cross-circle leak closed).
- **Search highlighting ✅** — a note containing a literal `<script>` searched clean: `search_phase1` emits `@@HL@@` sentinels; rendered DOM has only `<mark>` (no `<script>`, nothing executed).
- **Caregiver note creation** — left as code+migration-verified (`can_log_care` applied; notes API min-role `caregiver`); not exercised live per the user's call.
- Cleanup: seeded note/doc soft-deleted, timeline entries archived; one orphaned storage object remains (no user delete policy — see debt list). The `service_role` key was shared in chat but ultimately unused — **user was advised to rotate it.**

## Phase 4 Completed (2026-07-08) — migrations `202607080001` + `202607080002`

**Crisis & Continuity Mode.** Built + static gates green + **live e2e 36/37** (authenticated as the test account in an isolated throwaway circle, torn down clean). Migration `202607080001_phase_4_crisis_continuity.sql` **APPLIED** and **`pg_cron` enabled** (user); hardening `202607080002_harden_reminder_job.sql` authored — **confirm it is applied** (revokes `execute` on `process_due_reminders` from public/anon/authenticated so only pg_cron runs it). **Full record: `PHASE_4_PLAN.md`.**

New table (RLS, no delete): `notifications` (recipient-only select/update; inserts only via SECURITY DEFINER fns). New private storage bucket `emergency-packets` (coordinator+ RLS). Enum: `timeline_events.event_type` +`crisis_activated`/+`crisis_deactivated`. SECURITY DEFINER fns: `activate_crisis_mode` / `deactivate_crisis_mode` (atomic care_circle flags + `crisis_mode_sessions` row + timeline via `create_timeline_event` + immediate notifications; deactivate writes a `note_type='handoff'` continuity note + duration) and `process_due_reminders` (reminder-delivery job, pg_cron every 5 min, **in-app only**).

New API routes: `POST /api/crisis/activate|deactivate`, `GET /api/crisis/status|pending-tasks`, `POST /api/emergency-packet`, `GET|PATCH /api/notifications`, and **`POST /api/timeline`** (user_entry — backfills a Phase-1 gap). New UI: app-wide `CrisisModeProvider` (30s poll of `/api/crisis/status`) → red strip + condensed 5-item sidebar + offline banner; restructured crisis dashboard; Emergency Packet modal (pdfkit, 24h signed link); packet-only crisis Documents view; activate/deactivate modals (deactivate = summary → continuity checklist of crisis-created tasks with inline reassign); functional notification bell (60s poll). Offline: self-hosted `public/sw.js` (stale-while-revalidate for 5 critical reads + IndexedDB write-queue) registered via `workbox-window` (production-only; cleared on logout). New deps: `pdfkit`, `@types/pdfkit`, `workbox-window`.

**Deviations (flagged):** crisis activation writes notifications DIRECTLY (immediate, per README) instead of a queued reminder (avoids the 5-min cron double-notifying); `notify_emergency_contact` escalation action is a no-op in-app (external channel = Phase 5); hand-authored SW instead of the full Workbox runtime (CSP-safe; avoids a build-pipeline/esbuild step that risked the green build); emergency-strip border = DESIGN `red-400` (Phase-4 prompt said `red-200`); reminder-unack window configurable via `care_circles.settings.reminder_unack_hours` (default 4). **Excluded (Phase 5):** external email/SMS/push delivery, calendar/email integrations, analytics, multi-circle UI.

## Phase 5 Completed (2026-07-08) — migrations `202607080003`–`202607080008` (authored, await apply)

**Advanced Collaboration.** Full record: `PHASE_5_PLAN.md`. Built on `phase-5-checkpoint` (off `main`).
Multi-circle UX (`/workspaces` + switcher metadata); **additive capability layer** + per-membership
permission overrides (Settings → Members → Manage permissions), enforced on resource-write/crisis/settings/export
routes; external notification delivery (per-category/channel prefs + `create_notification` for task-assign/handoff
+ a Deno **delivery Edge Function** for Resend email/FCM push — authored, not deployed); workload analytics
(coordinator-only, SQL aggregates + Recharts); care-history export (JSON zip + Care Summary PDF); calendar import
(.ics fully built; Google OAuth authored/unverifiable; no write-back); temporary-access lifecycle (daily pg_cron:
expiry downgrade/remove + handoff-elevation revert); multi-household (Locations tab; access notes coordinator-only
via a DB-enforced companion table). New deps: `jszip`, `recharts`. **Excluded (per spec):** SMS, Gmail import,
Drive/Dropbox sync, calendar write-back. Deviations + tech debt in `PHASE_5_PLAN.md`.

## Redesign — "Night Watch" (branch `redesign`, off `main`, 2026-07-09)

Front-end-only visual redesign. **No security/RLS/API/data-model changes** — pure presentation. Standing
rules held (server-side authz, soft-delete, audit, RLS all untouched). Source of truth is the rewritten
**DESIGN.md "Visual Identity — The Night Watch"** + "Typography"/"Color Strategy" sections.

- **Identity:** navigation lives on a deep-evergreen **night rail** (`night` #12211C, desktop sidebar +
  mobile bottom nav); content sits on a green-cast **porcelain** field (`neutral-50` #F4F6F1). The
  **ember** (`#E8A33D`) is the single signature accent — the "keeping watch" lamp — used only on the
  wordmark, the active-nav bar, today markers, and Quick Check-in. **Never** for status.
- **Type (three voices):** `font-sans` **Spline Sans** (all UI), `font-mono` **Spline Sans Mono** (record
  data: timestamps, doses, phone numbers, Rx, counts), `font-display` **Literata** serif (wordmark, page
  titles, the Person's name, empty-state headlines). Loaded via `next/font` in `app/layout.tsx`.
- **Color:** old `blue-600` → **`brand-600` evergreen #2E5A4A** everywhere (codemod). Neutrals are a
  green-cast stone scale. Status red/green/yellow/orange semantics **unchanged**; crisis red untouched.
- **Tokens:** `tailwind.config.ts` (colors, fonts, radii, shadows); `app/globals.css` (`.ember-dot` /
  `.ember-pulse`, scrollbars, focus ring, `prefers-reduced-motion`). New shell: `components/shell/wordmark.tsx`,
  `mobile-nav.tsx`. Login/onboarding rebuilt as a night/daylight "threshold" split. Timeline has a real
  spine. `analytics-charts.tsx` Recharts palette moved to evergreen+stone.
- **Verified:** typecheck / lint / build / typecheck:worker all green; live browser check on desktop (1440)
  and mobile (375) against a **seeded demo circle** (Chen Family Care) — dense tasks/medications/timeline/
  calendar/people/analytics all confirmed on-token. QA caught + fixed one real bug: timeline system-entry
  de-emphasis (`isSystem` only matched `system`/`member_joined`; now everything but `user_entry`). See
  `REDESIGN_REPORT.md`.
- **Merged to `main`** via PR #9 (`4410d8b`), 2026-07-11. **A demo circle "Chen Family Care" is still seeded
  on the test account** — tear it down when convenient.

## NEXT SESSION — GO-LIVE / DEPLOYMENT (the job now)

**All six phases + hardening + the redesign are merged to `main`. Vigil has NEVER been deployed — deploying is
the next session's whole job.** Source of truth is **`DEPLOYMENT.md`** (the "Free launch plan" section). User
constraint: **free tier only, always-on** (no self-host — laptop can't stay on; no budget until scale).

**Decided free-launch shape (2026-07-11):**
- **Web app → Vercel Hobby (free).** Non-commercial per ToS (upgrade to Pro when monetized); the ~10 s function
  cap doesn't bite because the only >10 s path (voice) is deferred.
- **DB/auth/storage → Supabase** — already live; **all migrations applied through `202607080010`** (verify with
  `npx supabase migration list --db-url "<SESSION_POOLER>"`, do NOT re-apply).
- **Email → Resend free** via the `deliver-notifications` **Supabase Edge Function** + a pg_cron→pg_net trigger.
- **Google Calendar import → free** Google Cloud OAuth client (`calendar.readonly`). `.ics` needs no config.
- **Rotate `SUPABASE_SERVICE_ROLE_KEY` FIRST** (pasted in chat) → new value ONLY in the Edge Function secrets.
- **Deferred (free path later = Hugging Face Spaces, 16 GB free RAM): `worker/` OCR + `transcription/` voice.**
  Launch with `WORKER_URL` + `NEXT_PUBLIC_TRANSCRIPTION_ENABLED` unset — docs still upload/view, voice button
  hidden, both degrade gracefully. **FCM web-push + Next 16 upgrade also deferred** (not selected).

**Role boundary (safety rules):** the agent CANNOT create accounts, enter secrets/API keys into hosting
dashboards, or buy infra — those are the **user's** actions. The agent prepares configs/env templates/the Edge
Function/the pg_cron SQL/verification, deploys via CLIs the **user** has authenticated (`vercel`, `supabase`),
and verifies live. Secrets never pass through the agent.

## Older brief (superseded, kept for reference)

The prior hardening + redesign brief is in **`NEXT_SESSION_HANDOFF.md`**. Highlights:
- **Security audit** of the whole app (authorization/RLS cross-circle + capability-override enforcement,
  private-notes + household access-notes isolation, auth/401, XSS + `.ics` parser, secrets/crypto incl. the
  Google OAuth `state` CSRF gap, `npm audit`). Test via API **and** direct PostgREST under a user JWT.
- **Performance:** slow tab switching (adopt the installed-but-unused TanStack Query for client caching +
  skeletons), the Settings "no details found" loading-flash, the ~1s `/api/search` call, N+1s
  (`/api/workspaces`, contact hydration), the heavy Recharts bundle on `/settings/analytics`.
- **Bug fixes** surfaced by the audit/testing.
- **Then** a DESIGN.md conformance + redesign pass on the Phase 5 UI (do the hardening first).

Deployment still pending after that (see `DEPLOYMENT.md` "Phase 5 (done)"): **rotate the `service_role` key**,
deploy the notification Edge Function (+ Resend/FCM), register a Google OAuth client, wire client FCM, staging env.

Phase 5 is **Advanced Collaboration** (see README "Phase 5"): first-class multi–Care-Circle UX + workspace switcher; granular per-record permission overrides; workload analytics + accountability dashboard (Coordinators/Owners only); full care-history export (PDF/JSON); calendar integration (read + write); Gmail/email appointment import; Google Drive / Dropbox document sync; notification channel preferences (email, SMS, push per category); multi-household support. **Cross-check any Phase 5 prompt against README's "Phase 5 — Advanced Collaboration" and flag out-of-scope items before writing code.** Note some groundwork already exists: the app is architecturally multi-circle (surfaced now would be UX only); Phase 4 shipped the **in-app** notification center + a **pg_cron job runner** (`process_due_reminders`) — Phase 5's notification work is the *external channels* (email/SMS/push) + preferences on top of it; escalation *firing* also runs in that job now.

A prudent new session should:

1. Read `README.md` and `DESIGN.md` (source of truth) — flag any later instruction that contradicts them.
2. Read this handover + `PROJECT_MEMORY.md` + `PHASE_3_PLAN.md` + `PHASE_4_PLAN.md` + `DEPLOYMENT.md` (why nothing is deployed yet).
3. Run `npm run typecheck`, `npm run lint`, `npm run build`, `npm run typecheck:worker` (all currently green). Stop any dev server before `build` if `.next/trace` is locked.
4. **Do NOT re-apply any migration, re-run prior-phase e2e, or deploy anything** — all migrations through `202607080002` are applied/authored; deployment is deferred to after all phases. **Do NOT build until the Phase 5 prompt arrives.**

Standing test login for any e2e lives in `.env.local` as `VIGIL_TEST_EMAIL` / `VIGIL_TEST_PASSWORD` (gitignored). The `service_role` key in `.env.local` was shared in chat and **must be rotated before/at deploy** (used only for the worker + test teardown, never the web app). The two backend services run locally via `npm run worker` and (Python) `uvicorn main:app` in `transcription/`.

