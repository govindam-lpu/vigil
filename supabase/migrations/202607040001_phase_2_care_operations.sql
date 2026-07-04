-- Phase 2 — Care Operations
--
-- New tables: contacts, medications, medication_administration_logs, check_ins,
--   observations, escalation_rules, crisis_mode_sessions.
-- Enum extensions: reminders.reminder_type (+medication_refill),
--   timeline_events.event_type (+check_in, +medication_changed, +observation_logged).
-- Column additions: notes.note_type; memberships.original_role + elevation_expires_at.
-- RPC: complete_task(task_id) so caregiver+ can mark tasks complete (README role spec).
--
-- Apply AFTER all Phase 0/1 migrations. Follows the Phase 0/1 conventions:
-- RLS on every table, membership-scoped policies, NO delete policy (soft-delete only),
-- SECURITY DEFINER helpers pin search_path and check auth.uid().

-- ---------------------------------------------------------------------------
-- 1. Enum extensions (preserve every existing value, add the new ones)
-- ---------------------------------------------------------------------------
alter table public.reminders drop constraint if exists reminders_reminder_type_check;
alter table public.reminders add constraint reminders_reminder_type_check
  check (reminder_type in ('task_due','appointment_upcoming','medication_refill','document_expiring','custom'));

alter table public.timeline_events drop constraint if exists timeline_events_event_type_check;
alter table public.timeline_events add constraint timeline_events_event_type_check
  check (
    event_type in (
      'user_entry',
      'task_completed',
      'task_missed',
      'appointment_completed',
      'appointment_created',
      'document_uploaded',
      'note_created',
      'check_in',
      'medication_changed',
      'observation_logged',
      'member_joined',
      'system'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. Column additions on existing tables
-- ---------------------------------------------------------------------------
-- notes.note_type distinguishes handoff notes from standard notes.
alter table public.notes add column if not exists note_type text not null default 'standard';
alter table public.notes drop constraint if exists notes_note_type_check;
alter table public.notes add constraint notes_note_type_check check (note_type in ('standard','handoff'));

-- memberships: support temporary role elevation during a responsibility handoff.
-- original_role records the role to restore; elevation_expires_at is the intended
-- revert time (auto-revert job is Phase 4 — nothing fires this yet).
alter table public.memberships add column if not exists original_role text;
alter table public.memberships add column if not exists elevation_expires_at timestamptz;
alter table public.memberships drop constraint if exists memberships_original_role_check;
alter table public.memberships add constraint memberships_original_role_check
  check (original_role is null or original_role in ('owner','coordinator','contributor','caregiver','viewer','emergency'));

-- ---------------------------------------------------------------------------
-- 3. New tables
-- ---------------------------------------------------------------------------

-- Contacts: care-team people outside the circle (prescriber, pharmacy, doctor, etc.).
create table public.contacts (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  name text not null,
  organization text,
  role text check (role in ('doctor','specialist','pharmacist','attorney','insurance','caregiver','neighbor','other')),
  phone text,
  email text,
  address text,
  npi text,
  notes text,
  is_primary boolean default false,
  is_emergency_contact boolean default false,
  pinned_in_crisis boolean default false,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Link appointments to a provider contact (README Appointment.providerContactId; the
-- Phase 1 appointments table stored only free-text provider_name). Contacts must exist first.
alter table public.appointments
  add column if not exists provider_contact_id uuid references public.contacts(id) on delete set null;

-- Medications: full drug/treatment record with scheduling + refill logistics.
create table public.medications (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  name text not null,
  generic_name text,
  brand_name text,
  dosage text,
  unit text,
  form text check (form in ('pill','liquid','patch','injection','inhaler','other')),
  route text,
  frequency text not null,
  schedule jsonb,
  prescriber_id uuid references public.contacts(id) on delete set null,
  pharmacy_id uuid references public.contacts(id) on delete set null,
  rx_number text,
  start_date date,
  end_date date,
  is_active boolean default true,
  refills_remaining int,
  next_refill_date date,
  instructions text,
  side_effects_to_watch text,
  interactions text,
  status text default 'active' check (status in ('active','paused','discontinued')),
  discontinued_reason text,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Medication administration logs: append-only record of a dose being given.
create table public.medication_administration_logs (
  id uuid primary key default gen_random_uuid(),
  medication_id uuid not null references public.medications(id) on delete restrict,
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  administered_by uuid not null references auth.users(id),
  administered_at timestamptz not null default now(),
  notes text,
  created_at timestamptz default now()
);

-- Check-ins: append-only "person was seen, status is X" log.
create table public.check_ins (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  author_id uuid not null references auth.users(id),
  status text not null check (status in ('well','concerning','urgent')),
  notes text,
  occurred_at timestamptz not null default now(),
  created_at timestamptz default now()
);

-- Observations: typed symptom/observation entry, optionally linked to a med/appointment.
create table public.observations (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  author_id uuid not null references auth.users(id),
  observation_type text not null default 'symptom' check (observation_type in ('symptom','vital','behavior','mood','other')),
  body text not null,
  severity text check (severity in ('mild','moderate','severe')),
  occurred_at timestamptz not null default now(),
  linked_object_type text,
  linked_object_id uuid,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Escalation rules: stored configuration only. Firing logic is a Phase 4 background job.
-- deleted_at added for soft-delete parity (standing rule #4); rows deactivate via is_active.
create table public.escalation_rules (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  trigger_type text check (trigger_type in ('task_missed','reminder_unacknowledged','checkin_skipped','custom')),
  trigger_object_id uuid,
  trigger_condition jsonb,
  action text check (action in ('notify_role','notify_user','notify_emergency_contact')),
  target_ids uuid[],
  target_role text check (target_role is null or target_role in ('owner','coordinator','contributor','caregiver','viewer','emergency')),
  message text,
  is_active boolean default true,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Crisis mode sessions: Phase 4 object. Table + RLS created now (schema groundwork,
-- matching the crisis_mode columns already on care_circles since Phase 0). No Phase 2
-- consumer — no app code writes or reads this yet.
create table public.crisis_mode_sessions (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  activated_by uuid not null references auth.users(id),
  activated_at timestamptz not null default now(),
  deactivated_by uuid references auth.users(id),
  deactivated_at timestamptz,
  reason text,
  summary text,
  members_notified uuid[],
  created_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- 4. Indexes
-- ---------------------------------------------------------------------------
create index contacts_care_circle_person_idx on public.contacts(care_circle_id, person_id) where deleted_at is null;
create index medications_care_circle_person_idx on public.medications(care_circle_id, person_id) where deleted_at is null;
create index medication_admin_logs_medication_idx on public.medication_administration_logs(medication_id, administered_at desc);
create index check_ins_care_circle_person_idx on public.check_ins(care_circle_id, person_id, occurred_at desc);
create index observations_care_circle_person_idx on public.observations(care_circle_id, person_id, occurred_at desc) where deleted_at is null;
create index observations_linked_idx on public.observations(linked_object_type, linked_object_id) where deleted_at is null;
create index escalation_rules_care_circle_idx on public.escalation_rules(care_circle_id) where deleted_at is null;
create index crisis_mode_sessions_care_circle_idx on public.crisis_mode_sessions(care_circle_id, activated_at desc);

-- ---------------------------------------------------------------------------
-- 5. updated_at triggers (tables that carry updated_at)
-- ---------------------------------------------------------------------------
create trigger contacts_set_updated_at before update on public.contacts for each row execute function public.set_updated_at();
create trigger medications_set_updated_at before update on public.medications for each row execute function public.set_updated_at();
create trigger observations_set_updated_at before update on public.observations for each row execute function public.set_updated_at();
create trigger escalation_rules_set_updated_at before update on public.escalation_rules for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 6. complete_task RPC — lets caregiver+ mark a task complete, and spawns the
--    next instance of a recurring task.
--    Task INSERT/UPDATE RLS requires contributor+, but README allows caregivers to
--    complete tasks. Column-level restriction is not expressible in RLS, so this
--    SECURITY DEFINER function performs the status->done transition (and the
--    recurrence spawn) after a can_log_care check. Doing the spawn here (rather than
--    the API) keeps it RLS-safe for caregiver completions and atomic with completion.
--    Recurrence jsonb shape: {"frequency":"daily|weekly|every_n_days|monthly","interval":N}.
-- ---------------------------------------------------------------------------
create or replace function public.complete_task(target_task_id uuid)
returns public.tasks
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target public.tasks;
  updated public.tasks;
  spawned public.tasks;
  freq text;
  step int;
  base_date date;
  next_due date;
begin
  if actor is null then
    raise exception 'Authentication is required';
  end if;

  select * into target
  from public.tasks
  where id = target_task_id
    and deleted_at is null;

  if not found then
    raise exception 'Task not found';
  end if;

  if not public.can_log_care(target.care_circle_id) then
    raise exception 'You do not have permission to complete this task';
  end if;

  update public.tasks
  set status = 'done',
      completed_at = now(),
      completed_by = actor
  where id = target_task_id
  returning * into updated;

  -- Recurring task: create the next open instance.
  if target.recurrence is not null and (target.recurrence ? 'frequency') then
    freq := target.recurrence->>'frequency';
    step := greatest(coalesce((target.recurrence->>'interval')::int, 1), 1);
    base_date := coalesce(target.due_date, current_date);
    next_due := case
      when freq = 'daily' then base_date + (step || ' days')::interval
      when freq = 'every_n_days' then base_date + (step || ' days')::interval
      when freq = 'weekly' then base_date + (step * 7 || ' days')::interval
      when freq = 'monthly' then base_date + (step || ' months')::interval
      else null
    end;

    if next_due is not null then
      insert into public.tasks (
        care_circle_id, person_id, title, description, assignee_id, assigned_by,
        due_date, due_time, priority, status, recurrence, linked_object_type,
        linked_object_id, tags
      )
      values (
        target.care_circle_id, target.person_id, target.title, target.description,
        target.assignee_id, target.assigned_by, next_due, target.due_time,
        target.priority, 'open', target.recurrence, target.linked_object_type,
        target.linked_object_id, target.tags
      )
      returning * into spawned;

      insert into public.audit_logs (care_circle_id, actor_id, action_type, object_type, object_id, diff)
      values (
        target.care_circle_id, actor, 'created', 'task', spawned.id,
        jsonb_build_object('title', spawned.title, 'due_date', spawned.due_date, 'recurred_from', target.id)
      );
    end if;
  end if;

  return updated;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. Row level security
-- ---------------------------------------------------------------------------
alter table public.contacts enable row level security;
alter table public.medications enable row level security;
alter table public.medication_administration_logs enable row level security;
alter table public.check_ins enable row level security;
alter table public.observations enable row level security;
alter table public.escalation_rules enable row level security;
alter table public.crisis_mode_sessions enable row level security;

-- Contacts: members read; contributor+ create/update (caregiver+ cannot per README parity
-- with documents/appointments). No delete policy.
create policy "contacts_select_members"
on public.contacts for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "contacts_insert_contributors"
on public.contacts for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "contacts_update_contributors"
on public.contacts for update to authenticated
using (public.can_insert_into_circle(care_circle_id))
with check (public.can_insert_into_circle(care_circle_id));

-- Medications: members read; contributor+ create/update (README: caregiver cannot add meds).
create policy "medications_select_members"
on public.medications for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "medications_insert_contributors"
on public.medications for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "medications_update_contributors"
on public.medications for update to authenticated
using (public.can_insert_into_circle(care_circle_id))
with check (public.can_insert_into_circle(care_circle_id));

-- Administration logs: members read; caregiver+ may log a dose (README: medications.administer).
-- Append-only: no update/delete policy.
create policy "med_admin_logs_select_members"
on public.medication_administration_logs for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "med_admin_logs_insert_care"
on public.medication_administration_logs for insert to authenticated
with check (public.can_log_care(care_circle_id) and administered_by = auth.uid());

-- Check-ins: members read; caregiver+ may log. Append-only.
create policy "check_ins_select_members"
on public.check_ins for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "check_ins_insert_care"
on public.check_ins for insert to authenticated
with check (public.can_log_care(care_circle_id) and author_id = auth.uid());

-- Observations: members read; caregiver+ may log; author or coordinator may edit/soft-delete.
create policy "observations_select_members"
on public.observations for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "observations_insert_care"
on public.observations for insert to authenticated
with check (public.can_log_care(care_circle_id) and author_id = auth.uid());

create policy "observations_update_author_or_coordinator"
on public.observations for update to authenticated
using (author_id = auth.uid() or public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (author_id = auth.uid() or public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

-- Escalation rules: coordinator+ only (config lives in Settings; DESIGN shows escalation
-- state to coordinators and above). No delete policy.
create policy "escalation_rules_select_coordinators"
on public.escalation_rules for select to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "escalation_rules_insert_coordinators"
on public.escalation_rules for insert to authenticated
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "escalation_rules_update_coordinators"
on public.escalation_rules for update to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

-- Crisis mode sessions (inert, Phase 4): members read; coordinator+ activate/deactivate.
create policy "crisis_sessions_select_members"
on public.crisis_mode_sessions for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "crisis_sessions_insert_coordinators"
on public.crisis_mode_sessions for insert to authenticated
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']) and activated_by = auth.uid());

create policy "crisis_sessions_update_coordinators"
on public.crisis_mode_sessions for update to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));
