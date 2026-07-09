# Vigil — DESIGN.md

## Design Goals

Vigil must feel like a trusted operational tool — the kind of system a person instinctively reaches for when something important happens, not one they avoid because it's too complicated or too cold.

The core visual and interaction goals:

**Minimalist but not simple.** The UI presents only what is needed for the current context. It does not pad space or add decoration. But minimal does not mean sparse — the information density must be high enough to be genuinely useful. A doctor's notes app can afford to be sparse. A family caregiving system cannot.

**Calm under stress.** Users will often interact with Vigil in difficult moments. The design must not create additional cognitive friction. No animations that delay task completion. No cluttered layouts that require hunting. No ambiguous iconography that requires interpretation. Clarity is a safety property.

**Trustworthy and serious.** Vigil handles sensitive, important, and sometimes legally significant information. The visual tone should communicate seriousness without being grim. Think the design sensibility of a well-designed legal or medical professional tool — not a consumer wellness app.

**Information-rich without clutter.** Status, ownership, recency, and urgency should be visible at a glance on any record. But they should communicate through structure and typographic hierarchy, not through badge stacking and color noise.

**Operationally optimized.** Users need to take action: add a document, complete a task, record an update. The path from intent to completion must be short. Quick-add patterns and keyboard shortcuts are first-class affordances, not extras.

**A place, not a panel.** Vigil should feel like somewhere a family returns to — a kept room, not an admin console. The identity must be quiet enough to stay calm under stress, but present enough that the app is recognizably *Vigil* at a glance. Identity is carried by structure, type, and one signature mark — never by decoration that competes with information.

---

## Visual Identity — The Night Watch

The identity is drawn from the product's name. A vigil is the act of keeping watch through the night over someone you love: steady, attentive, unhurried. The interface embodies this with three moves:

