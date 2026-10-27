-- Data fix (2026-10-27): recover PPE stock quantity stranded on inactive
-- duplicate rows that predate the "one pool per item+size" fix
-- (557e58e, Merge PPE stock into one pool per item+size instead of
-- duplicating, 2026-10-23). That fix stops NEW duplicates but never
-- retroactively merged quantity on duplicates that already existed, or
-- that a user tried to clean up by deleting (deletePpeStock only sets
-- is_active = false -- it never transfers the row's on_hand_qty anywhere).
--
-- Found two such groups for company "Mel safety solutions"
-- (46f4758c-fed6-4b5b-88ef-5b6eb0b3338c), both with inactive rows still
-- holding quantity last touched 2026-10-23T14:01 (~9 seconds apart --
-- almost certainly one manual cleanup pass that deleted the redundant
-- rows without merging them):
--   Hard hat (no size):          active row had 12, 2 inactive rows held 2 + 10 = 12 more
--   Dust masks / Medium:         active row had 15, 1 inactive row held 5 more
--
-- This adds the stranded quantity back onto each group's active row,
-- zeroes it on the inactive rows (so it can never be double-counted if
-- one is ever reactivated), and records a stock movement on each for the
-- audit trail. Attributed to the company's primary admin
-- (ce39fd8f-f61a-4445-b138-9a8291fe0de2) since this is an administrative
-- correction, not an action any user actually took.

DO $$
DECLARE
  v_actor uuid := 'ce39fd8f-f61a-4445-b138-9a8291fe0de2';
  v_company uuid := '46f4758c-fed6-4b5b-88ef-5b6eb0b3338c';
  v_active_id uuid;
  v_old_qty int;
  v_new_qty int;
  v_recovered int;
BEGIN
  -- Hard hat (906b89e0-b04f-46da-a74e-f94244e156e6, size IS NULL)
  SELECT id, on_hand_qty INTO v_active_id, v_old_qty
  FROM public.ppe_stock
  WHERE company_id = v_company AND ppe_item_id = '906b89e0-b04f-46da-a74e-f94244e156e6'
    AND size IS NULL AND is_active = true;

  SELECT coalesce(sum(on_hand_qty), 0) INTO v_recovered
  FROM public.ppe_stock
  WHERE company_id = v_company AND ppe_item_id = '906b89e0-b04f-46da-a74e-f94244e156e6'
    AND size IS NULL AND is_active = false AND on_hand_qty > 0;

  v_new_qty := v_old_qty + v_recovered;
  UPDATE public.ppe_stock SET on_hand_qty = v_new_qty, updated_at = now(), updated_by_user_id = v_actor
  WHERE id = v_active_id;

  INSERT INTO public.ppe_stock_movements (
    company_id, stock_id, movement_type, quantity, reason, reference_type,
    old_on_hand_qty, new_on_hand_qty, created_by_user_id, created_at
  ) VALUES (
    v_company, v_active_id, 'in', v_recovered,
    'Data fix: recovered quantity stranded on inactive duplicate rows (pre-dedup-fix data)',
    'stock_merge', v_old_qty, v_new_qty, v_actor, now()
  );

  UPDATE public.ppe_stock SET on_hand_qty = 0, updated_at = now(), updated_by_user_id = v_actor
  WHERE company_id = v_company AND ppe_item_id = '906b89e0-b04f-46da-a74e-f94244e156e6'
    AND size IS NULL AND is_active = false AND on_hand_qty > 0;

  -- Dust masks (a7e709c8-ae1b-47e4-b796-2549a7af35d7, size = 'Medium')
  SELECT id, on_hand_qty INTO v_active_id, v_old_qty
  FROM public.ppe_stock
  WHERE company_id = v_company AND ppe_item_id = 'a7e709c8-ae1b-47e4-b796-2549a7af35d7'
    AND size = 'Medium' AND is_active = true;

  SELECT coalesce(sum(on_hand_qty), 0) INTO v_recovered
  FROM public.ppe_stock
  WHERE company_id = v_company AND ppe_item_id = 'a7e709c8-ae1b-47e4-b796-2549a7af35d7'
    AND size = 'Medium' AND is_active = false AND on_hand_qty > 0;

  v_new_qty := v_old_qty + v_recovered;
  UPDATE public.ppe_stock SET on_hand_qty = v_new_qty, updated_at = now(), updated_by_user_id = v_actor
  WHERE id = v_active_id;

  INSERT INTO public.ppe_stock_movements (
    company_id, stock_id, movement_type, quantity, reason, reference_type,
    old_on_hand_qty, new_on_hand_qty, created_by_user_id, created_at
  ) VALUES (
    v_company, v_active_id, 'in', v_recovered,
    'Data fix: recovered quantity stranded on inactive duplicate rows (pre-dedup-fix data)',
    'stock_merge', v_old_qty, v_new_qty, v_actor, now()
  );

  UPDATE public.ppe_stock SET on_hand_qty = 0, updated_at = now(), updated_by_user_id = v_actor
  WHERE company_id = v_company AND ppe_item_id = 'a7e709c8-ae1b-47e4-b796-2549a7af35d7'
    AND size = 'Medium' AND is_active = false AND on_hand_qty > 0;
END $$;
