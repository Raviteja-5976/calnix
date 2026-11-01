-- Calnix schema: organizations > teams > members, calendar items, and chat.
-- Access rules live here (RLS and column grants), so the browser client can be
-- used directly without any rule being bypassable from the client.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(full_name) between 1 and 80),
  color text not null default '#2B4BDB' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  created_at timestamptz not null default now()
);

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.org_members (
  org_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (org_id, user_id)
);
create index org_members_user_idx on public.org_members (user_id);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (id, org_id),
  unique (org_id, name)
);

-- Kept apart from teams: everyone in the org can see team names, but only the
-- team's members and org admins can read its invite code.
create table public.team_invites (
  team_id uuid primary key references public.teams (id) on delete cascade,
  code text not null unique default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
);

create table public.team_members (
  team_id uuid not null,
  org_id uuid not null,
  user_id uuid not null,
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete cascade,
  foreign key (org_id, user_id) references public.org_members (org_id, user_id) on delete cascade
);
create index team_members_user_idx on public.team_members (user_id);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  team_id uuid not null,
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  assignee_id uuid references public.profiles (id) on delete set null,
  kind text not null check (kind in ('task', 'event', 'tool', 'prompt')),
  scope text not null default 'team' check (scope in ('personal', 'team')),
  title text not null check (char_length(title) between 1 and 200),
  details text check (char_length(details) <= 10000),
  url text check (url ~* '^https?://' and char_length(url) <= 2000),
  prompt_body text check (char_length(prompt_body) <= 50000),
  -- Dates are calendar days and inclusive. Times are shown as entered, with no
  -- time zone conversion.
  start_date date,
  end_date date,
  start_time time,
  end_time time,
  status text not null default 'todo' check (status in ('todo', 'done')),
  ai_status text not null default 'pending' check (ai_status in ('pending', 'ready', 'failed')),
  ai_description text,
  ai_error text,
  ai_requested_at timestamptz,
  image_key text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete cascade,
  constraint items_dated_kinds check (kind in ('tool', 'prompt') or start_date is not null),
  constraint items_prompt_has_body check (kind <> 'prompt' or prompt_body is not null),
  constraint items_date_pair check ((start_date is null) = (end_date is null)),
  constraint items_date_order check (end_date >= start_date),
  constraint items_time_needs_date check (start_time is null or start_date is not null),
  constraint items_personal_unassigned check (scope = 'team' or assignee_id is null)
);
create index items_calendar_idx on public.items (org_id, start_date, end_date);
create index items_team_idx on public.items (team_id);
create index items_library_idx on public.items (org_id, kind, created_at desc);

-- Every AI generation, counted for the per-user hourly limit. Server-only.
create table public.ai_runs (
  id bigint generated always as identity primary key,
  user_id uuid not null references public.profiles (id) on delete cascade,
  item_id uuid references public.items (id) on delete set null,
  created_at timestamptz not null default now()
);
create index ai_runs_user_idx on public.ai_runs (user_id, created_at desc);

create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations (id) on delete cascade,
  kind text not null check (kind in ('dm', 'group', 'team')),
  name text check (char_length(name) <= 80),
  team_id uuid unique references public.teams (id) on delete cascade,
  dm_key text,
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (org_id, dm_key),
  constraint conversations_shape check (
    (kind = 'dm' and dm_key is not null and team_id is null)
    or (kind = 'group' and name is not null and team_id is null and dm_key is null)
    or (kind = 'team' and team_id is not null and dm_key is null)
  )
);

