-- Docs, whiteboards and folders now live only inside projects.
-- NOT VALID: rows created before this rule are left alone; every new or
-- changed row must belong to a project.
alter table public.folders
  add constraint folders_in_project check (project_id is not null) not valid;
alter table public.documents
  add constraint documents_in_project check (project_id is not null) not valid;
