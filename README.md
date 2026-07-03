# Vigil

## One-Sentence Summary

Vigil is a shared operational memory and coordination system that gives a family or care circle a single, structured, always-current record for every aspect of one dependent person's life.

---

## Problem Statement

When a family is responsible for an aging parent, a child with a chronic condition, a partner recovering from illness, or any person who needs sustained caregiving support, the coordination work rapidly outpaces what informal communication can handle.

The practical reality: one adult child calls the pharmacy, another schedules the cardiologist, a third manages insurance, and a fourth checks in on weekends. None of them has complete information. Nobody knows who talked to which doctor or what was decided. Important documents live in someone's email drafts, someone else's cloud folder, and in a manila envelope in the person's home. A sibling asks a question that was answered three weeks ago in a group text that nobody can find. A medication gets doubled up because two people refilled it independently. A follow-up appointment gets missed because the person who scheduled it went on vacation and assumed someone else knew.

The visible labor — appointments, medications, tasks — is hard enough. The invisible labor — tracking everything, holding the context, knowing what's missing — is crushing. That labor typically falls on one person. When that person is unavailable, the system collapses. When they burn out, care quality drops. When they're the only one with the full picture, every handoff is incomplete.

This is not a minor inconvenience. For families managing serious illness, aging, or disability, coordination failure causes real harm: missed medications, wrong information given to doctors, lost legal documents at critical moments, and family conflict that stems from nobody trusting that anyone else knows what's going on.

---

## Why Existing Tools Fail

**Group chat (WhatsApp, iMessage, text threads)**
Information is real-time but non-retrievable. Critical decisions, medication changes, and appointment details vanish into scroll. There is no structure, no ownership, and no history. You cannot search for "what did the cardiologist say in March." You cannot assign a task or confirm completion.

**Shared calendars (Google Calendar, Apple Calendar)**
Appointments exist, but context does not. There's no way to attach documents, record what happened, assign a follow-up, or note a medication change from that visit. The calendar shows the event but not the outcome.

**Task apps (Todoist, Asana, Notion)**
These tools are built for project management, not care coordination. They lack a Person-centric model, have no medication or appointment data types, no crisis mode, no relationship permissions model, and no concept of caregiving continuity. Turning them into a caregiving system requires enormous setup that most families will never maintain.

**Note apps (Apple Notes, Google Docs, Notion pages)**
Unstructured. Not real-time collaborative in the way caregiving requires. No reminders, no assignments, no timeline, no status. You end up with a giant doc nobody updates.

**Generic care apps (CaringBridge, CareZone, Lotsa Helping Hands)**
CaringBridge is a one-to-many broadcast tool, not a coordination system. CareZone is oriented toward medication management only and lacks the full operational scope. Lotsa Helping Hands is a volunteer meal/task coordination tool, not a full operational record. None of them has a usable document management system, flexible permission model, or timeline + task integration.

**EHR patient portals (MyChart, etc.)**
Read-only, medical-only, one-institution-at-a-time, inaccessible to the family, and designed for the patient — not the care circle.

The gap these tools leave is exactly what Vigil fills: a structured, shared, persistent, multi-user record built specifically around one person's life and needs.

---

## Core Product Thesis

A family managing a dependent person's life needs one shared operational system — not a collection of apps — that maintains the full context of that person's care, makes responsibility unambiguous, and allows any member of the care circle to come up to speed instantly, hand off cleanly, and act confidently even in stressful or time-pressured moments.

---

## Target Users

### Primary Users

**Adult children managing aging parents**
The most common case. One or more adult children managing a parent's medical appointments, medications, legal documents, home care, and daily wellbeing. Often geographically distributed. Often one sibling doing most of the work with others occasionally involved. High document load. High appointment volume. High coordination overhead.

**Sibling care teams**
Two to five siblings coordinating care responsibilities. Unequal involvement. Different access levels. Frequent "what's the latest?" inquiries. Strong need for clear task ownership and update visibility.

**Spouses and partners of people with chronic illness or recovery needs**
Managing their partner's care, often alone but needing to share context with other family members, doctors, or backup caregivers. Strong privacy requirements. Need for quick access during appointments.

**Family coordinators**
One person — often a daughter, a spouse, or a highly involved sibling — who has assumed the primary operational role. They need a system that supports them, not just a tool that adds more work. Their core need is offloading context from their head into a reliable shared store.

### Secondary Users

**People managing children with chronic conditions**
Parents of children with disabilities, serious illness, or complex medical needs. High medication and appointment volume. Multiple specialists. School/medical/legal document intersection.

**Non-family caregivers**
Home health aides, neighbors, family friends. Need limited access — task completion, check-in logging, schedule viewing — without full access to sensitive records.

**Backup caregivers**
A sibling or family friend who steps in temporarily. Needs rapid onboarding and a "what do I need to know right now" view without wading through months of history.

---

## Core Objects and Data Model

### User Account
Represents a person who has registered with Vigil. A User has an identity (email, name, profile photo, phone), notification preferences, time zone, and language settings. A User can belong to multiple Care Circles in different roles. A User's account is personal and persists independently of any Care Circle — if they leave one, their account remains.

**Key fields:** `id`, `email`, `displayName`, `phone`, `avatarUrl`, `timezone`, `notificationPreferences`, `createdAt`, `lastActiveAt`, `mfaEnabled`

**Relations:** belongs to many Care Circles (via Membership); has many Actions in Audit Log.

---

### Family / Care Circle
The top-level organizational container. A Care Circle is built around exactly one Person (the dependent). Multiple Users are members of a Care Circle, each with a Role. A Care Circle has settings for default permissions, notification behavior, and crisis mode configuration.

