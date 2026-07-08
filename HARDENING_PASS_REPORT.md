# Vigil — Hardening Pass Report (Security Audit · Performance · Fixes)

Branch: `hardening-pass` (off Phase 5 HEAD `e532907`). All four static gates green
(`typecheck` / `lint` / `build` / `typecheck:worker`). Live-verified in-browser with the
test account. **Migrations `202607080009` + `202607080010` APPLIED to remote (2026-07-08) and
re-probed end-to-end: all 4 escalations now blocked (`P0001` from the trigger guards), 0 VULN,
every legitimate flow intact.** `migration list` local == remote through `202607080010`.

## Method
- **Static review** — four scoped subagents (route authz/zod; secrets/crypto/signed-URLs;
  injection/XSS/`.ics`/exports; performance) plus a firsthand read of every RLS migration.
- **Live authorization probe** — a throwaway 2nd/3rd user exercised each RLS boundary
  against **PostgREST under a real user JWT + the anon key** (the app's own path), the way
  the prior private-notes leak was caught. All throwaway data torn down.
- **Migration verification** — the authz migration was applied inside a **rolled-back
  transaction** on the pooler and exercised under simulated user JWTs (`request.jwt.claims`):
  6 exploits blocked, 5 legitimate flows + the cron/system path still work. Nothing persisted.
- **In-browser QA** — login → dashboard → settings → analytics; zero console errors; BYOK key
  confirmed masked (`····VSTw`), never exposed.

---

## Findings (severity-ranked)

### CRITICAL — FIXED (migration `202607080009`, verified)
**C1. Coordinator → Owner privilege escalation via direct PostgREST.**
`memberships_update_owner_coordinator` let *any* owner/coordinator UPDATE *any* membership row
to *any* role. Live probe: a coordinator set their own row to `owner` and demoted the real
owner to `viewer`. The app has no role-change route, so this was reachable only by direct
PostgREST — but that is the threat model. **Fix:** a BEFORE INSERT/UPDATE trigger
(`enforce_membership_role_guard`) — only the owner may change roles, the owner row is immutable
here, no self role-change, no minting a second owner; the onboarding bootstrap and cron revert
still work.

### HIGH — FIXED (migration `202607080009`, verified)
**H1. Permission-override escalation via direct PostgREST.** `mpo_insert/update` policies let
any coordinator write any override. Live probe: a coordinator self-granted `export.all` (which
coordinators lack by default → then unlocks the full-circle export) and tampered with the
owner's capabilities. "Grant only up to your own level" + "owner-immutable" were API-only.
**Fix:** `enforce_override_guard` trigger DB-enforces both (capability model ported to SQL in
`role_default_capabilities` / `user_effective_capabilities` — keep in sync with
`lib/permissions/capabilities.ts`).

**H2. `care_circles.owner_id` hijack.** The circle UPDATE policy let a coordinator rewrite
`owner_id`. **Fix:** `enforce_care_circle_owner_guard` — only the current owner may transfer
ownership.

### MEDIUM — FIXED
- **M1. `checkMembership` ignored `deleted_at`/`expires_at`** (`lib/permissions/checkMembership.ts`)
  — the route gate didn't match the hardened DB helpers, so a soft-removed/expired member passed
  the API gate (contained today by downstream RLS, latent otherwise). Now filters both.
- **M2. Capability toggles that gated nothing.** `documents.delete` (archive was gated by
  `documents.upload`, which contributors have) and `notes.private` are now enforced in the
  document/notes routes, so revoking them actually works. *(`tasks.assign` remains subsumed by
  `tasks.write` — see Deferred.)*
- **M3. Notification `action_url` open-redirect / phishing.** `create_notification` is
  member-callable with a free-text `action_url`; the bell did `router.push(action_url)` unchecked.
  **Fix:** client validates same-origin relative path; migration `202607080010` adds a DB CHECK so
  a hostile URL can't even be stored.
- **M4. Google OAuth CSRF.** `state = careCircleId` (guessable) → an attacker could forge the
  callback and link their calendar into a victim's circle. **Fix:** signed, user-bound, expiring
  state (`lib/integrations/oauth-state.ts`). (Integration is not yet deployed → no live exposure.)
- **M5. `.ics` resource-exhaustion.** No size/event cap before parsing. **Fix:** 1 MB body cap +
  `Content-Length` pre-check + 1000-event parser cap; import route caps events (200) and validates
  start dates. (No ReDoS / prototype-pollution — parser regexes are linear, keys are fixed.)

### LOW — FIXED
- **L1.** `tasks/comments` POST now audit-logs (Rule 4).
- **L2.** `handoff.until` validated as a real date (was unvalidated → 500 on bad input).

### Dependencies — TRIAGED, not changed (see Pending)
`npm audit`: 4 high + 2 moderate. All require the **Next 16 major upgrade** (Next is pinned at
14.2.35, already the latest 14.2.x — no non-breaking fix) except a dev-only `js-yaml` bump whose
`audit fix` cascades into unrelated churn. The Next/postcss/glob advisories are DoS/cache-poisoning/
SSRF that only matter once **deployed** (hosting is deferred); glob/js-yaml are dev/build-only and
not exploitable. **Left unchanged** — schedule the Next 16 upgrade + `npm audit fix --force` as a
dedicated pre-deploy task with full regression testing.

---

## Verified SAFE (boundaries that held — probed live)
Cross-circle read/write isolation (API **and** PostgREST); **private notes** author-only;
**household `access_notes`** coordinator-only (a viewer sees the household but not the notes);
analytics coordinator-only; **soft-remove lockout** (removed member loses all access immediately);
`create_notification` excludes the caller and non-members; audit_logs append-only (no update/delete
policy). Crypto is sound (AES-256-GCM, random IV/tag verified); **BYOK keys and calendar OAuth
tokens never reach the client**; signed URLs are short-lived + IDOR-safe; **`service_role` is absent
from the web app**. Search `@@HL@@` highlight escaping is correct; PDF/JSON exports don't inject
user content; the full export correctly excludes other members' private notes (RLS).

---

## Performance changes + impact
| Change | File(s) | Impact |
|---|---|---|
| Code-split Recharts (dynamic, `ssr:false` + skeleton) | `analytics-view.tsx`, `analytics-charts.tsx` | `/settings/analytics` first-load **~214 kB → 107 kB** (build-confirmed) |
| Drop per-navigation memberships COUNT query | `middleware.ts` | Removes 1 of 2 server round-trips on **every** navigation/API call |
| Search on submit, not per keystroke | `top-bar.tsx` | Stops `/api/search` firing on every character (the "1s for own email" symptom) |
| Loading-vs-empty flash fix + `Skeleton` | `settings-view.tsx`, `ui/skeleton.tsx`, `analytics-view.tsx` | Settings no longer flashes "No escalation rules yet" before data resolves |

---

## Pending user actions
1. ~~Apply the two migrations~~ — **DONE (2026-07-08):** `supabase db push` applied `202607080009`
   + `202607080010`; the live probe was re-run and all 4 escalations are now blocked (0 VULN).
2. **Rotate `SUPABASE_SERVICE_ROLE_KEY`** — still pending (shared in chat). Used only by `worker/` +
   the Edge Function; never the web app.
3. **Plan the Next 16 upgrade** (`npm audit fix --force`) as a pre-deploy task with regression tests.

## Deferred (with rationale)
- **TanStack Query adoption** (client cache for tab-switch dedup) — the headline larger refactor
  (~15 views). Deferred to avoid a big-bang state-management change right before the planned
  redesign; the middleware + search + skeleton fixes address the concrete complaints. Detailed
  adoption plan available (provider in `app/providers.tsx`, per-resource `useQuery`, invalidate-on-
  mutation, prefetch-on-hover).
- **Loading-flash fix on remaining views** (dashboard right column, medications, people,
  members, notifications) — same one-line `isLoading`-gate pattern as Settings; low risk.
- **Dashboard middle column** shows 3 hardcoded placeholder cards ("No tasks yet" etc.) that render
  unconditionally even when data exists — a pre-existing unfinished state; wiring it to real data is
  a feature (out of scope for hardening).
- **`/api/workspaces` N+1** (4×N per-circle count queries) — replace with one aggregate RPC.
- **Search notes-branch GIN index** — the notes branch filters `to_tsvector('english', notes.content)`
  but the index is on `coalesce(content,'')`; align them so the notes branch uses its index.
- **L3 create-path IDOR** (personId not verified in-circle on POST) — confirmed non-leaking (row lands
  in the attacker's own circle with a dangling FK); add a shared in-circle guard as defense-in-depth.
- **`tasks.assign`** capability — still subsumed by `tasks.write`; enforce on assignment or drop the
  toggle from the permissions UI.
