-- Closes the last PPE stock-transaction-safety gap: createPpeIssue() still did the
-- ppe_issues insert and the (now-atomic) stock movement as two separate top-level
-- steps, mitigated only by a compensating delete if the second step failed. This RPC
-- does both in one Postgres transaction -- the issue row and its stock decrement now
-- always succeed or fail together, with no compensating-delete window at all.
--
-- p_issue carries every ppe_issues column the JS layer has already resolved (item
-- name/category, cost, issuer name, etc.) as jsonb, inserted via jsonb_populate_record
-- so this function doesn't need to know the full business logic -- it only owns the
-- transactional boundary. p_stock_id is optional (an issue can be recorded without a
-- resolvable stock record, same as today).
--
-- Idempotent: safe to re-run.

create or replace function public.ppe_issue_and_decrement_stock(
  p_issue jsonb,
  p_stock_id uuid default null,
  p_quantity integer default null,
  p_allow_negative_stock boolean default false
)
returns public.ppe_issues
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid := (p_issue->>'company_id')::uuid;
  v_actor_user_id uuid := (p_issue->>'issued_by_user_id')::uuid;
  -- jsonb_populate_record does NOT apply column DEFAULTs for keys missing from the
  -- jsonb -- it sets them to SQL NULL. id (default gen_random_uuid()) would otherwise
  -- insert as NULL and violate the NOT NULL constraint, so it's generated here and
  -- merged into the jsonb before populating, regardless of what the caller sent.
  v_id uuid := coalesce(nullif(p_issue->>'id', '')::uuid, gen_random_uuid());
  v_issue public.ppe_issues;
  v_current_qty integer;
  v_new_qty integer;
begin
  if v_company_id is null or v_actor_user_id is null then
    raise exception 'company_id and issued_by_user_id are required.' using errcode = '22023';
  end if;

  if not (public.is_platform_admin() or public.is_company_consultant_or_admin(v_company_id)) then
    raise exception 'Not authorized to issue PPE for this company.' using errcode = '42501';
  end if;

  insert into public.ppe_issues
  select * from jsonb_populate_record(null::public.ppe_issues, p_issue || jsonb_build_object('id', v_id))
  returning * into v_issue;

  if p_stock_id is not null then
    if p_quantity is null or p_quantity <= 0 then
      raise exception 'Quantity must be a positive number.' using errcode = '22023';
    end if;

    select on_hand_qty into v_current_qty
    from public.ppe_stock
    where id = p_stock_id and company_id = v_company_id
    for update;

    if not found then
      raise exception 'PPE stock record not found.' using errcode = 'P0002';
    end if;

    v_new_qty := v_current_qty - p_quantity;
    if v_new_qty < 0 and not p_allow_negative_stock then
      raise exception 'Insufficient stock for this issue.' using errcode = 'P0001';
    end if;

    update public.ppe_stock
    set on_hand_qty = v_new_qty,
        updated_at = now(),
        updated_by_user_id = v_actor_user_id
    where id = p_stock_id and company_id = v_company_id;

    insert into public.ppe_stock_movements (
      company_id, stock_id, movement_type, quantity, reference_type, reference_id,
      ppe_issue_id, old_on_hand_qty, new_on_hand_qty, created_by_user_id, created_at
    ) values (
      v_company_id, p_stock_id, 'out', p_quantity, 'ppe_issue', v_issue.id,
      v_issue.id, v_current_qty, v_new_qty, v_actor_user_id, now()
    );
  end if;

  return v_issue;
end;
$$;

comment on function public.ppe_issue_and_decrement_stock is
  'Atomically inserts a ppe_issues row and (when a stock record is given) decrements ppe_stock + inserts the matching ppe_stock_movements row, all in one transaction. Replaces the previous insert-then-compensating-delete approach in createPpeIssue().';

grant execute on function public.ppe_issue_and_decrement_stock(jsonb, uuid, integer, boolean) to authenticated;