**Key fields:** `id`, `name`, `personId`, `ownerId`, `settings`, `crisisMode` (boolean), `crisisModeActivatedAt`, `crisisModeActivatedBy`, `createdAt`

**Relations:** has one Person; has many Memberships; has many Folders; has many Tasks, Appointments, Medications, Documents, Notes, Timeline Events.

---

### Person Profile
The central object. The Person is the dependent individual whose life is being coordinated. The Person profile stores biographical information, medical identifiers, insurance references, emergency contacts, and metadata about their current condition and care mode.

**Key fields:** `id`, `careCircleId`, `firstName`, `lastName`, `preferredName`, `dateOfBirth`, `pronouns`, `primaryLanguage`, `photo`, `medicalRecordNumbers` (map of institution → MRN), `insuranceSummary`, `primaryDiagnoses`, `allergies`, `bloodType`, `emergencyContactIds`, `currentCareMode` (normal | elevated | crisis), `notes` (brief bio-level notes visible to all members), `createdAt`, `updatedAt`

**Relations:** belongs to one Care Circle; has many Medications, Appointments, Documents, Notes, Timeline Events, Tasks, Contacts, Reminders, Check-ins.

**Why it matters:** The Person is the anchor for all data. Nothing in Vigil is stored free-floating — every record belongs to a Person. This enforces discipline and allows filtering, search, and permissions to be scoped correctly.

---

### Role
Defines what a Member can do within a Care Circle. Roles are predefined but can be scoped with overrides.

**Predefined Roles:**
- `owner` — full access, can delete the care circle, transfer ownership
- `coordinator` — full read/write access to all data, can invite members, cannot delete the care circle
- `contributor` — can add and edit most records, cannot manage permissions or delete records
- `caregiver` — can view all records, add check-ins and notes, mark tasks complete, cannot add medications or documents
- `viewer` — read-only access to non-private records
- `emergency` — restricted view: sees only pinned crisis items, emergency contacts, medications, and the most recent timeline entries; no write access

**Key fields:** `id`, `name`, `permissions` (list of capabilities), `isBuiltIn` (boolean)

**Relations:** assigned to Memberships.

---

### Permission
Granular capability flags that can be granted or revoked per Membership, overriding the default Role.

**Capability domains:** `tasks.read`, `tasks.write`, `tasks.assign`, `appointments.read`, `appointments.write`, `medications.read`, `medications.write`, `medications.administer`, `documents.read`, `documents.upload`, `documents.delete`, `notes.read`, `notes.write`, `notes.private`, `contacts.read`, `contacts.write`, `members.invite`, `members.manage`, `circle.settings`, `circle.crisis`, `audit.read`, `export.all`

---

### Task
A discrete unit of work with an owner, due date, and completion state. Tasks can be one-time or recurring. A Task can be linked to an Appointment, Medication, Document, or Note, creating traceability. Tasks have priority levels and escalation thresholds.

**Key fields:** `id`, `personId`, `careCircleId`, `title`, `description`, `assigneeId`, `assignedBy`, `dueDate`, `dueTime`, `priority` (low | normal | high | urgent), `status` (open | in_progress | done | missed | cancelled), `recurrence` (null or recurrence rule), `linkedObjectType`, `linkedObjectId`, `tags`, `createdAt`, `updatedAt`, `completedAt`, `completedBy`, `missedAt`, `escalationRuleId`

**Relations:** belongs to Person and Care Circle; may link to Appointment, Medication, Document; may have an Escalation Rule; has many Comments (via Timeline Events).

---

### Appointment
A scheduled interaction with a medical provider, service, or institution. Appointments have preparation tasks, outcomes, and follow-up tasks attached.

**Key fields:** `id`, `personId`, `careCircleId`, `title`, `providerName`, `providerContactId`, `location`, `address`, `appointmentType` (medical | legal | financial | home service | other), `scheduledAt`, `duration`, `status` (scheduled | completed | cancelled | missed), `prepNotes`, `outcome` (text summary of what happened), `followUpTaskIds`, `attendeeIds` (which members attended), `attachments`, `createdAt`, `updatedAt`

**Relations:** belongs to Person; may link to a Contact (provider); may generate Tasks; has Attachments.

---

### Medication
A drug, supplement, or treatment the Person takes. Includes full scheduling information, the prescribing provider, pharmacy, and refill logistics.

**Key fields:** `id`, `personId`, `careCircleId`, `name`, `genericName`, `brandName`, `dosage`, `unit`, `form` (pill | liquid | patch | injection | inhaler | other), `route` (oral | topical | IV | etc.), `frequency`, `schedule` (list of times), `prescriberId`, `pharmacyId`, `rxNumber`, `startDate`, `endDate`, `isActive`, `refillsRemaining`, `nextRefillDate`, `instructions`, `sideEffectsToWatch`, `interactions`, `status` (active | paused | discontinued), `discontinuedReason`, `createdAt`, `updatedAt`

**Relations:** belongs to Person; linked to Contacts (prescriber, pharmacy); may have related Tasks (refill reminders); appears in Timeline Events when changed.

---

### Document
A file uploaded to the system, classified by type and linked to relevant objects.

**Key fields:** `id`, `personId`, `careCircleId`, `folderId`, `title`, `description`, `documentType` (medical_record | insurance | legal | financial | identification | care_plan | correspondence | other), `fileUrl`, `fileType`, `fileSizeBytes`, `uploadedBy`, `issuedAt`, `expiresAt`, `sourceName` (e.g., "Mayo Clinic"), `tags`, `extractedText` (OCR content for search), `isPrivate`, `pinnedInCrisis`, `createdAt`, `updatedAt`

**Relations:** belongs to Person, Care Circle, Folder; linked to Attachments on Appointments or Tasks; may be OCR-indexed.

---

