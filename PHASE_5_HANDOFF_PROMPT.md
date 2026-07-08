Taking over Vigil (D:\Vigil). Phases 0, 1, 2, 3, and 4 are COMPLETE, verified, and merged to
`main` on GitHub. Get oriented — do NOT write any code until I give you the Phase 5 spec.

1. Read in order, treat as source of truth: README.md (product spec + data model + phased
   roadmap), DESIGN.md (design system — note "Workspace Selection", "Permissions Management",
   "Audit / Activity Log", and the data-density/analytics notes), HANDOVER.md (operational
   handover), PROJECT_MEMORY.md (short-form), PHASE_3_PLAN.md (Phase 3 record), PHASE_4_PLAN.md
   (full Phase 4 record), DEPLOYMENT.md (why nothing is deployed yet). If any later instruction
   contradicts README/DESIGN, flag it before proceeding. Don't invent anything outside the specs
   or the current phase prompt — ask.

2. Current state — already done, do NOT redo:
   - Phases 0 + 1 + 2 + 3 + 4 all built, verified, and merged to `main`.
   - Phase 4 (Crisis & Continuity Mode) = crisis-mode UI lens (app-wide CrisisModeProvider →
     red strip + condensed 5-item sidebar + restructured crisis dashboard + offline banner),
     Emergency Packet PDF export (pdfkit + 24h signed share link), pin-based crisis surfacing,
     continuity handoff at deactivation, a functional in-app notification center + the
     reminder-delivery job (`process_due_reminders` via pg_cron every 5 min), and an offline
     service worker for critical reads. Live e2e passed 36/37.
   - Migrations `202607080001_phase_4_crisis_continuity.sql` (APPLIED; pg_cron enabled) and
     `202607080002_harden_reminder_job.sql` (reminder-job execute revoke). All migrations through
     `202607080002` are applied/authored — do NOT re-apply any migration.
   - The app is still 3 deployables: the Next web app + worker/ (Node OCR/extraction) +
     transcription/ (Python faster-whisper). NOTHING is deployed — hosting is intentionally
     DEFERRED until after all phases (see DEPLOYMENT.md). App runs locally against the remote
     Supabase. Do NOT deploy anything. The `service_role` key in .env.local must be rotated
     before/at deploy (worker + test-teardown only; never the web app).
   - Standing test login for any e2e is in .env.local (VIGIL_TEST_EMAIL / VIGIL_TEST_PASSWORD,
     gitignored) — always use that account. SESSION_POOLER (direct DB URL) is also in .env.local
     for schema checks / test-data teardown.

3. Confirm green (should already pass): npm run typecheck, npm run lint, npm run build,
   npm run typecheck:worker. Stop any dev server before build if .next/trace is locked.

4. Then WAIT for my Phase 5 spec. Build nothing until I send it. When I do, cross-check it
   against README's "Phase 5 — Advanced Collaboration" (first-class multi–Care-Circle UX +
   workspace switcher; granular per-record permission overrides; workload analytics + an
   accountability visibility dashboard for Coordinators/Owners only; full care-history export
   as PDF or JSON; calendar integration read+write; Gmail/email appointment import; Google
   Drive / Dropbox document sync; notification channel preferences — email, SMS, push per
   category; multi-household support) and DESIGN's "Workspace Selection" / "Permissions
   Management" / "Audit / Activity Log" sections, and flag anything out of scope or from a
   later phase before writing code. Note existing groundwork so you don't rebuild it: the app
   is architecturally multi-circle already (Phase 5 surfaces it as UX); Phase 4 shipped the
   in-app notification center + a pg_cron job runner (`process_due_reminders`) — Phase 5's
   notification work is the EXTERNAL channels (email/SMS/push, e.g. Resend/Twilio/FCM) +
   per-category preferences layered on top, and escalation firing already runs in that job.
   Phase 5 is the last roadmap phase — deployment/hosting + secret rotation + a likely staging
   env come after it (see DEPLOYMENT.md "Per-phase deploy additions").

Standing rules (every change):
 1. Server-side permission checks on every API route — never trust client state; use
    checkMembership(userId, careCircleId, minimumRole?).
 2. Never use `any` — explicit types matching the README data model.
 3. Every care-circle query filters by care_circle_id AND verifies membership; include
    person_id where relevant and `deleted_at is null` for soft-deletable tables.
 4. Soft-delete only (deleted_at); no hard-delete without explicit Owner confirmation
    + a second confirmation.
 5. Audit-log every write (create/update/delete/archive/permission change) via createAuditLog(...).
 6. Follow DESIGN.md exactly — tokens (neutral-50 #F9FAFB, blue-600 #2563EB, red-600 #DC2626,
    green-600 #16A34A, yellow-600 #D97706) and Inter via next/font.
 7. RLS on every Supabase table; no DELETE policy (soft-delete only).
 8. Every migration is a versioned .sql in supabase/migrations — never the dashboard. I apply
    migrations; you author them.
 9. Don't build future-phase features — check README for current-phase scope first.
10. After each phase, produce a checklist: what was built, what was intentionally excluded,
    deviations from spec + reasoning.
Also: create timeline rows only via createTimelineEvent(...) → the create_timeline_event DB
function, never via triggers.

Do not start Phase 5 (or anything else) until I explicitly send the Phase 5 prompt. We are
planning right now.
