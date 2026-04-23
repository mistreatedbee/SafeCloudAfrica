-- Sellable features: notify super admin (platform admin) on unlock request
-- 2026-04-23
-- Adds RPC `notify_platform_admins_unlock_request` which inserts an in-app notification
-- for every row in public.platform_admins.
-- Safe to run multiple times.

create or replace function public.notify_platform_admins_unlock_request(
  p_company_id uuid,
  p_feature_key text,
  p_feature_label text,
  p_requested_by_user_id uuid,
  p_requested_by_email text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sender text;
  v_inserted integer := 0;
begin
  v_sender := coalesce(nullif(trim(p_requested_by_email), ''), p_requested_by_user_id::text);

  insert into public.notifications (
    company_id,
    user_id,
    title,
    message,
    severity,
    read_at,
    metadata
  )
  select
    p_company_id,
    a.user_id,
    'Sellable Feature Unlock Request',
    (v_sender || ' requested unlock for ' || coalesce(nullif(trim(p_feature_label), ''), p_feature_key) || '.'),
    'medium',
    null,
    jsonb_build_object(
      'feature_key', p_feature_key,
      'requested_by_user_id', p_requested_by_user_id,
      'requested_by_email', p_requested_by_email,
      'notification_type', 'info',
      'action', 'sellable_feature_unlock_request'
    )
  from public.platform_admins a;

  get diagnostics v_inserted = row_count;
  return coalesce(v_inserted, 0);
end;
$$;

grant execute on function public.notify_platform_admins_unlock_request(uuid, text, text, uuid, text)
to authenticated;