### Note
Freeform text attached to a Person's record. Notes can be shared or private. Notes can be linked to a specific date, event, appointment, or medication.

**Key fields:** `id`, `personId`, `careCircleId`, `authorId`, `content`, `isPrivate` (visible only to author), `linkedObjectType`, `linkedObjectId`, `pinnedInCrisis`, `tags`, `createdAt`, `updatedAt`

**Relations:** belongs to Person; may link to Appointment, Task, or Medication.

---

### Timeline Event
An immutable, chronological record of something that happened. Timeline Events are the audit trail of the Person's story. Some are system-generated (task completed, medication changed, document uploaded); others are manually entered (visit summary, observation, status update).

**Key fields:** `id`, `personId`, `careCircleId`, `eventType` (user_entry | task_completed | medication_changed | appointment_completed | document_uploaded | check_in | escalation | crisis_activated | member_joined | system), `title`, `body`, `authorId`, `occurredAt`, `isEditable` (user entries only), `linkedObjectType`, `linkedObjectId`, `attachments`, `createdAt`

**Relations:** belongs to Person; authored by User; may link to any other object.

**Why it matters:** The timeline is the backbone. It answers "what happened, when, and who was involved." System-generated events make the timeline self-populating — users get history without having to manually log everything.

---

### Reminder
A time-based alert configured to notify one or more Members about something.

**Key fields:** `id`, `personId`, `careCircleId`, `linkedObjectType`, `linkedObjectId`, `reminderType` (task_due | appointment_upcoming | medication_refill | document_expiring | custom), `scheduledAt`, `message`, `recipientIds`, `repeatRule`, `acknowledgements` (map of userId → acknowledgedAt), `status` (pending | sent | acknowledged | snoozed | expired), `snoozeCount`, `snoozeUntil`, `createdAt`

---

### Escalation
A rule that defines what happens when a Task is missed, a check-in is skipped, or a Reminder goes unacknowledged.

**Key fields:** `id`, `careCircleId`, `triggerType` (task_missed | reminder_unacknowledged | checkin_skipped | custom), `triggerObjectId`, `triggerCondition` (e.g., missed for more than 2 hours), `action` (notify_role | notify_user | notify_emergency_contact | activate_crisis_mode), `targetIds`, `message`, `createdAt`, `isActive`

---

### Contact
A person outside the Care Circle who is relevant to the Person's care — doctor, specialist, pharmacy, lawyer, insurance rep, neighbor.

**Key fields:** `id`, `personId`, `careCircleId`, `name`, `organization`, `role` (doctor | specialist | pharmacist | attorney | insurance | caregiver | neighbor | other), `phone`, `email`, `address`, `npi` (for medical providers), `notes`, `isPrimary`, `isEmergencyContact`, `pinnedInCrisis`, `createdAt`, `updatedAt`

---

### Household / Location
A physical location associated with the Person — their home, a facility, a family member's home where they stay.

**Key fields:** `id`, `personId`, `careCircleId`, `name`, `type` (primary_residence | secondary_residence | facility | clinic | hospital | other), `address`, `accessNotes` (door codes, key location, etc.), `linkedContactIds`, `createdAt`, `updatedAt`

---

### Folder / Collection
An organizational container for Documents and Notes. Folders can be system-defined (Medical, Legal, Insurance, Emergency) or user-created. Folders can be nested one level deep.

**Key fields:** `id`, `personId`, `careCircleId`, `name`, `slug`, `parentFolderId`, `folderType` (system | user_created), `color`, `isPinned`, `isEmergencyVisible` (surfaces in crisis mode), `isArchived`, `description`, `createdAt`, `updatedAt`

**System Folders (auto-created for every Person):** Medical Records, Insurance, Legal, Identification, Financial, Emergency Packet, Care Plans, Correspondence, Archive.

---

### Attachment
A file linked to an object (Appointment, Task, Note, etc.) that is not necessarily a standalone Document.

**Key fields:** `id`, `careCircleId`, `linkedObjectType`, `linkedObjectId`, `fileUrl`, `fileName`, `fileType`, `fileSizeBytes`, `uploadedBy`, `createdAt`

---

### Check-in
A brief status update from a caregiver confirming the Person was seen and is in a certain condition.

**Key fields:** `id`, `personId`, `careCircleId`, `authorId`, `status` (well | concerning | urgent), `notes`, `occurredAt`, `createdAt`

**Relations:** generates a Timeline Event automatically.

---

### Crisis Mode Session
A structured record of a period when the Care Circle operated in crisis mode.

**Key fields:** `id`, `careCircleId`, `activatedBy`, `activatedAt`, `deactivatedBy`, `deactivatedAt`, `reason`, `summary`, `escalationsTriggered`, `membersNotified`

---

### Audit Log
An immutable record of every action taken by any user on any object. Used for trust, accountability, and conflict resolution.

**Key fields:** `id`, `careCircleId`, `actorId`, `actionType` (created | updated | deleted | archived | shared | permission_changed | role_changed | crisis_activated | export | login), `objectType`, `objectId`, `diff` (before/after for updates), `ipAddress`, `userAgent`, `occurredAt`

---

## Account and Identity Model

### Account Creation
A User registers with an email and password or via Google/Apple OAuth. MFA is available and encouraged. Account-level data (name, email, phone, notification preferences) is separate from Care Circle membership.

### Joining a Care Circle
A User joins a Care Circle via an invitation link or code sent by an existing Coordinator or Owner. The invitation specifies the Role being offered. The invitee can accept, which creates a Membership, or decline. Pending invitations expire after 14 days.

### Inviting Members
Coordinators and Owners can invite new Members. The invite form captures name, email, proposed role, and an optional personal note. The system sends a uniquely tokenized invite URL. If the invitee already has a Vigil account, they receive an in-app notification plus email. If not, they receive an email prompting account creation.

