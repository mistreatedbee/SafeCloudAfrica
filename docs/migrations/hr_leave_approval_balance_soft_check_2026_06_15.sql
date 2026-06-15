-- Fix: Remove hard balance block in hr_apply_leave_approval.
-- HR managers must be able to approve leave even when the balance is zero or
-- the leave type has default_days_per_year = 0 (the schema default). The balance
-- is still tracked and will go negative as an audit indicator; it just no longer
-- blocks the approval workflow.
-- Also: when auto-creating a missing balance, allocate at least enough days to
-- cover the current request so the generated remaining_days never starts negative.

create or replace function public.hr_apply_leave_approval(
  p_leave_request_id uuid,
  p_company_id uuid,
  p_decision text,
  p_actor_user_id uuid,
  p_decline_reason text default null
)
returns public.hr_leave_requests
language plpgsql
security definer
set search_path = public
as $$
declare
  v_leave public.hr_leave_requests;
  v_leave_type public.hr_leave_types;
  v_year integer;
  v_balance public.hr_leave_balances;
  v_auto_allocated numeric(8,2);
begin
  select * into v_leave from public.hr_leave_requests
    where id = p_leave_request_id and company_id = p_company_id for update;
  if not found then raise exception 'Leave request not found.'; end if;

  select * into v_leave_type from public.hr_leave_types where id = v_leave.leave_type_id;

  if p_decision = 'SUPERVISOR_APPROVE' then
    update public.hr_leave_requests
      set supervisor_approval_status = 'APPROVED', updated_at = now()
      where id = v_leave.id returning * into v_leave;

  elsif p_decision = 'SUPERVISOR_DECLINE' then
    update public.hr_leave_requests
      set supervisor_approval_status = 'DECLINED',
          status = 'DECLINED',
          decline_reason = coalesce(p_decline_reason, 'Declined by supervisor'),
          approved_by_user_id = p_actor_user_id,
          approved_at = now(),
          updated_at = now()
      where id = v_leave.id returning * into v_leave;

  elsif p_decision = 'HR_APPROVE' then
    if v_leave_type.requires_proof and coalesce(array_length(v_leave.proof_file_ids, 1), 0) = 0 then
      raise exception 'Proof is required.';
    end if;

    update public.hr_leave_requests
      set hr_approval_status = 'APPROVED',
          status = 'APPROVED',
          approved_by_user_id = p_actor_user_id,
          approved_at = now(),
          updated_at = now()
      where id = v_leave.id returning * into v_leave;

    v_year := extract(year from v_leave.start_date)::integer;

    select * into v_balance from public.hr_leave_balances
      where company_id = p_company_id
        and employee_id = v_leave.employee_id
        and leave_type_id = v_leave.leave_type_id
        and year = v_year
      for update;

    if not found then
      -- Auto-allocate at least enough to cover this request so the generated
      -- remaining_days column never starts negative on a brand-new balance.
      v_auto_allocated := greatest(coalesce(v_leave_type.default_days_per_year, 0), v_leave.total_days);
      insert into public.hr_leave_balances
        (company_id, employee_id, leave_type_id, year, allocated_days, used_days, updated_by_user_id)
      values
        (p_company_id, v_leave.employee_id, v_leave.leave_type_id, v_year, v_auto_allocated, 0, p_actor_user_id)
      returning * into v_balance;
    end if;

    -- Balance is tracked for reporting; HR approval is never hard-blocked by balance.
    update public.hr_leave_balances
      set used_days = used_days + v_leave.total_days,
          updated_by_user_id = p_actor_user_id,
          updated_at = now()
      where id = v_balance.id;

  elsif p_decision = 'HR_DECLINE' then
    update public.hr_leave_requests
      set hr_approval_status = 'DECLINED',
          status = 'DECLINED',
          decline_reason = coalesce(p_decline_reason, 'Declined by HR'),
          approved_by_user_id = p_actor_user_id,
          approved_at = now(),
          updated_at = now()
      where id = v_leave.id returning * into v_leave;

  else
    raise exception 'Unsupported decision';
  end if;

  return v_leave;
end;
$$;

grant execute on function public.hr_apply_leave_approval(uuid, uuid, text, uuid, text) to authenticated;
