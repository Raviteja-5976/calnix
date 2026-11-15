-- DTA-Cal: projects (goals, milestones, tasks), nested folders, docs and
-- whiteboards, user-started AI, uploads capped at 250 KB, and the activity log.
-- Everything a team owns carries team_id and org_id so access rules match items:
-- team members and organization admins can see and edit.

-- ---------------------------------------------------------------------------
-- Organizations: an AI switch admins control
-- ---------------------------------------------------------------------------
alter table public.organizations add column ai_enabled boolean not null default true;

-- ---------------------------------------------------------------------------
-- Projects and milestones
-- ---------------------------------------------------------------------------
create table public.projects (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  team_id uuid not null,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  goal text check (char_length(goal) <= 2000),
  description text check (char_length(description) <= 10000),
  status text not null default 'active' check (status in ('planning', 'active', 'on_hold', 'done')),
  lead_id uuid references public.profiles (id) on delete set null,
  start_date date,
  target_date date,
  color text not null default '#FF6B35' check (color ~ '^#[0-9A-Fa-f]{6}$'),
  archived_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete cascade,
  unique (id, team_id),
  constraint projects_date_order check (target_date is null or start_date is null or target_date >= start_date)
);
create index projects_team_idx on public.projects (team_id, archived_at);
create index projects_org_idx on public.projects (org_id);

create table public.milestones (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  team_id uuid not null,
  project_id uuid not null,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  description text check (char_length(description) <= 4000),
  due_date date,
  status text not null default 'open' check (status in ('open', 'done')),
  position double precision not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (project_id, team_id) references public.projects (id, team_id) on delete cascade,
  unique (id, project_id)
);
create index milestones_project_idx on public.milestones (project_id, position);
create index milestones_calendar_idx on public.milestones (org_id, due_date);

-- ---------------------------------------------------------------------------
-- Items become project tasks too
-- ---------------------------------------------------------------------------
alter table public.items rename column ai_description to summary;
alter table public.items
  add column image_source text check (image_source in ('upload', 'ai')),
  -- A project's tasks go with it; they are part of the project.
  add column project_id uuid references public.projects (id) on delete cascade,
  add column milestone_id uuid references public.milestones (id) on delete set null,
  add column parent_id uuid references public.items (id) on delete cascade,
  add column priority text not null default 'none'
    check (priority in ('none', 'low', 'medium', 'high', 'urgent')),
  add column position double precision not null default 0,
  add column labels text[] not null default '{}'
    check (cardinality(labels) <= 10);
update public.items set image_source = 'ai' where image_key is not null;

alter table public.items add constraint items_summary_length check (char_length(summary) <= 2000);

-- AI no longer starts on its own: new items wait until someone asks.
alter table public.items drop constraint if exists items_ai_status_check;
alter table public.items alter column ai_status set default 'idle';
alter table public.items add constraint items_ai_status_check
  check (ai_status in ('idle', 'pending', 'ready', 'failed'));
update public.items set ai_status = 'idle' where ai_status = 'pending' and image_key is null;

alter table public.items drop constraint if exists items_status_check;
alter table public.items add constraint items_status_check
  check (status in ('todo', 'in_progress', 'blocked', 'done'));

-- Project tasks may be undated; they simply stay off the calendar.
alter table public.items drop constraint items_dated_kinds;
alter table public.items add constraint items_dated_kinds
  check (kind in ('tool', 'prompt') or start_date is not null or project_id is not null);
alter table public.items add constraint items_project_tasks
  check ((project_id is null and milestone_id is null) or kind = 'task');
alter table public.items add constraint items_subtask_not_self check (parent_id <> id);

create index items_project_idx on public.items (project_id, status, position);
create index items_milestone_idx on public.items (milestone_id);
create index items_parent_idx on public.items (parent_id);
create index items_assignee_idx on public.items (assignee_id, status);

-- "Blocked by": a task cannot finish before the tasks it depends on.
create table public.task_dependencies (
  task_id uuid not null references public.items (id) on delete cascade,
  depends_on_id uuid not null references public.items (id) on delete cascade,
  org_id uuid not null,
  team_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (task_id, depends_on_id),
  constraint task_dependencies_not_self check (task_id <> depends_on_id)
);
create index task_dependencies_depends_idx on public.task_dependencies (depends_on_id);