### Role-Based Access
Every action in the system is gated against the acting user's effective permissions: the union of their Role's default permissions and any Membership-level overrides. Permission checks occur server-side on every API request.

### Permission Tiers
In descending authority: Owner → Coordinator → Contributor → Caregiver → Viewer → Emergency. Custom overrides can elevate a specific capability without changing the overall Role.

### Ownership and Delegation
Each Care Circle has exactly one Owner. Ownership can be transferred to another Coordinator by the current Owner. If an Owner account is deactivated, the longest-tenured Coordinator becomes acting Owner with a notification to confirm.

### Auditability
Every write action produces an Audit Log entry. Members with `audit.read` permission can view the log. Owners always have audit access. Sensitive changes (permission modifications, crisis activation, member removal, document deletion) include the full before/after diff.

### Multi-User Collaboration
Multiple users can be active simultaneously. Optimistic locking on frequently-edited objects (Person profile, Notes) prevents silent overwrites: if two users edit the same Note, the second save triggers a conflict prompt showing both versions.

---

## Family Tree / Care Circle Model

Vigil does not model a genealogical family tree. It models a **care relationship graph** centered on the Person. This is intentional: many real care networks include non-relatives, estranged family members who have limited roles, paid caregivers, neighbors, and friends. Forcing a genealogical model would exclude these relationships or create awkward workarounds.

### Relationship Types
Each Membership can optionally carry a `relationshipLabel` — a freeform or predefined descriptor:
- Spouse / Partner
- Child (adult)
- Parent
- Sibling
- Grandchild
- In-law
- Niece / Nephew
- Friend
- Neighbor
- Professional Caregiver
- Home Health Aide
- Care Manager
- Other

This label is display-only. It does not affect permissions, which are governed entirely by Role and Membership overrides.

### Sibling Groups
Multiple siblings can all hold Coordinator or Contributor roles. There is no "primary sibling" designation in the data model — if one sibling is the de-facto primary coordinator, they hold the Coordinator role; others may hold Contributor. Vigil surfaces workload distribution so families can see who is doing what without making it accusatory.

### Spouse / Partner Relationships
A spouse or partner of the Person may hold a Coordinator role and often is the de-facto Owner. Their access reflects their lived reality — full operational involvement. Vigil supports this without requiring any special "spouse mode."

### Non-Relative Caregivers
A paid home health aide, a care manager, or a neighbor with a key can be added as a Caregiver-role member. Their access is scoped to operational needs: check-ins, task completion, schedule viewing. They cannot access private notes, sensitive documents, or financial records unless explicitly granted.

### Temporary Collaborators
A member can be given a time-bounded membership. When the `expiresAt` timestamp passes, their membership is automatically downgraded to Viewer or deactivated, depending on the care circle setting. This supports vacation coverage, temporary helpers, and trial periods.

### Emergency-Only Access
The Emergency role provides a narrow read-only view: current medications, pinned emergency contacts, emergency folder documents, and the last 7 days of timeline entries. This role is designed for situations where someone needs the minimum viable information to act, with no risk of exposing full history or private records.

### Delegation of Specific Responsibilities
Vigil supports task-level and record-level ownership separate from circle-level roles. A Viewer can be assigned specific tasks. A Contributor can own a specific folder. Responsibility is operationally delegated, not role-elevated.

---

## Primary Workflows

### Create a Person Profile
1. User creates a Vigil account (if new) or signs in.
2. User selects "Create a new Care Circle."
3. System prompts for Person's name and date of birth (minimum required fields).
4. User optionally fills in additional profile fields: diagnoses, allergies, insurance, preferred name.
5. System auto-creates the default Folder structure for this Person.
6. Care circle is created; User is assigned Owner role.
7. System presents a prompt: "Invite your first family member" or "Set up later."

### Invite Family Members
1. Coordinator or Owner opens Circle Settings → Members → Invite.
2. Enters email address, selects proposed Role, optionally sets an expiration date.
3. Optionally adds a personal note that appears in the invitation email.
4. Sends invitation.
5. Recipient receives email with tokenized link. If they have an account, they accept via their notification center.
6. On acceptance, Membership is created. New member appears in the member list. A Timeline Event records the join.

### Set Up a Care Circle
After Person profile and initial members are added:
1. Walk through a setup checklist (dismissable): add emergency contacts, upload key documents, add current medications, set up first reminder.
2. Assign primary responsibility areas to members (optional).
3. Configure notification preferences.
4. Mark setup complete.

### Add a Document
1. From Person Dashboard or Document Library, select "Add Document."
2. Upload file (drag-and-drop or file picker).
3. Set title, document type, optional description, and folder.
4. Optionally mark as expiring (triggers a future reminder) or pin to emergency packet.
5. Save. Document appears in the folder and generates a Timeline Event.

### Add an Appointment
1. From Appointments view or via Quick Add, select "Add Appointment."
2. Fill in: title, provider (from Contacts or type new), date/time, location, type.
3. Optionally add prep notes and attach documents.
4. System offers to create preparation reminder (e.g., 2 days before).
5. Assign an attendee from the member list.
6. Save. Appears in appointment list and calendar view. Timeline Event logged.

### Add a Medication
1. From Medications view, select "Add Medication."
2. Enter medication name (autocomplete from common drug list), dosage, form, frequency, and schedule.
3. Add prescriber (from Contacts or new), pharmacy (from Contacts or new), Rx number.
4. Set start date and refill logistics.
5. System auto-creates a refill reminder based on days supply and refills remaining.
6. Save. Medication appears in active list. Timeline Event logged.

