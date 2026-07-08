-- Phase 5 — Notification action_url must be a same-origin relative path.
--
-- create_notification (202607080007) is a member-callable SECURITY DEFINER RPC with a
-- free-text action_url. Without a constraint, a member could store an off-site or
-- `javascript:` URL that a client might navigate to (open-redirect / phishing). The
-- notification bell also validates this client-side; this DB check enforces it at the
-- source so a direct RPC call can't persist a hostile URL either.
--
-- NOT VALID: enforced for every new/updated row, without retroactively scanning history
-- (all app-generated action_urls are already relative: /dashboard, /timeline, /tasks?...).

alter table public.notifications
  drop constraint if exists notifications_action_url_relative;

alter table public.notifications
  add constraint notifications_action_url_relative
  check (action_url is null or (action_url like '/%' and action_url not like '//%'))
  not valid;
