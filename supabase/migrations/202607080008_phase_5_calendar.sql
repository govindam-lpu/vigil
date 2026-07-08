-- Phase 5 — §6 Calendar integration (read-only import).
--
-- Stores a member's Google Calendar OAuth connection (per circle). Tokens are
-- app-encrypted (AES-256-GCM via AI_KEY_ENC_SECRET, same as BYOK AI keys) so the
-- ciphertext is opaque at rest; RLS restricts each row to its owning member. The .ics
-- import path needs no persistence. No write-back to external calendars in this phase.

create table public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null default 'google' check (provider in ('google')),
  encrypted_access_token text,
  encrypted_refresh_token text,
  token_expires_at timestamptz,
  keyword_list text[] not null default '{}',
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (care_circle_id, user_id, provider)
);

create index calendar_connections_user_idx on public.calendar_connections(user_id);

create trigger calendar_connections_set_updated_at
  before update on public.calendar_connections
  for each row execute function public.set_updated_at();

alter table public.calendar_connections enable row level security;

-- A member manages only their own connection, within circles they belong to.
-- No DELETE policy (Rule 7) — "disconnect" nulls the stored tokens via update.
create policy "calendar_connections_select_self"
on public.calendar_connections
for select
to authenticated
using (user_id = auth.uid() and public.is_care_circle_member(care_circle_id));

create policy "calendar_connections_insert_self"
on public.calendar_connections
for insert
to authenticated
with check (user_id = auth.uid() and public.is_care_circle_member(care_circle_id));

create policy "calendar_connections_update_self"
on public.calendar_connections
for update
to authenticated
using (user_id = auth.uid() and public.is_care_circle_member(care_circle_id))
with check (user_id = auth.uid() and public.is_care_circle_member(care_circle_id));
