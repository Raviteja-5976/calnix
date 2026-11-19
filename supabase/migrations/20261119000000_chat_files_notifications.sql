-- Chat attachments (pictures, videos, any file) and in-app notifications.

-- ---------------------------------------------------------------------------
-- Chat attachments
-- ---------------------------------------------------------------------------
-- Each attachment is {key, name, type, size}. The file itself lives in R2 under
-- chat-files/orgs/<org>/chat/<conversation>/... Only the server writes this
-- column (after checking the files exist), so clients keep their insert grant
-- on (conversation_id, body) alone and can't point at someone else's file.
alter table public.messages
  add column attachments jsonb not null default '[]'::jsonb;

-- A message may now be files with no text.
alter table public.messages drop constraint messages_body_check;
alter table public.messages
  add constraint messages_body_check check (char_length(body) <= 4000),
  add constraint messages_has_content
    check (btrim(body) <> '' or jsonb_array_length(attachments) > 0),
  add constraint messages_attachments_shape
    check (jsonb_typeof(attachments) = 'array' and jsonb_array_length(attachments) <= 10);

create or replace function public.message_preview(p_body text, p_attachments jsonb) returns text
language sql immutable set search_path = '' as $$
  select case
    when btrim(p_body) <> '' then left(p_body, 160)
    when jsonb_array_length(p_attachments) = 1
      then 'Sent ' || coalesce(p_attachments -> 0 ->> 'name', 'a file')
    else 'Sent ' || jsonb_array_length(p_attachments) || ' files'
  end;
$$;

-- Same shape as before; the list preview now describes file-only messages.
create or replace function public.conversation_overview(p_org uuid)
returns table (
  id uuid, kind text, name text, team_id uuid, last_message_at timestamptz,
  last_body text, other_user_id uuid, unread integer
)
language sql stable set search_path = '' as $$
  select c.id, c.kind, c.name, c.team_id, c.last_message_at,
    (select public.message_preview(m.body, m.attachments) from public.messages m
     where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select cm2.user_id from public.conversation_members cm2
     where c.kind = 'dm' and cm2.conversation_id = c.id and cm2.user_id <> auth.uid() limit 1),
    (select count(*)::int from public.messages m
     where m.conversation_id = c.id and m.created_at > me.last_read_at
       and m.sender_id is distinct from auth.uid())
  from public.conversations c
  join public.conversation_members me on me.conversation_id = c.id and me.user_id = auth.uid()
  where c.org_id = p_org
  order by c.last_message_at desc nulls last, c.created_at desc;
$$;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
-- One row per person per event, written only by the triggers below.
-- Chat messages are grouped: while a conversation's notice is unread, new
-- messages update it (and bump count) instead of adding rows.
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('message', 'project', 'team')),
  actor_id uuid references public.profiles (id) on delete set null,
  title text not null,
  body text,
  link text not null,
  group_key text,
  count integer not null default 1,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index notifications_user_idx on public.notifications (user_id, org_id, created_at desc);
create unique index notifications_unread_group_idx on public.notifications (user_id, group_key)
  where read_at is null and group_key is not null;

-- New message: tell everyone else in the conversation.
create function public.notify_message() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_conv public.conversations;
begin
  select * into v_conv from public.conversations where id = new.conversation_id;
  insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link, group_key)
  select cm.user_id, v_conv.org_id, 'message', new.sender_id,
         coalesce(v_conv.name, 'Direct message'),
         public.message_preview(new.body, new.attachments),
         '/chat?c=' || v_conv.id, 'conv:' || v_conv.id
  from public.conversation_members cm
  where cm.conversation_id = new.conversation_id
    and cm.user_id is distinct from new.sender_id
  on conflict (user_id, group_key) where read_at is null and group_key is not null
  do update set count = public.notifications.count + 1,
                body = excluded.body,
                actor_id = excluded.actor_id,
                created_at = excluded.created_at;
  return new;
end;
$$;
create trigger messages_notify after insert on public.messages
  for each row execute function public.notify_message();

