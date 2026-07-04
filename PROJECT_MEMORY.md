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

- Phase 0 complete.
- Phase 1 complete + debt paydown + Phase 0/1 audit fixes done.
- Phase 2 not started (wait for user's explicit Phase 2 prompt).
- **All migrations applied remotely** (2026-07-04): `202607030001_phase_1_debt.sql` + `202607030002_phase_1_audit_fixes.sql` pushed; `migration list` confirms local == remote for all five. No pending migrations.
- **Pre-Phase-2 debt fixed (2026-07-04, code only, in working tree — confirm if committed):** deep-link record selection (`/tasks`,`/calendar`,`/documents` read `?task`/`?appointment`/`?document`; new scoped `?id` filter on `GET /api/documents`; views `<Suspense>`-wrapped); load cancellation + error surfacing on all six list/dashboard loads (new `components/ui/load-error.tsx`). Green on typecheck/lint/build.
- **Live e2e passed (2026-07-04):** signed URLs resolve from the private bucket + unsigned public URL rejected (400); search highlighting XSS-safe (`@@HL@@`→`<mark>`, no script execution). Caregiver note-creation left code+migration-verified.
- Dev command: `npm run dev -- --hostname 127.0.0.1 --port 3000`.
- Verify with `npm run typecheck`, `npm run lint`, `npm run build` (all pass).

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

## Remaining Known Deviations (flagged, not fixed)

- `caregiver` can't mark tasks complete (needs a `complete_task` RPC — **deferred into Phase 2**).
- No storage `DELETE` policy on `documents` bucket → archived docs leave orphaned files (no purge path). Storage-lifecycle pass for a later phase.
- Notes not in primary sidebar (matches DESIGN nav); `task_comments` append-only; TanStack Query unused; minor RLS edges (see HANDOVER).

## Next Step

Do not continue without the user’s explicit Phase 2 prompt.

