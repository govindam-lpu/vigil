create extension if not exists pgcrypto;

create table public.users_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null,
  phone text,
  avatar_url text,
  timezone text default 'UTC',
  notification_preferences jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.care_circles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  person_id uuid,
  owner_id uuid not null references auth.users(id),
  settings jsonb default '{}'::jsonb,
  crisis_mode boolean default false,
  crisis_mode_activated_at timestamptz,
  crisis_mode_activated_by uuid references auth.users(id),
  created_at timestamptz default now()
);

create table public.persons (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  first_name text not null,
  last_name text not null,
  preferred_name text,
  date_of_birth date,
  pronouns text,
  primary_language text default 'English',
  photo_url text,
  primary_diagnoses text[],
  allergies text[],
  blood_type text,
  insurance_summary jsonb default '{}'::jsonb,
  medical_record_numbers jsonb default '{}'::jsonb,
  current_care_mode text default 'normal' check (current_care_mode in ('normal','elevated','crisis')),
  about_note text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

alter table public.care_circles
  add constraint care_circles_person_id_fkey
  foreign key (person_id) references public.persons(id) on delete restrict;

create table public.memberships (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('owner','coordinator','contributor','caregiver','viewer','emergency')),
  relationship_label text,
  expires_at timestamptz,
  created_at timestamptz default now(),
  unique (care_circle_id, user_id)
);

create table public.folders (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  person_id uuid not null references public.persons(id) on delete restrict,
  name text not null,
  slug text not null,
  parent_folder_id uuid references public.folders(id) on delete restrict,
  folder_type text default 'user_created' check (folder_type in ('system','user_created')),
  color text,
  is_pinned boolean default false,
  is_emergency_visible boolean default false,
  is_archived boolean default false,
  description text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid references public.care_circles(id) on delete restrict,
  actor_id uuid not null references auth.users(id),
  action_type text not null,
  object_type text not null,
  object_id uuid,
  diff jsonb,
  ip_address text,
  user_agent text,
  occurred_at timestamptz default now()
);

create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  care_circle_id uuid not null references public.care_circles(id) on delete restrict,
  invited_by uuid not null references auth.users(id),
  email text not null,
  role text not null check (role in ('owner','coordinator','contributor','caregiver','viewer','emergency')),
  token text not null unique,
  personal_note text,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz default now()
);

create index memberships_care_circle_user_idx on public.memberships(care_circle_id, user_id);
create index memberships_user_idx on public.memberships(user_id);
create index persons_care_circle_idx on public.persons(care_circle_id);
create index folders_care_circle_person_idx on public.folders(care_circle_id, person_id);
create index audit_logs_care_circle_idx on public.audit_logs(care_circle_id, occurred_at desc);
create index invitations_care_circle_idx on public.invitations(care_circle_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger users_profiles_set_updated_at
before update on public.users_profiles
for each row execute function public.set_updated_at();

create trigger persons_set_updated_at
before update on public.persons
for each row execute function public.set_updated_at();

create trigger folders_set_updated_at
before update on public.folders
for each row execute function public.set_updated_at();

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
      and role in ('owner','coordinator','contributor')
      and (expires_at is null or expires_at > now())
  );
$$;