-- Project activity (tasks, milestones, docs, status): tell the project's team.
create function public.notify_project_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link)
  select tm.user_id, new.org_id, 'project', new.actor_id, p.name,
         new.action || ' “' || new.subject || '”',
         '/projects/' || new.project_id
  from public.team_members tm
  join public.projects p on p.id = new.project_id
  where tm.team_id = new.team_id
    and tm.user_id is distinct from new.actor_id;
  return new;
end;
$$;
create trigger project_activity_notify after insert on public.project_activity
  for each row execute function public.notify_project_activity();

-- Team calendar items outside projects (projects already report their tasks).
create function public.notify_team_item() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.scope <> 'team' or new.project_id is not null or new.team_id is null then
    return new;
  end if;
  insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link)
  select tm.user_id, new.org_id, 'team', new.owner_id, t.name,
         'added ' || case new.kind when 'event' then 'an event' when 'task' then 'a task'
                                   when 'tool' then 'a tool' else 'a prompt' end
           || ' “' || left(new.title, 160) || '”',
         '/calendar?item=' || new.id
  from public.team_members tm
  join public.teams t on t.id = new.team_id
  where tm.team_id = new.team_id
    and tm.user_id is distinct from new.owner_id;
  return new;
end;
$$;
create trigger items_notify after insert on public.items
  for each row execute function public.notify_team_item();

-- Joining and leaving teams.
create function public.notify_team_member() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_team public.teams;
  v_actor uuid;
begin
  if tg_op = 'INSERT' then
    select * into v_team from public.teams where id = new.team_id;
    -- The person who was added, unless they added themselves.
    insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link)
    select new.user_id, v_team.org_id, 'team', auth.uid(), v_team.name, 'added you to the team', '/team'
    where new.user_id is distinct from auth.uid();
    -- Everyone already on the team.
    insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link)
    select tm.user_id, v_team.org_id, 'team', new.user_id, v_team.name, 'joined the team', '/team'
    from public.team_members tm
    where tm.team_id = new.team_id and tm.user_id <> new.user_id
      and tm.user_id is distinct from auth.uid();
    return new;
  end if;

  -- Deleting the team (or its organization) removes members too: say nothing.
  select * into v_team from public.teams where id = old.team_id;
  if v_team.id is null then
    return old;
  end if;
  -- When a whole account is deleted its profile is already gone.
  select id into v_actor from public.profiles where id = old.user_id;
  insert into public.notifications (user_id, org_id, kind, actor_id, title, body, link)
  select tm.user_id, v_team.org_id, 'team', v_actor, v_team.name, 'left the team', '/team'
  from public.team_members tm
  where tm.team_id = old.team_id and tm.user_id <> old.user_id
    and tm.user_id is distinct from auth.uid();
  return old;
end;
$$;
create trigger team_members_notify after insert or delete on public.team_members
  for each row execute function public.notify_team_member();

-- Opening a conversation also clears its notification.
create or replace function public.mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();
  update public.notifications set read_at = now()
  where user_id = auth.uid() and group_key = 'conv:' || p_conversation and read_at is null;
$$;

create function public.mark_notifications_read(p_org uuid) returns void
language sql security definer set search_path = '' as $$
  update public.notifications set read_at = now()
  where user_id = auth.uid() and org_id = p_org and read_at is null;
$$;

alter table public.notifications enable row level security;
create policy "See your own notifications" on public.notifications
  for select to authenticated using (user_id = auth.uid());
create policy "Mark your own notifications read" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "Clear your own notifications" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

grant select, delete on public.notifications to authenticated;
grant update (read_at) on public.notifications to authenticated;

revoke execute on function public.notify_message(), public.notify_project_activity(),
  public.notify_team_item(), public.notify_team_member()
  from public, anon, authenticated;
grant execute on function
  public.message_preview(text, jsonb),
  public.mark_notifications_read(uuid)
to authenticated;

alter publication supabase_realtime add table public.notifications;
