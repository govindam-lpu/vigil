# Vigil Redesign Report — "The Night Watch"

Branch: `redesign` (off `main`) · 2026-07-09 · Front-end only.

## Brief

Give Vigil a distinctive, warm, calm identity — "not every other dashboard." Better fonts, more
uniqueness, still simple/minimalist, invites a daily check-in, fully responsive incl. mobile. No changes
to the security model, RLS, API contracts, or data model.

## The concept

The identity is drawn from the product's name. **A vigil is keeping watch through the night over someone
you love.** Three moves carry it, and everything else stays disciplined so the record itself reads plainly:

1. **The night rail & the daylight field.** Navigation is a deep-evergreen "night" surface (`#12211C`)
   — the watcher's post, constant on every screen. Content sits on a green-cast porcelain field
   (`#F4F6F1`). That dark/light contrast is the strongest identity carrier and doubles as wayfinding.
2. **The ember.** One signature mark: a small amber dot (`#E8A33D`) with a faint glow — the lamp that
   says someone is keeping watch. It appears *only* where something is alive now: the wordmark (gently
   pulsing), the active-nav bar, today's date, and Quick Check-in. Never used for status.
3. **Three type voices.** Type encodes what kind of content something is: **Spline Sans** is the
   instrument (UI), **Spline Sans Mono** is the record (timestamps, doses, phone numbers, Rx, counts),
   **Literata** (serif) is the person (wordmark, page titles, the Person's name, empty-state headlines).

This replaces the old generic look (Inter everywhere, `blue-600` accent, white/`#F9FAFB` neutrals) with a
warm, specific system — while keeping DESIGN.md's density, hierarchy, and calm-under-stress principles.

## What changed

### Foundation
- **`app/layout.tsx`** — swapped Inter for three `next/font/google` families: Spline Sans (`--font-sans`),
  Spline Sans Mono (`--font-mono`), Literata (`--font-display`). Added `themeColor` (night) viewport.
- **`tailwind.config.ts`** — new palette: green-cast `neutral` scale (porcelain→ink), `brand` evergreen
  (`600 #2E5A4A`), `night`, `ember`; `font-display`/`font-mono` families; softer radii (`xl` 14px cards);
  shadow tokens (`lift`, `pane`, `ember`). Yellow stays on-token.
- **`app/globals.css`** — porcelain background; `.ember-dot` / `.ember-pulse` (with a full
  `prefers-reduced-motion` block that also disables it); quiet stone scrollbars; global evergreen focus ring.
- **Codemod** across all 71 `.tsx` files: `blue-*` → `brand-*` (0 blue references remain); every page
  `<h1>` → `font-display text-xl tracking-tight`.

### App shell (the identity carrier)
- **`sidebar.tsx`** — rebuilt as the night rail: evergreen surface, white/60 nav text, the **ember lamp**
  (3px glowing bar) marking the active page, wordmark at top.
- **`top-bar.tsx`** — now sits on the porcelain field to the right of the rail (no white slab); pill search,
  round icon buttons; mobile shows the wordmark + a search icon that routes to `/search`.
- **`mobile-nav.tsx`** (new) — night bottom tab bar (Dashboard/Timeline/Tasks/Documents + More), safe-area
  inset, ember dot over the active tab, and a **More bottom sheet** listing every destination.
- **`wordmark.tsx`** (new) — the `Vigil` + ember lockup, reused across rail, top bar, login, onboarding.
- **`person-switcher.tsx`** — evergreen initial "coin" + name pill. **`shell-main.tsx`** — mobile bottom
  padding for the tab bar. **`crisis-banner.tsx`** — offset for the rail on desktop.

### Screens
- **Login & onboarding** — rebuilt as a **night/daylight "threshold"**: night panel (big serif wordmark +
  tagline) beside the daylight form; warmer copy. Onboarding carries the wordmark + mono step counter.
- **Dashboard** — serif Person name, mono age, an **ember + today's date** above the greeting, Quick
  Check-in carries the ember, mono on stats/relative-times.
- **Timeline** — a real **spine**: mono date rail, a connective vertical line, and a per-entry node
  (evergreen for user entries, stone for system). Serif empty state ("The record begins here.").
- **Tasks, Medications, Calendar, Documents, Notes, Search, People, Workspaces** — `rounded-xl` cards,
  mono on all record data (due dates, doses, refills, phone/email, upload/expiry dates, counts), serif
  empty-state headlines. Calendar's **today cell carries the ember dot**. Workspace cards lift on hover.
- **Settings suite** — `rounded-xl` cards, mono on figures/dates, serif empty states. **Analytics charts**
  (Recharts) repaletted: evergreen-led categorical series, stone grid/axes, tokenized tooltip; **status
  hues (overdue red, etc.) unchanged**.
- **Crisis mode & modals** — `rounded-xl` + `shadow-pane`, mono on phone numbers / doses / durations.
  **Every red crisis semantic is byte-for-byte unchanged** — the safety layer was deliberately not touched.

## Guardrails honored
- No changes to routes, API handlers, permissions, RLS, migrations, or the data model. Presentation only.
- Status colors keep their exact meanings; the ember is never a status color.
- Accessibility: WCAG-minded contrast, visible focus rings, `prefers-reduced-motion` respected, mobile
  touch targets ≥44px, the mobile More sheet traps + closes on Escape/scrim.

## Verification
- `npm run typecheck`, `npm run lint`, `npm run build`, `npm run typecheck:worker` — **all green.**
- Live in-browser (logged in as the test account): desktop 1440 and mobile 375 — login threshold,
  dashboard (night rail + ember + serif/mono), timeline spine, mobile bottom nav, and the More sheet all
  verified via screenshots + computed-style inspection (Literata renders; ember `#E8A33D` with glow;
  night rail `#12211C`). No test data was created (navigation only), so nothing to clean up.

## Not done (out of scope / follow-ups)
- Not merged to `main`; no PR opened.
- Deploy tasks unchanged from before (rotate `SUPABASE_SERVICE_ROLE_KEY`, Next 16 upgrade, Edge Function
  deploy, etc. — see PROJECT_MEMORY / DEPLOYMENT.md).
- Deferred perf items (TanStack Query, N+1 RPCs) are independent of this pass.
