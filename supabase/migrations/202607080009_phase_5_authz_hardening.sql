-- Phase 5 — Authorization hardening (post-audit).
--
-- The audit confirmed (live, via direct PostgREST under a real coordinator JWT) three
-- privilege-escalation paths where a rule was enforced ONLY in the Next.js API route,
-- not in the database. Because the web app reaches Supabase PostgREST with the anon key
-- + the user's JWT, any authenticated member can bypass the route and call PostgREST
-- directly — so RLS/triggers are the real trust boundary. This migration moves the
-- missing checks into the DB (defense-in-depth; the API keeps its own checks).
--
--   1. memberships role changes — the only policy gating them
--      (memberships_update_owner_coordinator) let ANY owner/coordinator set ANY row to
--      ANY role. A coordinator could self-promote to owner or demote the owner.
--   2. membership_permission_overrides — the mpo_insert/update policies let any
--      owner/coordinator write any override, so a coordinator could self-grant
--      export.all or tamper with the owner's capabilities ("grant only up to your own
--      level" + "owner immutable" were API-only).
--   3. care_circles.owner_id — the update policy let a coordinator rewrite owner_id
--      (ownership hijack of the metadata field).
--
-- Approach: BEFORE triggers (SECURITY DEFINER) that read auth.uid() from the JWT.
-- A null auth.uid() means a trusted context (pg_cron lifecycle job, onboarding RPC runs
-- with the caller's uid so it is still checked) — system paths are allowed through.

-- ---------------------------------------------------------------------------
-- Capability model ported to SQL. MUST stay in sync with
-- lib/permissions/capabilities.ts (ROLE_CAPABILITIES). Used to DB-enforce
-- "grant only up to your own level" on permission overrides.
-- ---------------------------------------------------------------------------
create or replace function public.role_default_capabilities(r text)
returns text[]
language sql
immutable
as $$
  select case r
    when 'owner' then array[
      'tasks.read','tasks.write','tasks.assign','appointments.read','appointments.write',
      'medications.read','medications.write','documents.read','documents.upload','documents.delete',
      'notes.read','notes.write','notes.private','contacts.read','contacts.write',
      'members.invite','circle.settings','circle.crisis','audit.read','export.all']
    when 'coordinator' then array[
      'tasks.read','tasks.write','tasks.assign','appointments.read','appointments.write',
      'medications.read','medications.write','documents.read','documents.upload','documents.delete',
      'notes.read','notes.write','notes.private','contacts.read','contacts.write',
      'members.invite','circle.settings','circle.crisis','audit.read']
    when 'contributor' then array[
      'tasks.read','appointments.read','medications.read','documents.read','notes.read','contacts.read',
      'tasks.write','tasks.assign','appointments.write','medications.write','documents.upload',
      'contacts.write','notes.write','notes.private']
    when 'caregiver' then array[
      'tasks.read','appointments.read','medications.read','documents.read','notes.read','contacts.read',
      'notes.write','notes.private']
    when 'viewer' then array[
      'tasks.read','appointments.read','medications.read','documents.read','notes.read','contacts.read']
    when 'emergency' then array[
      'tasks.read','appointments.read','medications.read','documents.read','notes.read','contacts.read']
    else array[]::text[]
  end;
$$;

-- The acting user's effective capabilities in a circle (role default ± their OWN
-- override rows). Mirrors resolveEffectiveCapabilities() in lib/permissions/capabilities.ts.
create or replace function public.user_effective_capabilities(target_care_circle_id uuid)
returns text[]
language sql
security definer
set search_path = public
stable
as $$
  with m as (
    select id, role
    from public.memberships
    where care_circle_id = target_care_circle_id
      and user_id = auth.uid()
      and deleted_at is null
      and (expires_at is null or expires_at > now())
    limit 1
  ),
  base as (
    select unnest(public.role_default_capabilities((select role from m))) as cap
  ),
  ov as (
    select capability, granted
    from public.membership_permission_overrides
    where membership_id = (select id from m)
  )
  select coalesce(array_agg(distinct cap), array[]::text[])
  from (
    select cap from base
    where cap not in (select capability from ov where granted = false)
    union
    select capability as cap from ov where granted = true
  ) eff;
$$;

-- ---------------------------------------------------------------------------
-- 1. memberships role guard
-- ---------------------------------------------------------------------------
create or replace function public.enforce_membership_role_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  circle_owner uuid;
begin
  -- Trusted system context (pg_cron lifecycle job runs with no JWT).
  if actor is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    -- Only the circle creator's own bootstrap membership may be an owner row; nobody
    -- (incl. a coordinator adding members) may plant an additional owner.
    if new.role = 'owner' then
      select owner_id into circle_owner from public.care_circles where id = new.care_circle_id;
      if not (new.user_id = actor and circle_owner = actor) then
        raise exception 'Only the circle creator may hold the owner role';
      end if;
    end if;
    return new;
  end if;

  if tg_op = 'UPDATE' and new.role is distinct from old.role then
    -- Only the circle owner may change a member's role.
    if not public.has_care_circle_role(new.care_circle_id, array['owner']) then
      raise exception 'Only the circle owner may change member roles';
    end if;
    -- The owner row is immutable through this path (ownership transfer is a separate flow).
    if old.role = 'owner' then
      raise exception 'The owner role cannot be changed here';
    end if;
    -- No self role-change (blocks self-escalation even by the owner).
    if new.user_id = actor then
      raise exception 'You cannot change your own role';
    end if;
    -- No minting a second owner via update.
    if new.role = 'owner' then
      raise exception 'Ownership transfer is not permitted through this path';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists memberships_role_guard on public.memberships;
create trigger memberships_role_guard
before insert or update on public.memberships
for each row execute function public.enforce_membership_role_guard();

-- ---------------------------------------------------------------------------
-- 2. membership_permission_overrides guard: owner-immutable + grant-up-to-own-level
-- ---------------------------------------------------------------------------
create or replace function public.enforce_override_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  target_role text;
  target_circle uuid;
begin
  if actor is null then
    return new;  -- trusted system context
  end if;

  select role, care_circle_id into target_role, target_circle
  from public.memberships
  where id = new.membership_id;

  if target_role is null then
    raise exception 'Unknown membership';
  end if;

  -- Owner permissions cannot be overridden.
  if target_role = 'owner' then
    raise exception 'Owner permissions cannot be overridden';
  end if;

  -- Grant only up to your own level: to GRANT a capability you must hold it yourself.
  if new.granted and not (new.capability = any(public.user_effective_capabilities(target_circle))) then
    raise exception 'You can only grant permissions you hold yourself';
  end if;

  return new;
end;
$$;

drop trigger if exists mpo_guard on public.membership_permission_overrides;
create trigger mpo_guard
before insert or update on public.membership_permission_overrides
for each row execute function public.enforce_override_guard();

-- ---------------------------------------------------------------------------
-- 3. care_circles.owner_id guard: only the current owner may transfer ownership.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_care_circle_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
begin
  if actor is null then
    return new;  -- trusted system context
  end if;

  if new.owner_id is distinct from old.owner_id then
    -- Only the current owner may reassign owner_id (ownership transfer).
    if old.owner_id <> actor then
      raise exception 'Only the current owner may transfer ownership';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists care_circles_owner_guard on public.care_circles;
create trigger care_circles_owner_guard
before update on public.care_circles
for each row execute function public.enforce_care_circle_owner_guard();