-- ---------------------------------------------------------------------------
-- Folders, docs and whiteboards
-- ---------------------------------------------------------------------------
create table public.folders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  team_id uuid not null,
  project_id uuid references public.projects (id) on delete cascade,
  parent_id uuid references public.folders (id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 120),
  position double precision not null default 0,
  deleted_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete cascade,
  constraint folders_not_own_parent check (parent_id <> id)
);
create index folders_tree_idx on public.folders (team_id, project_id, parent_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  team_id uuid not null,
  project_id uuid references public.projects (id) on delete cascade,
  folder_id uuid references public.folders (id) on delete cascade,
  kind text not null check (kind in ('note', 'board')),
  title text not null check (char_length(btrim(title)) between 1 and 200),
  content text not null default '' check (char_length(content) <= 500000),
  -- Excalidraw scene. Images pasted onto a board are stored inline, already
  -- shrunk below 250 KB each by the browser.
  scene jsonb,
  version integer not null default 1,
  deleted_at timestamptz,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (team_id, org_id) references public.teams (id, org_id) on delete cascade,
  constraint documents_scene_size check (scene is null or pg_column_size(scene) <= 15000000)
);
create index documents_tree_idx on public.documents (team_id, project_id, folder_id);
create index documents_updated_idx on public.documents (org_id, updated_at desc);