create or replace function public.create_default_folders(person_id uuid, care_circle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  folder_names text[] := array[
    'Medical Records',
    'Insurance',
    'Legal',
    'Identification',
    'Financial',
    'Emergency Packet',
    'Care Plans',
    'Correspondence',
    'Archive'
  ];
  folder_name text;
  created_folder_id uuid;
  actor uuid;
begin
  select coalesce(auth.uid(), owner_id)
  into actor
  from public.care_circles
  where id = care_circle_id;

  foreach folder_name in array folder_names loop
    insert into public.folders (
      care_circle_id,
      person_id,
      name,
      slug,
      folder_type,
      is_emergency_visible,
      is_archived
    )
    values (
      care_circle_id,
      person_id,
      folder_name,
      lower(regexp_replace(folder_name, '[^a-zA-Z0-9]+', '-', 'g')),
      'system',
      folder_name = 'Emergency Packet',
      folder_name = 'Archive'
    )
    returning id into created_folder_id;

    insert into public.audit_logs (
      care_circle_id,
      actor_id,
      action_type,
      object_type,
      object_id,
      diff
    )
    values (
      care_circle_id,
      actor,
      'created',
      'folder',
      created_folder_id,
      jsonb_build_object('name', folder_name, 'folder_type', 'system')
    );
  end loop;
end;
$$;

create or replace function public.persons_create_default_folders()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.create_default_folders(new.id, new.care_circle_id);
  return new;
end;
$$;

create trigger persons_after_insert_create_default_folders
after insert on public.persons
for each row execute function public.persons_create_default_folders();

alter table public.users_profiles enable row level security;
alter table public.care_circles enable row level security;
alter table public.persons enable row level security;
alter table public.memberships enable row level security;
alter table public.folders enable row level security;
alter table public.audit_logs enable row level security;
alter table public.invitations enable row level security;

create policy "profiles_select_self_or_shared_circle"
on public.users_profiles
for select
to authenticated
using (
  id = auth.uid()
  or exists (
    select 1
    from public.memberships viewer_membership
    join public.memberships target_membership
      on target_membership.care_circle_id = viewer_membership.care_circle_id
    where viewer_membership.user_id = auth.uid()
      and target_membership.user_id = users_profiles.id
  )
);

create policy "profiles_insert_self"
on public.users_profiles
for insert
to authenticated
with check (id = auth.uid());

create policy "profiles_update_self"
on public.users_profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "care_circles_select_members"
on public.care_circles
for select
to authenticated
using (public.is_care_circle_member(id));

create policy "care_circles_insert_owner_bootstrap"
on public.care_circles
for insert
to authenticated
with check (owner_id = auth.uid());

create policy "care_circles_update_owner_coordinator"
on public.care_circles
for update
to authenticated
using (
  public.has_care_circle_role(id, array['owner','coordinator'])
  or owner_id = auth.uid()
)
with check (
  public.has_care_circle_role(id, array['owner','coordinator'])
  or owner_id = auth.uid()
);

create policy "persons_select_members"
on public.persons
for select
to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "persons_insert_contributors_or_owner_bootstrap"
on public.persons
for insert
to authenticated
with check (
  public.can_insert_into_circle(care_circle_id)
  or exists (
    select 1
    from public.care_circles
    where care_circles.id = persons.care_circle_id
      and care_circles.owner_id = auth.uid()
  )
);

create policy "persons_update_owner_coordinator"
on public.persons
for update
to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "memberships_select_members"
on public.memberships
for select
to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "memberships_insert_owner_coordinator_or_owner_bootstrap"
on public.memberships
for insert
to authenticated
with check (
  public.has_care_circle_role(care_circle_id, array['owner','coordinator'])
  or exists (
    select 1
    from public.care_circles
    where care_circles.id = memberships.care_circle_id
      and care_circles.owner_id = auth.uid()
      and memberships.user_id = auth.uid()
      and memberships.role = 'owner'
  )
);

create policy "memberships_update_owner_coordinator"
on public.memberships
for update
to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "folders_select_members"
on public.folders
for select
to authenticated
using (public.is_care_circle_member(care_circle_id));

create policy "folders_insert_contributors"
on public.folders
for insert
to authenticated
with check (public.can_insert_into_circle(care_circle_id));

create policy "folders_update_owner_coordinator"
on public.folders
for update
to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "audit_logs_insert_authenticated_actor"
on public.audit_logs
for insert
to authenticated
with check (actor_id = auth.uid());

create policy "audit_logs_select_owner_coordinator"
on public.audit_logs
for select
to authenticated
using (
  care_circle_id is not null
  and public.has_care_circle_role(care_circle_id, array['owner','coordinator'])
);

create policy "invitations_select_owner_coordinator"
on public.invitations
for select
to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));

create policy "invitations_insert_owner_coordinator"
on public.invitations
for insert
to authenticated
with check (
  invited_by = auth.uid()
  and public.has_care_circle_role(care_circle_id, array['owner','coordinator'])
);

create policy "invitations_update_owner_coordinator"
on public.invitations
for update
to authenticated
using (public.has_care_circle_role(care_circle_id, array['owner','coordinator']))
with check (public.has_care_circle_role(care_circle_id, array['owner','coordinator']));
