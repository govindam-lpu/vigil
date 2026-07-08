-- Phase 4 hardening — lock down the reminder-delivery job.
--
-- process_due_reminders() is a SYSTEM job invoked only by pg_cron (as the postgres
-- role). By default Postgres grants EXECUTE on new functions to PUBLIC, which let
-- any authenticated user trigger the global reminder sweep. It never leaks data
-- (returns void; only writes notifications for each reminder's own recipients), but
-- a system job should not be user-callable — revoke it.
--
-- NOTE: activate_crisis_mode / deactivate_crisis_mode REMAIN executable by
-- authenticated on purpose — they self-gate via has_care_circle_role and are called
-- by the API routes as the acting user.

revoke all on function public.process_due_reminders() from public, anon, authenticated;
