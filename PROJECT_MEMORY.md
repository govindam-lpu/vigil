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

- Phase 0 complete. Phase 1 complete. **Phase 2 (Care Operations) complete — built, applied, verified, committed, pushed (2026-07-04).**
- **Do NOT start Phase 3 until the user gives the explicit Phase 3 prompt.**
- **Migration `202607040001_phase_2_care_operations.sql` APPLIED to remote** (session-pooler `db push`); `migration list` = local == remote for all six. Direct schema spot-check 11/11.
- **Static gates green** (typecheck / lint / build, 38/38 pages). **Authenticated e2e PASSED 16/16** (signed in as the real test account via supabase-js): RLS inserts allowed for the correct roles on every new table; the 3 new timeline enums + `medication_refill` reminder enum accepted via real writes; `complete_task` RPC returns done AND spawns the recurring +1wk instance; write into a non-member circle rejected; all test rows cleaned up. NOT browser-tested: the Next route handlers + React UI (build-verified only, low risk).
- **On GitHub** (`github.com/govindam-lpu/vigil`): `phase-2-checkpoint` (`0d3fb53`) pushed. Merge into `main` via **PR #3** (https://github.com/govindam-lpu/vigil/pull/new/phase-2-checkpoint) — remote `main` already has Phase 1 (PRs #1+#2). Local `main` (`409352f`) is stale vs remote.
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

## Completed Phase 2 (2026-07-04) — migration `202607040001`

- New tables (RLS on all, no DELETE policy): contacts, medications, medication_administration_logs, check_ins, observations, escalation_rules, crisis_mode_sessions (inert Phase-4 groundwork — user approved).
- Enums: reminder_type +`medication_refill`; timeline event_type +`check_in`/+`medication_changed`/+`observation_logged`. Columns: notes.note_type, memberships.original_role + elevation_expires_at, appointments.provider_contact_id, escalation_rules.target_role. RPC `complete_task` (caregiver completion + recurring next-instance spawn).
- APIs (new): contacts, medications (+/administrations), check-ins, observations, escalation-rules, handoff. Enhanced: tasks (recurrence + RPC completion + description conflict), appointments (follow-up tasks + provider contact), persons (PATCH + conflict), notes (content edit + conflict), timeline (linkedObjectId filter).
- UI (new): /medications, /people (contacts + person profile edit), /settings (escalation rules); dashboard modules (quick check-in, refills-due, observations logger, handoff); shared ConflictModal; recurring-task + visit-summary follow-up UI.
- Scope decisions the user made: build inert crisis_mode_sessions table; INCLUDE symptom/observation logging (README P2 item the spec omitted; observations table designed here); INCLUDE medication_administration_logs.
- Deviations: reminder recurrence NOT built (task recurrence only); escalation firing + handoff role-elevation auto-revert deferred to Phase 4; recurrence-on-completion lives in the `complete_task` RPC (RLS-safe for caregivers) not the API; medications not added to global search; caregiver task-*description* edit 403s silently (completion works).

## Remaining Known Deviations (flagged, not fixed)

- `caregiver` complete-tasks: **DONE in Phase 2** (`complete_task` RPC).
- No storage `DELETE` policy on `documents` bucket → archived docs leave orphaned files (no purge path). Storage-lifecycle pass for a later phase.
- Pre-existing Phase 1 dashboard gap: center column still shows static empty states (Upcoming/Open tasks/recent activity not wired to real data); Documents stat still `-`.
- Notification *delivery* (email/push/SMS) unbuilt — reminders are just rows. Notes not in primary sidebar (matches DESIGN nav); `task_comments` append-only; TanStack Query unused; minor RLS edges (see HANDOVER).

## Next Step

Phase 2 is complete, applied, and verified. **Do not build anything until the user gives the explicit Phase 3 prompt** (Phase 3 = AI-Assisted Capture: OCR, voice notes, document extraction, suggested tasks/reminders — cross-check any spec against README "Phase 3" and flag scope before writing code). Optional before Phase 3: merge PR #3 (phase-2-checkpoint → main); rotate the DB password shared in chat; address flagged debt if desired.