create table public.conversation_members (
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);
create index conversation_members_user_idx on public.conversation_members (user_id);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations (id) on delete cascade,
  sender_id uuid default auth.uid() references public.profiles (id) on delete set null,
  body text not null check (char_length(btrim(body)) between 1 and 4000),
  created_at timestamptz not null default now()
);
create index messages_conversation_idx on public.messages (conversation_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Access helpers. SECURITY DEFINER keeps policies from recursing into the
-- membership tables they protect.
-- ---------------------------------------------------------------------------

create function public.is_org_member(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members
                 where org_id = p_org and user_id = auth.uid());
$$;

create function public.is_org_admin(p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.org_members
                 where org_id = p_org and user_id = auth.uid()
                   and role in ('owner', 'admin'));
$$;

create function public.is_team_member(p_team uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.team_members
                 where team_id = p_team and user_id = auth.uid());
$$;

create function public.shares_org(p_user uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.org_members a
    join public.org_members b on a.org_id = b.org_id
    where a.user_id = auth.uid() and b.user_id = p_user
  );
$$;

create function public.is_conversation_member(p_conversation uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.conversation_members
                 where conversation_id = p_conversation and user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------------

create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  palette text[] := array['#2B4BDB', '#C2256E', '#0F7B6C', '#B4540A', '#6B3FD4', '#0B6FA8', '#A0233C', '#4F7A12'];
begin
  insert into public.profiles (id, full_name, color)
  values (
    new.id,
    coalesce(nullif(btrim(left(new.raw_user_meta_data ->> 'full_name', 80)), ''),
             split_part(new.email, '@', 1), 'Member'),
    palette[1 + floor(random() * array_length(palette, 1))::int]
  );
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- A new team gets its invite code and its group chat.
create function public.handle_new_team() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.team_invites (team_id) values (new.id);
  insert into public.conversations (org_id, kind, name, team_id)
  values (new.org_id, 'team', new.name, new.id);
  return new;
end;
$$;
create trigger on_team_created after insert on public.teams
  for each row execute function public.handle_new_team();

create function public.sync_team_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    insert into public.conversation_members (conversation_id, user_id)
    select c.id, new.user_id from public.conversations c where c.team_id = new.team_id
    on conflict do nothing;
    return new;
  end if;
  delete from public.conversation_members cm
  using public.conversations c
  where c.id = cm.conversation_id and c.team_id = old.team_id and cm.user_id = old.user_id;
  return old;
end;
$$;
create trigger on_team_member_changed after insert or delete on public.team_members
  for each row execute function public.sync_team_conversation();

-- Leaving an organization also ends access to its direct and group chats.
create function public.handle_org_member_removed() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.conversation_members cm
  using public.conversations c
  where c.id = cm.conversation_id and c.org_id = old.org_id and cm.user_id = old.user_id;
  return old;
end;
$$;
create trigger on_org_member_removed after delete on public.org_members
  for each row execute function public.handle_org_member_removed();

create function public.items_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select t.org_id into new.org_id from public.teams t where t.id = new.team_id;
    if new.org_id is null then
      raise exception 'Team not found' using errcode = 'P0002';
    end if;
  end if;
  if new.assignee_id is not null
     and (tg_op = 'INSERT' or new.assignee_id is distinct from old.assignee_id)
     and not exists (select 1 from public.team_members m
                     where m.team_id = new.team_id and m.user_id = new.assignee_id) then
    raise exception 'The assignee must be a member of this team' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger items_before_write before insert or update on public.items
  for each row execute function public.items_before_write();

create function public.touch_conversation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set last_message_at = new.created_at
  where id = new.conversation_id;
  return new;
end;
$$;
create trigger on_message_created after insert on public.messages
  for each row execute function public.touch_conversation();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.org_members enable row level security;
alter table public.teams enable row level security;
alter table public.team_invites enable row level security;
alter table public.team_members enable row level security;
alter table public.items enable row level security;
alter table public.ai_runs enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.messages enable row level security;

create policy "See yourself and people in your organizations" on public.profiles
  for select to authenticated using (id = auth.uid() or public.shares_org(id));
create policy "Edit your own profile" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

create policy "Members see their organization" on public.organizations
  for select to authenticated using (public.is_org_member(id));
create policy "Admins rename their organization" on public.organizations
  for update to authenticated using (public.is_org_admin(id)) with check (public.is_org_admin(id));

create policy "Members see the member list" on public.org_members
  for select to authenticated using (public.is_org_member(org_id));
create policy "Admins remove members, members can leave; owners stay" on public.org_members
  for delete to authenticated
  using (role <> 'owner' and (user_id = auth.uid() or public.is_org_admin(org_id)));

create policy "Members see teams in their organization" on public.teams
  for select to authenticated using (public.is_org_member(org_id));
create policy "Admins rename teams" on public.teams
  for update to authenticated using (public.is_org_admin(org_id)) with check (public.is_org_admin(org_id));

create policy "Team members and admins see the invite code" on public.team_invites
  for select to authenticated using (
    public.is_team_member(team_id)
    or exists (select 1 from public.teams t where t.id = team_id and public.is_org_admin(t.org_id))
  );

create policy "Members see who is on each team" on public.team_members
  for select to authenticated using (public.is_org_member(org_id));
create policy "Admins add organization members to teams" on public.team_members
  for insert to authenticated with check (public.is_org_admin(org_id));
create policy "Admins remove team members, members can leave" on public.team_members
  for delete to authenticated using (user_id = auth.uid() or public.is_org_admin(org_id));

-- Everything on a team is visible to that whole team, personal items included.
create policy "The team sees all of its items" on public.items
  for select to authenticated
  using (public.is_team_member(team_id) or public.is_org_admin(org_id));
create policy "Team members add items as themselves" on public.items
  for insert to authenticated
  with check (owner_id = auth.uid()
              and (public.is_team_member(team_id) or public.is_org_admin(org_id)));
-- Team items are shared work. Personal items belong to their owner.
create policy "Team items are editable by the team, personal items by the owner" on public.items
  for update to authenticated
  using (public.is_org_admin(org_id)
         or (public.is_team_member(team_id) and (scope = 'team' or owner_id = auth.uid())))
  with check (public.is_org_admin(org_id)
              or (public.is_team_member(team_id) and (scope = 'team' or owner_id = auth.uid())));
create policy "Owners and admins delete items" on public.items
  for delete to authenticated
  using (owner_id = auth.uid() or public.is_org_admin(org_id));

-- ai_runs has no policies: only the service role and SECURITY DEFINER code touch it.

create policy "Participants see their conversations" on public.conversations
  for select to authenticated using (public.is_conversation_member(id));
create policy "Participants see who else is in a conversation" on public.conversation_members
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "Participants read messages" on public.messages
  for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "Participants send messages as themselves" on public.messages
  for insert to authenticated
  with check (sender_id = auth.uid() and public.is_conversation_member(conversation_id));

-- ---------------------------------------------------------------------------
-- Column grants. RLS picks the rows; these pick the columns. They stop a client
-- from forging owner_id or pointing image_key at another organization's file.
-- ---------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;

grant select on public.profiles, public.organizations, public.org_members, public.teams,
  public.team_invites, public.team_members, public.items, public.conversations,
  public.conversation_members, public.messages to authenticated;

grant update (full_name, color) on public.profiles to authenticated;
grant update (name) on public.organizations to authenticated;
grant update (name) on public.teams to authenticated;
grant delete on public.org_members to authenticated;
grant insert (team_id, org_id, user_id), delete on public.team_members to authenticated;
grant insert (team_id, assignee_id, kind, scope, title, details, url, prompt_body,
              start_date, end_date, start_time, end_time, status),
      update (assignee_id, scope, title, details, url, prompt_body,
              start_date, end_date, start_time, end_time, status),
      delete on public.items to authenticated;
grant insert (conversation_id, body) on public.messages to authenticated;

-- ---------------------------------------------------------------------------
-- Actions that span several tables
-- ---------------------------------------------------------------------------

create function public.create_organization(p_name text, p_team_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_team uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  insert into public.organizations (name, created_by) values (btrim(p_name), auth.uid())
  returning id into v_org;
  insert into public.org_members (org_id, user_id, role) values (v_org, auth.uid(), 'owner');
  insert into public.teams (org_id, name) values (v_org, btrim(p_team_name)) returning id into v_team;
  insert into public.team_members (team_id, org_id, user_id) values (v_team, v_org, auth.uid());
  return v_org;
end;
$$;

create function public.join_team(p_code text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
  v_org uuid;
begin
  if auth.uid() is null then
    raise exception 'Sign in first' using errcode = '42501';
  end if;
  select t.id, t.org_id into v_team, v_org
  from public.team_invites i join public.teams t on t.id = i.team_id
  where i.code = lower(btrim(p_code));
  if v_team is null then
    raise exception 'That invite code is not valid' using errcode = 'P0002';
  end if;
  insert into public.org_members (org_id, user_id) values (v_org, auth.uid())
  on conflict do nothing;
  insert into public.team_members (team_id, org_id, user_id) values (v_team, v_org, auth.uid())
  on conflict do nothing;
  return v_org;
end;
$$;

create function public.create_team(p_org uuid, p_name text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  if not public.is_org_admin(p_org) then
    raise exception 'Only organization admins can create teams' using errcode = '42501';
  end if;
  insert into public.teams (org_id, name) values (p_org, btrim(p_name)) returning id into v_team;
  insert into public.team_members (team_id, org_id, user_id) values (v_team, p_org, auth.uid());
  return v_team;
end;
$$;

create function public.rotate_team_invite(p_team uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_org uuid;
  v_code text;
begin
  select org_id into v_org from public.teams where id = p_team;
  if v_org is null or not public.is_org_admin(v_org) then
    raise exception 'Only organization admins can change invite codes' using errcode = '42501';
  end if;
  update public.team_invites
  set code = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
  where team_id = p_team
  returning code into v_code;
  return v_code;
end;
$$;

create function public.set_member_role(p_org uuid, p_user uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_role not in ('admin', 'member') then
    raise exception 'Role must be admin or member' using errcode = '22023';
  end if;
  if not exists (select 1 from public.org_members
                 where org_id = p_org and user_id = auth.uid() and role = 'owner') then
    raise exception 'Only the organization owner can change roles' using errcode = '42501';
  end if;
  update public.org_members set role = p_role
  where org_id = p_org and user_id = p_user and role <> 'owner';
end;
$$;

create function public.start_dm(p_org uuid, p_user uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_key text;
  v_conversation uuid;
begin
  if p_user = auth.uid() then
    raise exception 'Pick someone other than yourself' using errcode = '22023';
  end if;
  if not public.is_org_member(p_org)
     or not exists (select 1 from public.org_members where org_id = p_org and user_id = p_user) then
    raise exception 'Both people must be in this organization' using errcode = '42501';
  end if;
  v_key := least(auth.uid()::text, p_user::text) || ':' || greatest(auth.uid()::text, p_user::text);
  insert into public.conversations (org_id, kind, dm_key, created_by)
  values (p_org, 'dm', v_key, auth.uid())
  on conflict (org_id, dm_key) do update set dm_key = excluded.dm_key
  returning id into v_conversation;
  insert into public.conversation_members (conversation_id, user_id)
  values (v_conversation, auth.uid()), (v_conversation, p_user)
  on conflict do nothing;
  return v_conversation;
end;
$$;

create function public.create_group(p_org uuid, p_name text, p_members uuid[]) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  v_conversation uuid;
begin
  if not public.is_org_member(p_org) then
    raise exception 'Join this organization first' using errcode = '42501';
  end if;
  if exists (
    select 1 from unnest(p_members) as m(user_id)
    where not exists (select 1 from public.org_members o where o.org_id = p_org and o.user_id = m.user_id)
  ) then
    raise exception 'Everyone in a group must be in this organization' using errcode = '42501';
  end if;
  insert into public.conversations (org_id, kind, name, created_by)
  values (p_org, 'group', btrim(p_name), auth.uid())
  returning id into v_conversation;
  insert into public.conversation_members (conversation_id, user_id)
  select v_conversation, u from unnest(array_append(p_members, auth.uid())) as u
  on conflict do nothing;
  return v_conversation;
end;
$$;

create function public.mark_conversation_read(p_conversation uuid) returns void
language sql security definer set search_path = '' as $$
  update public.conversation_members set last_read_at = now()
  where conversation_id = p_conversation and user_id = auth.uid();
$$;

-- Runs as the caller, so RLS decides which conversations come back.
create function public.conversation_overview(p_org uuid)
returns table (
  id uuid, kind text, name text, team_id uuid, last_message_at timestamptz,
  last_body text, other_user_id uuid, unread integer
)
language sql stable set search_path = '' as $$
  select c.id, c.kind, c.name, c.team_id, c.last_message_at,
    (select m.body from public.messages m where m.conversation_id = c.id
     order by m.created_at desc limit 1),
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

-- Claims an AI run for an item the caller may edit. Returns:
--   'started'  the server should now generate
--   'running'  a generation is already in progress
--   'limited'  the caller hit the hourly limit; the item is marked failed
create function public.claim_item_ai(p_item uuid, p_hourly_limit integer default 30) returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_item public.items;
  v_user uuid := auth.uid();
begin
  select * into v_item from public.items where id = p_item for update;
  if v_item.id is null or not (
    public.is_org_admin(v_item.org_id)
    or (public.is_team_member(v_item.team_id)
        and (v_item.scope = 'team' or v_item.owner_id = v_user))
  ) then
    raise exception 'You cannot change this item' using errcode = '42501';
  end if;

  -- A pending run older than five minutes is treated as dead and can be retried.
  if v_item.ai_status = 'pending' and v_item.ai_requested_at > now() - interval '5 minutes' then
    return 'running';
  end if;

  if (select count(*) from public.ai_runs
      where user_id = v_user and created_at > now() - interval '1 hour') >= p_hourly_limit then
    update public.items
    set ai_status = 'failed',
        ai_error = 'You reached the hourly AI limit. Try again later.',
        ai_requested_at = now()
    where id = p_item;
    return 'limited';
  end if;

  insert into public.ai_runs (user_id, item_id) values (v_user, p_item);
  update public.items
  set ai_status = 'pending', ai_error = null, ai_requested_at = now()
  where id = p_item;
  return 'started';
end;
$$;

-- Functions are private unless granted here.
revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  public.is_org_member(uuid), public.is_org_admin(uuid), public.is_team_member(uuid),
  public.shares_org(uuid), public.is_conversation_member(uuid),
  public.create_organization(text, text), public.join_team(text), public.create_team(uuid, text),
  public.rotate_team_invite(uuid), public.set_member_role(uuid, uuid, text),
  public.start_dm(uuid, uuid), public.create_group(uuid, text, uuid[]),
  public.mark_conversation_read(uuid), public.conversation_overview(uuid),
  public.claim_item_ai(uuid, integer)
to authenticated;

-- ---------------------------------------------------------------------------
-- Realtime. Subscribers only receive rows RLS lets them read.
-- ---------------------------------------------------------------------------

alter publication supabase_realtime add table public.items, public.messages;