### Assign a Task
1. From Tasks view or quick add, create task with title, description, due date.
2. Select assignee from member list.
3. Set priority and optional escalation rule.
4. Link to a related appointment, medication, or document if applicable.
5. Save. Assignee receives a notification. Task appears in their task queue.

### Record an Update After a Doctor Visit
1. Open the relevant Appointment record.
2. Set status to "Completed."
3. Fill in the Outcome field: what the doctor said, what was decided, what changed.
4. Add any new Tasks that were identified (follow-up imaging, medication adjustment).
5. Upload any documents received (discharge notes, lab results).
6. Optionally add a Note for more detail or context.
7. Save. System generates a Timeline Event: "Appointment with [Provider] completed — [User] recorded outcome."

### View "What Changed Since Last Time"
1. Member opens the Person dashboard.
2. "Since your last visit [date]" section surfaces automatically: new timeline entries, completed/missed tasks, new documents, medication changes, and new notes.
3. Each item is linked to the full record.
4. Member can mark the summary as "caught up," which updates their last-active timestamp for that Person.

### Handle a Missed Task
1. System detects a task is past due.
2. Task status changes to "Missed." Timeline Event generated.
3. Escalation rule (if set) fires: notifies backup assignee or all Coordinators.
4. Overdue task appears at the top of the Tasks view with a distinct visual state.
5. Any member with `tasks.write` can reassign, extend the due date, or mark as cancelled with a reason.

### Enter Crisis Mode
1. Owner or Coordinator taps "Activate Crisis Mode" from the Person dashboard or Settings.
2. System prompts for a brief reason (optional but encouraged).
3. Crisis Mode session begins. All care circle members with notification permissions receive an immediate alert.
4. UI shifts to crisis layout (see Design.md — Crisis Mode Design).
5. Pinned contacts, pinned documents, active medications, and recent timeline entries are surfaced at top.
6. Crisis Mode session is recorded. When deactivated, the session is logged with duration and reason.

### Hand Off Responsibility to Another Caregiver
1. Current primary caregiver (often Coordinator) opens Handoff flow from Settings or Person dashboard.
2. Fills in handoff summary: current status, active tasks, upcoming appointments, anything needing immediate attention.
3. Selects who is taking over and for how long (optional expiration).
4. Handoff summary is saved as a Note and generates a Timeline Event.
5. Recipient receives a notification with the handoff summary linked.
6. Temporary elevated permissions (if needed) can be configured here.

### Search the Record During a Stressful Moment
1. User opens global search (keyboard shortcut or tap).
2. Types term (provider name, medication name, document type, date).
3. Results surface immediately, scoped to the current Person by default.
4. Results are grouped by type: Timeline, Documents, Medications, Contacts, Appointments.
5. Tapping any result opens the full record.
6. Recent searches are cached locally for offline access.

---

## Feature Set by Phases

### Phase 0 — Foundation

**What gets built:**
Authentication and account management (email + OAuth). User profile setup. Care Circle creation flow. Person profile creation with essential fields. Role-based membership with the five predefined roles. Permission enforcement on all API routes. Activity log (full Audit Log from day one). System-created Folder structure for each Person. Basic file upload (raw storage, no OCR). Baseline navigation shell: top bar, Person switcher, primary nav tabs. Minimal dashboard showing Person name, member count, last activity.

**Why this order:**
Nothing else works without a stable identity, permission, and data model. The Audit Log is built in Phase 0 because retrofitting it later is expensive and creates trust gaps. The Folder structure is created early so documents have a home from the first upload.

**What is not built yet:**
Timeline (Phase 1). Tasks, reminders, appointments, medications (Phase 1–2). AI features (Phase 3). Crisis mode (Phase 4). Any integration (Phase 5).

**Pain addressed:**
Establishing a shared place with controlled access. Stopping the permission confusion that plagues shared drives and chat groups.

---

### Phase 1 — Shared Memory and Coordination

**What gets built:**
Shared Timeline with system-generated and user-authored entries. Notes (shared and private). Tasks with assignment, due dates, priority, and status. Basic Reminders (due-date-based). Basic Appointment tracking (title, date, provider, outcome). Document organization within Folder structure. Full-text search across timeline entries, notes, documents (by title and description). Task assignment and ownership display. Read receipts on critical entries (Coordinators can mark entries as requiring acknowledgment). Status markers on tasks and appointments. "Last updated by / at" on all records. "What changed since last time" dashboard module (based on last-active timestamp per member).

**Why this order:**
Phase 1 converts Vigil from a storage system into a coordination system. Timeline, tasks, and notes are the core of daily use. Search is non-negotiable from Phase 1 — users need to retrieve information, not just store it.

**Dependencies:**
Phase 0 permissions, Person model, Folder structure, and file upload.

**What is not built yet:**
Medications (Phase 2). Recurring schedules (Phase 2). OCR, AI, voice (Phase 3). Crisis mode (Phase 4).

**Pain addressed:**
Scattered information across texts and chat. Nobody knowing who owns what. No shared history. No ability to catch up after being away.

---

### Phase 2 — Care Operations

**What gets built:**
Full Medication management: add, edit, schedule, track active/paused/discontinued. Recurring task and reminder schedules. Symptom and observation logging (typed observation linked to a date, optionally linked to a medication or appointment). Visit summaries (structured outcome entry on Appointment completion). Check-in logging (quick "Person was seen, status is X"). Follow-up task generation from appointment outcomes. Escalation logic: define rules for missed tasks and unacknowledged reminders. Responsibility handoff flow (structured note + temp permission change). Optimistic locking on concurrent edits with conflict resolution UI.

**Why this order:**
Medications and scheduling are the most safety-critical features and require their own development and QA track. Escalation logic belongs here because it only makes sense once tasks and reminders are fully built.

**Dependencies:**
Phase 1 tasks, reminders, appointments, and timeline.

