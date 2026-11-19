-- Email copies of notifications. The scheduler (the same call that sends the
-- daily summary) emails notifications that are still unread a few minutes
-- after they arrive, batched into one email per person per run.

-- When a notification was emailed (or skipped because of the person's
-- preference). Only the server writes it.
alter table public.notifications add column emailed_at timestamptz;
create index notifications_email_queue_idx on public.notifications (created_at)
  where read_at is null and emailed_at is null;

-- Which notifications to email:
--   all        everything in the bell
--   important  mentions and direct messages only (the default)
--   off        none
alter table public.user_settings
  add column notify_email text not null default 'important'
    check (notify_email in ('off', 'important', 'all'));

grant insert (notify_email), update (notify_email) on public.user_settings to authenticated;
