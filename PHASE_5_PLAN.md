# Phase 5 — Advanced Collaboration (Build Record)

Status: **BUILT — static gates green (typecheck / lint / build / typecheck:worker).**
Branch: `phase-5-checkpoint` (off `main` @ `41506b5`).
Source of truth: README "Phase 5 — Advanced Collaboration" + DESIGN (Workspace Selection, Permissions Management, Person Switcher, Audit/Activity Log) + the user's Phase 5 prompt.

**Migrations authored, NOT yet applied** — the user applies them. **Live e2e is pending migration application** (the new code queries the new tables/functions; the app's write routes will error until at least `202607080003` is applied). After apply, run the e2e (test account + SESSION_POOLER, isolated throwaway circle, torn down) as in prior phases.

## Decisions (user chose, via AskUserQuestion)
1. **Branch:** single `phase-5-checkpoint`, one PR (Phase-4 pattern).
2. **Permissions model:** **additive capability layer** — a role→capability map mirroring the exact pre-Phase-5 gates + effective-capability resolver + overrides; enforce capabilities on the routes tied to overridable capabilities, keep role-minimum checks elsewhere. Low regression risk.
3. **Handoff-elevation revert:** **include it** in the §7 daily cron (closes the Phase-2 deferred `elevation_expires_at → original_role` revert).

## Migrations (6, all applied by the user in order)
- `202607080003_phase_5_permission_overrides.sql` — `membership_permission_overrides` (RLS: self-read for enforcement + admin manage; no delete).
- `202607080004_phase_5_households.sql` — `households` + `household_access_notes` companion (access notes coordinator-only, **DB-enforced**).
- `202607080005_phase_5_analytics.sql` — `get_care_circle_analytics(care_circle, since)` SECURITY DEFINER (coordinator-gated aggregate → jsonb).
- `202607080006_phase_5_membership_lifecycle.sql` — `memberships.deleted_at`; helper functions (`is_care_circle_member`/`has_care_circle_role`/`can_insert_into_circle`) now exclude soft-removed members; `create_system_timeline_event` (cron-only); `enforce_membership_lifecycle` (daily pg_cron) — expiry downgrade/remove + handoff-elevation revert.
- `202607080007_phase_5_notifications.sql` — `user_device_tokens`; `notifications` +`category`/delivery-tracking + widened `notification_type` (`assignment`/`handoff`); `notification_preferences` backfill; `create_notification` (member-callable).
- `202607080008_phase_5_calendar.sql` — `calendar_connections` (encrypted Google OAuth tokens; RLS self-only).

## §1 — Multi-circle UX
- `GET /api/workspaces` — per-circle counts (members, open tasks, unread, last activity) under the user session.
- `/workspaces` card grid (`components/workspaces/workspaces-view.tsx`) — person avatar/name, role, member count, open-tasks + unread badges, Open, + Create.
- Root `/` redirect: >1 circle → `/workspaces`, single → `/dashboard`, none → `/onboarding`.
- Person Switcher: per-circle open-task/unread metadata + "All care circles" link.

## §2 — External notification delivery + preferences
- **Preferences:** `lib/notifications/preferences.ts` (8 categories × in_app/email/push, defaults, sanitizer); `GET/PUT /api/notifications/preferences`; Settings → Notifications matrix UI. Backfilled into existing profiles by migration.
- **Device tokens:** `POST /api/notifications/device-token` (upsert). *Client FCM token acquisition (Firebase Web SDK + messaging SW) is a deploy-time integration — the endpoint + table are ready.*
- **App-event notifications:** `create_notification` wired into task assignment (`assignment`) and handoff (`handoff`, replaces the old queued reminder → immediate + correctly categorized).
- **Delivery Edge Function** (`supabase/functions/deliver-notifications/index.ts`, Deno): pull model, processes undelivered `notifications`, fans out to Resend (email) + FCM (push) per the recipient's per-category preference, prunes dead FCM tokens. **Authored, NOT deployed** (needs Resend + FCM). Category derived for Phase-4 rows (crisis/reminder/escalation) and read directly for `create_notification` rows.

## §3 — Granular per-record permission overrides
- `lib/permissions/capabilities.ts` — 20 capabilities, `ROLE_CAPABILITIES` (mirrors historical gates exactly), `resolveEffectiveCapabilities`, labels/groups.
- `lib/api/server.ts` — `getEffectiveCapabilitiesForMembership` + `getCapabilityContext` (drop-in for write routes).
- Enforcement wired: tasks/appointments/medications/documents/contacts writes → `*.write`/`documents.upload`; crisis → `circle.crisis`; escalation-rules → `circle.settings`; exports → `export.all`.
- `GET/PUT /api/memberships/permissions` (admin-gated; "grant only up to your own level"; audit `permission_changed`; owner rows immutable).
- Settings → Members → **Manage permissions** UI (role defaults locked; grantable customs).
- `GET /api/me/capabilities` — self capabilities (gates Export/Import UI).

## §4 — Workload analytics
- `get_care_circle_analytics` SQL (all aggregation server-side). `GET /api/analytics?range=30d|90d|6m` (coordinator-gated).
- Settings → Analytics (`analytics-view.tsx`, Recharts, DESIGN-token colors): Tasks (created-vs-completed bar, overdue line, by-assignee table + completion rate, overdue keywords), Documentation (uploads bar, by-type donut, expiring-90d count→link), Activity (per-member stacked bar, check-ins bar).

## §5 — Care history export
- `POST /api/export/json` — zip: `care_circle.json` (persons, tasks, appointments, medications, document metadata, notes [others' private excluded by RLS], timeline, contacts, check-ins, audit) + `documents/signed-urls.json` (24h links).
- `POST /api/export/pdf` — Care Summary PDF (`lib/pdf/care-summary.ts`, pdfkit): profile, active meds, upcoming appts (90d), open tasks, contacts, last-30-day activity.
- Both gated to `export.all` (Owner default). Audit `export`. Settings → Export UI.

## §6 — Calendar integration (read-only import)
- `lib/calendar/ics.ts` — .ics parser + care-event matcher (contact name / keyword; next-90-day horizon).
- `POST /api/integrations/calendar/parse` (any member) + `POST /api/integrations/calendar/import` (`appointments.write` → creates appointments + timeline).
- Google OAuth: `google/connect` → `google/callback` (encrypted token storage) → `google/sync` (pull + match). **Authored, NOT verifiable in-repo** (needs a Google OAuth client + hosted redirect URI).
- Settings → Integrations UI (keyword input, Google connect/sync, .ics upload, suggestion review + import).
- **No write-back** to external calendars.

## §7 — Temporary access lifecycle
- `enforce_membership_lifecycle` daily pg_cron (`vigil-enforce-membership-lifecycle`, 03:00 UTC, execute revoked from users): expired temp memberships → Viewer or soft-remove (per `care_circles.settings.expiry_policy`); expired handoff elevations → `original_role`. Audit + system timeline events.
- `memberships.deleted_at` soft-remove; member queries + access helpers exclude removed members.
- `PATCH /api/care-circles` (`circle.settings`) + Settings → General "Temporary Access" policy toggle.

## §8 — Multi-household support
- `households` + `household_access_notes` (companion, coordinator-only). `GET/POST/PATCH /api/households` (contributor writes; access notes coordinator+; field stripped by companion RLS + API).
- People page → **Locations** section (cards + add/edit modal; viewers see "Access notes restricted").

## Deviations (flagged)
1. **Households access notes = coordinator-only companion table**, not a column with API-strip (spec's literal design). RLS can't hide a column → API-strip would leak door codes to lower roles via direct PostgREST (the Phase-0/1 private-notes bug class). DB-enforced instead; UX identical. *(Security hardening.)*
2. **Additive capability enforcement is scoped** (per decision 2): resource writes + crisis + circle.settings (escalation) + export are enforced. `audit.read`, `members.invite` remain role-gated (audit needs RLS-level capability integration; no invite flow exists). `tasks.assign`/`documents.delete`/`notes.private` are subsumed by their parent write capability (no separate route). Read capabilities are the floor for every role, so the add-only UI never toggles them.
3. **Handoff now sends an immediate `create_notification`** (correct "Handoffs" category) instead of a queued reminder (≤5-min delay, wrong category).
4. **`create_system_timeline_event`** added — cron/system timeline events (author null), since `create_timeline_event` hard-requires `auth.uid()`. Honors "timeline rows only via a create-function, never triggers."
5. **Export PDF/JSON return direct downloads** (no stored copy / share link), rather than the Emergency-Packet upload+link — better for a personal export.
6. **New dependencies:** `jszip` (JSON export), `recharts` (analytics).

## Intentionally excluded (README Phase-5 items the user's spec dropped — confirmed via flags)
- **SMS delivery (Twilio)** — spec's channels are in-app/email/push only.
- **Gmail/email appointment import** — README "optional, scoped".
- **Google Drive / Dropbox document sync** — README "optional, scoped".
- **Calendar write-back** (push Vigil appointments to Google/Apple) — spec is import-only.

## Tech debt to address before production launch
- **Apply the 6 migrations + run live e2e.** The app's write routes query `membership_permission_overrides` (needs `202607080003`); nothing Phase-5 works until applied.
- **Deploy the delivery Edge Function** + Resend/FCM secrets; wire the **client FCM token acquisition** (Firebase Web SDK + messaging service worker) — the only missing piece of push.
- **Google Calendar OAuth** needs a Google Cloud OAuth client + a hosted redirect URI (`GOOGLE_CLIENT_ID/SECRET/REDIRECT_URI`) — unexercised until deployed.
- **Analytics `by_assignee` / member queries** use per-circle counts / a heavy Recharts bundle on `/settings/analytics` (214 kB first load) — acceptable, but a code-split or lighter chart lib is a future lever.
- **`audit.read` / `members.invite`** capability overrides are display-only (role-gated enforcement) — full capability enforcement for audit reads needs RLS-level capability awareness.
- Settings sub-pages are role-gated by content (a viewer sees the tab + a "not available" card) rather than hiding tabs — minor.
- Pre-existing (carried): no storage DELETE policy on `documents`; TanStack Query still unused; dashboard center-column static modules.
