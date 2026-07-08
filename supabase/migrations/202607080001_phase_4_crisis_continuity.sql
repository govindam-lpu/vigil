-- Phase 4 — Crisis & Continuity Mode
--
-- New table: notifications (in-app delivery target for reminders + crisis alerts).
-- New storage bucket: emergency-packets (private; per-circle coordinator+ policies).
-- Enum extension: timeline_events.event_type (+crisis_activated, +crisis_deactivated).
-- SECURITY DEFINER functions:
--   activate_crisis_mode(care_circle, reason)   — atomic activate + session + timeline + immediate notifications.
--   deactivate_crisis_mode(care_circle, summary) — atomic deactivate + session close + duration timeline + handoff note.
--   process_due_reminders()                      — reminder delivery job (pending -> notifications; re-notify; escalate).
-- pg_cron: schedule process_due_reminders() every 5 minutes.
--
-- Apply AFTER all Phase 0/1/2/3 migrations. Follows existing conventions:
-- RLS on every table, membership-scoped policies, NO delete policy (retain history),
-- SECURITY DEFINER helpers pin search_path and check auth.uid().
--
-- NOTE (pg_cron): `create extension pg_cron` needs the extension enabled on the
-- Supabase project. If the CREATE EXTENSION line errors on your plan, enable
-- pg_cron once in Dashboard -> Database -> Extensions, then re-run this migration.
-- pg_cron runs INSIDE the live database, so the reminder job ticks even before the
-- web app / worker services are hosted.

-- ---------------------------------------------------------------------------
-- 1. Enum extension: crisis timeline events (preserve every existing value)
-- ---------------------------------------------------------------------------
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
      'system',
      'crisis_activated',
      'crisis_deactivated'
    )
  );

-- ---------------------------------------------------------------------------
-- 2. notifications — in-app notification center rows
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  recipient_id uuid not null references auth.users(id) on delete cascade,
  reminder_id uuid references public.reminders(id) on delete set null,
  title text not null,
  body text,
  notification_type text not null default 'reminder'
    check (notification_type in ('crisis_activated', 'reminder', 'escalation')),
  action_url text,
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index notifications_recipient_idx on public.notifications(recipient_id, is_read, created_at desc);
create index notifications_care_circle_idx on public.notifications(care_circle_id, created_at desc);
create index notifications_reminder_idx on public.notifications(reminder_id);

-- ---------------------------------------------------------------------------
-- 3. RLS: notifications are private to their recipient.
--    INSERTs happen only via SECURITY DEFINER functions below (no insert policy).
--    No delete policy (retain history; mark read instead).
-- ---------------------------------------------------------------------------
alter table public.notifications enable row level security;

create policy "notifications_select_own"
on public.notifications for select to authenticated
using (recipient_id = auth.uid());

create policy "notifications_update_own"
on public.notifications for update to authenticated
using (recipient_id = auth.uid())
with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 4. Emergency Packet storage bucket (private). Mirrors the documents-bucket
--    per-circle policy, scoped to coordinator+ (packets are coordinator-generated).
--    Objects are keyed {care_circle_id}/{uuid}.pdf. Read via short-lived signed URL.
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('emergency-packets', 'emergency-packets', false)
on conflict (id) do nothing;

create policy "packets_bucket_read_coordinators"
on storage.objects for select to authenticated
using (
  bucket_id = 'emergency-packets'
  and public.has_care_circle_role(((storage.foldername(name))[1])::uuid, array['owner', 'coordinator'])
);

create policy "packets_bucket_insert_coordinators"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'emergency-packets'
  and public.has_care_circle_role(((storage.foldername(name))[1])::uuid, array['owner', 'coordinator'])
);

-- ---------------------------------------------------------------------------
-- 5. activate_crisis_mode — owner/coordinator only. Atomic:
--    care_circle flags + crisis_mode_sessions row + crisis_activated timeline
--    event (via the canonical create_timeline_event) + immediate in-app
--    notifications to all owner/coordinator members. Idempotent if already active.
-- ---------------------------------------------------------------------------
create or replace function public.activate_crisis_mode(
  target_care_circle_id uuid,
  activation_reason text
)
returns public.crisis_mode_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  circle public.care_circles;
  person_name text;
  actor_name text;
  new_session public.crisis_mode_sessions;
  notified uuid[];
