-- Phase 3a — AI-Assisted Capture (foundation + text/LLM pipeline)
--
-- Adds:
--   documents: ai_suggestions (jsonb), ai_suggestions_dismissed_at, processing_status
--   ai_provider_configs: per-circle BYOK provider + encrypted key (admin-managed)
--   ai_usage_logs: per-call AI metadata for monitoring + rate limiting (no key, no content)
--   care_circle_summaries: cached "since last visit" AI prose summary (per user)
--   get_ai_runtime_config(): SECURITY DEFINER accessor so a member's server-side call can
--     obtain the circle's provider + ciphertext at inference time (base table stays admin-only)
--   search_phase1(): documents branch now also indexes extracted_text (OCR content)
--
-- Follows Phase 0-2 conventions: RLS on every table, membership-scoped policies, NO delete
-- policy (soft-delete / null-out only), SECURITY DEFINER helpers pin search_path and check
-- auth.uid()/membership. Apply AFTER all Phase 0-2 migrations.
--
-- Security note: ai_provider_configs.encrypted_key stores AES-256-GCM ciphertext ONLY. The
-- decryption master key (AI_KEY_ENC_SECRET) lives solely in server/worker env — never in the
-- DB or the browser — so the ciphertext is opaque even to a member who reads it directly.

-- ---------------------------------------------------------------------------
-- 1. documents: OCR + AI-suggestion columns (extracted_text already exists from Phase 1)
-- ---------------------------------------------------------------------------
alter table public.documents add column if not exists ai_suggestions jsonb;
alter table public.documents add column if not exists ai_suggestions_dismissed_at timestamptz;
alter table public.documents add column if not exists processing_status text;
alter table public.documents drop constraint if exists documents_processing_status_check;
alter table public.documents add constraint documents_processing_status_check
  check (processing_status is null or processing_status in ('pending','processing','indexed','failed'));

