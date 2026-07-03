create or replace function public.create_onboarding_care_circle(
  care_circle_name text,
  person_first_name text,
  person_last_name text,
  person_date_of_birth date,
  person_preferred_name text default null,
  person_pronouns text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  actor uuid := auth.uid();
  created_care_circle public.care_circles;
  created_person public.persons;
  created_membership public.memberships;
  created_folders jsonb;
begin
  if actor is null then
    raise exception 'Authentication is required';
  end if;

  if nullif(trim(care_circle_name), '') is null then
    raise exception 'Care circle name is required';
  end if;

  if nullif(trim(person_first_name), '') is null then
    raise exception 'Person first name is required';
  end if;

  if nullif(trim(person_last_name), '') is null then
    raise exception 'Person last name is required';
  end if;

  insert into public.care_circles (
    name,
    owner_id,
    person_id,
    settings,
    crisis_mode,
    crisis_mode_activated_at,
    crisis_mode_activated_by
  )
  values (
    trim(care_circle_name),
    actor,
    null,
    '{}'::jsonb,
    false,
    null,
    null
  )
  returning * into created_care_circle;

  insert into public.audit_logs (
    care_circle_id,
    actor_id,
    action_type,
    object_type,
    object_id,
    diff
  )
  values (
    created_care_circle.id,
    actor,
    'created',
    'care_circle',
    created_care_circle.id,
    jsonb_build_object('name', created_care_circle.name)
  );

  insert into public.persons (
    care_circle_id,
    first_name,
    last_name,
    preferred_name,
    date_of_birth,
    pronouns,
    primary_language,
    photo_url,
    primary_diagnoses,
    allergies,
    blood_type,
    insurance_summary,
    medical_record_numbers,
    current_care_mode,
    about_note
  )
  values (
    created_care_circle.id,
    trim(person_first_name),
    trim(person_last_name),
    nullif(trim(coalesce(person_preferred_name, '')), ''),
    person_date_of_birth,
    nullif(trim(coalesce(person_pronouns, '')), ''),
    'English',
    null,
    null,
    null,
    null,
    '{}'::jsonb,
    '{}'::jsonb,
    'normal',
    null
  )
  returning * into created_person;

  insert into public.audit_logs (
    care_circle_id,
    actor_id,
    action_type,
    object_type,
    object_id,
    diff
  )
  values (
    created_care_circle.id,
    actor,
    'created',
    'person',
    created_person.id,
    jsonb_build_object('first_name', created_person.first_name, 'last_name', created_person.last_name)
  );

  update public.care_circles
  set person_id = created_person.id
  where id = created_care_circle.id
  returning * into created_care_circle;

  insert into public.audit_logs (
    care_circle_id,
    actor_id,
    action_type,
    object_type,
    object_id,
    diff
  )
  values (
    created_care_circle.id,
    actor,
    'updated',
    'care_circle',
    created_care_circle.id,
    jsonb_build_object('person_id', created_person.id)
  );

  insert into public.memberships (
    care_circle_id,
    user_id,
    role,
    relationship_label,
    expires_at
  )
  values (
    created_care_circle.id,
    actor,
    'owner',
    null,
    null
  )
  returning * into created_membership;

  insert into public.audit_logs (
    care_circle_id,
    actor_id,
    action_type,
    object_type,
    object_id,
    diff
  )
  values (
    created_care_circle.id,
    actor,
    'created',
    'membership',
    created_membership.id,
    jsonb_build_object('user_id', actor, 'role', 'owner')
  );

  select coalesce(jsonb_agg(to_jsonb(folders.*) order by folders.created_at), '[]'::jsonb)
  into created_folders
  from public.folders
  where folders.care_circle_id = created_care_circle.id
    and folders.person_id = created_person.id;

  return jsonb_build_object(
    'careCircle', to_jsonb(created_care_circle),
    'person', to_jsonb(created_person),
    'membership', to_jsonb(created_membership),
    'folders', created_folders
  );
end;
$$;