**1. The night rail and the daylight field.** The navigation sidebar is a deep evergreen "night" surface (`night` #12211C) — the watcher's post, constant on every screen. The content area is a soft green-cast porcelain (`neutral-50` #F4F6F1) — the daylight where the record is read and kept. The contrast between the two is the app's strongest identity carrier and doubles as wayfinding: navigation is always the dark thing.

**2. The ember.** A single signature mark: a small warm amber dot (`ember` #E8A33D) with a faint glow — the lamp that says someone is keeping watch. It appears only where something is *alive now*:
- In the wordmark (`Vigil` + ember), pulsing gently (3s, disabled under `prefers-reduced-motion`)
- As the active-page indicator in the night rail (a 3px ember bar — the lit lamp marks where you are)
- Next to today's date (dashboard greeting, calendar today cell)
- On the Quick Check-in affordance

The ember is never used for status communication (that is what status colors are for) and never appears more than a few times on one screen. It is an accent mark, not a palette color.

**3. Three type voices.** Typography encodes what kind of content something is (see Typography). The sans voice is the instrument, the mono voice is the record, the serif voice is the person. This replaces decorative variety with meaningful variety.

Everything else stays disciplined: white cards, hairline borders, restrained shadows, status colors reserved for meaning. The identity lives in the frame; the record itself stays plain and legible.

---

## Visual Language

### Typography

Vigil uses three typefaces, each with a fixed semantic role. Type voice is information: a reader learns that serif = the person, mono = the record, sans = the controls.

**The instrument — Spline Sans (variable), `font-sans`.** All UI chrome: navigation, buttons, labels, form fields, table headers, card titles, body copy. A compact grotesque designed for dense UI; warmer and narrower than Inter, so lists hold more without feeling tighter.

**The record — Spline Sans Mono (variable), `font-mono`.** Kept-record data: timestamps, the timeline date rail, dosage and frequency strings, Rx numbers, phone numbers, date badges, audit values. Mono marks data as ledger-true and makes scanning columns of record data effortless. Same family as the sans, so the two voices harmonize at any size.

**The person — Literata (variable), `font-display`.** The human layer: the wordmark, page titles, the Person's name, empty-state headlines, and the login/onboarding threshold. A book face — Vigil is the family's book of record, and the serif voice is reserved for the story, never for controls. Use sparingly: if a screen has more than three serif elements, something is wrong.

**Scale (base 16px, 1.25 ratio):**
- `xs`: 11px / line-height 1.4 — metadata, labels, timestamps (mono where record data)
- `sm`: 13px / line-height 1.5 — secondary text, table rows, captions
- `base`: 15px / line-height 1.6 — body text, notes, descriptions
- `md`: 17px / line-height 1.4 — section headings, card titles
- `lg`: 20px / line-height 1.3 — subsection headings
- `xl`: 26px / line-height 1.2 — page titles (display serif), Person name (display serif)
- `2xl`: 34px / line-height 1.1 — reserved for crisis mode alert header and the login wordmark

**Weight usage:**
- 400 (regular) — body text, descriptions, metadata
- 500 (medium) — most UI labels, table column headers, mono record data
- 600 (semibold) — card titles, task titles, section headings, status labels, display headings
- 700 (bold) — urgent indicators, crisis mode headings

**Never use font sizes below 11px.** Never use weights below 400 in body content. Never rely on italics for primary communication. Page titles are `font-display` (serif) `xl` semibold with tight tracking.

---

### Spacing

Spacing follows a 4px base unit. All spacing values are multiples of 4.

| Token | Value | Use |
|---|---|---|
| `space-1` | 4px | Internal icon padding, tight label gaps |
| `space-2` | 8px | Between label and value in a field |
| `space-3` | 12px | Between form fields, list items |
| `space-4` | 16px | Standard card padding, section gaps |
| `space-5` | 20px | Major section separation |
| `space-6` | 24px | Between page sections |
| `space-8` | 32px | Large layout gaps |
| `space-12` | 48px | Top-level page section breaks |

---

### Density

The default density is **compact-comfortable**: enough whitespace that the page does not feel claustrophobic, not enough whitespace that useful information is pushed off screen.

Task lists use 40–48px row height. Cards use 16px internal padding. Timeline entries use 12px vertical padding. Document cards use 16px padding.

A "compact mode" toggle (in user preferences) reduces padding by 20% for power users managing large lists. Not a phase-0 feature — introduce in Phase 1 post-launch.

---

### Hierarchy

Information hierarchy is communicated through: type weight → type size → color (sparingly) → position.

**Never use color as the primary hierarchy signal.** Color is reserved for status communication (urgency, state) and must never be the only differentiator — always paired with text or shape.

Page structure hierarchy:
1. Page heading — `xl` display serif semibold
2. Section heading — `md` semibold, with a subtle divider line
3. Card/row title — `base` semibold
4. Body / description — `base` regular, `neutral-600` on white background
5. Metadata — `sm` regular, `neutral-400`
6. Timestamps — `xs` regular, `neutral-400`

---

### Surface Treatment

**Backgrounds:**
- App background: `neutral-50` (#F4F6F1) — porcelain with a green cast, not pure white and not yellow cream
- Card surface: `white` (#FFFFFF) with `1px neutral-200` border
- Sidebar / mobile nav bar: `night` (#12211C) — deep evergreen, full height
- Inset surfaces (wells, hover rows): `neutral-100` (#E9EDE4)

**No gradients in the primary UI.** No shadow-heavy card design. Shadows are used sparingly: `0 1px 3px rgba(27,38,32,0.08)` on elevated cards, `0 8px 28px rgba(27,38,32,0.14)` on floating panels/modals/drawers. No stacked shadows.

**Borders:** 1px solid `neutral-200` for card edges and dividers. `neutral-300` for input fields. `neutral-400` for visible separators.

**Radii:** `md` 8px (inputs, chips' rectangular cousins), `lg` 10px (buttons, list rows), `xl` 14px (cards, panes), `full` for pills and avatars. Softer than a spreadsheet, firmer than a consumer app.

**On the night rail:** text is white at reduced opacity (60% resting, 90% hover, 100% active); interactive hover fields are `white/5`. Never place status chips or dense data on the night surface — it holds navigation and the wordmark only.

---

### Color Strategy

The palette is restrained. There are six functional color categories:

**Neutral (interface structure):**
`neutral-50` through `neutral-900` — a green-cast stone scale, from porcelain (#F4F6F1) to ink (#1B2620). Used for backgrounds, surfaces, text, and dividers. The green cast keeps neutrals in the same family as the brand so the whole surface reads warm without any surface being colorful.

Reference values: 50 #F4F6F1 · 100 #E9EDE4 · 200 #D9DFD2 · 300 #BFC8B8 · 400 #93A08F · 500 #6C7A6B · 600 #556456 · 700 #3E4C41 · 800 #293630 · 900 #1B2620.

**Brand (evergreen):**
`brand-600` (#2E5A4A) for primary actions, links, focus rings, and active states — deep evergreen, the daylight version of the night rail. `brand-700` (#234939) hover. `brand-50` (#EDF4EE) / `brand-100` (#DBE8DD) / `brand-200` (#B7D1BD) for tinted fills and borders. Not used decoratively. `night` (#12211C) is the brand's darkest register, used only for the navigation surfaces.

**Ember (signature accent):**
`ember` (#E8A33D). The vigil lamp. Used only per the Identity rules (wordmark, active-nav lamp, today markers, check-in affordance). Never for status, never for large fills, never for text.

**Status colors (meaning-carrying only):**
- `green-600` (#16A34A) — completed, healthy, active medication, good check-in
- `yellow-600` (#D97706) — due soon, needs attention, upcoming
- `red-600` (#DC2626) — overdue, missed, urgent, crisis indicators
- `orange-500` (#F97316) — elevated concern, warning (between yellow and red)

Status hues are deliberately brighter and more saturated than the brand evergreen so state always reads as state, never as chrome.

**Muted variants of status colors** (`green-50`, `red-50`, etc.) are used for backgrounds on status chips so they do not scream.

**Crisis mode accent:** `red-500` used sparingly as an accent on the dark crisis background. Not used outside crisis mode. Crisis surfaces keep their red semantics exactly as before — the identity layer never touches safety color.

**No decorative color use.** No teal headers, no purple section backgrounds, no gradient buttons. Every pixel of color carries semantic meaning — including the ember, whose meaning is "alive now."

---

### Icon Usage

Icons from Lucide React (MIT licensed, consistent style, well-maintained). Size: 16px for inline/row use, 20px for nav, 24px for primary actions.

Icons are always paired with a text label except in the most space-constrained contexts (mobile bottom nav, toolbar buttons with tooltips). In those cases, tooltips are mandatory.

Icons are `neutral-500` by default. `neutral-900` on hover/active. Status-color icons (e.g., a red clock on a missed task) follow the status color rules above.

---

### States

Every interactive element has explicit design for four states:
- **Default** — as described above
- **Hover** — `neutral-100` background on list rows and buttons; `brand-600` underline on text links; cards may lift with `border neutral-300` + subtle shadow
- **Focus** — `2px brand-600` outline, `2px offset` — visible, not subtle (white outline on the night rail)
- **Disabled** — 40% opacity, no hover behavior, cursor: not-allowed

For data records (tasks, appointments, etc.):
- **Active / Open** — default styling
- **Completed** — title struck through with `neutral-400` text; green status chip
- **Overdue / Missed** — red `Missed` chip; row has `red-50` left border indicator (4px)
- **In Progress** — yellow chip
- **Archived** — `neutral-400` text, no left border

---

### Empty States

Empty states are functional, not playful. No mascots, no confetti, no "Wow, such empty." Each empty state includes:
- A short headline explaining what belongs here
- A one-sentence explanation of why it matters
- A primary action button (when the user has write permission)

Example — Tasks empty state: "No tasks yet. Tasks make it clear who is responsible for what and when."  [+ Add Task]

Empty states do not use illustration unless the illustration carries specific navigational meaning. Default: icon + text + action.

---

### Error States

Errors are communicated at the field level (inline, below the field, `red-600` text, `red-400` border) and at the page level (a top-of-page alert bar for system-level errors). Error messages are specific: "File size exceeds 25MB — please compress the document or upload a smaller version." Never: "Something went wrong."

---

## Navigation Model

### App Shell

The app shell persists across all screens. It has two components: the top bar and the left sidebar (desktop) or bottom navigation bar (mobile).

**Top Bar (56px height):**
- Sits on the porcelain background (no white slab) with a hairline bottom border; on desktop it begins to the right of the night rail.
- Left (mobile only): compact Vigil wordmark (the rail carries it on desktop).
- Center-left: Person Switcher — a pill showing a small initial-avatar and the active Person's name with a down-arrow. On click, shows a list of care circles the user belongs to, with Person name and role badge. Keyboard accessible.
- Center: Global Search bar — always visible on desktop. On mobile, a search icon that navigates to the search screen.
- Right: Notifications bell (with unread count badge, max "9+"), User avatar (dropdown: Profile, Preferences, Sign Out)
- Far right: "Crisis Mode" button appears only when crisis mode is active — red background, white text "Crisis Active."

**Left Sidebar — the night rail (240px width, desktop only):**

Full-height `night` (#12211C) surface. Top: the Vigil wordmark with the pulsing ember. Below: primary navigation. The sidebar contains the primary navigation and is not collapsible.

Navigation items:
- Dashboard (home icon)
- Timeline (activity icon)
- Tasks (check-square icon)
- Calendar (calendar icon)
- Medications (pill icon)
- Documents (folder icon)
- People & Roles (users icon)
- ——
- Settings (gear icon, at bottom)

Nav items: `sm` medium, white at 60% opacity; hover raises to 90% on a `white/5` field. Active item: white text on `white/7` field with a 3px `ember` left bar — the lit lamp marks where you are.

The sidebar does not contain sub-items in its default state. Selecting an item loads the full page with its own internal navigation where needed (e.g., Documents shows folder nav in its left panel).

**Mobile Navigation:**
Bottom tab bar (64px + safe-area inset) on the `night` surface with 5 items: Dashboard, Timeline, Tasks, Documents, More (reveals remaining nav items in a bottom sheet). Active item: white with an ember dot above the icon; inactive items white at 55%. Top bar retains Person Switcher, Search icon, and Notifications. In crisis mode the bar shows the five crisis items with More still available.

---

### Person Switcher

Displays as: "[Person Name] ▾" — a compact pill in the top bar. On click: dropdown list of care circles, each showing the Person's name and the user's role in that circle. A "+" option to create a new care circle. Maximum height for the dropdown is 320px with scroll.

If a user belongs to only one care circle, the switcher shows the Person's name but the dropdown is suppressed.

---

### Contextual Actions

Contextual actions (Add, Edit, Share, Export, Archive) appear:
- As a primary `[+ Add X]` button in the top-right of a list view or page
- As a `...` (ellipsis) menu on individual records in list view
- As a toolbar in the detail pane of an open record

Destructive actions (Delete, Archive, Remove Member) are in the `...` menu, never as primary buttons. They require a confirmation dialog.

---

## Screen Inventory

### Login / Onboarding
Standard email/password form with Google and Apple OAuth options. "Forgot password" link. First-time users see a three-step onboarding: create account → create or join a care circle → add first Person or accept invitation. No progress bar gamification — just a simple stepper with "Step 2 of 3."

### Workspace Selection
Shown when a user belongs to multiple care circles and the app is loaded without a specific context. A card-based list of care circles, each showing: Person name, Person photo (if uploaded), user's role, last activity timestamp, and unread notification count. Select any to enter that workspace.

### Care Circle Dashboard
The primary landing screen after selecting a Person. Divided into three columns on desktop, single column on mobile.

**Left column (240px):** Person snapshot — name, photo, age, primary diagnoses (brief), current care mode badge. Below: member avatars with their role.

**Center column:** Main feed — "What changed since your last visit" at top (if applicable), then a reverse-chronological recent activity stream (last 10 timeline events with links), followed by "Upcoming this week" (appointments within 7 days). Below that: "Open tasks" — top 5 by priority and due date.

**Right column (280px):** Quick access: active medications count (links to Medications), pinned documents (links to full list), upcoming appointments (next 2), open tasks assigned to the current user.

### Person Profile Overview
Full person detail: biographical info, insurance summary, allergies, diagnoses, emergency contacts, current care mode. Editable by Coordinators and above. Fields display as read-only by default, clicking "Edit" (top right) switches to edit mode. Inline save with optimistic UI.

### Timeline
Full-page chronological feed. Top: filter bar (type, author, date range, linked object). Each entry shows: date, author avatar, event type badge, title, body (truncated at 3 lines, expand on click), and linked object (if any) as a chip. System-generated entries have a distinct "automatic" label to differentiate from user-authored entries. Manual entries have an edit affordance for the author.

### Tasks
Split view: left is the task list; right panel opens on task click showing full detail. Top of list: filter chips (All, Mine, Overdue, Unassigned) + sort control. Each row: checkbox, title, assignee avatar, due date, priority chip, status chip. Completed tasks are shown with strikethrough and reduced contrast; they collapse into a "Completed" section after 24 hours unless the filter is "All."

### Appointments
Default: list view grouped by month. Each entry: date badge, provider name, appointment type, status chip, attendees. Month switcher at top. "Add Appointment" primary button. Switching to calendar view shows a standard month grid with appointment dots.

### Medications
Two-column on desktop: left shows the active medication list (name, dose, frequency, next refill date). Right panel opens on selection with full detail: schedule, prescriber, pharmacy, Rx number, instructions, side effects, interactions, history of changes. Tabs at top of page: Active | Paused | Discontinued. "Add Medication" primary button.

### Documents
Three-panel layout: left (folder nav tree, 200px), center (document grid or list, flexible), right (document detail panel, 320px, opens on selection). Top: search within documents, filter by type, sort by date or name. Each document card: title, type badge, upload date, uploader name, file type icon, expiry date if set.

### Notes
List view showing all shared notes (private notes shown with a lock icon visible only to the author). Each note: author, date, linked object (if any), first two lines of content, expand button. New note via "Add Note" button or inline from an Appointment or Task detail.

### Search Results
Full-page results view. Query shown at top with result count. Filter bar: object type tabs (All, Timeline, Documents, Tasks, Appointments, Medications, Contacts, Notes). Each result group shows 3–5 results with a "Show more" option. Keyword highlighting in result titles and snippets.

### Crisis Mode
See the Crisis Mode Design section below. This is a full UI state change, not just a page.

### Settings
Tabbed layout: General (care circle name, Person profile edit), Members (list, roles, invitations), Notifications (per-category, per-channel preferences), Escalation Rules (list of configured rules), Crisis Config (who gets notified, what gets pinned), Export (full data export request), Audit Log (filterable by actor, object type, date range), Danger Zone (transfer ownership, delete care circle).

### Permissions Management
Accessible from Settings → Members → individual member row. Shows member's current role, default permissions for that role, and any Membership-level overrides. Toggle interface for overrides. Coordinator can only grant up to their own permission level. All changes appear immediately in the Audit Log.

### Invite Flow
Modal: email input, role selector (with description of each role), optional note, optional expiration date. "Send Invitation" confirms and shows a success state with the invite link. Link can be copied for manual sharing.

### Folder / Collection View
Within the Documents screen, selecting a folder shows its contents in the center panel. Folder header shows name, description, item count, and last updated date. Pin button to add to Emergency Packet (shows current contents). Archive folder is read-only.

### Audit / Activity Log
Full-page, reverse-chronological table. Columns: timestamp, actor (name + avatar), action, object type, object name/id, details (expandable diff). Filter: actor, action type, date range, object type. Export as CSV.

---

## Layout System

### Page Structure

All pages follow a three-zone layout:

**Top zone (56px):** Global top bar. Persistent. Fixed.

**Content zone (flex):** The main content area, 100% of remaining height. Divided as needed.

**No footer** in the application.

### Content Width

Maximum content width: 1280px, centered. Below 1280px, content fills available width. Below 768px, switches to mobile layout.

Standard page padding: 24px horizontal, 24px top.

### Left Rail / Sidebars

The application sidebar (240px) is fixed-left within the content zone. Inside specific pages (Documents, Settings), a secondary left rail (200px) handles sub-navigation. This secondary rail sits to the right of the app sidebar.

### Top Summary Bars

Some pages (Medications, Tasks, Documents) include a summary bar immediately below the page heading: a row of key stats (e.g., "12 active medications · 2 refills due · 1 discontinued"). These are non-interactive summary chips.

### Cards

Standard cards: white background, 1px `neutral-200` border, 8px border-radius, 16px padding. No drop shadow on cards within a list. Subtle drop shadow (`0 1px 4px rgba(0,0,0,0.06)`) on cards in a grid layout.

Card hover state: `neutral-100` background or `brand-50` left border indicator, depending on context.

### Tables

Used for Audit Log and Contacts list. Column headers: `sm` semibold, `neutral-500`. Row height: 44px. Alternating row background: white and `neutral-50`. Selected row: `brand-50` background.

### Detail Panes

In split-view screens (Tasks, Documents, Medications), the right detail pane is 320–400px wide on desktop. It slides in from the right. On mobile, it takes the full screen. Pane has a close button (top-right ✕) and a "full page" expand button.

### Responsive Behavior

**≥1280px (large desktop):** Three-column layouts, wide detail panes, full sidebar.

**960–1279px:** Two-column layouts, full sidebar, narrower detail panes.

**768–959px:** Sidebar collapses to icon-only rail (48px). Two-column content.

**<768px:** Mobile layout. Bottom nav bar. Single column content. Detail panes become full screens.

### Sticky Areas

Page heading row (page title + primary action button) is sticky below the top bar. This ensures "Add Appointment" is always accessible while scrolling a long list.

Timeline entries do not have sticky section headers — the filter bar is sticky instead.

---

## Core UI Patterns

### Person Header
Shown at top of dashboard and person profile pages. Contains: Person photo (48px circular), Person name (`xl` bold), age and current care mode badge, a one-line summary of primary diagnosis (if available). On person profile page, expands to show all biographical fields.

### Status Chip
A small inline badge (rounded pill, 12px text, 4px vertical / 8px horizontal padding). Color follows status color strategy. Text is always a concrete status label: "Active," "Completed," "Missed," "Overdue," "Upcoming," "Paused," "Discontinued."

Never use generic statuses like "Done" or "OK." Statuses should be role-appropriate for their object type.

### Ownership Chip
Shows the assigned user for a task or responsibility. Contains: avatar (20px) + name. If unassigned: a dashed outline chip reading "Unassigned" in `neutral-400`. Clicking opens an assignment modal.

### Due Date Display
For tasks: shows date in natural language for near-future ("Tomorrow," "In 3 days," "Today at 2pm"). For dates more than 7 days out: "Jun 12." For overdue: "2 days ago" in `red-600`. For completed tasks: date of completion.

### Escalation Indicator
A small `orange-500` or `red-600` icon (triangle with exclamation) on records with an active escalation rule triggered. Hover tooltip explains the escalation state. Only visible to Coordinators and above.

### Recent Activity Summary
A collapsible module on the dashboard showing the N most recent timeline events as text lines (author name + event summary + time ago). Expandable to full timeline.

### Shared Note Card
Title (if any), author avatar + name + date, body text (up to 3 lines, expand affordance). Linked object chip (if linked). Private notes show a lock icon and are only rendered for the author.

### Document Card
File type icon (PDF, DOCX, image, etc. — 24px), title (base semibold), folder badge, document type chip, upload date, uploader name, expiry date (in `yellow-600` if expiring within 30 days). In grid layout: 200px wide card. In list layout: full-width row.

### Appointment Card
Date badge (prominent — day and month, large), provider name (semibold), appointment type chip, status chip, attendee avatars, time. Prep notes indicator (paperclip icon if prep notes exist). Outcome indicator (checkmark if outcome recorded).

### Medication Card
Medication name (semibold), dosage + form + route in `sm` neutral text, frequency and schedule, refill status (days remaining, chip color: green → yellow → red as refill approaches). Prescriber name in metadata.

### Folder Tile
In folder navigation: icon, folder name, item count. Active folder: `brand-600` text and icon. System folders have a lock icon. User folders have a folder icon.

### Timeline Item
Left: date column (date + time, xs, neutral-400). Center: content block — author avatar + name, event type badge, title (base semibold), body (base regular, 3 lines max), linked object chip. Right: action menu (... for user-authored entries). System entries are visually de-emphasized (lighter border, smaller type).

### Task Row
In list view: [checkbox] [title — base semibold] [assignee chip] [due date] [priority chip] [status chip] [...]. Clicking the row expands the detail pane. Long-pressing (mobile) opens the action menu.

### Empty State
As described in Visual Language. Icon (24px, neutral-300), headline (md semibold, neutral-700), body (base, neutral-500), primary action button. Centered in the content area.

### Danger State
Used for overdue tasks, escalated reminders, and missed check-ins. 4px red left border on the row or card. `red-50` background on hover. `red-600` status chip. No animation — the visual state itself communicates urgency without motion.

### Callout Block
A horizontal-rule-bounded block used for important notes that need to be separate from body text. 4px left border in the appropriate status color, `neutral-50` background, 16px padding. Used for crisis summaries, handoff notes, and escalation explanations.

### Quick-Add Button
Persistent in the top-right of list views. "[ + Add Task ]" — primary button style (brand-600 background, white text). A secondary "quick add" shortcut (keyboard: `n` for note, `t` for task, `a` for appointment) opens a minimal modal requiring only the essential fields, with an "Add details later" option.

### Assign Modal
A small modal (360px wide) with a searchable list of care circle members, their avatars, role badges, and current task load count (e.g., "3 open tasks"). Single-select. Confirm button. Opens from ownership chip click.

### Confirm Handoff Flow
A structured modal, not just a confirm dialog. Fields: handoff summary text (required), who is taking over (required — member picker), duration (optional — "until [date]" or "indefinitely"), any specific escalations to enable during the handoff. On confirm: saves a handoff note to the timeline, sends notifications, optionally adjusts permissions temporarily.

---

## Interaction Rules

### Quick Add vs. Detailed Add
Quick add is the default entry point for tasks, notes, and appointments. It collects: title, due date (task), and date (appointment), then saves immediately. The record can be opened for full detail editing after. This pattern is essential for mobile and stressful-moment use — never require a user to fill a long form just to capture something.

### Edit in Place
Fields on the Person profile and on record detail panes are rendered as read-only by default. Clicking any field activates it as an input. Pressing Enter or Tab saves the field and moves to the next. Clicking away triggers a save with a brief "Saved" confirmation in the status bar. This eliminates "Edit mode" as a concept for most records.

### Inline Assignment
Clicking the Ownership Chip on any record opens the Assign Modal inline — no page navigation. Selecting a member immediately saves the assignment and triggers a notification to the new assignee.

### Marking Complete
Tasks have a checkbox. Clicking it marks the task complete with an immediate visual transition (strikethrough title, status chip changes to "Completed"). A brief undo toast appears for 5 seconds. System generates a timeline event. No confirmation dialog for task completion.

### Acknowledgement
For timeline entries marked "requires acknowledgment" by a Coordinator, members see an "Acknowledge" button on the entry. Clicking it logs their acknowledgement and updates the entry's acknowledgement roster. This is not the same as task completion — it is a read receipt for important information.

### Comment Threading
Notes and Timeline entries can receive comments (Phase 1 stretch). Comments are threaded below the entry, displayed in a compact list. Adding a comment does not generate a new timeline event — it is part of the existing entry's thread.

### Conflict Resolution
If two users attempt to save edits to the same record simultaneously, the second save receives a conflict error. A conflict modal shows the two versions side by side: "Your version" and "Current version (saved by [Name] at [time])." The user can: accept current version (discard their changes), overwrite with their version, or manually merge by editing a combined version.

### Undo Behavior
Undo is available for 5 seconds after completing a task, archiving a record, or soft-deleting an item. An undo toast appears at the bottom of the screen. After 5 seconds, the action is committed and undo is no longer available. Permanent deletion has no undo — it requires a confirmation modal.

### Deletion Behavior
All deletions are soft by default. Records move to Archive. Archive items are excluded from default views but accessible via the Archive folder or a "Show archived" toggle. Coordinators can hard-delete from Archive (second confirmation required). Owners can hard-delete anything.

### Archive Behavior
Archiving moves a record to the Archive folder and removes it from active views. Archived records remain searchable and remain in the timeline. An "Archived" badge appears on archived records wherever they appear.

### Notification Handling
In-app notifications appear in the bell panel (right side of top bar). Unread count badge clears when panel is opened. Each notification has: icon (event type), title, body (one line), timestamp, and a "→" navigation affordance. Grouping: multiple task-due notifications for the same day are grouped as "3 tasks due tomorrow." Bulk "Mark all as read" option at top of panel.

### Hover, Focus, Keyboard Support
All interactive elements respond to hover with a visual state change. Focus is indicated by a `2px brand-600` outline. Tab order follows the visual layout. Keyboard shortcuts are documented in a help modal (`?` key). Primary shortcuts: `/` (search), `n` (new note), `t` (new task), `a` (new appointment), `Escape` (close modal/pane), `Cmd+K` (command palette — Phase 5).

---

## Crisis Mode Design

Crisis Mode is a UI-level state change that applies when a Care Circle activates crisis mode. It is not a separate app or flow — it is a lens applied over the existing app that radically simplifies the interface and surfaces the most critical information.

### Activation
A banner appears at the top of the screen (below the top bar) in `red-600`: "Crisis Mode is active · [Activated by Name] · [Time ago] · Deactivate." This banner persists on every screen while crisis mode is on. It does not push content down — it overlays the top bar area at reduced opacity, then is replaced by a clear persistent strip.

### UI Changes in Crisis Mode

**Background:** Does not go dark. The app remains on its standard background. Crisis mode is communicated through banners and pinned content surfacing, not by a full visual inversion. (Full dark mode was evaluated but creates legibility issues on bright screens in well-lit rooms.)

**Sidebar changes:** The sidebar condenses to five items only: Dashboard, Medications, Documents (Emergency Packet only), Contacts, Timeline. Tasks, Calendar, People & Roles, and Settings are deprioritized — still accessible via an "All" link at the bottom of the sidebar.

**Dashboard in Crisis Mode:** Restructured. Three distinct zones:

1. **Emergency strip (top, full width, red-50 background, red-400 border):** Person name + care mode status + crisis activated by/when. Pinned emergency contacts (name, role, phone — tap to call on mobile). Quick action: "Share Emergency Packet" (generates export link).

2. **Critical info cards (below strip, two columns):**
   - Active medications (all active meds, name + dose + frequency, in a compact table)
   - Pinned documents (emergency packet items — listed by title with view link)

3. **Recent timeline (below critical info):** Last 10 timeline entries, in reverse chronological order. No activity stream pagination — just the last 10 visible immediately.

**Reduced controls:** In crisis mode, "quick add" actions for non-essential record types (e.g., add folder, add note to archive) are hidden. Visible actions: Add check-in, Record update (timeline entry), Add task, View all medications, View Emergency Packet.

**Navigation simplification:** Pages outside the condensed sidebar are accessible but don't surface by default. No visual noise from non-critical UI elements.

**Emergency Packet export:** Always visible as a primary button in crisis mode. Generates a PDF containing: Person name + DOB, active medications (full list), emergency contacts (with phone numbers), pinned documents (embedded if possible, linked otherwise), last 5 timeline entries. PDF is generated server-side and a download/share link is returned within 5 seconds.

**Handoff in Crisis Mode:** Simplified handoff flow available from the dashboard: "Hand off to" — member picker, brief note, confirm. No multi-step flow. Generates timeline event and notification immediately.

**Deactivation:** The "Deactivate" action in the banner opens a brief modal: optional summary of what happened, then confirms. Deactivation is logged. The crisis session record is created. The UI returns to its standard state.

---

## Minimalist But Not Simple

This principle deserves concrete explanation, because "minimalist" is frequently confused with "simple," "sparse," or "low-information."

Vigil's design is minimalist in the sense that:
- Every UI element present earns its place by carrying information or enabling action.
- No decorative borders, dividers, or shapes exist solely to create visual rhythm.
- Color is used only to communicate — status, state, urgency — never for branding inside the app.
- Typography does the heavy lifting for hierarchy.
- There are no hero images, no onboarding illustrations, and no marketing copy inside the product UI.

Vigil's design is not simple in the sense that:
- A single task row carries: title, assignee, due date, priority, and status — all visible simultaneously.
- A medication entry shows: name, dosage, frequency, next refill date, and prescriber — in a compact card.
- A timeline entry shows: date, author, event type, title, body, and linked object — without requiring expansion.

The resolution of this apparent contradiction is **structured density**: information is organized through tight, consistent visual patterns (the same four data points always appear in the same positions) so that users can scan without reading. Once the pattern is learned, dense information becomes easy to process.

**Avoid feature tourism:** Every section of the app is there because users need it, not to demonstrate that the app "does everything." Features that are rarely used are accessible but not prominent.

**Surface important data immediately:** The dashboard shows overdue tasks, upcoming appointments, recent activity, and current medications without clicking anything. The Emergency Packet is always one action away in crisis mode. Medications are never more than two clicks from any screen.

**Allow deeper layers when needed:** Full record detail is one click away. Search reaches everything. Audit log is available. The app doesn't hide depth — it just doesn't require it for common use.

---

## Accessibility and Readability

**Contrast:** All text meets WCAG AA minimum contrast ratios. Body text (`neutral-700` on white): 8.1:1. Secondary text (`neutral-500` on white): 4.5:1. Status chips use dark text on muted background to maintain contrast without requiring white-on-color. Crisis mode text on `neutral-900` uses white text at high contrast.

**Type scale:** Minimum rendered size is 11px (used only for timestamps). All actionable text is at least 13px. Body content is 15px. These sizes are specified as `rem` values, honoring browser font size preferences.

**Hit targets:** All interactive elements have a minimum touch target of 44×44px, achieved with padding on smaller visual elements. Checkbox touch targets on mobile: 44×44px regardless of checkbox visual size.

**Keyboard support:** Full tab navigation through all UI elements in logical order. All modals trap focus. Escape closes modals and drawers. Arrow keys navigate dropdown menus. Enter activates focused elements.

**Screen reader compatibility:** All images have `alt` text. Icons used for meaning have `aria-label`. Modals use `role="dialog"` and `aria-modal="true"`. Status chips use `role="status"` where dynamically updated. Form fields have associated `<label>` elements.

**Error clarity:** Error messages appear adjacent to the field that caused the error, not only in a general error banner. Errors are described in plain language, not error codes.

**Stress-state readability:** In crisis mode, type sizes are increased by 1 step (base becomes md, md becomes lg) to improve readability under stress. Color contrast is maintained or increased. The emergency strip uses large, high-contrast typography for the most critical information.

**Mobile readability:** Minimum touch target 44px. Text does not scale below 13px on any mobile breakpoint. Line lengths are capped at 75 characters on wide screens to maintain readability.

---

## Folder and Information Design

The folder system (detailed in README.md) must be rendered in a way that prevents the chaos of unconstrained file systems. Key visual decisions:

**Folder navigation (left rail in Documents view):** Flat list of folders with indentation for subfolders (one level only). Icons differentiate system folders (lock icon) from user-created folders (folder icon). Item count shown in muted text next to each folder name. The active folder is highlighted.

**Smart views (above folder list):** "Expiring Soon," "Added This Week," "Pinned for Crisis," "Needs Review." These are not folders — they are filtered views. Visually distinct from folders: shown with a filter/view icon, no item count, no indentation.

**Document grid vs. list toggle:** Top-right of the document area. Grid shows document cards (200px wide) in a 3-column layout. List shows a single-column table with more metadata per row. Default: list view, since Vigil users are task-oriented, not browsing.

**Folder breadcrumb:** When inside a subfolder, a breadcrumb appears at the top of the document area: "Medical Records › Lab Results." Click any breadcrumb segment to navigate up.

**Visual folder cleanup:**
- Folders with zero items show an empty state immediately on selection (no loading, no ambiguity).
- Archive folder is visually de-emphasized (lower contrast label, grayed icon).
- System folders are listed first, user-created folders below, with a visual divider between them.
- No infinite nesting. The UI does not render a third level even if created via API.

---

## Component Library Direction

The design system targets a component library structured as follows. Phase 0 ships with primitives; higher-level composites are added progressively.

**Buttons:** Three variants: primary (solid evergreen), secondary (white + evergreen border), destructive (white + red border). Three sizes: sm (32px height), md (40px), lg (48px). All buttons have a loading state (spinner replaces label, button disabled). Icon-only buttons require a tooltip.

**Menus:** Dropdown menus use a white floating panel, 1px `neutral-200` border, 8px border-radius, light shadow. Menu items: 36px height, 16px horizontal padding, hover `neutral-100` background. Dividers between groups.

**Tabs:** Horizontal tab bar, 40px height. Active tab: `brand-600` bottom border (2px), `brand-600` text. Inactive: `neutral-500` text. No background color change. On mobile: tabs scroll horizontally.

**Sidebars / Drawers:** Right-side drawers (for detail panes) slide in from the right, 320–400px width. Left-side drawers (for mobile nav) slide from the left, 280px. Background scrim: `rgba(0,0,0,0.3)`. Close on scrim click or Escape.

**Cards:** As described in Layout System. Hover states add a subtle left border in `brand-200`.

**Tables:** As described in Layout System. Sortable columns: sort icon (`neutral-400`, highlights to `neutral-900` when sorted) appears on hover of any column header.

**Badges / Chips:** Two types — Status chips (colored, pill shape) and Label chips (neutral, used for folder names, tags, linked objects). Status chips should not be stacked; a record should have at most two chips in a row view.

**Modals:** Centered overlay, max-width 480px (small) to 720px (large). `neutral-900` scrim. Header: title (md semibold) + close button. Footer: primary action + cancel. Body scrolls if content overflows. Does not close on scrim click for destructive actions.

**Inputs:** 40px height, 1px `neutral-300` border, 8px border-radius, 12px horizontal padding. Focus: `brand-600` border. Error: `red-400` border + error message below. Textarea: same border, 4px border-radius, min 80px height, resizable vertically only.

**Search:** In top bar: 240px wide on desktop, expands to 400px on focus. Results appear in a floating panel below (max 480px wide, max 400px tall with scroll). Search within a page (documents, timeline) is a full-width bar at top of content area.

**Filters:** A horizontal row of filter chips below the search bar (or below page heading). Active filter chips show a close (✕) affordance. Multiple filters can be active simultaneously. A "Clear all" link appears when any filter is active.

**Toasts:** Bottom-center of screen, max-width 360px, 8px border-radius, white background, `neutral-900` text, subtle shadow. Types: success (green left border), error (red left border), info (brand left border), warning (yellow left border). Auto-dismiss after 4 seconds for success/info, no auto-dismiss for errors. Stack upward if multiple toasts are queued.

**Alerts:** Full-width within a content area (not toasts). Used for page-level messages (e.g., "This care circle's trial ends in 3 days"). Dismissible. Type-colored left border, `neutral-50` background.

---

## Data Density Strategy

Vigil must show useful information without creating visual noise. The strategy:

**Consistent information slots.** Every task row always shows the same five pieces of information in the same positions. Users learn the pattern once and scan effectively thereafter. Variability in what information is present (e.g., no due date assigned) is shown as a placeholder state ("No due date" in `neutral-400`), not by hiding the column entirely.

**Progressive disclosure.** Default views show primary information only. Secondary information (description, linked objects, full schedule) is one click away in a detail pane. Tertiary information (history, audit entries, comments) is accessible via a tab or section within the detail pane. Nothing important is hidden; it's just organized by layer.

**Visual grouping over visual separation.** Records of the same type (tasks, appointments) are grouped in lists without heavy dividers. A simple `neutral-100` row hover and `neutral-200` divider between sections is sufficient. Heavy borders and backgrounds between individual rows add visual noise without adding information.

**Limit concurrent chip types per row.** A task row should have no more than: one status chip, one priority chip, one assignee chip. Never stack four or five chips on a single record in list view — that is a sign that the list view is carrying too much data, and the detail pane should be used instead.

**Use typography to replace visual elements where possible.** "Due tomorrow" in red is more readable than a red calendar icon with a badge. "Assigned to Sarah M." reads faster than an avatar alone. Text communicates faster than icon interpretation when context is absent.

**Collapse low-priority data at rest.** Completed tasks collapse after 24 hours into a "Show completed (N)" disclosure. Archived documents are excluded by default. Old timeline entries paginate rather than all loading at once. This keeps the default view focused on what is current and actionable.

---

## Example Screens

### 1 — Dashboard

The dashboard for an active care circle managing an 82-year-old named Margaret Chen. 

At the top: a soft greeting with the date. Immediately below: a callout block reading "Since your last visit (5 days ago):" followed by four items — "Sarah updated the outcome of the cardiology appointment," "2 tasks were completed," "1 new document uploaded: Lab Results – May 14," "Metformin refill reminder was acknowledged by David." Each item is a link.

Below the callout: "Upcoming this week" — two appointment cards side by side. Thursday: "Primary care follow-up — Dr. Patel · 10:30 AM · Sarah attending." Friday: "Home health aide visit — Maria Torres · 9:00 AM." Both show status "Scheduled" in neutral.

Below upcoming: "Open tasks" — a compact list of 4 tasks. Top task: "Submit Medicare supplemental claim for March hospitalization" — assigned to David Chen, due yesterday, Overdue chip in red. Second task: "Refill Lisinopril" — assigned to Sarah, due in 2 days, normal priority. Third: "Call Dr. Patel's office re: referral for PT" — assigned to you (the viewing user), due today. Fourth: "Update emergency contact info for Margaret" — unassigned.

Right column: Active medications (6), Documents in Emergency Packet (4 — links to view), a "Quick Check-in" button, and the member list: Sarah Chen (Coordinator), David Chen (Coordinator), Robert Chen (Contributor), Maria Torres (Caregiver).

Everything on this screen links to the underlying record. Nothing is a dead end.

---

### 2 — Person Profile

Margaret Chen's profile page. Photo (64px circular, soft border). Name in `xl` bold. Age: 82. Current care mode: "Normal" (green badge).

Below: tabbed sections — Overview | Medical | Insurance | Contacts | Emergency.

**Overview tab:** Preferred name, pronouns, date of birth, address (primary residence: Maple Hill Assisted Living), primary language. Below: brief "About" note (editable by Coordinators): "Margaret prefers to be addressed as 'Grandma Chen' by the care team. She has mild cognitive decline and does best with morning appointments."

**Medical tab:** Primary diagnoses (editable list — Type 2 Diabetes, Atrial Fibrillation, Hypertension, Mild Cognitive Impairment). Allergies (Penicillin — severe; Sulfa drugs — moderate). Blood type: A+. Medical record numbers: Mayo Clinic (MRN-28473), Primary Care (MRN-11821).

**Contacts tab:** Displays all contacts with role badges. Dr. Anita Patel — Primary Care · (312) 555-0122. Maple Hill Nursing · (312) 555-0145. CVS Pharmacy – Oak Street · (312) 555-0198. Three emergency contacts starred with red star.

**Emergency tab:** Same as Emergency Packet view — pinned documents, emergency contacts, current medications. "Share Emergency Packet" primary button.

All fields are click-to-edit. Changes log to the audit trail automatically.

---

### 3 — Timeline

Full-page chronological view. Filter bar at top: All types | By author dropdown | Date range | Object type.

Entry 1 (most recent — today, 9:14 AM): System event — grey badge "Appointment Completed." "Cardiology follow-up with Dr. Ramos completed. Outcome recorded by Sarah Chen." Linked chip: [↗ View Appointment]. 

Entry 2 (today, 9:10 AM): User entry — brand "Update" badge. Author: Sarah Chen. Title: "Cardiology visit summary." Body: "Dr. Ramos reviewed the echocardiogram. Ejection fraction stable at 55%. No medication changes. Recommended follow-up in 6 months. Follow-up scheduling task created." [Expand] link. Linked chips: [Appointment — Cardiology 5/21] [Task — Schedule 6-month follow-up].

Entry 3 (yesterday, 4:30 PM): System — "Document Uploaded." "Lab Results – CBC May 14 uploaded by David Chen." Linked chip: [↗ View Document].

Entry 4 (May 18, 11:00 AM): System — "Medication Changed." "Metformin dose updated from 500mg to 750mg twice daily by Sarah Chen." Expanded view shows: previous value, new value, date of change.

Entry 5 (May 15, 2:20 PM): User entry — "Check-in" badge (green). "Margaret was seen and is doing well. Had a good lunch. Physical therapy session went smoothly. — Maria Torres."

---

### 4 — Document Library

Three-panel layout. Left rail: folder tree. Center: document list. Right: preview pane (empty until a document is selected).

Folder tree: Medical Records (14) | Insurance (8) | Legal (3) | Identification (2) | Emergency Packet (4) | Care Plans (1) | Correspondence (6) | Archive (19)

Under Medical Records, expanded: Lab Results (6) | Imaging (3) | Specialist Notes (5)

Active folder: Lab Results. Center shows 6 documents in list view.

Row 1: PDF icon. "CBC Results – May 14, 2025." Medical record badge. Uploaded by David Chen · 2 days ago. Source: Northwest Community Hospital. No expiry.

Row 2: PDF icon. "CBC Results – March 3, 2025." Medical record badge. Uploaded by Sarah Chen · 2 months ago.

Each row has a `...` menu: View, Download, Move to folder, Pin to Emergency Packet, Archive.

Clicking row 1 opens the right preview pane: rendered PDF preview (thumbnail for non-native format), full metadata table (title, type, uploaded by, upload date, source, tags), a "Download" button, a "Pin to Emergency Packet" toggle, and a "Notes about this document" section.

---

### 5 — Task Detail

Right pane open, showing a selected task. 

**Title:** "Submit Medicare supplemental claim for March hospitalization"

**Status chip:** Overdue (red) · **Priority chip:** High (orange)

**Assigned to:** David Chen (avatar + name). [Reassign] link.

**Due date:** May 20, 2025 (yesterday) · **Created by:** Sarah Chen · May 16, 2025

**Description:** "Need to submit the supplemental claim for the 3-day hospitalization in March. The EOB is in the Insurance folder. Claim form is in Correspondence. Submit via mail to: Medicare Supplemental, PO Box 31001, Louisville KY 40231. Track tracking number after mailing."

**Linked objects:** [↗ EOB – March Hospitalization] [↗ Claim Form – Draft]

**Escalation:** Active — "If this task is not completed by May 22, Sarah Chen and Robert Chen will be notified."

**Comments:** 0 comments. [Add comment]

**Actions:** Mark Complete · Extend Due Date · Reassign · Archive

The "Mark Complete" button is prominent — primary evergreen. "Extend Due Date" opens a date picker inline. "Reassign" opens the Assign Modal.

---

### 6 — Crisis Mode

Care circle has entered crisis mode. Margaret was rushed to the ER.

**Top bar:** Standard, but with a persistent red strip below it: "⚑ Crisis Mode Active · Activated by Sarah Chen · 47 minutes ago · [Deactivate]"

**Condensed sidebar:** Dashboard, Medications, Emergency Packet, Contacts, Timeline.

**Dashboard in Crisis Mode:**

Full-width emergency strip (red-50 background): "Margaret Chen — Crisis Mode" in large bold. Below: "Activated by Sarah Chen at 3:14 PM — Chest pain, transport to Northwestern Hospital."

Emergency contacts (horizontal card row): Dr. Anita Patel — Primary Care · (312) 555-0122 · [Call]. Northwestern Hospital ER — (312) 926-2000 · [Call]. David Chen — Son · (312) 555-0188 · [Call].

Primary action button: "Share Emergency Packet" — generates a PDF and a share link in one tap.

**Active Medications (below):** Compact two-column table. Metformin 750mg · twice daily. Lisinopril 10mg · once daily. Eliquis 5mg · twice daily. Atorvastatin 40mg · once at bedtime. Omeprazole 20mg · once daily. Vitamin D3 2000IU · once daily.

**Pinned Documents:** Lab Results – May 14 · CBC. Cardiology Report – April 2025. Power of Attorney – Margaret Chen. Medicare Card Scan.

**Recent Timeline (last 10 entries):** Displayed compactly with date, author, and one-line summary.

**Add check-in button** visible. "Record Update" visible. No other quick-add buttons.

The layout is direct, fast, and carries no visual noise. Every element on screen is actionable or critical.

---

## Design Tradeoffs

**What this design optimizes for:**
- Speed of information retrieval under stress
- Clear task ownership without social awkwardness
- Dense, accurate operational information at a glance
- Trustworthiness through consistency and auditability
- Usability by non-technical users in difficult emotional situations

**What this design deliberately sacrifices:**
- Visual delight for its own sake — there are no micro-animations on task completion, no illustrated empty states, no personality moments
- First-session usability over long-term efficiency — the app rewards learned patterns; it is not optimized for someone trying it once casually
- Mobile-first elegance — the product is desktop-primary; mobile is fully functional but the richest experience is on a larger screen
- Customization — the folder structure, the navigation order, and the data model are opinionated; users cannot freely rearrange the interface
- Real-time collaboration feel — the product is optimized for asynchronous use; it does not simulate the feel of a real-time collaborative tool like Notion or Figma

These tradeoffs are intentional. Vigil is not a product someone uses for five minutes a day to feel productive. It is a system a family relies on for years to manage something that matters. Reliability, clarity, and trust outweigh delight, customization, and novelty.
