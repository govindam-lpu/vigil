-- Phase 5 — §3 Granular per-membership permission overrides.
--
-- Adds a membership-level capability override layer on top of role defaults.
-- A row with granted = true adds a capability the role lacks; granted = false
-- removes a capability the role would otherwise have. "Reset to role default" is
-- modeled as granted = false (or an absent row) rather than a hard delete, so the
-- table keeps the soft-delete-only invariant (no DELETE policy — Rule 7).

create table public.membership_permission_overrides (
  id uuid primary key default gen_random_uuid(),
  membership_id uuid not null references public.memberships(id) on delete cascade,
  capability text not null,
  granted boolean not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (membership_id, capability)
);

create index membership_permission_overrides_membership_idx
  on public.membership_permission_overrides(membership_id);

create trigger membership_permission_overrides_set_updated_at
  before update on public.membership_permission_overrides
  for each row execute function public.set_updated_at();

alter table public.membership_permission_overrides enable row level security;

-- SELECT: a user may read overrides for their OWN membership (required so the API
-- can resolve effective capabilities under the user session when enforcing writes),
-- and owners/coordinators of the circle may read all overrides (for the management
-- screen).
create policy "mpo_select_self_or_admin"
on public.membership_permission_overrides
for select
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.id = membership_permission_overrides.membership_id
      and (
        m.user_id = auth.uid()
        or public.has_care_circle_role(m.care_circle_id, array['owner', 'coordinator'])
      )
  )
);

-- INSERT / UPDATE: only owners/coordinators of the target membership's circle.
-- (The API additionally enforces "grant only up to your own level" and refuses to
-- edit an owner membership.)
create policy "mpo_insert_admin"
on public.membership_permission_overrides
for insert
to authenticated
with check (
  exists (
    select 1
    from public.memberships m
    where m.id = membership_permission_overrides.membership_id
      and public.has_care_circle_role(m.care_circle_id, array['owner', 'coordinator'])
  )
);

create policy "mpo_update_admin"
on public.membership_permission_overrides
for update
to authenticated
using (
  exists (
    select 1
    from public.memberships m
    where m.id = membership_permission_overrides.membership_id
      and public.has_care_circle_role(m.care_circle_id, array['owner', 'coordinator'])
  )
)
with check (
  exists (
    select 1
    from public.memberships m
    where m.id = membership_permission_overrides.membership_id
      and public.has_care_circle_role(m.care_circle_id, array['owner', 'coordinator'])
  )
);

-- No DELETE policy (Rule 7 — soft-delete only; removal is granted = false).
