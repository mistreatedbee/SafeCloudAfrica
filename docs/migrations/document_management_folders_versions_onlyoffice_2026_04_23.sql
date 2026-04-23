-- Document Management: folders + versioned documents + approval trigger
-- 2026-04-23
-- Adds:
-- - public.document_folders (company-scoped hierarchical folders)
-- - public.document_versions (immutable-ish version history; drafts can be updated)
-- - documents additions: folder_id, description, current_version_id
-- - approval trigger: approvals(entity_type='document_version') drives version/document status

create table if not exists public.document_folders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid null references public.document_folders(id) on delete cascade,
  module text not null check (module in ('safety','hr','legal','quality','health','environment','general','security')),
  name text not null,
  sort_order integer not null default 0,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_document_folders_unique_name
  on public.document_folders(company_id, coalesce(parent_id, '00000000-0000-0000-0000-000000000000'::uuid), lower(name));

create index if not exists idx_document_folders_company
  on public.document_folders(company_id, module, parent_id, sort_order, created_at);

alter table public.document_folders enable row level security;

drop policy if exists document_folders_select_member on public.document_folders;
create policy document_folders_select_member
on public.document_folders for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists document_folders_write_management on public.document_folders;
create policy document_folders_write_management
on public.document_folders for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Versions table
create table if not exists public.document_versions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  version_label text not null,
  status text not null check (status in ('draft','in_review','approved','rejected','archived')) default 'draft',
  storage_bucket text null,
  storage_key text null,
  original_filename text null,
  mime_type text null,
  file_size bigint null,
  created_by_user_id uuid null,
  supersedes_version_id uuid null references public.document_versions(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_document_versions_doc
  on public.document_versions(company_id, document_id, created_at desc);

create index if not exists idx_document_versions_status
  on public.document_versions(company_id, status, updated_at desc);

alter table public.document_versions enable row level security;

drop policy if exists document_versions_select_member on public.document_versions;
create policy document_versions_select_member
on public.document_versions for select
using (public.is_company_member(company_id) or public.is_platform_admin());

drop policy if exists document_versions_write_management on public.document_versions;
create policy document_versions_write_management
on public.document_versions for all
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

-- Extend documents
alter table public.documents
  add column if not exists folder_id uuid null references public.document_folders(id) on delete set null;

alter table public.documents
  add column if not exists description text null;

alter table public.documents
  add column if not exists current_version_id uuid null references public.document_versions(id) on delete set null;

alter table public.documents
  add column if not exists published_version_id uuid null references public.document_versions(id) on delete set null;

create index if not exists idx_documents_folder
  on public.documents(company_id, folder_id, updated_at desc);

-- Maintain updated_at columns for new tables
create or replace function public.dms_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_document_folders_updated_at on public.document_folders;
create trigger trg_document_folders_updated_at
before update on public.document_folders
for each row execute function public.dms_set_updated_at();

drop trigger if exists trg_document_versions_updated_at on public.document_versions;
create trigger trg_document_versions_updated_at
before update on public.document_versions
for each row execute function public.dms_set_updated_at();

-- Seed default folders for a company (idempotent)
create or replace function public.seed_default_document_folders(p_company_id uuid, p_actor_user_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_created integer := 0;
  v_root uuid;
  v_module text;
  v_sub text;
  v_roots text[] := array['safety','quality','environment','health','legal','hr','general','security'];
  v_subs text[] := array['Policies','Procedures','Forms','Records','Other'];
begin
  if not (public.is_company_consultant_or_admin(p_company_id) or public.is_platform_admin()) then
    raise exception 'not_allowed';
  end if;

  foreach v_module in array v_roots loop
    insert into public.document_folders (company_id, parent_id, module, name, sort_order, created_by_user_id)
    values (p_company_id, null, v_module, initcap(v_module), 0, p_actor_user_id)
    on conflict do nothing;

    select id into v_root
    from public.document_folders
    where company_id = p_company_id and parent_id is null and module = v_module and lower(name) = lower(initcap(v_module))
    limit 1;

    if v_root is not null then
      foreach v_sub in array v_subs loop
        insert into public.document_folders (company_id, parent_id, module, name, sort_order, created_by_user_id)
        values (p_company_id, v_root, v_module, v_sub, 0, p_actor_user_id)
        on conflict do nothing;
      end loop;
    end if;
  end loop;

  get diagnostics v_created = row_count;
  return 1;
end;
$$;

grant execute on function public.seed_default_document_folders(uuid, uuid) to authenticated;

-- RPC: create document + initial version (v1 draft) atomically
create or replace function public.create_document_with_initial_version(
  p_company_id uuid,
  p_module text,
  p_title text,
  p_category text,
  p_description text,
  p_folder_id uuid,
  p_owner_user_id uuid,
  p_created_by_user_id uuid,
  p_storage_bucket text,
  p_storage_key text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_ver public.document_versions;
begin
  if not (public.is_company_consultant_or_admin(p_company_id) or public.is_platform_admin()) then
    raise exception 'not_allowed';
  end if;

  insert into public.documents (
    company_id,
    module,
    title,
    category,
    version,
    status,
    owner_user_id,
    review_due_at,
    storage_bucket,
    storage_key,
    folder_id,
    description
  )
  values (
    p_company_id,
    p_module,
    p_title,
    p_category,
    'v1',
    'draft',
    p_owner_user_id,
    null,
    p_storage_bucket,
    p_storage_key,
    p_folder_id,
    p_description
  )
  returning * into v_doc;

  insert into public.document_versions (
    company_id,
    document_id,
    version_label,
    status,
    storage_bucket,
    storage_key,
    original_filename,
    mime_type,
    file_size,
    created_by_user_id
  )
  values (
    p_company_id,
    v_doc.id,
    'v1',
    'draft',
    p_storage_bucket,
    p_storage_key,
    p_original_filename,
    p_mime_type,
    p_file_size,
    p_created_by_user_id
  )
  returning * into v_ver;

  update public.documents
  set current_version_id = v_ver.id
  where id = v_doc.id;

  select * into v_doc from public.documents where id = v_doc.id;
  return v_doc;
end;
$$;

grant execute on function public.create_document_with_initial_version(
  uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text, bigint
) to authenticated;

-- RPC: create a new version (draft) for an existing document
create or replace function public.create_document_version(
  p_company_id uuid,
  p_document_id uuid,
  p_version_label text,
  p_status text,
  p_storage_bucket text,
  p_storage_key text,
  p_original_filename text,
  p_mime_type text,
  p_file_size bigint,
  p_created_by_user_id uuid,
  p_supersedes_version_id uuid,
  p_set_current boolean
)
returns public.document_versions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_ver public.document_versions;
begin
  if not (public.is_company_consultant_or_admin(p_company_id) or public.is_platform_admin()) then
    raise exception 'not_allowed';
  end if;

  select * into v_doc
  from public.documents
  where id = p_document_id and company_id = p_company_id;

  if not found then
    raise exception 'not_found';
  end if;

  insert into public.document_versions (
    company_id,
    document_id,
    version_label,
    status,
    storage_bucket,
    storage_key,
    original_filename,
    mime_type,
    file_size,
    created_by_user_id,
    supersedes_version_id
  )
  values (
    p_company_id,
    p_document_id,
    p_version_label,
    coalesce(p_status, 'draft'),
    p_storage_bucket,
    p_storage_key,
    p_original_filename,
    p_mime_type,
    p_file_size,
    p_created_by_user_id,
    p_supersedes_version_id
  )
  returning * into v_ver;

  if p_set_current then
    update public.documents
    set
      current_version_id = v_ver.id,
      status = case when v_ver.status = 'approved' then 'approved' else 'draft' end,
      updated_at = now()
    where id = p_document_id and company_id = p_company_id;

    if v_ver.status = 'approved' then
      update public.documents
      set
        published_version_id = v_ver.id,
        version = v_ver.version_label,
        storage_bucket = v_ver.storage_bucket,
        storage_key = v_ver.storage_key,
        updated_at = now()
      where id = p_document_id and company_id = p_company_id;
    end if;
  end if;

  return v_ver;
end;
$$;

grant execute on function public.create_document_version(
  uuid, uuid, text, text, text, text, text, text, bigint, uuid, uuid, boolean
) to authenticated;

-- Approval trigger: if approvals.entity_type='document_version', update document_versions + documents
create or replace function public.on_approval_document_version_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ver public.document_versions;
begin
  if tg_op <> 'UPDATE' then
    return new;
  end if;

  if new.entity_type <> 'document_version' then
    return new;
  end if;

  if new.status is not distinct from old.status then
    return new;
  end if;

  select * into v_ver
  from public.document_versions
  where id = new.entity_id and company_id = new.company_id;

  if not found then
    return new;
  end if;

  if new.status = 'approved' then
    update public.document_versions
    set status = 'approved', updated_at = now()
    where id = v_ver.id and company_id = new.company_id;

    update public.documents
    set
      status = 'approved',
      published_version_id = v_ver.id,
      current_version_id = v_ver.id,
      version = v_ver.version_label,
      storage_bucket = v_ver.storage_bucket,
      storage_key = v_ver.storage_key,
      updated_at = now()
    where id = v_ver.document_id and company_id = new.company_id;
  elsif new.status = 'rejected' then
    update public.document_versions
    set status = 'rejected', updated_at = now()
    where id = v_ver.id and company_id = new.company_id;

    update public.documents
    set
      status = case when published_version_id is not null then 'approved' else 'draft' end,
      updated_at = now()
    where id = v_ver.document_id and company_id = new.company_id;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_approvals_document_version on public.approvals;
create trigger trg_approvals_document_version
after update of status on public.approvals
for each row execute function public.on_approval_document_version_status_change();