-- Earlier versions, kept on save so a teammate's overwrite can be undone.
create table public.document_versions (
  id bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  org_id uuid not null,
  team_id uuid not null,
  version integer not null,
  title text not null,
  content text not null,
  scene jsonb,
  saved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index document_versions_doc_idx on public.document_versions (document_id, created_at desc);

-- Images placed in Markdown docs. The bucket is private; the app hands out
-- signed links after checking the viewer can see the document.
create table public.doc_files (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  org_id uuid not null,
  team_id uuid not null,
  storage_key text not null unique,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index doc_files_doc_idx on public.doc_files (document_id);

-- ---------------------------------------------------------------------------
-- Project activity: who changed what. Written only by triggers.
-- ---------------------------------------------------------------------------
create table public.project_activity (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  team_id uuid not null,
  project_id uuid not null references public.projects (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  subject text not null,
  created_at timestamptz not null default now()
);
create index project_activity_project_idx on public.project_activity (project_id, created_at desc);

-- AI runs now cover every feature, not only item artwork.
alter table public.ai_runs
  add column feature text not null default 'cover',
  add column org_id uuid references public.organizations (id) on delete cascade;

-- ---------------------------------------------------------------------------
-- Triggers: fill team/org from the parent row and keep rows consistent
-- ---------------------------------------------------------------------------
create function public.projects_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select t.org_id into new.org_id from public.teams t where t.id = new.team_id;
    if new.org_id is null then
      raise exception 'Team not found' using errcode = 'P0002';
    end if;
  end if;
  if new.lead_id is not null
     and (tg_op = 'INSERT' or new.lead_id is distinct from old.lead_id)
     and not exists (select 1 from public.team_members m
                     where m.team_id = new.team_id and m.user_id = new.lead_id) then
    raise exception 'The project lead must be a member of this team' using errcode = '23514';
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger projects_before_write before insert or update on public.projects
  for each row execute function public.projects_before_write();

create function public.milestones_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    select p.org_id, p.team_id into new.org_id, new.team_id
    from public.projects p where p.id = new.project_id;
    if new.team_id is null then
      raise exception 'Project not found' using errcode = 'P0002';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger milestones_before_write before insert or update on public.milestones
  for each row execute function public.milestones_before_write();

-- Items: a project task must live on the project's team, its milestone must
-- belong to its project, and a subtask stays in its parent's project.
create function public.items_project_check() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_team uuid;
begin
  if new.project_id is not null then
    select team_id into v_team from public.projects where id = new.project_id;
    if v_team is distinct from new.team_id then
      raise exception 'The task and its project must be on the same team' using errcode = '23514';
    end if;
  end if;
  if new.milestone_id is not null and not exists (
    select 1 from public.milestones m where m.id = new.milestone_id and m.project_id = new.project_id
  ) then
    raise exception 'That milestone belongs to another project' using errcode = '23514';
  end if;
  if new.parent_id is not null and not exists (
    select 1 from public.items p where p.id = new.parent_id and p.team_id = new.team_id and p.kind = 'task'
  ) then
    raise exception 'A subtask must belong to a task on the same team' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger items_project_check before insert or update of project_id, milestone_id, parent_id, team_id
  on public.items for each row execute function public.items_project_check();

create function public.task_dependencies_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select i.org_id, i.team_id into new.org_id, new.team_id from public.items i where i.id = new.task_id;
  if not exists (select 1 from public.items d where d.id = new.depends_on_id and d.team_id = new.team_id) then
    raise exception 'Both tasks must be on the same team' using errcode = '23514';
  end if;
  -- Refuse a cycle: the other task must not already wait on this one.
  if exists (
    with recursive chain(id) as (
      select depends_on_id from public.task_dependencies where task_id = new.depends_on_id
      union
      select d.depends_on_id from public.task_dependencies d join chain c on d.task_id = c.id
    )
    select 1 from chain where id = new.task_id
  ) or new.depends_on_id = new.task_id then
    raise exception 'That would make the tasks wait on each other' using errcode = '23514';
  end if;
  return new;
end;
$$;
create trigger task_dependencies_before_insert before insert on public.task_dependencies
  for each row execute function public.task_dependencies_before_insert();

-- Folders take their team and project from their parent, and cannot be moved
-- inside themselves.
create function public.folders_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_parent public.folders;
begin
  if new.parent_id is not null then
    select * into v_parent from public.folders where id = new.parent_id;
    if v_parent.id is null then
      raise exception 'Parent folder not found' using errcode = 'P0002';
    end if;
    new.team_id := v_parent.team_id;
    new.org_id := v_parent.org_id;
    new.project_id := v_parent.project_id;
    if tg_op = 'UPDATE' and exists (
      with recursive up(id, parent_id) as (
        select id, parent_id from public.folders where id = new.parent_id
        union
        select f.id, f.parent_id from public.folders f join up on f.id = up.parent_id
      )
      select 1 from up where id = new.id
    ) then
      raise exception 'A folder cannot be moved inside itself' using errcode = '23514';
    end if;
  elsif new.project_id is not null then
    select p.team_id, p.org_id into new.team_id, new.org_id from public.projects p where p.id = new.project_id;
  else
    select t.org_id into new.org_id from public.teams t where t.id = new.team_id;
  end if;
  if new.org_id is null then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
create trigger folders_before_write before insert or update of parent_id, project_id, team_id
  on public.folders for each row execute function public.folders_before_write();

-- Documents take their place from their folder or project, bump their version
-- on every content change, and keep the previous version.
create function public.documents_before_write() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_folder public.folders;
begin
  if new.folder_id is not null then
    select * into v_folder from public.folders where id = new.folder_id;
    if v_folder.id is null then
      raise exception 'Folder not found' using errcode = 'P0002';
    end if;
    new.team_id := v_folder.team_id;
    new.org_id := v_folder.org_id;
    new.project_id := v_folder.project_id;
  elsif new.project_id is not null then
    select p.team_id, p.org_id into new.team_id, new.org_id from public.projects p where p.id = new.project_id;
  elsif tg_op = 'INSERT' or new.team_id is distinct from old.team_id then
    select t.org_id into new.org_id from public.teams t where t.id = new.team_id;
  end if;
  if new.org_id is null then
    raise exception 'Team not found' using errcode = 'P0002';
  end if;

  if tg_op = 'UPDATE' and (new.content is distinct from old.content
                           or new.scene is distinct from old.scene
                           or new.title is distinct from old.title) then
    new.version := old.version + 1;
    new.updated_at := now();
    new.updated_by := auth.uid();
    -- One snapshot per person per ten minutes keeps history useful, not huge.
    if not exists (
      select 1 from public.document_versions v
      where v.document_id = old.id and v.saved_by is not distinct from old.updated_by
        and v.created_at > now() - interval '10 minutes'
    ) then
      insert into public.document_versions (document_id, org_id, team_id, version, title, content, scene, saved_by)
      values (old.id, old.org_id, old.team_id, old.version, old.title, old.content, old.scene, old.updated_by);
    end if;
  end if;
  return new;
end;
$$;
create trigger documents_before_write before insert or update on public.documents
  for each row execute function public.documents_before_write();

create function public.doc_files_before_insert() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  select d.org_id, d.team_id into new.org_id, new.team_id from public.documents d where d.id = new.document_id;
  if new.team_id is null then
    raise exception 'Document not found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
create trigger doc_files_before_insert before insert on public.doc_files
  for each row execute function public.doc_files_before_insert();

-- Activity log
create function public.log_project_activity() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_project uuid;
  v_action text;
  v_subject text;
begin
  if tg_table_name = 'items' then
    v_project := coalesce(new.project_id, old.project_id);
    if v_project is null then return coalesce(new, old); end if;
    v_subject := coalesce(new.title, old.title);
    if tg_op = 'INSERT' then v_action := 'created task';
    elsif tg_op = 'DELETE' then v_action := 'deleted task';
    elsif new.status is distinct from old.status then
      v_action := case new.status when 'done' then 'completed task'
                                  when 'in_progress' then 'started task'
                                  when 'blocked' then 'marked blocked'
                                  else 'reopened task' end;
    elsif new.assignee_id is distinct from old.assignee_id then v_action := 'reassigned task';
    else return new;
    end if;
  elsif tg_table_name = 'milestones' then
    v_project := coalesce(new.project_id, old.project_id);
    v_subject := coalesce(new.title, old.title);
    if tg_op = 'INSERT' then v_action := 'added milestone';
    elsif tg_op = 'DELETE' then v_action := 'removed milestone';
    elsif new.status is distinct from old.status then
      v_action := case new.status when 'done' then 'reached milestone' else 'reopened milestone' end;
    elsif new.due_date is distinct from old.due_date then v_action := 'moved milestone';
    else return new;
    end if;
  elsif tg_table_name = 'documents' then
    v_project := coalesce(new.project_id, old.project_id);
    if v_project is null then return coalesce(new, old); end if;
    v_subject := coalesce(new.title, old.title);
    if tg_op = 'INSERT' then
      v_action := case new.kind when 'board' then 'created board' else 'created doc' end;
    elsif new.deleted_at is not null and old.deleted_at is null then v_action := 'moved to trash';
    else return new;
    end if;
  elsif tg_table_name = 'projects' then
    v_project := new.id;
    v_subject := new.name;
    if tg_op = 'INSERT' then v_action := 'created project';
    elsif new.status is distinct from old.status then v_action := 'changed status to ' || replace(new.status, '_', ' ');
    elsif new.archived_at is distinct from old.archived_at then
      v_action := case when new.archived_at is null then 'restored project' else 'archived project' end;
    else return new;
    end if;
  end if;

  -- A cascading delete has already removed the project.
  if not exists (select 1 from public.projects where id = v_project) then
    return coalesce(new, old);
  end if;

  insert into public.project_activity (org_id, team_id, project_id, actor_id, action, subject)
  select p.org_id, p.team_id, p.id, auth.uid(), v_action, left(v_subject, 200)
  from public.projects p where p.id = v_project;
  return coalesce(new, old);
end;
$$;
create trigger items_activity after insert or update or delete on public.items
  for each row execute function public.log_project_activity();
create trigger milestones_activity after insert or update or delete on public.milestones
  for each row execute function public.log_project_activity();
create trigger documents_activity after insert or update on public.documents
  for each row execute function public.log_project_activity();
create trigger projects_activity after insert or update on public.projects
  for each row execute function public.log_project_activity();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.task_dependencies enable row level security;
alter table public.folders enable row level security;
alter table public.documents enable row level security;
alter table public.document_versions enable row level security;
alter table public.doc_files enable row level security;
alter table public.project_activity enable row level security;

create function public.can_use_team(p_team uuid, p_org uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_team_member(p_team) or public.is_org_admin(p_org);
$$;

create policy "Team sees its projects" on public.projects
  for select to authenticated using (public.can_use_team(team_id, org_id));
create policy "Team members create projects" on public.projects
  for insert to authenticated with check (public.is_team_member(team_id) or public.is_org_admin(
    (select t.org_id from public.teams t where t.id = team_id)));
create policy "Team edits its projects" on public.projects
  for update to authenticated using (public.can_use_team(team_id, org_id))
  with check (public.can_use_team(team_id, org_id));
create policy "Lead, creator or admin deletes a project" on public.projects
  for delete to authenticated
  using (lead_id = auth.uid() or created_by = auth.uid() or public.is_org_admin(org_id));

create policy "Team sees milestones" on public.milestones
  for select to authenticated using (public.can_use_team(team_id, org_id));
create policy "Team adds milestones" on public.milestones
  for insert to authenticated with check (exists (
    select 1 from public.projects p where p.id = project_id and public.can_use_team(p.team_id, p.org_id)));
create policy "Team edits milestones" on public.milestones
  for update to authenticated using (public.can_use_team(team_id, org_id))
  with check (public.can_use_team(team_id, org_id));
create policy "Team removes milestones" on public.milestones
  for delete to authenticated using (public.can_use_team(team_id, org_id));

create policy "Team sees dependencies" on public.task_dependencies
  for select to authenticated using (public.can_use_team(team_id, org_id));
create policy "Team adds dependencies" on public.task_dependencies
  for insert to authenticated with check (exists (
    select 1 from public.items i where i.id = task_id and public.can_use_team(i.team_id, i.org_id)));
create policy "Team removes dependencies" on public.task_dependencies
  for delete to authenticated using (public.can_use_team(team_id, org_id));

create policy "Team sees folders" on public.folders
  for select to authenticated using (public.can_use_team(team_id, org_id));
create policy "Team creates folders" on public.folders
  for insert to authenticated with check (public.is_team_member(team_id) or public.is_org_admin(
    (select t.org_id from public.teams t where t.id = team_id)));
create policy "Team edits folders" on public.folders
  for update to authenticated using (public.can_use_team(team_id, org_id))
  with check (public.can_use_team(team_id, org_id));
create policy "Team deletes folders" on public.folders
  for delete to authenticated using (public.can_use_team(team_id, org_id));

create policy "Team sees documents" on public.documents
  for select to authenticated using (public.can_use_team(team_id, org_id));
create policy "Team creates documents" on public.documents
  for insert to authenticated with check (public.is_team_member(team_id) or public.is_org_admin(
    (select t.org_id from public.teams t where t.id = team_id)));
create policy "Team edits documents" on public.documents
  for update to authenticated using (public.can_use_team(team_id, org_id))
  with check (public.can_use_team(team_id, org_id));
create policy "Creator or admin deletes documents for good" on public.documents
  for delete to authenticated using (created_by = auth.uid() or public.is_org_admin(org_id));

create policy "Team sees document history" on public.document_versions
  for select to authenticated using (public.can_use_team(team_id, org_id));
create policy "Team sees document files" on public.doc_files
  for select to authenticated using (public.can_use_team(team_id, org_id));
create policy "Team sees project activity" on public.project_activity
  for select to authenticated using (public.can_use_team(team_id, org_id));

-- ---------------------------------------------------------------------------
-- Column grants
-- ---------------------------------------------------------------------------
grant select on public.projects, public.milestones, public.task_dependencies, public.folders,
  public.documents, public.document_versions, public.doc_files, public.project_activity
  to authenticated;

grant insert (team_id, name, goal, description, status, lead_id, start_date, target_date, color),
      update (name, goal, description, status, lead_id, start_date, target_date, color, archived_at),
      delete on public.projects to authenticated;
grant insert (project_id, title, description, due_date, status, position),
      update (title, description, due_date, status, position),
      delete on public.milestones to authenticated;
grant insert (task_id, depends_on_id), delete on public.task_dependencies to authenticated;
grant insert (team_id, project_id, parent_id, name, position),
      update (parent_id, name, position, deleted_at),
      delete on public.folders to authenticated;
grant insert (team_id, project_id, folder_id, kind, title, content, scene),
      update (folder_id, title, content, scene, deleted_at),
      delete on public.documents to authenticated;

grant update (name, ai_enabled) on public.organizations to authenticated;

-- Items: the summary is now the user's to write; project fields are editable.
revoke insert, update on public.items from authenticated;
grant insert (team_id, assignee_id, kind, scope, title, details, summary, url, prompt_body,
              start_date, end_date, start_time, end_time, status,
              project_id, milestone_id, parent_id, priority, position, labels),
      update (assignee_id, scope, title, details, summary, url, prompt_body,
              start_date, end_date, start_time, end_time, status,
              project_id, milestone_id, parent_id, priority, position, labels)
  on public.items to authenticated;

-- ---------------------------------------------------------------------------
-- AI: one hourly limit across every feature, and the organization switch
-- ---------------------------------------------------------------------------
create function public.claim_ai(p_org uuid, p_feature text, p_hourly_limit integer default 30)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_org_member(p_org) then
    raise exception 'Join this organization first' using errcode = '42501';
  end if;
  if not (select ai_enabled from public.organizations where id = p_org) then
    return 'disabled';
  end if;
  if (select count(*) from public.ai_runs
      where user_id = v_user and created_at > now() - interval '1 hour') >= p_hourly_limit then
    return 'limited';
  end if;
  insert into public.ai_runs (user_id, org_id, feature) values (v_user, p_org, left(p_feature, 40));
  return 'ok';
end;
$$;

-- Cover art for an item, started by the user. Same rules as before, plus the switch.
create or replace function public.claim_item_ai(p_item uuid, p_hourly_limit integer default 30) returns text
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

  if v_item.ai_status = 'pending' and v_item.ai_requested_at > now() - interval '5 minutes' then
    return 'running';
  end if;
  if not (select ai_enabled from public.organizations where id = v_item.org_id) then
    return 'disabled';
  end if;
  if (select count(*) from public.ai_runs
      where user_id = v_user and created_at > now() - interval '1 hour') >= p_hourly_limit then
    return 'limited';
  end if;

  insert into public.ai_runs (user_id, org_id, item_id, feature) values (v_user, v_item.org_id, p_item, 'cover');
  update public.items
  set ai_status = 'pending', ai_error = null, ai_requested_at = now()
  where id = p_item;
  return 'started';
end;
$$;

-- Restores an earlier version of a document as a new save.
create function public.restore_document_version(p_version bigint) returns void
language plpgsql set search_path = '' as $$
declare
  v public.document_versions;
begin
  select * into v from public.document_versions where id = p_version;
  if v.id is null then
    raise exception 'Version not found' using errcode = 'P0002';
  end if;
  update public.documents
  set title = v.title, content = v.content, scene = v.scene, deleted_at = null
  where id = v.document_id;
end;
$$;

-- Moves a folder and everything in it to the trash, or back.
create function public.set_folder_trashed(p_folder uuid, p_trashed boolean) returns void
language plpgsql set search_path = '' as $$
declare
  v_when timestamptz := case when p_trashed then now() end;
begin
  with recursive tree(id) as (
    select id from public.folders where id = p_folder
    union
    select f.id from public.folders f join tree t on f.parent_id = t.id
  )
  update public.folders set deleted_at = v_when where id in (select id from tree);
  with recursive tree(id) as (
    select id from public.folders where id = p_folder
    union
    select f.id from public.folders f join tree t on f.parent_id = t.id
  )
  update public.documents set deleted_at = v_when where folder_id in (select id from tree);
end;
$$;

-- Search across items, projects and docs. Runs as the caller, so RLS applies.
create function public.search_workspace(p_org uuid, p_query text)
returns table (kind text, id uuid, title text, snippet text, project_id uuid, extra text)
language sql stable set search_path = '' as $$
  with q as (select '%' || replace(replace(btrim(p_query), '%', ''), '_', '') || '%' as pattern)
  (select 'project', p.id, p.name, left(coalesce(p.goal, ''), 140), p.id, p.status
   from public.projects p, q
   where p.org_id = p_org and (p.name ilike q.pattern or p.goal ilike q.pattern)
   order by p.updated_at desc limit 8)
  union all
  (select i.kind, i.id, i.title, left(coalesce(i.summary, i.details, ''), 140), i.project_id, i.status
   from public.items i, q
   where i.org_id = p_org and (i.title ilike q.pattern or i.details ilike q.pattern or i.summary ilike q.pattern)
   order by i.updated_at desc limit 12)
  union all
  (select d.kind, d.id, d.title, left(regexp_replace(d.content, '\s+', ' ', 'g'), 140), d.project_id, null
   from public.documents d, q
   where d.org_id = p_org and d.deleted_at is null
     and (d.title ilike q.pattern or d.content ilike q.pattern)
   order by d.updated_at desc limit 12);
$$;

revoke execute on function public.projects_before_write(), public.milestones_before_write(),
  public.items_project_check(), public.task_dependencies_before_insert(),
  public.folders_before_write(), public.documents_before_write(),
  public.doc_files_before_insert(), public.log_project_activity()
  from public, anon, authenticated;
grant execute on function
  public.can_use_team(uuid, uuid),
  public.claim_ai(uuid, text, integer),
  public.restore_document_version(bigint),
  public.set_folder_trashed(uuid, boolean),
  public.search_workspace(uuid, text)
to authenticated;

-- ---------------------------------------------------------------------------
-- Storage: uploads and AI images are kept under 250 KB
-- ---------------------------------------------------------------------------
update storage.buckets
set file_size_limit = 256000,
    allowed_mime_types = array['image/webp', 'image/jpeg', 'image/png']
where id = 'item-images';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('doc-files', 'doc-files', false, 256000, array['image/webp', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

alter publication supabase_realtime add table public.projects, public.milestones;
