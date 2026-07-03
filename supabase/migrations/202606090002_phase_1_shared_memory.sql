alter table public.memberships
  add column if not exists last_caught_up_at timestamptz;

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  title text not null,
  description text,
  assignee_id uuid references auth.users(id),
  assigned_by uuid references auth.users(id),
  due_date date,
  due_time time,
  priority text default 'normal' check (priority in ('low','normal','high','urgent')),
  status text default 'open' check (status in ('open','in_progress','done','missed','cancelled')),
  recurrence jsonb,
  linked_object_type text,
  linked_object_id uuid,
  tags text[],
  completed_at timestamptz,
  completed_by uuid references auth.users(id),
  missed_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.appointments (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  title text not null,
  provider_name text,
  location text,
  address text,
  appointment_type text check (appointment_type in ('medical','legal','financial','home_service','other')),
  scheduled_at timestamptz not null,
  duration_minutes int,
  status text default 'scheduled' check (status in ('scheduled','completed','cancelled','missed')),
  prep_notes text,
  outcome text,
  attendee_ids uuid[],
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  author_id uuid not null references auth.users(id),
  content text not null,
  is_private boolean default false,
  linked_object_type text,
  linked_object_id uuid,
  pinned_in_crisis boolean default false,
  tags text[],
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.timeline_events (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  event_type text not null check (
    event_type in (
      'user_entry',
      'task_completed',
      'task_missed',
      'appointment_completed',
      'appointment_created',
      'document_uploaded',
      'note_created',
      'member_joined',
      'system'
    )
  ),
  title text not null,
  body text,
  author_id uuid references auth.users(id),
  occurred_at timestamptz not null default now(),
  is_editable boolean default false,
  linked_object_type text,
  linked_object_id uuid,
  created_at timestamptz default now()
);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  linked_object_type text,
  linked_object_id uuid,
  reminder_type text check (reminder_type in ('task_due','appointment_upcoming','document_expiring','custom')),
  scheduled_at timestamptz not null,
  message text,
  recipient_ids uuid[],
  repeat_rule jsonb,
  acknowledgements jsonb default '{}'::jsonb,
  status text default 'pending' check (status in ('pending','sent','acknowledged','snoozed','expired')),
  snooze_count int default 0,
  snooze_until timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  folder_id uuid references public.folders(id) on delete restrict,
  title text not null,
  description text,
  document_type text check (
    document_type in (
      'medical_record',
      'insurance',
      'legal',
      'financial',
      'identification',
      'care_plan',
      'correspondence',
      'other'
    )
  ),
  file_url text not null,
  file_type text,
  file_size_bytes bigint,
  uploaded_by uuid references auth.users(id),
  issued_at date,
  expires_at date,
  source_name text,
  tags text[],
  extracted_text text,
  is_private boolean default false,
  pinned_in_crisis boolean default false,
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.task_comments (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  task_id uuid not null references public.tasks(id) on delete restrict,
  author_id uuid not null references auth.users(id),
  content text not null,
  created_at timestamptz default now()
);

create index tasks_care_circle_person_idx on public.tasks(care_circle_id, person_id) where deleted_at is null;
create index tasks_assignee_idx on public.tasks(assignee_id) where deleted_at is null;
create index appointments_care_circle_person_idx on public.appointments(care_circle_id, person_id) where deleted_at is null;
create index notes_care_circle_person_idx on public.notes(care_circle_id, person_id) where deleted_at is null;
create index documents_care_circle_person_idx on public.documents(care_circle_id, person_id) where deleted_at is null;
create index timeline_events_care_circle_person_idx on public.timeline_events(care_circle_id, person_id, occurred_at desc);
create index reminders_care_circle_person_idx on public.reminders(care_circle_id, person_id);
create index task_comments_task_idx on public.task_comments(task_id, created_at);

create index tasks_search_idx on public.tasks using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));
create index appointments_search_idx on public.appointments using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(provider_name, '')));
create index notes_search_idx on public.notes using gin (to_tsvector('english', coalesce(content, '')));
create index documents_search_idx on public.documents using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')));
create index timeline_events_search_idx on public.timeline_events using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')));

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function public.set_updated_at();

create trigger appointments_set_updated_at
before update on public.appointments
for each row execute function public.set_updated_at();

create trigger notes_set_updated_at
before update on public.notes
for each row execute function public.set_updated_at();

create trigger reminders_set_updated_at
before update on public.reminders
for each row execute function public.set_updated_at();

create trigger documents_set_updated_at
before update on public.documents
for each row execute function public.set_updated_at();

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
    author_id,
    event_type = 'user_entry',
    linked_object_type,
    linked_object_id
  )
  returning * into created_event;

  return created_event;
end;
$$;

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
    where timeline_events.care_circle_id in (select allowed_circles.care_circle_id from allowed_circles)
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

create or replace function public.mark_membership_caught_up(target_care_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;

  update public.memberships
  set last_caught_up_at = now()
  where care_circle_id = target_care_circle_id
    and user_id = auth.uid();
end;
$$;

alter table public.tasks enable row level security;
alter table public.appointments enable row level security;
alter table public.notes enable row level security;
alter table public.timeline_events enable row level security;
alter table public.reminders enable row level security;
alter table public.documents enable row level security;
alter table public.task_comments enable row level security;

create policy "tasks_select_members"
on public.tasks for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "tasks_insert_contributors"
on public.tasks for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "tasks_update_contributors"
on public.tasks for update to authenticated
using (public.can_insert_into_circle(care_circle_id))
with check (public.can_insert_into_circle(care_circle_id));

create policy "appointments_select_members"
on public.appointments for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "appointments_insert_contributors"
on public.appointments for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "appointments_update_contributors"
on public.appointments for update to authenticated
using (public.can_insert_into_circle(care_circle_id))
with check (public.can_insert_into_circle(care_circle_id));

create policy "notes_select_members"
on public.notes for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "notes_insert_contributors"
on public.notes for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id) and author_id = auth.uid());

create policy "notes_update_author_or_coordinator"
on public.notes for update to authenticated
using (author_id = auth.uid() or public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (author_id = auth.uid() or public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "timeline_select_members"
on public.timeline_events for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "timeline_insert_contributors"
on public.timeline_events for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "timeline_update_author_editable"
on public.timeline_events for update to authenticated
using (is_editable = true and author_id = auth.uid())
with check (is_editable = true and author_id = auth.uid());

create policy "reminders_select_members"
on public.reminders for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "reminders_insert_contributors"
on public.reminders for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "reminders_update_contributors"
on public.reminders for update to authenticated
using (public.can_insert_into_circle(care_circle_id))
with check (public.can_insert_into_circle(care_circle_id));

create policy "documents_select_members"
on public.documents for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "documents_insert_contributors"
on public.documents for insert to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "documents_update_contributors"
on public.documents for update to authenticated
using (public.can_insert_into_circle(care_circle_id))
with check (public.can_insert_into_circle(care_circle_id));

create policy "task_comments_select_members"
on public.task_comments for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "task_comments_insert_members"
on public.task_comments for insert to authenticated
with check (public.is_care_circle_member(care_circle_id) and author_id = auth.uid());

insert into storage.buckets (id, name, public)
values ('documents', 'documents', true)
on conflict (id) do nothing;

create policy "documents_bucket_authenticated_upload"
on storage.objects for insert to authenticated
with check (bucket_id = 'documents');

create policy "documents_bucket_authenticated_read"
on storage.objects for select to authenticated
using (bucket_id = 'documents');