**What is not built yet:**
AI extraction (Phase 3). Crisis mode UI (Phase 4). Integrations (Phase 5).

**Pain addressed:**
Medication confusion. Missed appointments. No clear process for handoffs. No systemic catch for overdue tasks. One caregiver holding all context in their head.

---

### Phase 3 — AI-Assisted Capture

**What gets built:**
Voice note capture transcribed to text and saved as a Note (on-device transcription preferred). OCR on uploaded documents to extract text for search and structured parsing. Structured data extraction from common document types (discharge summaries, lab reports, insurance EOBs) — surfaced as suggestions, not auto-committed. Auto-generated reminders suggested from uploaded documents (e.g., "This document mentions a follow-up in 6 weeks — create a reminder?"). Appointment and medication extraction from PDFs (user confirms before saving). "What changed since last time" narrative summary generated for returning users. Suggested task creation from unstructured note text ("I see you mentioned a follow-up MRI — want to create a task?").

**Why this order:**
AI features require a mature data model and solid base data quality — they can't work well on top of an incomplete foundation. Phase 3 AI features are assistive and confirmatory, never autonomous. Every extraction is a suggestion the user accepts or discards.

**Dependencies:**
Phase 2 full data model. Document storage with OCR pipeline. Timeline and task structures for suggestions to target.

**What is not built yet:**
No AI-driven medication interactions (out of scope). No diagnostic inference (non-goal). No AI chat interface (out of scope for Phase 3).

**Pain addressed:**
The cognitive tax of manually entering information from documents. Voice-to-record for caregivers on the go. The difficulty of extracting structured data from messy doctor's paperwork.

---

### Phase 4 — Crisis and Continuity Mode

**What gets built:**
Full Crisis Mode UI (see Design.md). Crisis mode activation and deactivation flow. Crisis session recording in the audit trail. Pin system: any document, contact, note, or medication can be pinned as crisis-visible. Emergency Packet — a curated, exportable PDF of the most critical records. Export/share packet as a PDF or secure link for emergency room situations. Outage-safe behavior: critical read-only records cached locally for offline access. Continuity handoff: structured summary generated at crisis deactivation explaining what happened, what changed, what's pending.

**Why this order:**
Crisis mode is a structural UI and data concern that requires all prior phases to be solid. It is its own design system layer on top of the existing app.

**Dependencies:**
All prior phases. Pinning system built on top of existing document and contact models. Export pipeline from Phase 3 document infrastructure.

**Pain addressed:**
Emergency room moments where nobody has the right information. Situations where the primary caregiver is suddenly unavailable. Families who need to hand a packet to a nurse or doctor quickly.

---

### Phase 5 — Advanced Collaboration

**What gets built:**
Support for multiple Care Circles per user (currently possible architecturally, now surfaced as a first-class UX with a workspace switcher). Granular per-record permission overrides. Workload analytics: tasks per member over time, overdue rate by member, documentation frequency. Accountability visibility dashboard (visible to Coordinators and Owners only). Full care history export (PDF or JSON). Calendar integration (read: pull appointments into Google/Apple Calendar; write: push calendar events into Vigil). Gmail/email import of appointment confirmations (optional, scoped). Google Drive or Dropbox sync for documents (optional, scoped). Notification channel preferences (email, SMS, push, none per category). Multi-household support: a Person associated with more than one Household location.

**Why this order:**
Integrations require a stable API and data model. Analytics require historical data. Multi-circle UX requires trust built through single-circle reliability.

**Dependencies:**
All prior phases. OAuth scopes for calendar and email integrations. Export pipeline from Phase 4.

**Pain addressed:**
Power users managing multiple family situations. Families who want accountability visibility. Duplicate entry between Vigil and other tools. Advanced permission scenarios in complex blended family situations.

---

## Non-Goals

Vigil is explicitly not:
- A general-purpose note-taking app
- A group chat replacement
- A telehealth or telemedicine platform
- A diagnostic or clinical decision-support tool
- A full electronic health record (EHR) or PHI-regulated medical record system
- A social network or community platform
- A gamified productivity or habit-tracking app
- A personal finance app
- A billing, invoicing, or payment processing system
- A legal document drafting tool
- A replacement for a care manager, social worker, or medical professional
- An app for the Person themselves to self-manage (though a future "Person mode" with read access to their own record is a conceivable extension, not a current goal)

---

## Design Principles

**Minimize cognitive load.** Every screen should communicate the most important information first. Depth is available but not forced. Users under stress should not have to think about where to look.

**Preserve continuity.** The system should make it trivially easy for someone who has been away for a week to get fully current. "What happened since I was last here" should always be answerable in under 60 seconds.

**Make responsibility visible.** Every task, every open item, every appointment has an owner. The UI never allows ambiguity about who is responsible for something.

**Optimize for stress and interruption.** Users often interact with Vigil in difficult moments — at the hospital, after a bad phone call, late at night worried about a parent. The app must be usable under those conditions: fast to load, easy to navigate, clear without effort.

**Support asynchronous family collaboration.** Most coordination happens asynchronously. The system should be designed for family members in different time zones, with different schedules, catching up at different times. Real-time features are nice but not the core value.

**Make history easy to recover.** No information should be truly lost. Archived, deleted (soft-deleted), completed, and cancelled items remain accessible via the timeline and search.

**Privilege clarity over decoration.** If an interface element doesn't carry information, it shouldn't be there. Visual complexity has a cost in cognitive load — that cost must be justified.

**Never bury critical information.** Medications, emergency contacts, and crisis items must be reachable in two taps from anywhere in the app.

**Make it easy to hand off ownership.** The system should assume that the person doing the most work will eventually need to step back. Every critical record should be complete enough that someone else can take over without a briefing.

