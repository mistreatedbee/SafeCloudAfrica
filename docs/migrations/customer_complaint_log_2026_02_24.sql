-- Customer Complaint Log (Quality module)
-- Adds complaint register with status workflow, org-scoped ref numbering, and RLS.

create table if not exists public.quality_customer_complaint_counter (
  company_id uuid not null references public.companies(id) on delete cascade,
  year integer not null,
  last_number integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (company_id, year)
);

create table if not exists public.quality_customer_complaints (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  site_id uuid null references public.sites(id) on delete set null,
  department_id uuid null references public.departments(id) on delete set null,
  complaint_ref_no text not null,
  customer_name text not null,
  person_handling_user_id uuid null,
  person_handling_name_snapshot text not null,
  date_received date not null,
  description text not null,
  action_taken text null,
  status text not null default 'MONITORING_REQUIRED'
    check (status in ('CLOSED', 'MONITORING_REQUIRED', 'ESCALATED_TO_MANAGEMENT')),
  customer_feedback text null,
  evidence_file_ids uuid[] null,
  linked_ncr_id uuid null references public.quality_ncrs(id) on delete set null,
  linked_task_id uuid null references public.tasks(id) on delete set null,
  closed_at timestamptz null,
  closed_by_user_id uuid null,
  created_by_user_id uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, complaint_ref_no)
);

alter table public.quality_customer_complaints
  drop constraint if exists quality_customer_complaints_closed_requirements_check;
alter table public.quality_customer_complaints
  add constraint quality_customer_complaints_closed_requirements_check
  check (
    status <> 'CLOSED'
    or (
      length(trim(coalesce(action_taken, ''))) > 0
      and closed_at is not null
      and closed_by_user_id is not null
    )
  );

create index if not exists idx_quality_customer_complaints_company_date
  on public.quality_customer_complaints(company_id, date_received desc);
create index if not exists idx_quality_customer_complaints_company_status
  on public.quality_customer_complaints(company_id, status, updated_at desc);
create index if not exists idx_quality_customer_complaints_company_person
  on public.quality_customer_complaints(company_id, person_handling_user_id);
create index if not exists idx_quality_customer_complaints_company_customer
  on public.quality_customer_complaints(company_id, customer_name);
create index if not exists idx_quality_customer_complaints_company_ref
  on public.quality_customer_complaints(company_id, complaint_ref_no);

alter table public.quality_customer_complaint_counter enable row level security;
alter table public.quality_customer_complaints enable row level security;

drop policy if exists customer_complaint_counter_select_management on public.quality_customer_complaint_counter;
create policy customer_complaint_counter_select_management
on public.quality_customer_complaint_counter for select
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant')
);

drop policy if exists customer_complaint_counter_write_management on public.quality_customer_complaint_counter;
create policy customer_complaint_counter_write_management
on public.quality_customer_complaint_counter for all
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant')
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant')
);

drop policy if exists quality_customer_complaints_select_scoped on public.quality_customer_complaints;
create policy quality_customer_complaints_select_scoped
on public.quality_customer_complaints for select
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant', 'auditor')
  or (public.company_role(company_id) = 'employee' and created_by_user_id = public.request_user_id())
);

drop policy if exists quality_customer_complaints_insert_scoped on public.quality_customer_complaints;
create policy quality_customer_complaints_insert_scoped
on public.quality_customer_complaints for insert
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant')
  or (public.company_role(company_id) = 'employee' and created_by_user_id = public.request_user_id())
);

drop policy if exists quality_customer_complaints_update_scoped on public.quality_customer_complaints;
create policy quality_customer_complaints_update_scoped
on public.quality_customer_complaints for update
using (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant')
  or (public.company_role(company_id) = 'employee' and created_by_user_id = public.request_user_id())
)
with check (
  public.is_platform_admin()
  or public.company_role(company_id) in ('owner', 'admin', 'manager', 'supervisor', 'consultant')
  or (public.company_role(company_id) = 'employee' and created_by_user_id = public.request_user_id())
);
