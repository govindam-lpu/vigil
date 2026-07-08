-- Phase 5 — §2 External notification delivery + preferences.
--
-- Adds: device-token storage for push, delivery-tracking + category columns on
-- notifications, a per-category/channel preference schema (backfilled into existing
-- profiles), and a member-callable create_notification helper so app events
-- (task assignment, handoff) can raise in-app notifications that the delivery Edge
-- Function then fans out to email/push per the recipient's preferences.

-- Device tokens for push (FCM). Users manage their own tokens; the delivery function
-- (service role) prunes invalid ones. No DELETE policy (Rule 7) — the service role
-- bypasses RLS for cleanup.
create table public.user_device_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  token text not null,
  platform text not null default 'web' check (platform in ('web', 'ios', 'android')),
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique (user_id, token)
);

create index user_device_tokens_user_idx on public.user_device_tokens(user_id);

create trigger user_device_tokens_set_updated_at
  before update on public.user_device_tokens
  for each row execute function public.set_updated_at();

alter table public.user_device_tokens enable row level security;

create policy "device_tokens_select_self"
on public.user_device_tokens
for select
to authenticated
using (user_id = auth.uid());

create policy "device_tokens_insert_self"
on public.user_device_tokens
for insert
to authenticated
with check (user_id = auth.uid());

create policy "device_tokens_update_self"
on public.user_device_tokens
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

-- notifications: category (preference bucket) + external-delivery tracking.
alter table public.notifications add column if not exists category text;
alter table public.notifications add column if not exists delivery_processed_at timestamptz;
alter table public.notifications add column if not exists email_sent_at timestamptz;
alter table public.notifications add column if not exists push_sent_at timestamptz;

create index if not exists notifications_delivery_pending_idx
  on public.notifications(created_at)
  where delivery_processed_at is null;

-- Widen notification_type for app-event notifications (assignment, handoff).
alter table public.notifications drop constraint if exists notifications_notification_type_check;
alter table public.notifications add constraint notifications_notification_type_check
  check (notification_type in ('crisis_activated', 'reminder', 'escalation', 'assignment', 'handoff'));

-- Backfill the preference schema into profiles that have none yet. Categories mirror
-- Settings → Notifications; channels are in_app / email / push. Defaults: in-app on for
-- all; email on for actionable + crisis; push off except crisis.
update public.users_profiles
set notification_preferences = jsonb_build_object(
  'task_reminders', jsonb_build_object('in_app', true, 'email', true, 'push', false),
  'appointment_reminders', jsonb_build_object('in_app', true, 'email', true, 'push', false),
  'medication_refill_reminders', jsonb_build_object('in_app', true, 'email', true, 'push', false),
  'check_in_alerts', jsonb_build_object('in_app', true, 'email', false, 'push', false),
  'crisis_mode', jsonb_build_object('in_app', true, 'email', true, 'push', true),
  'handoffs', jsonb_build_object('in_app', true, 'email', true, 'push', false),
  'new_members', jsonb_build_object('in_app', true, 'email', false, 'push', false),
  'general_activity', jsonb_build_object('in_app', true, 'email', false, 'push', false)
)
where notification_preferences is null or notification_preferences = '{}'::jsonb;

-- Member-callable notification creator (in-app row; the delivery Edge Function handles
-- external channels). Self-gates on membership; only notifies active co-members and
-- never the caller.
create or replace function public.create_notification(
  target_care_circle_id uuid,
  recipient_ids uuid[],
  notification_title text,
  notification_body text,
  notification_category text,
  notification_type text,
  action_url text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_care_circle_member(target_care_circle_id) then
    raise exception 'Not authorized to notify this care circle';
  end if;

  insert into public.notifications (
    care_circle_id, recipient_id, title, body, category, notification_type, action_url, is_read
  )
  select
    target_care_circle_id, m.user_id, notification_title, notification_body,
    notification_category, notification_type, action_url, false
  from public.memberships m
  where m.care_circle_id = target_care_circle_id
    and m.user_id = any(recipient_ids)
    and m.user_id <> auth.uid()
    and m.deleted_at is null;
end;
$$;
