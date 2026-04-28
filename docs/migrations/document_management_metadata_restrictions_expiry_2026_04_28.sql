-- Document Management: metadata, restricted folders/docs, expiry reminders
-- 2026-04-28

alter table if exists public.documents
  add column if not exists effective_date date null,
  add column if not exists document_owner_name text null,
  add column if not exists approving_officer_name text null,
  add column if not exists document_number text null,
  add column if not exists revision_number text null,
  add column if not exists revision_date date null,
  add column if not exists approved_date date null,
  add column if not exists expiry_date date null,
  add column if not exists is_restricted boolean not null default false;

alter table if exists public.document_folders
  add column if not exists is_restricted boolean not null default false;

create index if not exists idx_documents_company_document_number
  on public.documents(company_id, lower(document_number))
  where document_number is not null;

create index if not exists idx_documents_company_document_owner
  on public.documents(company_id, lower(document_owner_name))
  where document_owner_name is not null;

create index if not exists idx_documents_company_expiry
  on public.documents(company_id, expiry_date)
  where expiry_date is not null;

create table if not exists public.document_expiry_reminder_sent (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  recipient_user_id uuid not null,
  reminder_type text not null check (reminder_type in ('expiry_30', 'expiry_14', 'expiry_7', 'expiry_1', 'expiry_0', 'expired')),
  sent_at timestamptz not null default now()
);

create unique index if not exists idx_document_expiry_reminder_sent_unique
  on public.document_expiry_reminder_sent(document_id, recipient_user_id, reminder_type);

create index if not exists idx_document_expiry_reminder_sent_company
  on public.document_expiry_reminder_sent(company_id, sent_at desc);

alter table public.document_expiry_reminder_sent enable row level security;

drop policy if exists document_expiry_reminder_sent_select_exec on public.document_expiry_reminder_sent;
create policy document_expiry_reminder_sent_select_exec
on public.document_expiry_reminder_sent for select
using (
  public.is_company_owner_or_admin(company_id)
  or public.is_platform_admin()
);

drop policy if exists document_expiry_reminder_sent_write_exec on public.document_expiry_reminder_sent;
create policy document_expiry_reminder_sent_write_exec
on public.document_expiry_reminder_sent for all
using (
  public.is_company_owner_or_admin(company_id)
  or public.is_platform_admin()
)
with check (
  public.is_company_owner_or_admin(company_id)
  or public.is_platform_admin()
);

drop function if exists public.create_document_with_initial_version(
  uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text, bigint
);
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
  p_file_size bigint,
  p_effective_date date,
  p_document_owner_name text,
  p_approving_officer_name text,
  p_document_number text,
  p_revision_number text,
  p_revision_date date,
  p_approved_date date,
  p_expiry_date date,
  p_is_restricted boolean
)
returns public.documents
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doc public.documents;
  v_ver public.document_versions;
  v_folder public.document_folders;
  v_restricted boolean := false;
begin
  if p_folder_id is not null then
    select * into v_folder
    from public.document_folders f
    where f.id = p_folder_id
      and f.company_id = p_company_id
      and f.module = p_module;

    if not found then
      raise exception 'invalid_folder';
    end if;

    v_restricted := coalesce(v_folder.is_restricted, false);
  end if;

  v_restricted := coalesce(p_is_restricted, v_restricted, false);

  if v_restricted then
    if not (public.is_company_owner_or_admin(p_company_id) or public.is_platform_admin()) then
      raise exception 'not_allowed';
    end if;
  elsif not (public.is_company_consultant_or_admin(p_company_id) or public.is_platform_admin()) then
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
    folder_id,
    description,
    storage_bucket,
    storage_key,
    published_version_id,
    effective_date,
    document_owner_name,
    approving_officer_name,
    document_number,
    revision_number,
    revision_date,
    approved_date,
    expiry_date,
    is_restricted
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
    p_folder_id,
    p_description,
    null,
    null,
    null,
    p_effective_date,
    nullif(trim(p_document_owner_name), ''),
    nullif(trim(p_approving_officer_name), ''),
    nullif(trim(p_document_number), ''),
    nullif(trim(p_revision_number), ''),
    p_revision_date,
    p_approved_date,
    p_expiry_date,
    v_restricted
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
    public.request_user_id()
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
  uuid, text, text, text, text, uuid, uuid, uuid, text, text, text, text, bigint,
  date, text, text, text, text, date, date, date, boolean
) to authenticated;

