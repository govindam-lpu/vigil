-- Phase 5 — §8 Multi-household support.
--
-- A Person can have several Household locations. Non-sensitive fields (name, type,
-- address, linked contacts) live on `households` and are visible to any member.
--
-- SECURITY DEVIATION FROM SPEC (flagged): the spec puts `access_notes` (door codes,
-- key location, garage code) as a column on `households` and strips it in the API for
-- lower roles. RLS cannot hide a single column, so a caregiver/viewer could still read
-- it via direct PostgREST — the exact leak class the Phase 0/1 audit fixed for private
-- notes. We instead store access notes in a companion table gated to coordinator+ so the
-- protection is DB-enforced (Rules 1 & 7). UX is unchanged: coordinators see/edit access
-- notes; everyone else sees "Access notes restricted".

create table public.households (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  name text not null,
  type text not null check (
    type in ('primary_residence', 'secondary_residence', 'facility', 'clinic', 'hospital', 'other')
  ),
  address text,
  linked_contact_ids uuid[] not null default '{}',
  deleted_at timestamptz,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.household_access_notes (
  household_id uuid primary key references public.households(id) on delete cascade,
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  notes text,
  updated_at timestamptz default now()
);

create index households_care_circle_person_idx on public.households(care_circle_id, person_id);

create trigger households_set_updated_at
  before update on public.households
  for each row execute function public.set_updated_at();

create trigger household_access_notes_set_updated_at
  before update on public.household_access_notes
  for each row execute function public.set_updated_at();

alter table public.households enable row level security;
alter table public.household_access_notes enable row level security;

-- households: any member reads; contributor+ writes (matches contacts). No delete policy.
create policy "households_select_members"
on public.households
for select
to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "households_insert_contributors"
on public.households
for insert
to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "households_update_contributors"
on public.households
for update
to authenticated
using (public.can_insert_into_circle(care_circle_id))
with check (public.can_insert_into_circle(care_circle_id));

-- household_access_notes: coordinator+ only, for select and write. No delete policy.
create policy "household_access_notes_select_coordinator"
on public.household_access_notes
for select
to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner', 'coordinator']));

create policy "household_access_notes_insert_coordinator"
on public.household_access_notes
for insert
to authenticated
with check (public.has_care_circle_role(care_circle_id, array['owner', 'coordinator']));

create policy "household_access_notes_update_coordinator"
on public.household_access_notes
for update
to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner', 'coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner', 'coordinator']));
