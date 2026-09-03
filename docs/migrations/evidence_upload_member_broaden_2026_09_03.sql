-- Allow any active company member to attach evidence (not only management roles
-- or rows where created_by_user_id exactly matches the JWT sub).

drop policy if exists evidence_insert_member on public.evidence_attachments;

create policy evidence_insert_member
on public.evidence_attachments for insert
with check (
  public.is_platform_admin()
  or public.is_company_member(company_id)
);

notify pgrst, 'reload schema';