drop function if exists public.create_document_version(
  uuid, uuid, text, text, text, text, text, text, bigint, uuid, uuid, boolean, boolean
);
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
  p_set_current boolean,
  p_unpublish boolean
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
  select * into v_doc
  from public.documents
  where id = p_document_id and company_id = p_company_id;

  if not found then
    raise exception 'not_found';
  end if;

  if coalesce(v_doc.is_restricted, false) then
    if not (public.is_company_owner_or_admin(p_company_id) or public.is_platform_admin()) then
      raise exception 'not_allowed';
    end if;
  elsif not (public.is_company_consultant_or_admin(p_company_id) or public.is_platform_admin()) then
    raise exception 'not_allowed';
  end if;

  if p_supersedes_version_id is not null then
    if not exists (
      select 1
      from public.document_versions dv
      where dv.id = p_supersedes_version_id
        and dv.company_id = p_company_id
        and dv.document_id = p_document_id
    ) then
      raise exception 'invalid_supersedes_version';
    end if;
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
    public.request_user_id(),
    p_supersedes_version_id
  )
  returning * into v_ver;

  if p_set_current then
    update public.documents
    set
      current_version_id = v_ver.id,
      status = 'draft',
      updated_at = now()
    where id = p_document_id and company_id = p_company_id;

    if p_unpublish then
      update public.documents
      set
        published_version_id = null,
        storage_bucket = null,
        storage_key = null,
        updated_at = now()
      where id = p_document_id and company_id = p_company_id;
    end if;
  end if;

  return v_ver;
end;
$$;

grant execute on function public.create_document_version(
  uuid, uuid, text, text, text, text, text, text, bigint, uuid, uuid, boolean, boolean
) to authenticated;

drop policy if exists docs_select_member on public.documents;
create policy docs_select_member
on public.documents for select
using (
  public.is_platform_admin()
  or (
    coalesce(is_restricted, false) = false
    and public.is_company_member(company_id)
  )
  or (
    coalesce(is_restricted, false) = true
    and public.is_company_owner_or_admin(company_id)
  )
);

drop policy if exists docs_write_admin_consultant on public.documents;
create policy docs_write_admin_consultant
on public.documents for all
using (
  public.is_platform_admin()
  or (
    coalesce(is_restricted, false) = false
    and public.is_company_consultant_or_admin(company_id)
  )
  or (
    coalesce(is_restricted, false) = true
    and public.is_company_owner_or_admin(company_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    coalesce(is_restricted, false) = false
    and public.is_company_consultant_or_admin(company_id)
  )
  or (
    coalesce(is_restricted, false) = true
    and public.is_company_owner_or_admin(company_id)
  )
);

drop policy if exists document_folders_select_member on public.document_folders;
create policy document_folders_select_member
on public.document_folders for select
using (
  public.is_platform_admin()
  or (
    coalesce(is_restricted, false) = false
    and public.is_company_member(company_id)
  )
  or (
    coalesce(is_restricted, false) = true
    and public.is_company_owner_or_admin(company_id)
  )
);

drop policy if exists document_folders_write_management on public.document_folders;
create policy document_folders_write_management
on public.document_folders for all
using (
  public.is_platform_admin()
  or (
    coalesce(is_restricted, false) = false
    and public.is_company_consultant_or_admin(company_id)
  )
  or (
    coalesce(is_restricted, false) = true
    and public.is_company_owner_or_admin(company_id)
  )
)
with check (
  public.is_platform_admin()
  or (
    coalesce(is_restricted, false) = false
    and public.is_company_consultant_or_admin(company_id)
  )
  or (
    coalesce(is_restricted, false) = true
    and public.is_company_owner_or_admin(company_id)
  )
);

drop policy if exists document_versions_select_member on public.document_versions;
create policy document_versions_select_member
on public.document_versions for select
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.documents d
    where d.id = document_versions.document_id
      and d.company_id = document_versions.company_id
      and (
        (coalesce(d.is_restricted, false) = false and public.is_company_member(document_versions.company_id))
        or (coalesce(d.is_restricted, false) = true and public.is_company_owner_or_admin(document_versions.company_id))
      )
  )
);

drop policy if exists document_versions_write_management on public.document_versions;
create policy document_versions_write_management
on public.document_versions for all
using (
  public.is_platform_admin()
  or exists (
    select 1
    from public.documents d
    where d.id = document_versions.document_id
      and d.company_id = document_versions.company_id
      and (
        (coalesce(d.is_restricted, false) = false and public.is_company_consultant_or_admin(document_versions.company_id))
        or (coalesce(d.is_restricted, false) = true and public.is_company_owner_or_admin(document_versions.company_id))
      )
  )
)
with check (
  public.is_platform_admin()
  or exists (
    select 1
    from public.documents d
    where d.id = document_versions.document_id
      and d.company_id = document_versions.company_id
      and (
        (coalesce(d.is_restricted, false) = false and public.is_company_consultant_or_admin(document_versions.company_id))
        or (coalesce(d.is_restricted, false) = true and public.is_company_owner_or_admin(document_versions.company_id))
      )
  )
);
