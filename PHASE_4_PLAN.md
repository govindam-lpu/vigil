# Phase 4 — Crisis & Continuity Mode (Build Record)

Status: **COMPLETE** — built, static gates green, live e2e 36/37, merged to `main` (2026-07-08).
Branch: `phase-4-checkpoint`. Source of truth: README "Phase 4 — Crisis and Continuity Mode" + DESIGN "Crisis Mode Design" + the user's Phase 4 prompt.

Crisis mode is a **UI-level state change** (a lens over the existing app), not a separate app. Every AI/crisis output that mutates state goes through server-side permission checks; nothing bypasses RLS.

## Decisions (user chose all four recommended, via AskUserQuestion)

1. **Reminder-delivery job = pg_cron + SECURITY DEFINER `process_due_reminders()`** — runs inside the live DB every 5 min. No new deployable, and **no service-role key in the web app** (a property DEPLOYMENT.md relies on). Chosen over a Supabase Edge Function (new runtime) or a service-role Next route.
2. **Emergency Packet PDF = pdfkit + pinned docs LINKED via 24h signed URL** (DESIGN allows "linked otherwise"). Chosen over pdf-lib embedding (fragile across file types) or Puppeteer (heavy Chromium, bad in serverless).
3. **Crisis dashboard layout = the Phase-4 prompt's layout** (emergency strip; active meds LEFT column; emergency contacts RIGHT column; pinned docs full-width; recent timeline; quick actions). Diverges from DESIGN's "contacts in the strip, meds+docs as the two columns" — user picked the prompt.
4. **Crisis "Documents" nav = Emergency-Packet-only** (pinned docs), per DESIGN "Documents (Emergency Packet only)"; the full library stays reachable via the "All sections" flyout.

## Data model — migration `202607080001_phase_4_crisis_continuity.sql` (APPLIED)