-- ---------------------------------------------------------------------------
-- 2. ai_provider_configs — one BYOK config per care circle
-- ---------------------------------------------------------------------------
create table public.ai_provider_configs (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null unique references public.care_circles(id) on delete restrict,
  provider text check (provider is null or provider in ('anthropic','gemini','managed')),
  encrypted_key text,            -- AES-256-GCM ciphertext (BYOK only); null for managed/none
  key_last4 text,                -- display only
  gemini_free_tier_ack boolean not null default false,
  model_overrides jsonb,
  updated_by uuid references auth.users(id),
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create trigger ai_provider_configs_set_updated_at
  before update on public.ai_provider_configs
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- 3. ai_usage_logs — per-call metadata for monitoring + rate limiting.
--    Never stores the key or any document/note content. Append-only.
-- ---------------------------------------------------------------------------
create table public.ai_usage_logs (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  provider text not null,
  feature text not null,         -- 'extraction' | 'summary' | 'note_task_suggestion'
  model text not null,
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  est_cost numeric(10,6) not null default 0,
  latency_ms int,
  succeeded boolean not null default false,
  created_at timestamptz default now()
);

create index ai_usage_logs_circle_created_idx on public.ai_usage_logs(care_circle_id, created_at desc);

-- ---------------------------------------------------------------------------
-- 4. care_circle_summaries — cached "since last visit" AI summary, per user
-- ---------------------------------------------------------------------------
create table public.care_circle_summaries (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  generated_for_user_id uuid not null references auth.users(id),
  generated_at timestamptz not null default now(),
  summary_text text not null,
  events_covered jsonb,
  unique (care_circle_id, generated_for_user_id)
);

create index care_circle_summaries_lookup_idx
  on public.care_circle_summaries(care_circle_id, generated_for_user_id);

-- ---------------------------------------------------------------------------
-- 5. get_ai_runtime_config — member-scoped accessor for inference-time key use.
--    ai_provider_configs SELECT is admin-only; this lets any member's server-side
--    call (e.g. a caregiver saving a note -> note->task suggestion) fetch the circle's
--    provider + ciphertext without widening the table's own RLS. Returns ciphertext
--    only (opaque without the server master key).
-- ---------------------------------------------------------------------------
create or replace function public.get_ai_runtime_config(target_care_circle_id uuid)
returns table (provider text, encrypted_key text, model_overrides jsonb)
language plpgsql
security definer
set search_path = public
stable
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication is required';
  end if;
  if not public.is_care_circle_member(target_care_circle_id) then
    raise exception 'You do not have access to this care circle';
  end if;
  return query
    select c.provider, c.encrypted_key, c.model_overrides
    from public.ai_provider_configs c
    where c.care_circle_id = target_care_circle_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Row level security
-- ---------------------------------------------------------------------------
alter table public.ai_provider_configs enable row level security;
alter table public.ai_usage_logs enable row level security;
alter table public.care_circle_summaries enable row level security;

-- Provider config: admin-managed (owner/coordinator == circle.settings capability).
-- SELECT admin-only; non-admin runtime key access goes through get_ai_runtime_config().
-- No delete policy (remove-key nulls the columns via update).
create policy "ai_provider_configs_select_admins"
on public.ai_provider_configs for select to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "ai_provider_configs_insert_admins"
on public.ai_provider_configs for insert to authenticated
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']) and updated_by = auth.uid());

create policy "ai_provider_configs_update_admins"
on public.ai_provider_configs for update to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']) and updated_by = auth.uid());

-- Usage logs: members read (rate-limit counter + admin cost estimator) and insert their own
-- circle's rows under the acting member's session. The worker inserts via the service role
-- (bypasses RLS). Append-only: no update/delete policy.
create policy "ai_usage_logs_select_members"
on public.ai_usage_logs for select to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "ai_usage_logs_insert_members"
on public.ai_usage_logs for insert to authenticated
with check (public.is_care_circle_member(care_circle_id));

-- Summaries: a member reads/writes only their own summary row for a circle.
create policy "care_circle_summaries_select_own"
on public.care_circle_summaries for select to authenticated
using (public.is_care_circle_member(care_circle_id) and generated_for_user_id = auth.uid());

create policy "care_circle_summaries_insert_own"
on public.care_circle_summaries for insert to authenticated
with check (public.is_care_circle_member(care_circle_id) and generated_for_user_id = auth.uid());

create policy "care_circle_summaries_update_own"
on public.care_circle_summaries for update to authenticated
using (public.is_care_circle_member(care_circle_id) and generated_for_user_id = auth.uid())
with check (public.is_care_circle_member(care_circle_id) and generated_for_user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 7. Full-text index across documents incl. extracted_text (OCR). Functional GIN
--    index matches the exact expression used by search_phase1 below.
-- ---------------------------------------------------------------------------
create index if not exists documents_fts_idx on public.documents
  using gin (to_tsvector('english',
    coalesce(title, '') || ' ' || coalesce(description, '') || ' ' || coalesce(extracted_text, '')))
  where deleted_at is null;

-- ---------------------------------------------------------------------------
-- 8. search_phase1 — recreated from 202607030002 with ONE change: the documents
--    branch now matches / ranks / snippets over title + description + extracted_text
--    so full-text search reaches inside OCR'd document content. All other branches,
--    the soft-delete filters, membership scoping, and the @@HL@@ sentinel delimiters
--    are unchanged.
-- ---------------------------------------------------------------------------
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
      ts_headline('english', coalesce(documents.title, '') || ' ' || coalesce(documents.description, '') || ' ' || coalesce(documents.extracted_text, ''), query.tsq, 'StartSel=@@HL@@, StopSel=@@/HL@@, MaxWords=18, MinWords=6'),
      documents.created_at,
      ts_rank(to_tsvector('english', coalesce(documents.title, '') || ' ' || coalesce(documents.description, '') || ' ' || coalesce(documents.extracted_text, '')), query.tsq)
    from public.documents, query
    where documents.deleted_at is null
      and documents.care_circle_id in (select allowed_circles.care_circle_id from allowed_circles)
      and (search_all_circles or documents.person_id = target_person_id)
      and documents.is_private = false
      and to_tsvector('english', coalesce(documents.title, '') || ' ' || coalesce(documents.description, '') || ' ' || coalesce(documents.extracted_text, '')) @@ query.tsq

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
