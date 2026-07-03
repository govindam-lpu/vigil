-- Phase 0/1 audit fixes (security + correctness)
-- Apply AFTER 202607030001_phase_1_debt.sql.
--
-- 1. Private notes must be author-only at the DB layer, not just masked in the API.
-- 2. The caregiver role can log care content (notes, task comments) per the role spec.
-- 3. Cross-member profile reads must respect membership expiry.
-- 4. create_timeline_event must attribute entries to the authenticated actor,
--    never a caller-supplied author_id (prevents timeline attribution spoofing).
-- 5. documents.is_private author-only at the DB layer (parity with notes).

-- Helper: caregiver-and-above may log care content (notes, comments, check-ins).
-- Distinct from can_insert_into_circle (contributor+) which still gates
-- documents, appointments, tasks, medications, folders.
create or replace function public.can_log_care(target_care_circle_id uuid)
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
      and role in ('owner','coordinator','contributor','caregiver')
      and (expires_at is null or expires_at > now())
  );
$$;

-- 1: notes SELECT — private notes readable only by their author.
drop policy if exists "notes_select_members" on public.notes;
create policy "notes_select_members"
on public.notes for select to authenticated
using (
  public.is_care_circle_member(care_circle_id)
  and (is_private = false or author_id = auth.uid())
);

-- 2: notes INSERT — caregiver-and-above may add notes (was contributor+).
drop policy if exists "notes_insert_contributors" on public.notes;
create policy "notes_insert_care"
on public.notes for insert to authenticated
with check (public.can_log_care(care_circle_id) and author_id = auth.uid());

-- 2: task_comments INSERT — caregiver-and-above may comment
--    (was any member, which let read-only viewer/emergency roles write).
drop policy if exists "task_comments_insert_members" on public.task_comments;
create policy "task_comments_insert_care"
on public.task_comments for insert to authenticated
with check (public.can_log_care(care_circle_id) and author_id = auth.uid());

-- 5: documents SELECT — private documents readable only by their uploader.
--    No-op for existing rows (all are is_private = false) but future-proofs the flag.
drop policy if exists "documents_select_members" on public.documents;
create policy "documents_select_members"
on public.documents for select to authenticated
using (
  public.is_care_circle_member(care_circle_id)
  and (is_private = false or uploaded_by = auth.uid())
);

-- 3: users_profiles SELECT — cross-member reads must respect membership expiry.
drop policy if exists "profiles_select_self_or_shared_circle" on public.users_profiles;
create policy "profiles_select_self_or_shared_circle"
on public.users_profiles for select to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.memberships viewer_membership
    join public.memberships target_membership
      on target_membership.care_circle_id = viewer_membership.care_circle_id
    where viewer_membership.user_id = auth.uid()
      and (viewer_membership.expires_at is null or viewer_membership.expires_at > now())
      and target_membership.user_id = users_profiles.id
  )
);

-- 4: create_timeline_event — attribute to auth.uid(), ignore caller-supplied author_id.
create or replace function public.create_timeline_event(
  care_circle_id uuid,
  person_id uuid,
  event_type text,
  title text,
  body text,
  author_id uuid,
  linked_object_type text,
  linked_object_id uuid
)
returns public.timeline_events
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  created_event public.timeline_events;
begin
  if actor is null then
    raise exception 'Authentication is required';
  end if;

  if not public.is_care_circle_member(care_circle_id) then
    raise exception 'You do not have access to this care circle';
  end if;

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
    care_circle_id,
    person_id,
    event_type,
    title,
    body,
    actor,
    event_type = 'user_entry',
    linked_object_type,
    linked_object_id
  )
  returning * into created_event;

  return created_event;
end;
$$;