- `timeline_events.event_type` CHECK extended: +`crisis_activated`, +`crisis_deactivated` (all prior values preserved).
- **`notifications`** (new) — `id, care_circle_id, recipient_id → auth.users, reminder_id → reminders (nullable), title, body, notification_type ('crisis_activated'|'reminder'|'escalation'), action_url, is_read, read_at, created_at`. RLS: recipient-only SELECT + UPDATE; **no INSERT policy** (rows created only by SECURITY DEFINER fns); **no DELETE policy**.
- **`emergency-packets`** private storage bucket + per-circle policies scoped to coordinator+ (`has_care_circle_role`), keyed `{care_circle_id}/{uuid}.pdf`.
- **`activate_crisis_mode(care_circle, reason)`** (SECURITY DEFINER) — owner/coordinator only (self-gates). Atomic: sets `care_circles.crisis_mode`/`_activated_at`/`_activated_by`, inserts a `crisis_mode_sessions` row, writes a `crisis_activated` timeline event via `create_timeline_event`, and inserts **immediate** `notifications` for all owner/coordinator members. Idempotent if already active.
- **`deactivate_crisis_mode(care_circle, summary)`** (SECURITY DEFINER) — owner/coordinator only. Closes the open session (deactivated_by/at, summary), writes a `crisis_deactivated` timeline event with duration, and (when a summary is given) a `note_type='handoff'` continuity note.
- **`process_due_reminders()`** (SECURITY DEFINER) — the deferred reminder job. Step 1: due `pending` reminders → `notifications` for each recipient, mark `sent`. Step 2: `sent` reminders still unacknowledged after `care_circles.settings.reminder_unack_hours` (default 4) → re-notify unacked recipients, `snooze_count++`; after `>3`, fire matching `escalation_rules` (trigger `reminder_unacknowledged`; in-app `notify_role`/`notify_user`) and set `expired`. In-app only.
- **pg_cron**: `vigil-process-reminders` every 5 min. Enable + schedule is **fail-soft** (migration still applies if pg_cron isn't pre-enabled).

### Migration `202607080002_harden_reminder_job.sql`
Revokes `execute` on `process_due_reminders()` from `public, anon, authenticated` — it is a cron-only system job. `activate_/deactivate_crisis_mode` stay user-callable (they self-gate and the API calls them as the acting user).

## API routes (Next)

- `POST /api/crisis/activate` — coordinator+ → `activate_crisis_mode` RPC → `createAuditLog('crisis_activated')`.
- `POST /api/crisis/deactivate` — coordinator+ → `deactivate_crisis_mode` RPC → `createAuditLog('crisis_deactivated')`.
- `GET /api/crisis/status` — any member; source for the `CrisisModeProvider` 30s poll.
- `GET /api/crisis/pending-tasks` — coordinator+; open tasks created during the active session (continuity checklist).
- `POST /api/emergency-packet` — coordinator+; gathers person/meds/contacts/pinned-docs/last-5-timeline → pdfkit → uploads to `emergency-packets` → 24h signed URL → `createAuditLog('export')`.
- `GET|PATCH /api/notifications` — recipient's list + unread count / mark one|all read.
- **`POST /api/timeline`** — new; caregiver+ records a `user_entry` (powers crisis "Record update"; backfills a Phase-1 gap).

`createAuditLog` action union widened: +`shared`/`export`/`crisis_activated`/`crisis_deactivated`/`login` (`audit_logs.action_type` is free text — no DB change needed).

## UI (Next)

- `components/shell/crisis-mode-provider.tsx` — app-wide `CrisisModeProvider`, seeds from the active circle, polls `/api/crisis/status` every 30s, tracks `navigator.onLine`, exposes `bannerOffsetPx`.
- `crisis-banner.tsx` (red-600 strip + offline banner), `shell-main.tsx` (padding tracks banners), `sidebar.tsx` (condensed 5-item crisis nav + "All sections" flyout), `top-bar.tsx` (coordinator+ Crisis-Mode button + functional bell; clears offline caches on logout), `service-worker-register.tsx`.
- `components/crisis/*`: `crisis-dashboard.tsx`, `activate-crisis-modal.tsx`, `deactivate-crisis-modal.tsx` (summary → continuity checklist w/ inline reassign), `emergency-packet-modal.tsx` (spinner → Download / Copy 24h link), `crisis-documents-view.tsx` (pinned-only).
- `components/notifications/notification-bell.tsx` (60s poll, grouped by date, mark read/all).
- `components/shared/check-in-modal.tsx` (extracted from the dashboard; reused in crisis).
- `lib/pdf/emergency-packet.ts` (pdfkit builder).

## Offline (service worker)

Self-hosted `public/sw.js` (no CDN, CSP-safe): stale-while-revalidate for 5 critical GET reads (persons, medications, contacts, documents-metadata, timeline) + an IndexedDB write-queue that replays check-in / record-update POSTs on reconnect. Registered via `workbox-window` (production-only — a fetch-intercepting SW breaks dev HMR). Caches cleared on sign-out. Minimum-viable offline: tasks, settings, full document files, and full history are NOT cached. New deps: `pdfkit`, `@types/pdfkit`, `workbox-window`.

## Deviations (flagged)

1. **Crisis activation writes `notifications` DIRECTLY** (immediate — README requires an immediate alert), instead of the prompt's "create reminder rows" (a ≤5-min cron would delay it and could double-notify).
2. **`notify_emergency_contact` escalation action is a no-op in-app** — it needs an external channel (Phase 5). `notify_role`/`notify_user` fire now.
3. **Hand-authored SW, not the full Workbox runtime** — registered via `workbox-window` per spec, but the caching/queue logic is hand-rolled to stay CSP-safe and avoid an esbuild/build-pipeline step that risked the green build. Behavior matches spec.
4. **Emergency-strip border = DESIGN `red-400`** (Phase-4 prompt said `red-200`) — Rule 6. Content shift-down = the prompt (36px).
5. **Packet contents** include age/blood-type/allergies/diagnoses beyond DESIGN's literal "name + DOB" — appropriate for an ER packet.
6. **`POST /api/timeline`** is net-new (there was no user-entry create path).

## Intentionally excluded (Phase 5)

External email/SMS/push delivery, calendar/email integrations, analytics/accountability dashboards, multi-circle UX.

## Verification (2026-07-08)

- Static gates green: `typecheck`, `lint`, `build` (49 routes), `typecheck:worker`.
- **Live e2e 36/37** — authenticated as the test account against the remote DB, admin (pooler) for schema checks + clean teardown, in an **isolated throwaway circle that was fully removed after**. Verified: schema (table/fns/bucket/`pg_cron */5`/enum/RLS); activate → flags + session + `crisis_activated` timeline + immediate notification; continuity task-during-crisis; reminder delivery + unack escalation (>3 → expire); Emergency Packet build + upload + **24h unauth share** + **cross-circle upload rejected** + pinned-doc sign; deactivate → session close + duration + handoff note; notifications RLS + mark-read.
- The 1 non-pass was a hardening probe (`process_due_reminders` executable by `authenticated`) → fixed by `202607080002`.
- **Not runtime-tested headless:** the offline SW read/queue behavior (needs a production build + a manual DevTools offline toggle) and the browser click-through of the crisis UI (build-verified; APIs proven).
