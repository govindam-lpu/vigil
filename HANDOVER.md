# Vigil Handover

Last updated: 2026-07-04

This file is the project handover for a new Codex session. Treat it as operational memory, not as a replacement for the source-of-truth specs.

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

Implemented phases:

- Phase 0: complete
- Phase 1: complete

Not started:

- Phase 2 and beyond

The remote Supabase database has had migrations applied via the transaction pooler. The exact DB password was shared in chat but must not be copied into docs or committed. If migrations need to be pushed again, ask the user for the current secure connection string/password or use the local shell history only if explicitly appropriate.

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

## What Is Left Next

Wait for the user’s explicit Phase 2 prompt before building more.

Likely Phase 2 areas from README are Care Operations, but do not infer scope. The user must provide the specific Phase 2 requirements. **Cross-check any Phase 2 prompt against README's "Phase 2 — Care Operations"** (medications; recurring task/reminder schedules; symptom/observation logging; visit summaries; check-in logging; follow-up task generation; escalation logic; responsibility handoff; optimistic locking + conflict-resolution UI) and flag out-of-scope items before writing code.

Before Phase 2, a prudent new session should:

1. Read `README.md` and `DESIGN.md`.
2. Read this handover + `PROJECT_MEMORY.md`.
3. Run `npm run typecheck`, `npm run lint`, `npm run build` (all currently green).

Migrations are already applied and a live smoke test already passed this session — no need to re-apply or re-verify unless something changed. The pre-Phase-2 debt fixes (deep links, load cancellation/error surfacing) are in the working tree; confirm whether they've been committed before starting Phase 2.