---

## Information Architecture

### Global Navigation (persistent across all screens)

- **Top Bar:** App logo/name, Person Switcher (dropdown if multiple care circles), Global Search, Notifications bell, User profile menu.
- **Primary Nav (left sidebar on desktop, bottom bar on mobile):**
  - Dashboard
  - Timeline
  - Tasks
  - Calendar
  - Medications
  - Documents
  - People & Roles
  - Settings

### Person-Level Navigation

All content below the top bar is scoped to the active Person. Switching the Person reloads all content accordingly.

### Document Library

Organized by Folder. Left rail shows folder tree. Main area shows documents in selected folder. Top bar has filters (type, date, expiry) and sort controls.

### Timeline

Chronological. Filterable by event type, author, date range, and linked object type. Search within timeline. Pinned/important events can be starred for faster retrieval.

### Tasks

List view with columns: title, assignee, due date, priority, status. Groupable by assignee, priority, or status. Quick filter by: "Mine," "Overdue," "Unassigned," "Due this week."

### Calendar / Appointments

Month and list views. Appointments shown with provider name and type. Clicking an appointment opens the detail panel. Filter by type (medical, legal, financial, etc.).

### Medications

Active medications listed by name. Expandable to show full schedule, prescriber, pharmacy, and refill info. Tabs: Active, Paused, Discontinued. Quick action to log an administration or flag a concern.

### People & Roles

Member list with role badges. Add/remove members. Adjust roles. View permission overrides. Manage invitations.

### Settings

Care circle settings. Notification preferences. Crisis mode configuration. Escalation rules. Export. Audit log.

### Crisis Mode Access

Accessible from a persistent "Crisis Mode" banner when active, or from the top-bar "Activate Crisis Mode" button. In crisis mode, the navigation simplifies.

### Search

Global search accessible from any screen via keyboard shortcut (`/` or `Cmd+K`) or top bar icon. Results grouped by type. Recent searches cached. Within-Person scope by default; toggle to search across all circles.

### Notifications Center

In-app notifications panel (bell icon). Grouped by type and date. Acknowledge, snooze, or navigate to the linked object. Notification preferences managed in Settings.

---

## Folder and Organization System

Every Person's record includes the following system-created Folder structure. System folders cannot be renamed or deleted. User-created folders are allowed inside user-created parent folders, one level deep.

### System Folders

| Folder | Purpose |
|---|---|
| Medical Records | Lab results, imaging reports, specialist notes, discharge summaries |
| Insurance | Insurance cards, EOBs, prior authorization letters, policy documents |
| Legal | Power of attorney, healthcare proxy, DNR/POLST, trust documents, wills |
| Identification | ID cards, passport, birth certificate, Social Security card |
| Financial | (Limited) Documents adjacent to care billing, Medicare/Medicaid |
| Emergency Packet | Curated subset of documents pinned for crisis access and export |
| Care Plans | Formal care plans from providers or care managers |
| Correspondence | Letters to/from providers, insurance, legal entities |
| Archive | Soft-deleted or superseded documents |

### Preventing Folder Chaos

- System folders are fixed and cannot proliferate.
- User-created folders require a name and type selection (Medical | Administrative | Personal | Other).
- Maximum two folder levels (folder → subfolder). No deeper nesting.
- Documents in the Archive folder are read-only.
- Any document can be tagged (max 5 tags, from a shared tag vocabulary per care circle).
- Smart views (not folders): "Expiring within 30 days," "Added this week," "Pinned for crisis," "Needs review."

### Emergency Packet
The Emergency Packet folder is special: it surfaces in crisis mode, it can be exported as a PDF in one action, and it can be shared as a time-limited read-only link with emergency services or a new doctor. Items are added to it by pinning, not by moving — a document stays in its primary folder and also appears in the Emergency Packet.

---

## Notification and Reminder Philosophy

### What triggers a notification

- Task assigned to you
- Task due within 24 hours (configurable)
- Task missed (past due, status changed)
- Escalation triggered on a task you own or coordinate
- Appointment within 48 hours (configurable)
- Medication refill due within 7 days (configurable)
- Document expiring within 30 days
- New note or timeline entry in a care circle you belong to (frequency-controlled — not every entry)
- New member joins
- Crisis mode activated
- Handoff note created where you are the recipient
- Acknowledgement requested on a timeline entry

### Distinguishing Urgent from Informational

**Urgent (immediate push notification, in-app banner):** Crisis mode activation, escalation triggered, task marked Urgent that is assigned to you, missed check-in escalation.

**Actionable (push notification, summary if batched):** Task assigned, task due soon, refill due, document expiring, appointment in 24h.

**Informational (digest or in-app only):** New notes, new documents, general timeline activity, new member joined.

### Preventing Notification Spam

Users configure notification preferences per category and per channel (push, email, in-app). Default settings deliver urgent notifications immediately, actionable notifications as they occur during waking hours, and informational updates in a daily digest. Care circles with more than four members default to digest mode for general activity to prevent alert fatigue.

### Snooze and Acknowledge

Reminders can be snoozed (default options: 1 hour, 4 hours, tomorrow, custom). Snoozed reminders re-fire at the snooze expiry. Escalation rules can define that after N snoozes, the reminder escalates to the full care circle. Acknowledgements are tracked per user — a task reminder shows which members have acknowledged it, so the group knows nobody is ignoring it.

---

## Search and Retrieval

### Global Search
Accessible from anywhere. Searches across: timeline entries, notes, documents (by title, description, and extracted OCR text), tasks (by title and description), appointments (by title and provider), medications (by name), contacts (by name and organization).

### Person-Scoped Search
Default. Results are filtered to the active Person. Users with multiple Care Circles can toggle to cross-circle search.

