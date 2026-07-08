# Vigil — Next Session Handoff: Security Audit, Performance, Fixes → Redesign Prep

Paste this as the opening prompt for the new session.

---

Taking over Vigil (D:\Vigil). **All six phases (0–5) are COMPLETE and merged to `main` on GitHub.** The app
runs locally against the remote Supabase; nothing is deployed yet (hosting intentionally deferred —
see DEPLOYMENT.md). **Your job this session is NOT to build new features.** It is to **security-audit,
fix, and optimize** the existing application end to end, then prep for a redesign pass.

## 1. Orient (read in order, source of truth)
README.md (product spec + data model + phased roadmap), DESIGN.md (design system), HANDOVER.md
(operational handover), PROJECT_MEMORY.md (short-form), PHASE_3_PLAN.md, PHASE_4_PLAN.md, PHASE_5_PLAN.md,
DEPLOYMENT.md. If a later instruction contradicts README/DESIGN, flag it. Don't invent outside the specs — ask.

## 2. Confirm green + DB state
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run typecheck:worker` — all currently pass. Stop any
  dev server before `build` if `.next/trace` is locked.
- **Confirm the Phase 5 migrations are applied:** `npx supabase migration list --db-url "<SESSION_POOLER from .env.local>"`
  — local must equal remote through `202607080008`. If `202607080003`–`202607080008` are NOT applied,
  apply them first (`npx supabase db push --db-url "<pooler>"`) — the app's write routes query
  `membership_permission_overrides` and break without them.
- Standing test login is in `.env.local` (`VIGIL_TEST_EMAIL` / `VIGIL_TEST_PASSWORD`). `SESSION_POOLER`
  (admin DB URL) is in `.env.local` for schema checks + direct-RLS probing + test-data teardown.

## 3. Standing rules (unchanged — every change)
Server-side permission checks on every API route (`checkMembership` / `getCapabilityContext`); no `any`;
every care-circle query filters `care_circle_id` + verifies membership + `deleted_at is null`; soft-delete
only; audit-log every write; DESIGN.md tokens + Inter; RLS on every table, no DELETE policy; migrations are
versioned `.sql` in `supabase/migrations` — **you author, the user applies**; timeline rows only via
`create_timeline_event` (or the system variant `create_system_timeline_event` for cron/system events).

## 4. MISSION

### A. Security audit (whole app, all phases) — highest priority
Run a thorough security review, then **fix confirmed issues** (server-side; author migrations for the user
to apply). Test each not just through the API but **directly against PostgREST under a real user JWT + the
anon key** (the same path the app uses) — that's how prior audits caught the private-notes RLS leak. Cover:

- **Authorization / RLS (crown jewels):**
  - **Cross-circle isolation:** as a member of circle A, attempt read/write on every resource type using
    circle B's `careCircleId` and circle-B object ids → expect 403/empty. Do it via API *and* direct PostgREST.
  - **Role + capability enforcement:** viewer/caregiver cannot perform writes they shouldn't; **permission
    overrides actually grant/revoke** (grant a viewer `tasks.write` → can create; revoke a contributor's
    `tasks.write` → 403); "grant only up to your own level" holds (a coordinator can't grant `export.all` or
    edit an owner's permissions); the `membership_permission_overrides` RLS (a member reads only their own
    overrides; admins read all; only admins write).
  - **Private notes** author-only (API + PostgREST). **Household `access_notes`** coordinator-only (the
    `household_access_notes` companion table — verify a caregiver/viewer gets nothing via PostgREST).
  - **Emergency role** scoping. **IDOR:** mismatched `person_id` vs `careCircleId`, other circles' object ids.
  - **Membership soft-remove:** a member with `deleted_at` set loses ALL access immediately
    (`is_care_circle_member` now excludes them) — verify.
  - **Soft-delete/audit integrity:** no hard-delete path; `audit_logs` append-only (no update/delete policy).
- **Auth:** every `/api/*` returns 401 unauthenticated; middleware redirects; auth callback. The **Google
  OAuth callback uses a predictable `state` (=careCircleId)** → CSRF risk; replace with a signed/nonce state.
- **Injection / XSS:** re-verify the search `@@HL@@` sentinel escaping; audit any `dangerouslySetInnerHTML`
  for unescaped user content; the **`.ics` parser** against malformed/huge/hostile files (enforce an upload
  size cap; avoid ReDoS in the regexes); confirm PDF/JSON export doesn't inject user content; zod on every
  route body/query; RPC arg safety.
- **Secrets & crypto:** BYOK AI keys **and** the new **calendar OAuth tokens** never reach the client and are
  never returned by config APIs; AES-256-GCM usage is sound; signed-URL scoping + expiry (60s doc URLs, 24h
  packet/export links; unsigned rejected). **The `service_role` key STILL needs rotating** — it was shared in
  chat; it's used only by `worker/` + the notification Edge Function, never the web app.
- **New Phase 5 surfaces:** the capability-override endpoint; **export** (`export.all` gating + note it dumps
  the full circle record); analytics (coordinator-only, self-gated SQL fn); device-token endpoint; the
  `deliver-notifications` Edge Function (shared-secret + service role); `create_notification` (member-gated,
  never notifies non-members / self).
- **Dependencies:** `npm audit` reports known vulns (some high) — triage + upgrade where safe.
- **Data exposure:** minimal exposure to low roles; GDPR/full export excludes other members' private notes.

Deliver a **severity-ranked findings report**, then fix the confirmed ones. Consider running this as a
multi-agent review if the codebase breadth warrants it.

### B. Performance
- **Slow tab switching (top complaint).** Causes: dev-mode per-route compilation (dev-only, ignore), and in
  prod every page re-fetches on navigation with **no client cache** — **TanStack Query is installed but
  unused**. Adopt it (cached/deduped server-state + prefetch on hover/nav) and add loading **skeletons**.
- **Loading-state bug:** Settings (and possibly other views) flash **"no details found" / empty before data
  loads**, then fill in on revisit. Across all views, distinguish *loading* from *empty/not-found* — never
  render "not found" until the fetch resolves. (Reproduced by the user on `/settings`.)
- **`/api/search` firing ~1s for the user's own email** (seen in dev logs:
  `GET /api/search?q=govindam%40mridangamedia.com... 200 in 1008ms`) — find why it fires and speed it up.
- **N+1 / heavy queries:** `/api/workspaces` runs per-circle count queries; households + medications hydrate
  contacts per row; consider batching / an RPC. `/settings/analytics` ships a heavy **Recharts** bundle
  (~214 kB first load) — code-split / lazy-load. Review middleware cost per navigation.

### C. Bug fixes
Fix everything the audit + testing surface: console/network errors, the settings loading flash, any 500s.
Use the test account for live repro; tear down test data.

### D. Then — redesign prep (do NOT redesign yet)
Once the app is secure, fast, and green, we'll do a **DESIGN.md conformance + redesign** pass on the Phase 5
UI (settings tab bar, workspace cards, permissions panel, analytics charts, Locations, notifications matrix,
export/integrations). Get the app solid first; we plan the redesign together after.

## 5. Working method
Branch off `main` (e.g. `hardening-pass`). Keep all four static gates green. Author migrations — don't apply
(the user applies). Live-test with the test account; clean up. After the audit + fixes, produce a report:
what was tested, findings (severity + fix), perf changes + measured impact, and anything deferred.

---

*(Full Phase 5 build record: PHASE_5_PLAN.md. Deploy runbook incl. the pending service-role rotation +
Edge Function + Google OAuth setup: DEPLOYMENT.md "Phase 5 (done)".)*