begin
  if actor is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_care_circle_role(target_care_circle_id, array['owner', 'coordinator']) then
    raise exception 'Only an owner or coordinator can activate crisis mode';
  end if;

  select * into circle from public.care_circles where id = target_care_circle_id;
  if circle.id is null then
    raise exception 'Care circle not found';
  end if;

  -- Idempotent: if already active, return the current open session unchanged.
  if circle.crisis_mode then
    select * into new_session from public.crisis_mode_sessions
    where care_circle_id = target_care_circle_id and deactivated_at is null
    order by activated_at desc limit 1;
    if new_session.id is not null then
      return new_session;
    end if;
  end if;

  -- Recipients: all owner/coordinator members whose membership has not expired.
  select array_agg(user_id) into notified
  from public.memberships
  where care_circle_id = target_care_circle_id
    and role in ('owner', 'coordinator')
    and (expires_at is null or expires_at > now());

  update public.care_circles
  set crisis_mode = true,
      crisis_mode_activated_at = now(),
      crisis_mode_activated_by = actor
  where id = target_care_circle_id;

  insert into public.crisis_mode_sessions (care_circle_id, activated_by, activated_at, reason, members_notified)
  values (target_care_circle_id, actor, now(), nullif(activation_reason, ''), notified)
  returning * into new_session;

  select coalesce(preferred_name, first_name || ' ' || last_name) into person_name
  from public.persons where id = circle.person_id;
  select display_name into actor_name from public.users_profiles where id = actor;

  if circle.person_id is not null then
    perform public.create_timeline_event(
      target_care_circle_id,
      circle.person_id,
      'crisis_activated',
      'Crisis mode activated by ' || coalesce(actor_name, 'a coordinator'),
      case when nullif(activation_reason, '') is not null then 'Reason: ' || activation_reason else null end,
      actor,
      'crisis_mode_session',
      new_session.id
    );
  end if;

  -- Immediate in-app alert (README: crisis activation is an immediate alert; we do
  -- not queue a reminder for this, to avoid the 5-minute cron double-notifying).
  if notified is not null then
    insert into public.notifications (care_circle_id, recipient_id, reminder_id, title, body, notification_type, action_url)
    select target_care_circle_id, uid, null,
      'Crisis mode activated for ' || coalesce(person_name, 'the person'),
      'Activated by ' || coalesce(actor_name, 'a coordinator')
        || case when nullif(activation_reason, '') is not null then '. ' || activation_reason else '' end,
      'crisis_activated',
      '/dashboard'
    from unnest(notified) as uid;
  end if;

  return new_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. deactivate_crisis_mode — owner/coordinator only. Closes the open session,
--    records duration in a crisis_deactivated timeline event, and (when a summary
--    is provided) writes a continuity handoff note (note_type = 'handoff').
-- ---------------------------------------------------------------------------
create or replace function public.deactivate_crisis_mode(
  target_care_circle_id uuid,
  deactivation_summary text
)
returns public.crisis_mode_sessions
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  circle public.care_circles;
  actor_name text;
  open_session public.crisis_mode_sessions;
  duration_text text;
  hours numeric;
begin
  if actor is null then
    raise exception 'Authentication is required';
  end if;

  if not public.has_care_circle_role(target_care_circle_id, array['owner', 'coordinator']) then
    raise exception 'Only an owner or coordinator can deactivate crisis mode';
  end if;

  select * into circle from public.care_circles where id = target_care_circle_id;
  if circle.id is null then
    raise exception 'Care circle not found';
  end if;

  select * into open_session from public.crisis_mode_sessions
  where care_circle_id = target_care_circle_id and deactivated_at is null
  order by activated_at desc limit 1;

  update public.care_circles set crisis_mode = false where id = target_care_circle_id;

  if open_session.id is null then
    return null;
  end if;

  update public.crisis_mode_sessions
  set deactivated_by = actor,
      deactivated_at = now(),
      summary = nullif(deactivation_summary, '')
  where id = open_session.id
  returning * into open_session;

  hours := round(extract(epoch from (open_session.deactivated_at - open_session.activated_at)) / 3600.0, 1);
  duration_text := hours || ' hour' || case when hours = 1 then '' else 's' end;

  select display_name into actor_name from public.users_profiles where id = actor;

  if circle.person_id is not null then
    perform public.create_timeline_event(
      target_care_circle_id,
      circle.person_id,
      'crisis_deactivated',
      'Crisis mode ended by ' || coalesce(actor_name, 'a coordinator'),
      'Duration: ' || duration_text
        || case when nullif(deactivation_summary, '') is not null then '. Summary: ' || deactivation_summary else '' end,
      actor,
      'crisis_mode_session',
      open_session.id
    );

    if nullif(deactivation_summary, '') is not null then
      insert into public.notes (care_circle_id, person_id, author_id, content, is_private, note_type, pinned_in_crisis)
      values (
        target_care_circle_id, circle.person_id, actor,
        'Crisis continuity summary (' || duration_text || '): ' || deactivation_summary,
        false, 'handoff', false
      );
    end if;
  end if;

  return open_session;
end;
$$;

