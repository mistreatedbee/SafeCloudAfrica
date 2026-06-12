-- SHEQ: Toolbox Talks, Permit to Work, LOTO
-- Apply date: 2026-06-12

-- Toolbox Talks
CREATE TABLE IF NOT EXISTS toolbox_talks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  topic TEXT,
  conducted_by_user_id UUID REFERENCES auth.users(id),
  conducted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  site_id UUID REFERENCES sites(id),
  attendees JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'DRAFT' CHECK (status IN ('DRAFT', 'COMPLETE')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE toolbox_talks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "toolbox_talks_company_member" ON toolbox_talks
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );

-- Permit to Work
CREATE TABLE IF NOT EXISTS permits_to_work (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  permit_number TEXT,
  work_description TEXT NOT NULL,
  location TEXT,
  site_id UUID REFERENCES sites(id),
  requested_by_user_id UUID REFERENCES auth.users(id),
  approved_by_user_id UUID REFERENCES auth.users(id),
  valid_from TIMESTAMPTZ,
  valid_to TIMESTAMPTZ,
  hazards JSONB NOT NULL DEFAULT '[]',
  precautions JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'APPROVED', 'ACTIVE', 'CLOSED', 'CANCELLED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE permits_to_work ENABLE ROW LEVEL SECURITY;

CREATE POLICY "permits_to_work_company_member" ON permits_to_work
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );

-- LOTO (Lockout / Tagout)
CREATE TABLE IF NOT EXISTS loto_records (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,
  equipment_name TEXT NOT NULL,
  location TEXT,
  site_id UUID REFERENCES sites(id),
  lock_applied_by_user_id UUID REFERENCES auth.users(id),
  lock_applied_at TIMESTAMPTZ DEFAULT now(),
  lock_removed_by_user_id UUID REFERENCES auth.users(id),
  lock_removed_at TIMESTAMPTZ,
  reason TEXT,
  isolation_points JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'LOCKED' CHECK (status IN ('LOCKED', 'RELEASED')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE loto_records ENABLE ROW LEVEL SECURITY;

CREATE POLICY "loto_records_company_member" ON loto_records
  FOR ALL USING (
    company_id IN (
      SELECT company_id FROM memberships
      WHERE user_id = auth.uid() AND status = 'ACTIVE'
    )
  );