### Filters
Type filter (select one or many object types). Date range. Author. Status. Priority (for tasks). Linked object. Tag.

### Recency Bias
Results are ranked by relevance with a recency decay — a document from last week ranks above an identical document from two years ago, unless the older one is pinned or marked important.

### Fast Retrieval During Stress
The search bar opens with `/` or `Cmd+K`. Recent searches are persisted and shown immediately. The most recent 100 records per type are cached for offline access. On typing, results appear after 200ms. Documents with OCR text are fully indexed. Contacts can be found by name, role, or organization.

---

## Trust, Privacy, and Safety

### Consent
Every user explicitly accepts the terms of service and privacy policy. Invitation to a Care Circle includes a description of what access is being granted. Users can review and revoke their own access. Users can leave a Care Circle at any time.

### Access Control
Permissions are enforced server-side on every request. There is no client-side trust. Private notes are excluded from queries for non-authors — the server strips them before returning results.

### Audit Trail
Every create, update, delete, export, and permission change is logged. The Audit Log is visible to Owners always and to members with `audit.read` permission. Logs are immutable — they cannot be edited or deleted.

### Private Notes
A Note marked private is visible only to its author. It is excluded from all shared views, search results for other users, and notification digests. It is still included in that author's personal export.

### Emergency Access
The Emergency role cannot access private records. It is a strict subset of public, non-private information. Emergency roles can be set with time expiration.

### Data Sensitivity
Vigil treats all data as sensitive by default. Documents are stored encrypted at rest. Signed URLs are used for all file access — direct file URLs are never exposed. File access tokens expire.

### Minimal Exposure
The Emergency role and viewer roles see only what is necessary. Vigil does not expose full audit logs, private notes, or permission details to low-privilege members.

### Export and Delete
Members can export their own contributed content at any time. Owners can export the full care circle record. Deletion is soft by default — records move to Archive. Permanent deletion requires Owner confirmation and is logged. GDPR-style full account deletion is supported: the user's PII is removed, but audit log entries retain an anonymized actor reference.

---

## Technical Assumptions

**Frontend:** React with TypeScript. Single-page application with client-side routing. State management via a combination of server state (React Query or SWR) and minimal local UI state. Design token system. Responsive layout — desktop primary, mobile-capable.

**Backend:** REST API with JSON. Node.js (TypeScript) or Go. Layered architecture: API layer → service layer → data layer. All business logic in the service layer, not the API layer or database.

**Storage:** PostgreSQL for relational data. Object storage (S3-compatible) for files and documents. Redis for session management, caching, and short-lived data (pending notifications, reminder state). Full-text search via Postgres `tsvector` initially; migrate to dedicated search index (Typesense or Elasticsearch) if search volume requires it.

**File Handling:** Uploads go through a server-signed URL directly to object storage. Server processes the file post-upload: virus scan, metadata extraction, OCR queuing. Files are served via short-lived signed URLs, never directly exposed.

**Permissions:** Row-level security enforced in the service layer. Every database query for care circle data includes a membership check. Role and permission lookups are cached in Redis with short TTL (60 seconds).

**Notification Service:** Internal job queue (BullMQ or equivalent) for scheduled and triggered notifications. External delivery via Resend or Postmark for email, Firebase Cloud Messaging for push, Twilio for SMS. Notification preferences filter delivery channels before dispatch.

**Search Index:** Phase 1–3: Postgres full-text search on indexed columns. Phase 3+: Typesense or Meilisearch for fuzzy, faceted, fast search across all object types including OCR text.

**Event Log:** Timeline Events and Audit Logs are append-only. Database rows are never updated, only inserted. Soft deletes use `deletedAt` timestamps; the row remains in the database.

**Offline Considerations:** Service worker caches the last-viewed Person's critical records (contacts, medications, recent timeline entries, pinned documents) for offline read access. Write operations queue and sync when connectivity is restored. No offline write conflicts are expected in normal use; conflict UI handles the edge case.

---

## Success Criteria

**Operational continuity:** A new member joining a Care Circle can get fully current on a Person's status in under 5 minutes using the app alone, without calling anyone.

**Fewer missed tasks:** The number of overdue and missed tasks (measured by status transitions) decreases as Care Circles mature with the product.

**Faster handoffs:** Handoff notes are created and confirmed, not just messaged informally. New primary caregivers can take over without a live briefing.

**Reduced overload:** Multiple members contribute to the care record, reducing the percentage of entries authored by a single user over time.

**Document retrieval:** Members can locate a specific document within 30 seconds, even if they did not upload it.

**Trust in shared information:** Members rank the accuracy of shared information higher than their group chat alternatives (measured via NPS and targeted surveys).

**Crisis response:** Care Circles with Crisis Mode configured can activate it and share an Emergency Packet with a medical professional in under 3 minutes.

---

## Roadmap Summary

| Phase | Focus | Core Deliverable |
|---|---|---|
| 0 | Foundation | Identity, permissions, Person profile, basic storage, activity log |
| 1 | Shared Memory | Timeline, tasks, notes, documents, search, reminders, assignments |
| 2 | Care Operations | Medications, schedules, check-ins, visit summaries, escalations, handoffs |
| 3 | AI-Assisted Capture | OCR, voice notes, structured extraction from docs, suggested tasks/reminders |
| 4 | Crisis and Continuity | Crisis mode, Emergency Packet, export, offline access, continuity handoff |
| 5 | Advanced Collaboration | Multi-circle UX, integrations, analytics, advanced permissions, exports |

Each phase is independently valuable. Phase 0 through Phase 2 constitute the minimum viable product that a real care circle would rely on. Phase 3 and above are meaningful differentiators. Phase 4 is a safety and trust feature that may pull forward in priority based on user feedback.