-- ---------------------------------------------------------------------------
-- 7. process_due_reminders — the reminder-delivery job (deferred from Phase 1).
--    Runs every 5 min via pg_cron. In-app delivery only (external email/SMS/push
--    is Phase 5). SECURITY DEFINER: it writes notifications for other members.
-- ---------------------------------------------------------------------------
create or replace function public.process_due_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  esc record;
begin
  -- Step 1: deliver due 'pending' reminders as notifications, then mark 'sent'.
  for r in
    select * from public.reminders
    where status = 'pending' and scheduled_at <= now() and recipient_ids is not null
  loop
    insert into public.notifications (care_circle_id, recipient_id, reminder_id, title, body, notification_type, action_url)
    select r.care_circle_id, rec_id, r.id,
      case r.reminder_type
        when 'task_due' then 'Task due'
        when 'appointment_upcoming' then 'Upcoming appointment'
        when 'medication_refill' then 'Medication refill due'
        when 'document_expiring' then 'Document expiring'
        else 'Reminder'
      end,
      r.message,
      'reminder',
      case r.reminder_type
        when 'task_due' then '/tasks' || coalesce('?task=' || r.linked_object_id::text, '')
        when 'appointment_upcoming' then '/calendar' || coalesce('?appointment=' || r.linked_object_id::text, '')
        when 'medication_refill' then '/medications'
        when 'document_expiring' then '/documents' || coalesce('?document=' || r.linked_object_id::text, '')
        else '/timeline'
      end
    from unnest(r.recipient_ids) as rec_id;

    update public.reminders set status = 'sent', updated_at = now() where id = r.id;
  end loop;

  -- Step 2: re-notify 'sent' reminders still unacknowledged after N hours
  --         (care_circle setting reminder_unack_hours, default 4). After the 4th
  --         pass (snooze_count > 3) fire matching escalation rules, then expire.
  for r in
    select rem.*
    from public.reminders rem
    join public.care_circles cc on cc.id = rem.care_circle_id
    where rem.status = 'sent'
      and rem.recipient_ids is not null
      and rem.updated_at <= now() - (coalesce((cc.settings->>'reminder_unack_hours')::int, 4) || ' hours')::interval
      and exists (
        select 1 from unnest(rem.recipient_ids) as rid
        where not (rem.acknowledgements ? rid::text)
      )
  loop
    insert into public.notifications (care_circle_id, recipient_id, reminder_id, title, body, notification_type, action_url)
    select r.care_circle_id, rec_id, r.id, 'Reminder still needs attention', r.message, 'reminder', '/timeline'
    from unnest(r.recipient_ids) as rec_id
    where not (r.acknowledgements ? rec_id::text);

    update public.reminders set snooze_count = snooze_count + 1, updated_at = now() where id = r.id;

    if r.snooze_count + 1 > 3 then
      for esc in
        select * from public.escalation_rules
        where care_circle_id = r.care_circle_id
          and trigger_type = 'reminder_unacknowledged'
          and is_active = true
          and deleted_at is null
      loop
        if esc.action = 'notify_user' and esc.target_ids is not null then
          insert into public.notifications (care_circle_id, recipient_id, reminder_id, title, body, notification_type, action_url)
          select r.care_circle_id, t, r.id, 'Escalation: reminder unacknowledged',
            coalesce(esc.message, r.message), 'escalation', '/timeline'
          from unnest(esc.target_ids) as t;
        elsif esc.action = 'notify_role' and esc.target_role is not null then
          insert into public.notifications (care_circle_id, recipient_id, reminder_id, title, body, notification_type, action_url)
          select r.care_circle_id, m.user_id, r.id, 'Escalation: reminder unacknowledged',
            coalesce(esc.message, r.message), 'escalation', '/timeline'
          from public.memberships m
          where m.care_circle_id = r.care_circle_id
            and m.role = esc.target_role
            and (m.expires_at is null or m.expires_at > now());
        end if;
        -- 'notify_emergency_contact' has no in-app channel (external delivery = Phase 5): skipped.
      end loop;

      update public.reminders set status = 'expired', updated_at = now() where id = r.id;
    end if;
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- 8. Schedule the reminder job every 5 minutes via pg_cron.
--    Fail-soft: if pg_cron cannot be enabled on this project/role, the table and
--    functions above still apply — only the schedule is skipped (with a NOTICE).
--    To schedule it later, enable pg_cron in Dashboard -> Database -> Extensions,
--    then run:
--      select cron.schedule('vigil-process-reminders','*/5 * * * *','select public.process_due_reminders();');
-- ---------------------------------------------------------------------------
do $$
begin
  create extension if not exists pg_cron;
  if exists (select 1 from cron.job where jobname = 'vigil-process-reminders') then
    perform cron.unschedule('vigil-process-reminders');
  end if;
  perform cron.schedule('vigil-process-reminders', '*/5 * * * *', $cron$select public.process_due_reminders();$cron$);
exception
  when others then
    raise notice 'pg_cron not scheduled (%). Enable pg_cron in the Supabase dashboard, then schedule vigil-process-reminders manually.', sqlerrm;
end;
$$;
