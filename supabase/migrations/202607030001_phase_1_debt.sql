-- Phase 1 debt paydown
-- 1. Timeline soft-delete support
-- 2. Documents: storage path for signed URLs + formal appointment link
-- 3. Private documents bucket with per-care-circle storage RLS
--
-- Safe to run once against a database that already has the Phase 1 schema.

-- ---------------------------------------------------------------------------
-- 1. Timeline soft-delete
-- ---------------------------------------------------------------------------
alter table public.timeline_events
  add column if not exists deleted_at timestamptz;

create index if not exists timeline_events_active_idx
  on public.timeline_events (care_circle_id, person_id, occurred_at desc)
  where deleted_at is null;

-- Recreate search so soft-deleted timeline entries drop out of results.
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
      ts_headline('english', coalesce(timeline_events.body, timeline_events.title), query.tsq, 'MaxWords=18, MinWords=6') as snippet,
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
      ts_headline('english', coalesce(tasks.description, tasks.title), query.tsq, 'MaxWords=18, MinWords=6'),
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
      ts_headline('english', coalesce(appointments.provider_name, appointments.title), query.tsq, 'MaxWords=18, MinWords=6'),
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
      ts_headline('english', coalesce(documents.description, documents.title), query.tsq, 'MaxWords=18, MinWords=6'),
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
      ts_headline('english', notes.content, query.tsq, 'MaxWords=18, MinWords=6'),
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

-- ---------------------------------------------------------------------------
-- 2. Documents: storage path + formal appointment link
-- ---------------------------------------------------------------------------
alter table public.documents
  add column if not exists storage_path text;

alter table public.documents
  add column if not exists appointment_id uuid references public.appointments(id) on delete set null;

-- Backfill storage_path for any rows created before signed URLs (parse the
-- object path out of the previously stored public URL).
update public.documents
set storage_path = regexp_replace(file_url, '^.*/documents/', '')
where storage_path is null
  and file_url is not null;

-- Files are now accessed via signed URLs, so a public file_url is no longer required.
alter table public.documents
  alter column file_url drop not null;

create index if not exists documents_appointment_idx
  on public.documents (appointment_id)
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 3. Private documents bucket + per-care-circle storage RLS
--    Object paths are laid out as "<care_circle_id>/.../<file>", so the first
--    path segment identifies the owning care circle.
-- ---------------------------------------------------------------------------
update storage.buckets set public = false where id = 'documents';

drop policy if exists "documents_bucket_authenticated_upload" on storage.objects;
drop policy if exists "documents_bucket_authenticated_read" on storage.objects;

create policy "documents_bucket_read_circle_members"
on storage.objects for select to authenticated
using (
  bucket_id = 'documents'
  and public.is_care_circle_member(((storage.foldername(name))[1])::uuid)
);

create policy "documents_bucket_insert_circle_contributors"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'documents'
  and public.can_insert_into_circle(((storage.foldername(name))[1])::uuid)
);
