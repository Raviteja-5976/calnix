-- Profile settings and the daily summary email.
-- Everything here is private to its owner: teammates can't see your phone
-- number, extra emails or summary schedule.

-- ---------------------------------------------------------------------------
-- Personal settings
-- ---------------------------------------------------------------------------
create table public.user_settings (
  user_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  phone text check (phone is null or phone ~ '^\+?[0-9][0-9 ()-]{5,22}$'),
  digest_enabled boolean not null default false,
  -- Local time of day the summary is sent, in the user's own time zone.
  digest_time time not null default '08:00',
  timezone text not null default 'UTC' check (char_length(timezone) between 1 and 64),
  -- Whether the sign-in email gets the summary (extra emails have their own switch).
  digest_primary boolean not null default true,
  -- Local date of the last summary sent. Only the server writes it.
  last_digest_on date,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Extra email addresses. Sign-in still uses the account's one email; these
-- receive emails (the daily summary) once confirmed through a link.
-- ---------------------------------------------------------------------------
create table public.user_emails (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  verified_at timestamptz,
  receives_digest boolean not null default true,
  -- SHA-256 of the confirmation token; the token itself is only in the email.
  token_hash text,
  token_expires_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index user_emails_unique_idx on public.user_emails (user_id, lower(email));
create index user_emails_token_idx on public.user_emails (token_hash) where token_hash is not null;

alter table public.user_settings enable row level security;
alter table public.user_emails enable row level security;

create policy "Read your own settings" on public.user_settings
  for select to authenticated using (user_id = auth.uid());
create policy "Create your own settings" on public.user_settings
  for insert to authenticated with check (user_id = auth.uid());
create policy "Change your own settings" on public.user_settings
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

create policy "Read your own emails" on public.user_emails
  for select to authenticated using (user_id = auth.uid());
create policy "Change your own emails" on public.user_emails
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Remove your own emails" on public.user_emails
  for delete to authenticated using (user_id = auth.uid());

-- Adding an email goes through the server (it sends the confirmation), and
-- confirming it needs the emailed token, so clients can't insert rows or
-- set verified_at themselves. The token hash is never readable.
grant select, update (phone, digest_enabled, digest_time, timezone, digest_primary, updated_at)
  on public.user_settings to authenticated;
grant insert (user_id, phone, digest_enabled, digest_time, timezone, digest_primary, updated_at)
  on public.user_settings to authenticated;
grant select (id, user_id, email, verified_at, receives_digest, created_at) on public.user_emails to authenticated;
grant update (receives_digest), delete on public.user_emails to authenticated;

-- ---------------------------------------------------------------------------
-- Unread chats for one person, for the summary email. Only the server
-- (service role) may call it.
-- ---------------------------------------------------------------------------
create function public.digest_unread_chats(p_user uuid)
returns table (
  conversation_id uuid, org_id uuid, kind text, name text, other_name text,
  unread integer, last_body text
)
language sql stable security definer set search_path = '' as $$
  select c.id, c.org_id, c.kind, c.name,
    (select p.full_name from public.conversation_members cm2
     join public.profiles p on p.id = cm2.user_id
     where c.kind = 'dm' and cm2.conversation_id = c.id and cm2.user_id <> p_user limit 1),
    count(m.id)::int,
    (select public.message_preview(m2.body, m2.attachments) from public.messages m2
     where m2.conversation_id = c.id and m2.sender_id is distinct from p_user
     order by m2.created_at desc limit 1)
  from public.conversations c
  join public.conversation_members me on me.conversation_id = c.id and me.user_id = p_user
  join public.messages m on m.conversation_id = c.id
    and m.created_at > me.last_read_at and m.sender_id is distinct from p_user
  group by c.id
  order by max(m.created_at) desc;
$$;

revoke execute on function public.digest_unread_chats(uuid) from public, anon, authenticated;
grant execute on function public.digest_unread_chats(uuid) to service_role;