-- 6: search_phase1 — emit non-HTML sentinel delimiters instead of <b>..</b> so
--    the client can escape untrusted snippet text before adding <mark> highlights
--    (fixes stored XSS via ts_headline output rendered with dangerouslySetInnerHTML).
--    Keeps the soft-delete filters from 202607030001.
create or replace function public.search_phase1(
  search_query text,
  target_person_id uuid,
  target_care_circle_id uuid,
  search_all_circles boolean default false
)
returns table (
  result_type text,
  object_id uuid,
  care_circle_id uuid,
  person_id uuid,
  title text,
  snippet text,
  occurred_at timestamptz,
  rank real
)
language sql
security definer
set search_path = public
stable
as $$
  with query as (
    select plainto_tsquery('english', search_query) as tsq
  ),
  allowed_circles as (
    select memberships.care_circle_id
    from public.memberships
    where memberships.user_id = auth.uid()
      and (memberships.expires_at is null or memberships.expires_at > now())
      and (search_all_circles or memberships.care_circle_id = target_care_circle_id)
  )
  select *
  from (
    select
      'timeline'::text as result_type,
      timeline_events.id as object_id,
      timeline_events.care_circle_id,
      timeline_events.person_id,
      timeline_events.title,
      ts_headline('english', coalesce(timeline_events.body, timeline_events.title), query.tsq, 'StartSel=@@HL@@, StopSel=@@/HL@@, MaxWords=18, MinWords=6') as snippet,
      timeline_events.occurred_at,
      ts_rank(to_tsvector('english', coalesce(timeline_events.title, '') || ' ' || coalesce(timeline_events.body, '')), query.tsq) as rank
    from public.timeline_events, query
    where timeline_events.deleted_at is null
      and timeline_events.care_circle_id in (select allowed_circles.care_circle_id from allowed_circles)
      and (search_all_circles or timeline_events.person_id = target_person_id)
      and to_tsvector('english', coalesce(timeline_events.title, '') || ' ' || coalesce(timeline_events.body, '')) @@ query.tsq

    union all

    select
      'task',
      tasks.id,
      tasks.care_circle_id,
      tasks.person_id,
      tasks.title,
      ts_headline('english', coalesce(tasks.description, tasks.title), query.tsq, 'StartSel=@@HL@@, StopSel=@@/HL@@, MaxWords=18, MinWords=6'),
      tasks.created_at,
      ts_rank(to_tsvector('english', coalesce(tasks.title, '') || ' ' || coalesce(tasks.description, '')), query.tsq)
    from public.tasks, query
    where tasks.deleted_at is null
      and tasks.care_circle_id in (select allowed_circles.care_circle_id from allowed_circles)
      and (search_all_circles or tasks.person_id = target_person_id)
      and to_tsvector('english', coalesce(tasks.title, '') || ' ' || coalesce(tasks.description, '')) @@ query.tsq

    union all

    select
      'appointment',
      appointments.id,
      appointments.care_circle_id,
      appointments.person_id,
      appointments.title,
      ts_headline('english', coalesce(appointments.provider_name, appointments.title), query.tsq, 'StartSel=@@HL@@, StopSel=@@/HL@@, MaxWords=18, MinWords=6'),
      appointments.scheduled_at,
      ts_rank(to_tsvector('english', coalesce(appointments.title, '') || ' ' || coalesce(appointments.provider_name, '')), query.tsq)
    from public.appointments, query
    where appointments.deleted_at is null
      and appointments.care_circle_id in (select allowed_circles.care_circle_id from allowed_circles)
      and (search_all_circles or appointments.person_id = target_person_id)
      and to_tsvector('english', coalesce(appointments.title, '') || ' ' || coalesce(appointments.provider_name, '')) @@ query.tsq

    union all

    select
      'document',
      documents.id,
      documents.care_circle_id,
      documents.person_id,
      documents.title,
      ts_headline('english', coalesce(documents.description, documents.title), query.tsq, 'StartSel=@@HL@@, StopSel=@@/HL@@, MaxWords=18, MinWords=6'),
      documents.created_at,
      ts_rank(to_tsvector('english', coalesce(documents.title, '') || ' ' || coalesce(documents.description, '')), query.tsq)
    from public.documents, query
    where documents.deleted_at is null
      and documents.care_circle_id in (select allowed_circles.care_circle_id from allowed_circles)
      and (search_all_circles or documents.person_id = target_person_id)
      and documents.is_private = false
      and to_tsvector('english', coalesce(documents.title, '') || ' ' || coalesce(documents.description, '')) @@ query.tsq

    union all

    select
      'note',
      notes.id,
      notes.care_circle_id,
      notes.person_id,
      'Note'::text,
      ts_headline('english', notes.content, query.tsq, 'StartSel=@@HL@@, StopSel=@@/HL@@, MaxWords=18, MinWords=6'),
      notes.created_at,
      ts_rank(to_tsvector('english', notes.content), query.tsq)
    from public.notes, query
    where notes.deleted_at is null
      and notes.care_circle_id in (select allowed_circles.care_circle_id from allowed_circles)
      and (search_all_circles or notes.person_id = target_person_id)
      and (notes.is_private = false or notes.author_id = auth.uid())
      and to_tsvector('english', notes.content) @@ query.tsq
  ) results
  order by rank desc, occurred_at desc
  limit 50;
$$;
