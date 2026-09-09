-- Single round-trip lock/unlock for Super Admin sellable features (update + audit).

create or replace function public.set_platform_sellable_feature_lock(
  p_company_id uuid,
  p_feature_key text,
  p_locked boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_metadata jsonb;
  v_features jsonb;
  v_feature jsonb;
  v_actor uuid;
begin
  if not public.is_platform_admin() then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  v_actor := auth.uid();
  if v_actor is null then
    raise exception 'unauthorized' using errcode = '42501';
  end if;

  select metadata into v_metadata
  from public.companies
  where id = p_company_id
  for update;

  if not found then
    raise exception 'company not found' using errcode = 'P0002';
  end if;

  v_metadata := coalesce(v_metadata, '{}'::jsonb);
  v_features := coalesce(v_metadata -> 'sellable_features', '{}'::jsonb);
  v_feature := coalesce(v_features -> p_feature_key, '{"enabled": true, "locked": true}'::jsonb);
  v_feature := jsonb_set(
    jsonb_set(
      v_feature,
      '{enabled}',
      to_jsonb(coalesce((v_feature ->> 'enabled')::boolean, true))
    ),
    '{locked}',
    to_jsonb(p_locked)
  );
  v_features := jsonb_set(v_features, array[p_feature_key], v_feature, true);
  v_metadata := jsonb_set(v_metadata, '{sellable_features}', v_features, true);

  update public.companies
  set metadata = v_metadata
  where id = p_company_id;

  insert into public.platform_admin_audit_logs (
    actor_user_id,
    action,
    target_company_id,
    details
  ) values (
    v_actor,
    case when p_locked then 'sellable_feature_locked' else 'sellable_feature_unlocked' end,
    p_company_id,
    jsonb_build_object('feature_key', p_feature_key, 'locked', p_locked)
  );

  return jsonb_build_object(
    'company_id', p_company_id,
    'feature_key', p_feature_key,
    'locked', p_locked,
    'metadata', v_metadata
  );
end;
$$;

grant execute on function public.set_platform_sellable_feature_lock(uuid, text, boolean) to authenticated;

NOTIFY pgrst, 'reload schema';
