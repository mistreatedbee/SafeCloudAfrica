-- Roadmap phase 1: compliance intelligence, automation, billing ops, and modular expansion
-- 2026-04-22

create table if not exists public.compliance_score_runs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  score_kind text not null default 'overall',
  score_percentage numeric(5,2) not null default 0,
  rag_status text not null default 'red',
  weighted_score numeric(10,2) not null default 0,
  generated_by_user_id uuid null,
  generated_at timestamptz not null default now(),
  effective_month date not null default date_trunc('month', now())::date,
  ai_predicted_deterioration_risk numeric(5,2) null,
  ai_next_month_risk_flag text null,
  ai_recommendations jsonb not null default '[]'::jsonb,
  ai_top_gaps jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compliance_score_runs_company_month
  on public.compliance_score_runs(company_id, effective_month desc, generated_at desc);

create table if not exists public.compliance_score_run_domains (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.compliance_score_runs(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  domain_key text not null,
  domain_label text not null,
  weight numeric(5,2) not null default 20,
  score_percentage numeric(5,2) not null default 0,
  rag_status text not null default 'red',
  total_count integer not null default 0,
  compliant_count integer not null default 0,
  overdue_count integer not null default 0,
  attention_count integer not null default 0,
  trend_delta numeric(8,2) not null default 0,
  drilldown_records jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_compliance_score_run_domains_unique
  on public.compliance_score_run_domains(run_id, domain_key);

create table if not exists public.compliance_iso_record_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  standard_key text not null,
  clause_number text not null,
  clause_title text not null,
  module_key text null,
  source_table text not null,
  source_record_id uuid not null,
  compliance_status text not null default 'under-review',
  evidence_document_ids uuid[] null,
  evidence_links jsonb not null default '[]'::jsonb,
  notes text null,
  linked_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_compliance_iso_links_company_standard
  on public.compliance_iso_record_links(company_id, standard_key, clause_number);

create table if not exists public.monthly_compliance_reports (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  report_month date not null,
  generated_from_run_id uuid null references public.compliance_score_runs(id) on delete set null,
  recipient_emails text[] not null default '{}',
  status text not null default 'queued',
  summary jsonb not null default '{}'::jsonb,
  sent_at timestamptz null,
  delivery_error text null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_monthly_compliance_reports_company_month
  on public.monthly_compliance_reports(company_id, report_month);

create table if not exists public.audit_invitation_tokens (
  id uuid primary key default gen_random_uuid(),
  audit_id uuid not null references public.audits(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  invitee_email text not null,
  invitee_user_id uuid null,
  token_hash text not null,
  proposed_dates jsonb not null default '[]'::jsonb,
  responded_date timestamptz null,
  response_status text not null default 'pending',
  selected_date timestamptz null,
  decline_reason text null,
  expires_at timestamptz not null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_audit_invitation_tokens_hash
  on public.audit_invitation_tokens(token_hash);

create table if not exists public.sla_policies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null,
  reminder_after_hours integer not null default 24,
  manager_escalation_after_hours integer not null default 48,
  director_escalation_after_hours integer not null default 72,
  enabled boolean not null default true,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_sla_policies_company_entity
  on public.sla_policies(company_id, entity_type);

create table if not exists public.sla_escalation_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  stage text not null,
  status text not null default 'sent',
  recipients jsonb not null default '[]'::jsonb,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_sla_escalation_events_lookup
  on public.sla_escalation_events(company_id, entity_type, entity_id, stage);

create table if not exists public.external_access_grants (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subject_email text not null,
  subject_user_id uuid null,
  role text not null,
  allowed_modules text[] not null default '{}',
  allowed_site_ids uuid[] null,
  allowed_department_ids uuid[] null,
  audit_ids uuid[] null,
  billing_mode text not null default 'seat',
  starts_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz null,
  revoked_by_user_id uuid null,
  status text not null default 'active',
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_external_access_grants_company_email
  on public.external_access_grants(company_id, subject_email, status);

create table if not exists public.billing_plan_catalog (
  id uuid primary key default gen_random_uuid(),
  plan_code text not null unique,
  name text not null,
  currency text not null default 'ZAR',
  monthly_base_amount numeric(12,2) not null default 0,
  included_users integer not null default 0,
  included_sites integer not null default 0,
  module_entitlements jsonb not null default '{}'::jsonb,
  trial_user_limit integer null,
  trial_site_limit integer null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.billing_subscriptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  plan_code text not null,
  status text not null default 'trial',
  billing_cycle_months integer not null default 1,
  starts_at timestamptz not null default now(),
  renews_at timestamptz null,
  trial_ends_at timestamptz null,
  user_limit integer null,
  site_limit integer null,
  module_overrides jsonb not null default '{}'::jsonb,
  auto_invoice boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_bill_subscriptions_company
  on public.billing_subscriptions(company_id);

create table if not exists public.billing_usage_snapshots (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  snapshot_month date not null,
  active_users integer not null default 0,
  active_sites integer not null default 0,
  enabled_modules text[] not null default '{}',
  external_grants integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists idx_billing_usage_company_month
  on public.billing_usage_snapshots(company_id, snapshot_month);

create table if not exists public.billing_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  subscription_id uuid null references public.billing_subscriptions(id) on delete set null,
  invoice_number text not null unique,
  period_start date not null,
  period_end date not null,
  subtotal_amount numeric(12,2) not null default 0,
  tax_amount numeric(12,2) not null default 0,
  total_amount numeric(12,2) not null default 0,
  currency text not null default 'ZAR',
  status text not null default 'draft',
  line_items jsonb not null default '[]'::jsonb,
  due_at timestamptz null,
  issued_at timestamptz null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.visitor_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  qr_code text not null,
  signed_in_at timestamptz null,
  signed_out_at timestamptz null,
  status text not null default 'generated',
  created_by_user_id uuid null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_visitor_qr_sessions_code
  on public.visitor_qr_sessions(qr_code);

create table if not exists public.template_library_versions (
  id uuid primary key default gen_random_uuid(),
  template_item_id uuid not null references public.template_library_items(id) on delete cascade,
  company_id uuid not null references public.companies(id) on delete cascade,
  version_label text not null,
  storage_bucket text null,
  storage_key text null,
  change_summary text null,
  created_by_user_id uuid null,
  created_at timestamptz not null default now()
);

create table if not exists public.template_org_copies (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  source_template_item_id uuid not null references public.template_library_items(id) on delete cascade,
  source_version_id uuid null references public.template_library_versions(id) on delete set null,
  target_document_id uuid null references public.documents(id) on delete set null,
  copied_by_user_id uuid null,
  copied_at timestamptz not null default now()
);

alter table if exists public.bbs_observations
  add column if not exists behaviour_category text null,
  add column if not exists observation_outcome text null,
  add column if not exists linked_training_record_id uuid null,
  add column if not exists linked_ncr_id uuid null,
  add column if not exists owner_user_id uuid null,
  add column if not exists due_date date null,
  add column if not exists closed_at timestamptz null,
  add column if not exists notes text null;

alter table if exists public.contractors
  add column if not exists contact_email text null,
  add column if not exists contact_phone text null,
  add column if not exists documents_status text null default 'pending',
  add column if not exists induction_status text null default 'pending',
  add column if not exists portal_token_hash text null,
  add column if not exists portal_expires_at timestamptz null,
  add column if not exists notes text null;

alter table if exists public.visitors
  add column if not exists host_user_id uuid null,
  add column if not exists visit_date date null,
  add column if not exists qr_code text null,
  add column if not exists signed_in_at timestamptz null,
  add column if not exists signed_out_at timestamptz null,
  add column if not exists notes text null;

alter table if exists public.emergency_drills
  add column if not exists plan_document_id uuid null,
  add column if not exists performance_score numeric(5,2) null,
  add column if not exists participants_count integer not null default 0,
  add column if not exists actions_open integer not null default 0,
  add column if not exists alert_channel text null,
  add column if not exists action_notes text null;

alter table if exists public.template_library_items
  add column if not exists is_master_template boolean not null default false,
  add column if not exists latest_version_label text null,
  add column if not exists change_history jsonb not null default '[]'::jsonb;

alter table if exists public.audits
  add column if not exists date_approval_status text null default 'pending',
  add column if not exists date_decline_reason text null,
  add column if not exists invitee_email text null;

alter table if exists public.companies
  add column if not exists billing_plan_code text null,
  add column if not exists billing_cycle_months integer not null default 1,
  add column if not exists renewal_reminder_days integer not null default 14;
