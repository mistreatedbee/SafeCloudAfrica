-- Allow company members (including auditors and assignees) to upload evidence they attach.
-- Management roles retain full update/delete access.

drop policy if exists evidence_write_management on public.evidence_attachments;

create policy evidence_insert_member
on public.evidence_attachments for insert
with check (
  public.is_platform_admin()
  or public.is_company_consultant_or_admin(company_id)
  or public.is_company_auditor(company_id)
  or (
    public.is_company_member(company_id)
    and created_by_user_id = public.request_user_id()
  )
);

create policy evidence_update_management
on public.evidence_attachments for update
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin())
with check (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

create policy evidence_delete_management
on public.evidence_attachments for delete
using (public.is_company_consultant_or_admin(company_id) or public.is_platform_admin());

notify pgrst, 'reload schema';
