-- Follow-up: PPE stock transaction safety. createPpeStockMovement() (ppeService.ts)
-- previously did two separate REST writes -- update ppe_stock.on_hand_qty, then insert
-- into ppe_stock_movements -- with no transaction wrapping them. If the second write
-- failed after the first succeeded, on_hand_qty would change with no movement record
-- explaining why (and, via createPpeIssue, a PPE issue could end up with no matching
-- stock effect at all). This RPC does both writes in a single Postgres transaction,
-- so they always succeed or fail together.
--
-- security definer + explicit company_id/RLS-equivalent checks inside the function body
-- (mirrors how other write-management policies on these tables gate access) so this
-- doesn't bypass tenant isolation or the existing write-permission model.
--
-- Idempotent: safe to re-run (create or replace).

create or replace function public.ppe_apply_stock_movement(
  p_company_id uuid,
  p_stock_id uuid,
  p_movement_type text,
  p_quantity integer,
  p_actor_user_id uuid,
  p_reason text default null,
  p_reference_type text default null,
  p_reference_id uuid default null,
  p_ppe_issue_id uuid default null,
  p_transaction_date date default null,
  p_allow_negative_stock boolean default false
)
returns table (
  stock_id uuid,
  new_on_hand_qty integer,
  movement_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_current_qty integer;
  v_new_qty integer;
  v_movement_id uuid;
begin
  if p_quantity is null or p_quantity <= 0 then
    raise exception 'Quantity must be a positive number.' using errcode = '22023';
  end if;

  if not (public.is_platform_admin() or public.is_company_consultant_or_admin(p_company_id)) then
    raise exception 'Not authorized to modify PPE stock for this company.' using errcode = '42501';
  end if;

  -- Lock the stock row for the duration of this transaction so concurrent issues
  -- against the same stock record can't both read the same on_hand_qty and both pass
  -- the insufficient-stock check.
  select on_hand_qty into v_current_qty
  from public.ppe_stock
  where id = p_stock_id and company_id = p_company_id
  for update;

  if not found then
    raise exception 'PPE stock record not found.' using errcode = 'P0002';
  end if;

  if p_movement_type in ('in', 'return') then
    v_new_qty := v_current_qty + p_quantity;
  elsif p_movement_type = 'out' then
    v_new_qty := v_current_qty - p_quantity;
    if v_new_qty < 0 and not p_allow_negative_stock then
      raise exception 'Insufficient stock for this movement.' using errcode = 'P0001';
    end if;
  elsif p_movement_type = 'adjust' then
    v_new_qty := p_quantity;
  elsif p_movement_type = 'ordered' then
    v_new_qty := v_current_qty;
  elsif p_movement_type in ('damage', 'expired') then
    v_new_qty := v_current_qty - p_quantity;
    if v_new_qty < 0 and not p_allow_negative_stock then
      raise exception 'Insufficient stock for this write-off.' using errcode = 'P0001';
    end if;
  else
    raise exception 'Unknown movement type: %', p_movement_type using errcode = '22023';
  end if;

  update public.ppe_stock
  set on_hand_qty = v_new_qty,
      updated_at = now(),
      updated_by_user_id = p_actor_user_id
  where id = p_stock_id and company_id = p_company_id;

  insert into public.ppe_stock_movements (
    company_id, stock_id, movement_type, quantity, reason, reference_type, reference_id,
    ppe_issue_id, old_on_hand_qty, new_on_hand_qty, created_by_user_id, created_at, transaction_date
  ) values (
    p_company_id, p_stock_id, p_movement_type, p_quantity, p_reason, p_reference_type, p_reference_id,
    p_ppe_issue_id, v_current_qty, v_new_qty, p_actor_user_id, now(), p_transaction_date
  )
  returning id into v_movement_id;

  return query select p_stock_id, v_new_qty, v_movement_id;
end;
$$;

comment on function public.ppe_apply_stock_movement is
  'Atomically updates ppe_stock.on_hand_qty and inserts the matching ppe_stock_movements row in one transaction -- replaces the previous two-separate-REST-write approach in createPpeStockMovement().';

grant execute on function public.ppe_apply_stock_movement(
  uuid, uuid, text, integer, uuid, text, text, uuid, uuid, date, boolean
) to authenticated;
