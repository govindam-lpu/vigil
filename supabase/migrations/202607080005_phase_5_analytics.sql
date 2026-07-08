-- Phase 5 — §4 Workload analytics.
--
-- Single coordinator/owner-gated aggregate function. All computation happens in SQL
-- (spec: do not compute in the client). Self-gates via has_care_circle_role, so a
-- non-coordinator calling it for a circle raises. Returns one jsonb payload with the
-- Tasks / Documentation / Activity series the analytics screen renders.

create or replace function public.get_care_circle_analytics(
  target_care_circle_id uuid,
  since_ts timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = public
stable
as $$
declare
  result jsonb;
begin
  if not public.has_care_circle_role(target_care_circle_id, array['owner', 'coordinator']) then
    raise exception 'Not authorized to view analytics for this care circle';
  end if;

  select jsonb_build_object(
    'tasks', jsonb_build_object(
      'created_completed_by_week', (
        with weeks as (
          select generate_series(
            date_trunc('week', since_ts),
            date_trunc('week', now()),
            interval '1 week'
          )::date as week
        ),
        created as (
          select date_trunc('week', created_at)::date as week, count(*) as c
          from public.tasks
          where care_circle_id = target_care_circle_id and deleted_at is null and created_at >= since_ts
          group by 1
        ),
        completed as (
          select date_trunc('week', completed_at)::date as week, count(*) as c
          from public.tasks
          where care_circle_id = target_care_circle_id and completed_at is not null and completed_at >= since_ts
          group by 1
        )
        select coalesce(
          jsonb_agg(
            jsonb_build_object('week', w.week, 'created', coalesce(cr.c, 0), 'completed', coalesce(cp.c, 0))
            order by w.week
          ),
          '[]'::jsonb
        )
        from weeks w
        left join created cr on cr.week = w.week
        left join completed cp on cp.week = w.week
      ),
      'by_assignee', (
        select coalesce(
          jsonb_agg(jsonb_build_object(
            'user_id', assignee_id,
            'assigned', assigned,
            'completed', completed,
            'missed', missed
          )),
          '[]'::jsonb
        )
        from (
          select assignee_id,
            count(*) as assigned,
            count(*) filter (where status = 'done') as completed,
            count(*) filter (where status = 'missed') as missed
          from public.tasks
          where care_circle_id = target_care_circle_id
            and deleted_at is null
            and assignee_id is not null
            and created_at >= since_ts
          group by assignee_id
        ) a
      ),
      'overdue_by_week', (
        with weeks as (
          select generate_series(
            date_trunc('week', since_ts),
            date_trunc('week', now()),
            interval '1 week'
          )::date as week
        ),
        missed as (
          select date_trunc('week', missed_at)::date as week, count(*) as c
          from public.tasks
          where care_circle_id = target_care_circle_id and missed_at is not null and missed_at >= since_ts
          group by 1
        )
        select coalesce(
          jsonb_agg(jsonb_build_object('week', w.week, 'missed', coalesce(m.c, 0)) order by w.week),
          '[]'::jsonb
        )
        from weeks w
        left join missed m on m.week = w.week
      ),
      'keywords', (
        select coalesce(jsonb_agg(jsonb_build_object('word', word, 'count', c) order by c desc), '[]'::jsonb)
        from (
          select lower(word) as word, count(*) as c
          from public.tasks t
          cross join lateral regexp_split_to_table(t.title, '\s+') as word
          where t.care_circle_id = target_care_circle_id
            and t.status = 'missed'
            and t.missed_at is not null
            and t.missed_at >= since_ts
            and length(word) > 3
          group by lower(word)
          order by c desc
          limit 10
        ) k
      )
    ),
    'documents', jsonb_build_object(
      'uploads_by_month', (
        select coalesce(
          jsonb_agg(jsonb_build_object('month', month, 'count', c) order by month),
          '[]'::jsonb
        )
        from (
          select date_trunc('month', created_at)::date as month, count(*) as c
          from public.documents
          where care_circle_id = target_care_circle_id and deleted_at is null and created_at >= since_ts
          group by 1
        ) d
      ),
      'by_type', (
        select coalesce(
          jsonb_agg(jsonb_build_object('type', coalesce(document_type, 'other'), 'count', c) order by c desc),
          '[]'::jsonb
        )
        from (
          select document_type, count(*) as c
          from public.documents
          where care_circle_id = target_care_circle_id and deleted_at is null
          group by document_type
        ) t
      ),
      'expiring_90d', (
        select count(*)
        from public.documents
        where care_circle_id = target_care_circle_id
          and deleted_at is null
          and expires_at is not null
          and expires_at >= now()::date
          and expires_at <= (now() + interval '90 days')::date
      )
    ),
    'activity', jsonb_build_object(
      'timeline_by_member_month', (
        select coalesce(
          jsonb_agg(jsonb_build_object('month', month, 'user_id', author_id, 'count', c)),
          '[]'::jsonb
        )
        from (
          select date_trunc('month', occurred_at)::date as month, author_id, count(*) as c
          from public.timeline_events
          where care_circle_id = target_care_circle_id
            and deleted_at is null
            and occurred_at >= since_ts
            and author_id is not null
          group by 1, 2
        ) tm
      ),
      'checkins_by_week', (
        with weeks as (
          select generate_series(
            date_trunc('week', since_ts),
            date_trunc('week', now()),
            interval '1 week'
          )::date as week
        ),
        ci as (
          select date_trunc('week', occurred_at)::date as week, count(*) as c
          from public.check_ins
          where care_circle_id = target_care_circle_id and occurred_at >= since_ts
          group by 1
        )
        select coalesce(
          jsonb_agg(jsonb_build_object('week', w.week, 'count', coalesce(ci.c, 0)) order by w.week),
          '[]'::jsonb
        )
        from weeks w
        left join ci on ci.week = w.week
      )
    )
  )
  into result;

  return result;
end;
$$;
