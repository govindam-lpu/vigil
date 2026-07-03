# Vigil — Phase 2 Handoff Prompt

Paste the block below into a **fresh** Claude Code session opened in `D:\Vigil`. It orients the new session and explicitly does **not** start Phase 2 — you'll supply the Phase 2 spec separately.

---

```
You're taking over the Vigil project (D:\Vigil). Before doing anything, get fully oriented — do NOT start writing Phase 2 features yet; I'll give you the Phase 2 spec in a separate message.

1. Read these source-of-truth docs in D:\Vigil, in order: README.md (product spec, data model, phased roadmap), DESIGN.md (design system), HANDOVER.md (operational handover — read the "Pending Migrations To Apply", "Phase 1 Debt Paydown", and "Phase 0/1 Audit" sections carefully), PROJECT_MEMORY.md (short form). If any later instruction contradicts README/DESIGN, flag it before proceeding. Don't invent anything outside the specs — ask.

2. Standing rules (apply to every change): enforce permissions server-side on every API route (use checkMembership); every care-circle query filters care_circle_id AND verifies membership; never use `any`; soft-delete only (deleted_at, never hard-delete); audit-log every write (createAuditLog); follow DESIGN.md tokens exactly (Inter font; blue-600 #2563EB, red-600 #DC2626, green-600 #16A34A, yellow-600 #D97706, neutral-50 #F9FAFB); RLS on every Supabase table; migrations only as versioned .sql files in supabase/migrations (never the dashboard); do NOT build future-phase features; produce a checklist after each phase.

3. Current state: Phase 0 + Phase 1 are built and verified (typecheck/lint/build pass). A Phase 1 debt paydown and a Phase 0/1 audit are complete. TWO migrations are written but NOT YET APPLIED to the remote Supabase DB: 202607030001_phase_1_debt.sql and 202607030002_phase_1_audit_fixes.sql. They must be applied (in order) before any runtime testing — the current app code depends on them.

4. Your first tasks, in order:
   a. Confirm you've read the docs and summarize the current state back to me.
   b. Help me apply the two pending migrations to the remote DB — ask me for the secure pooler connection string, then run: npx supabase db push --db-url "<connection string>". Never put the password in any file or commit.
   c. Run npm run typecheck, npm run lint, npm run build to confirm green. Then a quick runtime smoke test once migrations are applied (dev: npm run dev -- --hostname 127.0.0.1 --port 3000). Specifically confirm: signed document URLs work (user-scoped createSignedUrl through the private bucket), caregiver note creation works, and search highlighting renders safely.
   d. Walk me through the "Remaining Known Deviations / Technical Debt" list in HANDOVER.md (caregiver task-completion, deep links, load cancellation/error handling) and ask whether I want any of them fixed before Phase 2.

5. WAIT for my Phase 2 prompt before building anything. When I send it, cross-check the scope against README's "Phase 2 — Care Operations" (medications; recurring task/reminder schedules; symptom/observation logging; visit summaries; check-in logging; follow-up task generation from appointment outcomes; escalation logic; responsibility handoff flow; optimistic locking + conflict-resolution UI) and flag anything that falls outside it before writing code.
```

---

## Quick reference for the new session

- **Run app:** `npm run dev -- --hostname 127.0.0.1 --port 3000` → http://127.0.0.1:3000/login
- **Verify:** `npm run typecheck` · `npm run lint` · `npm run build` (stop the dev server first if `.next/trace` is locked)
- **Pending migrations (apply in order):** `202607030001_phase_1_debt.sql`, then `202607030002_phase_1_audit_fixes.sql`
- **Do not start Phase 2** until the user provides the explicit Phase 2 spec.
