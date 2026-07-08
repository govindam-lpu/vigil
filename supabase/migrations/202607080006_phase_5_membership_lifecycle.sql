-- Phase 5 — §7 Temporary membership expiry + handoff-elevation auto-revert.
--
-- A daily pg_cron job enforces two lifecycle rules the app previously only stored:
--   1. Temporary handoff elevations (Phase 2: original_role + elevation_expires_at)
--      revert to the original role once elevation_expires_at passes.
--   2. Temporary memberships (memberships.expires_at) are, once expired, either
--      downgraded to Viewer or soft-removed — per a per-circle setting.
--
-- Soft-remove needs a soft-delete column on memberships (Rule 4/7: no hard delete).

alter table public.memberships add column if not exists deleted_at timestamptz;

-- Membership-based access helpers must ignore soft-removed memberships, so a removed
-- member immediately loses all access. (deleted_at is null for every existing row, so
-- active members are unaffected.)
create or replace function public.is_care_circle_member(target_care_circle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where care_circle_id = target_care_circle_id
      and user_id = auth.uid()
      and deleted_at is null
      and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.has_care_circle_role(target_care_circle_id uuid, allowed_roles text[])
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where care_circle_id = target_care_circle_id
      and user_id = auth.uid()
      and role = any(allowed_roles)
      and deleted_at is null
      and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.can_insert_into_circle(target_care_circle_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.memberships
    where care_circle_id = target_care_circle_id
      and user_id = auth.uid()
      and role in ('owner', 'coordinator', 'contributor')
      and deleted_at is null
      and (expires_at is null or expires_at > now())
  );
$$;

-- System counterpart to create_timeline_event for cron/system events (no auth.uid()).
-- Author is null (a system entry). Restricted to definer functions — end users must
-- keep using create_timeline_event (which forces auth.uid() attribution).
create or replace function public.create_system_timeline_event(
  target_care_circle_id uuid,
  target_person_id uuid,
  event_type text,
  title text,
  body text,
  linked_object_type text,
  linked_object_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.timeline_events (
    care_circle_id,
    person_id,
    event_type,
    title,
    body,
    author_id,
    is_editable,
    linked_object_type,
    linked_object_id
  )
  values (
    target_care_circle_id,
    target_person_id,
    event_type,
    title,
    body,
    null,
    false,
    linked_object_type,
    linked_object_id
  );
end;
$$;

revoke execute on function public.create_system_timeline_event(uuid, uuid, text, text, text, text, uuid)
  from public, anon, authenticated;

-- The daily lifecycle job. Audit actor is the circle owner (same pattern as
-- create_default_folders — audit_logs.actor_id is NOT NULL and cron has no auth.uid()).
create or replace function public.enforce_membership_lifecycle()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  rec record;
  policy text;
  member_name text;
begin
  -- 1) Revert expired handoff elevations to the original role.
  for rec in
    select m.id, m.care_circle_id, m.user_id, m.role, m.original_role,
           cc.person_id as cc_person_id, cc.owner_id as cc_owner_id
    from public.memberships m
    join public.care_circles cc on cc.id = m.care_circle_id
    where m.elevation_expires_at is not null
      and m.elevation_expires_at < now()
      and m.original_role is not null
      and m.deleted_at is null
  loop
    update public.memberships
    set role = rec.original_role,
        original_role = null,
        elevation_expires_at = null
    where id = rec.id;

    select display_name into member_name from public.users_profiles where id = rec.user_id;

    insert into public.audit_logs (care_circle_id, actor_id, action_type, object_type, object_id, diff)
    values (
      rec.care_circle_id, rec.cc_owner_id, 'role_changed', 'membership', rec.id,
      jsonb_build_object('from', rec.role, 'to', rec.original_role, 'reason', 'handoff_elevation_expired')
    );

    if rec.cc_person_id is not null then
      perform public.create_system_timeline_event(
        rec.care_circle_id, rec.cc_person_id, 'system',
        coalesce(member_name, 'A member') || '''s temporary elevation ended',
        'Access reverted to ' || rec.original_role || '.',
        'membership', rec.id
      );
    end if;
  end loop;

  -- 2) Expire temporary memberships (downgrade to Viewer, or soft-remove per setting).
  for rec in
    select m.id, m.care_circle_id, m.user_id, m.role,
           cc.person_id as cc_person_id, cc.owner_id as cc_owner_id, cc.settings as cc_settings
    from public.memberships m
    join public.care_circles cc on cc.id = m.care_circle_id
    where m.expires_at is not null
      and m.expires_at < now()
      and m.role <> 'viewer'
      and m.deleted_at is null
  loop
    policy := coalesce(rec.cc_settings->>'expiry_policy', 'downgrade');
    select display_name into member_name from public.users_profiles where id = rec.user_id;

    if policy = 'remove' then
      update public.memberships set deleted_at = now() where id = rec.id;

      insert into public.audit_logs (care_circle_id, actor_id, action_type, object_type, object_id, diff)
      values (
        rec.care_circle_id, rec.cc_owner_id, 'deleted', 'membership', rec.id,
        jsonb_build_object('role', rec.role, 'reason', 'temporary_access_expired')
      );

      if rec.cc_person_id is not null then
        perform public.create_system_timeline_event(
          rec.care_circle_id, rec.cc_person_id, 'system',
          coalesce(member_name, 'A member') || ' was removed from the care circle',
          'Temporary access as ' || rec.role || ' expired.',
          'membership', rec.id
        );
      end if;
    else
      update public.memberships set role = 'viewer', expires_at = null where id = rec.id;

      insert into public.audit_logs (care_circle_id, actor_id, action_type, object_type, object_id, diff)
      values (
        rec.care_circle_id, rec.cc_owner_id, 'role_changed', 'membership', rec.id,
        jsonb_build_object('from', rec.role, 'to', 'viewer', 'reason', 'temporary_access_expired')
      );

      if rec.cc_person_id is not null then
        perform public.create_system_timeline_event(
          rec.care_circle_id, rec.cc_person_id, 'system',
          coalesce(member_name, 'A member') || '''s temporary access as ' || rec.role || ' has expired',
          'Access set to Viewer.',
          'membership', rec.id
        );
      end if;
    end if;
  end loop;
end;
$$;

-- Cron-only: revoke user execute (like process_due_reminders).
revoke execute on function public.enforce_membership_lifecycle() from public, anon, authenticated;

-- Schedule daily at 03:00 UTC. Fail-soft if pg_cron isn't enabled yet (schedule
-- manually afterwards with the same select).
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule(
      'vigil-enforce-membership-lifecycle',
      '0 3 * * *',
      'select public.enforce_membership_lifecycle();'
    );
  end if;
exception
  when others then
    raise notice 'pg_cron scheduling skipped: %', sqlerrm;
end;
$$;
