-- Toolbox Talks: HR-linked attendees, attachments, e-signatures
-- Apply date: 2026-08-27

-- Ensure base table exists (original migration may have failed on apply)
CREATE TABLE IF NOT EXISTS public.toolbox_talks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  conducted_by_user_id UUID REFERENCES auth.users(id),
  conducted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  site_id UUID REFERENCES public.sites(id),
  attendees JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.toolbox_talks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "toolbox_talks_company_member" ON public.toolbox_talks;
CREATE POLICY "toolbox_talks_company_member" ON public.toolbox_talks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = toolbox_talks.company_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.company_memberships cm
      WHERE cm.company_id = toolbox_talks.company_id
        AND cm.user_id = auth.uid()
        AND cm.status = 'ACTIVE'
    )
  );

-- HR-linked attendees + attachment metadata
ALTER TABLE public.toolbox_talks
  ADD COLUMN IF NOT EXISTS attendee_employee_ids JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS external_attendee_names JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS attachment_file_url TEXT,
  ADD COLUMN IF NOT EXISTS attachment_file_key TEXT,
  ADD COLUMN IF NOT EXISTS attachment_file_name TEXT,
  ADD COLUMN IF NOT EXISTS attachment_mime_type TEXT;

CREATE INDEX IF NOT EXISTS idx_toolbox_talks_company_conducted
  ON public.toolbox_talks(company_id, conducted_at DESC);

-- Attendee e-signatures (typed confirmation, same pattern as risk assessment sign-offs)
CREATE TABLE IF NOT EXISTS public.toolbox_talk_signoffs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  toolbox_talk_id UUID NOT NULL REFERENCES public.toolbox_talks(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES public.hr_employees(id) ON DELETE SET NULL,
  employee_name TEXT NOT NULL,
  employee_user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  signature TEXT,
  signed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_toolbox_talk_signoffs_talk
  ON public.toolbox_talk_signoffs(company_id, toolbox_talk_id, signed_at ASC);

ALTER TABLE public.toolbox_talk_signoffs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS toolbox_talk_signoffs_tenant ON public.toolbox_talk_signoffs;
CREATE POLICY toolbox_talk_signoffs_tenant ON public.toolbox_talk_signoffs
  FOR ALL
  USING (public.is_company_member(company_id) OR public.is_platform_admin())
  WITH CHECK (public.is_company_member(company_id) OR public.is_platform_admin());

NOTIFY pgrst, 'reload schema';
