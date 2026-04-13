import React, { useState } from 'react';
import { createClient } from '@insforge/sdk';
import { AuthShell } from '../../components/auth/AuthShell';
import { formatAuthError } from '../../auth/authMessages';
import { LoadingOverlay } from '../../components/ui/LoadingOverlay';
import { LoadingSpinner } from '../../components/ui/LoadingSpinner';

const ENABLE_DEMO_SEED = ((import.meta as any)?.env?.VITE_ENABLE_DEMO_SEED as string | undefined) === 'true';
const DEMO_SEED_TOKEN = (import.meta as any)?.env?.VITE_DEMO_SEED_TOKEN as string | undefined;
const INSFORGE_BASE_URL = (import.meta as any)?.env?.VITE_INSFORGE_BASE_URL as string | undefined;
const INSFORGE_ANON_KEY = (import.meta as any)?.env?.VITE_INSFORGE_ANON_KEY as string | undefined;

function memoryStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k)
  };
}

function makeClient() {
  if (!INSFORGE_BASE_URL || !INSFORGE_ANON_KEY) throw new Error('InsForge env vars missing.');
  return createClient({
    baseUrl: INSFORGE_BASE_URL,
    anonKey: INSFORGE_ANON_KEY,
    persistSession: true,
    autoRefreshToken: false,
    storage: memoryStorage()
  });
}

type SeedAccount = { label: string; email: string; password: string; name: string };

const SEED_ACCOUNTS: SeedAccount[] = [
  { label: 'Super Admin', email: 'superadmin@safecloud.africa', password: 'SafeCloud@123', name: 'Ashley Mashigo' },
  { label: 'Company A Admin', email: 'admin@khanyisa.co.za', password: 'SafeCloud@123', name: 'Lerato Ndlovu' },
  { label: 'Company A Consultant', email: 'consultant@khanyisa.co.za', password: 'SafeCloud@123', name: 'Thabo Mokoena' },
  { label: 'Company A Employee', email: 'employee@khanyisa.co.za', password: 'SafeCloud@123', name: 'Nomsa Khumalo' },
  { label: 'Company B Admin', email: 'admin@umzansi.co.za', password: 'SafeCloud@123', name: 'Sipho Dlamini' },
  { label: 'Company B Consultant', email: 'consultant@umzansi.co.za', password: 'SafeCloud@123', name: 'Kabelo Tshego' },
  { label: 'Company B Employee', email: 'employee@umzansi.co.za', password: 'SafeCloud@123', name: 'Ayanda Zulu' }
];

async function ensureUser(input: { email: string; password: string; name: string }) {
  const c = makeClient();
  const email = input.email.trim().toLowerCase();

  const signIn = await c.auth.signInWithPassword({ email, password: input.password });
  if (!signIn.error) {
    const session = await c.auth.getCurrentSession();
    return { client: c, userId: session.data.session?.user?.id as string };
  }

  const signUp = await c.auth.signUp({ email, password: input.password, name: input.name });
  if (signUp.error) throw signUp.error;

  const signIn2 = await c.auth.signInWithPassword({ email, password: input.password });
  if (signIn2.error) {
    throw new Error(
      `Created user ${email} but cannot sign in yet. Email verification may be enabled. Disable verification for demo, then try again.`
    );
  }

  const session = await c.auth.getCurrentSession();
  const userId = session.data.session?.user?.id;
  if (!userId) throw new Error(`Could not get session for ${email}.`);
  return { client: c, userId };
}

async function createCompanyWithAdmin(input: {
  adminClient: any;
  adminUserId: string;
  name: string;
  license_type: 'starter_6m' | 'professional_12m' | 'enterprise_custom';
  employee_limit: number;
  metadata?: Record<string, unknown>;
}) {
  const { data, error } = await input.adminClient.database
    .from('companies')
    .insert({
      name: input.name,
      license_type: input.license_type,
      employee_limit: input.employee_limit,
      primary_admin_user_id: input.adminUserId,
      metadata: input.metadata ?? null
    })
    .select('*')
    .single();
  if (error) throw error;

  // Add admin membership (RLS requires membership insert policy; schema includes it)
  const { error: mErr } = await input.adminClient.database.from('company_memberships').insert({
    company_id: data.id,
    user_id: input.adminUserId,
    role: 'admin'
  });
  if (mErr) throw mErr;

  return data;
}

async function addMembership(input: { adminClient: any; companyId: string; userId: string; role: 'consultant' | 'employee' }) {
  const { error } = await input.adminClient.database.from('company_memberships').insert({
    company_id: input.companyId,
    user_id: input.userId,
    role: input.role
  });
  if (error) throw error;
}

async function seedIncidentsAndTasks(input: { adminClient: any; companyId: string; adminUserId: string }) {
  await input.adminClient.database.from('incidents').insert([
    {
      company_id: input.companyId,
      module: 'safety',
      category: 'Near Miss',
      subcategory: 'Slip / Trip / Fall',
      title: 'Near miss: slip at loading bay',
      description: 'Employee slipped on wet surface. No injury. Housekeeping improved.',
      severity: 'medium',
      status: 'open',
      occurred_at: new Date().toISOString(),
      location: 'Loading Bay',
      assignee_user_id: null,
      created_by_user_id: input.adminUserId
    }
  ]);

  await input.adminClient.database.from('tasks').insert([
    {
      company_id: input.companyId,
      module: 'safety',
      title: 'Conduct weekly safety inspection',
      description: 'Complete checklist and upload evidence photos.',
      priority: 'high',
      status: 'pending',
      due_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      assignee_user_id: null,
      created_by_user_id: input.adminUserId
    }
  ]);

  // Seed a few NCRs for demo: high-risk, overdue, and repeat finding
  const today = new Date();
  const pastDate = new Date(today.getTime() - 10 * 24 * 3600 * 1000);
  const futureDate = new Date(today.getTime() + 10 * 24 * 3600 * 1000);

  await input.adminClient.database.from('quality_ncrs').insert([
    {
      company_id: input.companyId,
      module: 'quality',
      nc_number: `NCR-${today.getFullYear()}-${String(Date.now()).slice(-6)}`,
      title: 'High-risk non-conformance: missing critical guard on machine',
      description: 'Guard removed from moving parts on production line. Immediate risk of serious injury.',
      occurrence_date: today.toISOString(),
      location: 'Production Line 1',
      severity: 'critical',
      status: 'open',
      risk_classification: 'Critical',
      risk_rating: 'critical',
      corrective_action_due_date: futureDate.toISOString(),
      created_by_user_id: input.adminUserId
    },
    {
      company_id: input.companyId,
      module: 'quality',
      nc_number: `NCR-${today.getFullYear()}-${String(Date.now() + 1).slice(-6)}`,
      title: 'Overdue NCR: calibration records not maintained',
      description: 'Equipment calibration records are missing for the past 6 months.',
      occurrence_date: pastDate.toISOString(),
      location: 'Maintenance Workshop',
      severity: 'high',
      status: 'overdue',
      risk_classification: 'High',
      risk_rating: 'high',
      corrective_action_due_date: pastDate.toISOString(),
      created_by_user_id: input.adminUserId
    },
    {
      company_id: input.companyId,
      module: 'quality',
      nc_number: `NCR-${today.getFullYear()}-${String(Date.now() + 2).slice(-6)}`,
      title: 'Repeat finding: incomplete document control',
      description: 'Procedures not updated after process change. Similar NCR was raised last quarter.',
      occurrence_date: today.toISOString(),
      location: 'Head Office',
      severity: 'medium',
      status: 'open',
      risk_classification: 'Medium',
      risk_rating: 'medium',
      repeat_finding: true,
      created_by_user_id: input.adminUserId
    }
  ]);
}

async function seedAuditDemo(input: { adminClient: any; companyId: string; adminUserId: string; consultantUserId: string; employeeUserId: string }) {
  const proposedDates = [
    new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() + 14 * 24 * 3600 * 1000).toISOString(),
    new Date(Date.now() + 21 * 24 * 3600 * 1000).toISOString()
  ];
  const auditNumber = `AUDIT-${new Date().getFullYear()}${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(Math.floor(Math.random() * 10000)).padStart(4, '0')}`;
  const { data: audit, error: auditErr } = await input.adminClient.database
    .from('audits')
    .insert({
      company_id: input.companyId,
      module: 'safety',
      audit_number: auditNumber,
      title: 'Q1 2026 Safety Management System Internal Audit',
      objectives: 'Verify ISO 45001 implementation and legal compliance.',
      audit_type: 'internal',
      audit_criteria: 'ISO 45001:2018, OHS Act, internal procedures',
      scope_of_audit: 'Operations at Site A, maintenance workshop',
      location: 'Site A',
      status: 'draft',
      date_approval_status: 'pending',
      proposed_dates: proposedDates,
      required_document_list: [
        { key: 'doc-0', label: 'Training records' },
        { key: 'doc-1', label: 'Risk assessments' }
      ],
      document_submission_deadline: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      auditor_user_ids: [input.adminUserId, input.consultantUserId],
      departments_auditee_ids: [input.employeeUserId],
      findings_count: 0,
      nonconformances_count: 0,
      observations_count: 0,
      related_ncr_ids: [],
      created_by_user_id: input.adminUserId
    })
    .select('*')
    .single();
  if (auditErr) throw auditErr;
  if (!audit) throw new Error('Failed to create seed audit.');

  await input.adminClient.database.from('audit_questions').insert([
    {
      company_id: input.companyId,
      audit_id: audit.id,
      section: 'Safety leadership',
      question: 'Is there evidence of management commitment to safety?',
      expected_evidence: 'Minutes, policy statements, resource allocation',
      question_order: 1,
      allocated_score: 10,
      created_by_user_id: input.adminUserId
    },
    {
      company_id: input.companyId,
      audit_id: audit.id,
      section: 'Risk assessment',
      question: 'Are risk assessments up to date and reviewed?',
      expected_evidence: 'Risk register, review dates',
      question_order: 2,
      allocated_score: 10,
      created_by_user_id: input.adminUserId
    },
    {
      company_id: input.companyId,
      audit_id: audit.id,
      section: 'Training',
      question: 'Are training records maintained and current?',
      expected_evidence: 'Training matrix, certificates',
      question_order: 3,
      allocated_score: 10,
      created_by_user_id: input.adminUserId
    }
  ]);
}

async function seedPpeDemo(input: {
  adminClient: any;
  companyId: string;
  adminUserId: string;
}) {
  const { adminClient, companyId, adminUserId } = input;
  const now = new Date().toISOString();
  const today = now.slice(0, 10);

  const { data: sites, error: sitesErr } = await adminClient.database
    .from('sites')
    .select('id')
    .eq('company_id', companyId)
    .limit(2);
  let site1 = sites?.[0]?.id;
  let site2 = sites?.[1]?.id;
  if (sitesErr || !site1) {
    const { data: insSite } = await adminClient.database.from('sites').insert([
      { company_id: companyId, name: 'Site Alpha', address: '123 Main Rd', is_active: true, created_by_user_id: adminUserId },
      { company_id: companyId, name: 'Site Beta', address: '456 Industrial Ave', is_active: true, created_by_user_id: adminUserId }
    ]).select('id');
    site1 = insSite?.[0]?.id;
    site2 = insSite?.[1]?.id;
  }
  if (!site2 && sites?.[1]) site2 = sites[1].id;

  const { data: depts, error: deptsErr } = await adminClient.database
    .from('departments')
    .select('id')
    .eq('company_id', companyId)
    .limit(2);
  let dept1 = depts?.[0]?.id;
  let dept2 = depts?.[1]?.id;
  if (deptsErr || !dept1) {
    const { data: insDept } = await adminClient.database.from('departments').insert([
      { company_id: companyId, site_id: site1, name: 'Operations', is_active: true, created_by_user_id: adminUserId },
      { company_id: companyId, site_id: site1, name: 'Maintenance', is_active: true, created_by_user_id: adminUserId }
    ]).select('id');
    dept1 = insDept?.[0]?.id;
    dept2 = insDept?.[1]?.id;
  }
  if (!dept2 && depts?.[1]) dept2 = depts[1].id;

  const itemsPayload = [
    { company_id: companyId, name: 'Safety Helmet', category: 'Head', unit_cost: 180, description: 'EN 397', sizes_available: ['S', 'M', 'L'], supplier_name: 'Acme Safety', stock_location: 'Store A' },
    { company_id: companyId, name: 'Safety Boots', category: 'Foot', unit_cost: 450, description: 'S3', sizes_available: ['40', '42', '44', '46'], supplier_name: 'BootCo', stock_location: 'Store A' },
    { company_id: companyId, name: 'Safety Harness', category: 'Fall protection', unit_cost: 1200, description: 'Full body', sizes_available: ['M', 'L', 'XL'], supplier_name: 'HeightSafe', stock_location: 'Store B' },
    { company_id: companyId, name: 'Safety Glasses', category: 'Eye', unit_cost: 85, description: 'Anti-fog', sizes_available: ['One size'], supplier_name: 'Acme Safety', stock_location: 'Store A' },
    { company_id: companyId, name: 'Work Gloves', category: 'Hand', unit_cost: 65, description: 'Cut-resistant', sizes_available: ['S', 'M', 'L'], supplier_name: 'GloveCo', stock_location: 'Store A' }
  ];
  const { data: insertedItems, error: itemsError } = await adminClient.database.from('ppe_items').insert(itemsPayload).select('id,name,unit_cost');
  if (itemsError || !insertedItems?.length) throw new Error('Failed to seed PPE items');
  const itemIds = insertedItems.map((r: { id: string }) => r.id);
  const harnessItem = insertedItems.find((r: { name: string }) => r.name === 'Safety Harness');
  const harnessId = harnessItem?.id ?? itemIds[2];

  for (let i = 0; i < itemIds.length; i++) {
    await adminClient.database.from('ppe_stock').insert({
      company_id: companyId,
      site_id: site1,
      department_id: i % 2 === 0 ? dept1 : dept2,
      ppe_item_id: itemIds[i],
      on_hand_qty: 50,
      reserved_qty: 0,
      reorder_level: 10,
      reorder_qty: 20,
      is_active: true,
      created_by_user_id: adminUserId,
      updated_by_user_id: adminUserId,
      captured_by_user_id: adminUserId,
      captured_by_name: 'Demo Admin',
      date_ordered: today,
      date_stock_received: today
    });
  }

  const reasons = ['New Issue', 'Replacement (Torn)', 'Replacement (Lost)', 'Replacement (Expired)', 'Damage'];
  const issues: any[] = [];
  for (let i = 0; i < 20; i++) {
    const itemIdx = i < 8 ? 2 : i % 5;
    const itemId = itemIds[itemIdx];
    const itemRow = insertedItems[itemIdx];
    const unitCost = itemRow?.unit_cost ?? 100;
    const qty = i % 3 === 0 ? 2 : 1;
    const totalCost = unitCost * qty;
    issues.push({
      company_id: companyId,
      ppe_item_id: itemId,
      issued_to_user_id: null,
      issued_by_user_id: adminUserId,
      issued_at: now,
      issue_date: today,
      site_id: i % 2 === 0 ? site1 : site2,
      department_id: i % 2 === 0 ? dept1 : dept2,
      ppe_item_name: itemRow?.name ?? 'Item',
      ppe_category: itemsPayload[itemIdx]?.category ?? 'Other',
      size: 'M',
      quantity_issued: qty,
      reason_for_issue: reasons[i % reasons.length],
      issued_by_name: 'Demo Admin',
      unit_cost_at_issue: unitCost,
      total_cost_at_issue: totalCost
    });
  }
  const { error: issuesErr } = await adminClient.database.from('ppe_issues').insert(issues);
  if (issuesErr) throw new Error('Failed to seed PPE issues: ' + (issuesErr as Error).message);
}

export function SeedDemoPage() {
  const [token, setToken] = useState('');
  const [loading, setLoading] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const enabled = ENABLE_DEMO_SEED;
  const tokenConfigured = !!DEMO_SEED_TOKEN?.trim();
  const canRun = enabled && tokenConfigured && token.trim() === DEMO_SEED_TOKEN;

  if (!enabled) {
    return (
      <AuthShell title="Access Denied" subtitle="">
        <div className="bg-critical-50 border border-critical/20 rounded-xl p-6 text-center">
          <h3 className="text-lg font-semibold text-critical mb-2">Demo Seeding Disabled</h3>
          <p className="text-charcoal-600">Demo seeding is disabled in production. Set VITE_ENABLE_DEMO_SEED=true to enable.</p>
        </div>
      </AuthShell>
    );
  }

  async function runSeed() {
    setError(null);
    setSuccess(null);
    setLog([]);

    try {
      setLoading(true);

      const created: Record<string, { email: string; userId: string; client: any }> = {};

      setLog((l) => [...l, 'Creating/validating users…']);
      for (const a of SEED_ACCOUNTS) {
        const { client: c, userId } = await ensureUser({ email: a.email, password: a.password, name: a.name });
        created[a.label] = { email: a.email, userId, client: c };
        setLog((l) => [...l, `- OK ${a.label}: ${a.email} (${userId})`]);
      }

      setLog((l) => [...l, 'Creating companies…']);
      const companyA = await createCompanyWithAdmin({
        adminClient: created['Company A Admin'].client,
        adminUserId: created['Company A Admin'].userId,
        name: 'Khanyisa Construction (Pty) Ltd',
        license_type: 'starter_6m',
        employee_limit: 4,
        metadata: { province: 'Gauteng', industry: 'Construction', contact_phone: '072 123 4567' }
      });
      setLog((l) => [...l, `- OK Company A: ${companyA.id}`]);

      const companyB = await createCompanyWithAdmin({
        adminClient: created['Company B Admin'].client,
        adminUserId: created['Company B Admin'].userId,
        name: 'Umzansi Logistics (Pty) Ltd',
        license_type: 'professional_12m',
        employee_limit: 20,
        metadata: { province: 'KwaZulu-Natal', industry: 'Logistics & Transport', contact_phone: '073 456 7890' }
      });
      setLog((l) => [...l, `- OK Company B: ${companyB.id}`]);

      setLog((l) => [...l, 'Adding memberships…']);
      await addMembership({
        adminClient: created['Company A Admin'].client,
        companyId: companyA.id,
        userId: created['Company A Consultant'].userId,
        role: 'consultant'
      });
      await addMembership({
        adminClient: created['Company A Admin'].client,
        companyId: companyA.id,
        userId: created['Company A Employee'].userId,
        role: 'employee'
      });
      await addMembership({
        adminClient: created['Company B Admin'].client,
        companyId: companyB.id,
        userId: created['Company B Consultant'].userId,
        role: 'consultant'
      });
      await addMembership({
        adminClient: created['Company B Admin'].client,
        companyId: companyB.id,
        userId: created['Company B Employee'].userId,
        role: 'employee'
      });
      setLog((l) => [...l, '- OK memberships']);

      setLog((l) => [...l, 'Seeding incidents + tasks…']);
      await seedIncidentsAndTasks({
        adminClient: created['Company A Admin'].client,
        companyId: companyA.id,
        adminUserId: created['Company A Admin'].userId
      });
      await seedIncidentsAndTasks({
        adminClient: created['Company B Admin'].client,
        companyId: companyB.id,
        adminUserId: created['Company B Admin'].userId
      });
      setLog((l) => [...l, '- OK seeded records']);

      setLog((l) => [...l, 'Seeding audit demo…']);
      await seedAuditDemo({
        adminClient: created['Company A Admin'].client,
        companyId: companyA.id,
        adminUserId: created['Company A Admin'].userId,
        consultantUserId: created['Company A Consultant'].userId,
        employeeUserId: created['Company A Employee'].userId
      });
      setLog((l) => [...l, '- OK sample audit with checklist']);

      setLog((l) => [...l, 'Seeding PPE demo (5 items, 20 issues, 2 depts)…']);
      await seedPpeDemo({
        adminClient: created['Company A Admin'].client,
        companyId: companyA.id,
        adminUserId: created['Company A Admin'].userId
      });
      setLog((l) => [...l, '- OK PPE items, stock, and issue register']);

      setLog((l) => [
        ...l,
        '',
        'Super Admin note:',
        `Insert this user id into platform_admins to enable /super-admin: ${created['Super Admin'].userId}`
      ]);

      setSuccess('Demo seed completed. You can now sign in with the demo accounts.');
    } catch (e) {
      setError(formatAuthError(e));
    } finally {
      setLoading(false);
    }
  }

  if (!enabled) {
    return (
      <AuthShell title="Demo seeding disabled" subtitle="This page is disabled on this deployment.">
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <p className="text-sm text-charcoal-500">
            To enable, set `VITE_ENABLE_DEMO_SEED=true` and `VITE_DEMO_SEED_TOKEN` in Vercel environment variables, then redeploy.
          </p>
        </div>
      </AuthShell>
    );
  }

  if (!tokenConfigured) {
    return (
      <AuthShell title="Demo seeding not configured" subtitle="Missing required environment variables.">
        <div className="bg-white rounded-xl border border-surface-300 p-4">
          <p className="text-sm text-charcoal-500">
            Set `VITE_DEMO_SEED_TOKEN` in Vercel and redeploy. Keep it private.
          </p>
        </div>
      </AuthShell>
    );
  }

  return (
    <>
      <LoadingOverlay show={loading} title="Seeding demo data…" message="Creating accounts, companies, and sample records." />
      <AuthShell title="Seed demo accounts" subtitle="Create demo companies and users for testing (one-time).">
      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-charcoal mb-1.5">Seed token</label>
          <input
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Enter your private seed token"
            className="w-full px-4 py-2.5 bg-white border border-surface-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-teal focus:border-transparent"
          />
          <p className="text-xs text-charcoal-400 mt-1">This token is required to prevent public seeding.</p>
        </div>

        <div className="bg-surface-50 border border-surface-200 rounded-xl p-4">
          <p className="text-sm font-semibold text-charcoal">Accounts that will be created</p>
          <ul className="mt-2 space-y-1 text-sm text-charcoal-600">
            {SEED_ACCOUNTS.map((a) => (
              <li key={a.email}>
                <span className="font-semibold">{a.label}</span> — {a.email}
              </li>
            ))}
          </ul>
          <p className="text-xs text-charcoal-400 mt-2">Password for all: SafeCloud@123</p>
        </div>

        {error && (
          <div className="bg-critical-50 border border-critical/20 rounded-lg p-3">
            <p className="text-sm font-semibold text-critical">Seed failed</p>
            <p className="text-sm text-charcoal-600 mt-1">{error}</p>
          </div>
        )}

        {success && (
          <div className="bg-success-50 border border-success/20 rounded-lg p-3">
            <p className="text-sm font-semibold text-success">Done</p>
            <p className="text-sm text-charcoal-600 mt-1">{success}</p>
          </div>
        )}

        <button
          type="button"
          disabled={!canRun || loading}
          onClick={runSeed}
          className="w-full flex items-center justify-center gap-2 px-5 py-2.5 bg-teal text-white rounded-lg text-sm font-semibold hover:bg-teal-600 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
        >
          {loading && <LoadingSpinner />}
          {loading ? 'Seeding…' : 'Seed demo accounts now'}
        </button>

        {log.length > 0 && (
          <div className="bg-white rounded-xl border border-surface-300 p-4">
            <p className="text-sm font-semibold text-charcoal">Progress</p>
            <pre className="mt-2 text-xs text-charcoal-600 whitespace-pre-wrap">{log.join('\n')}</pre>
          </div>
        )}
      </div>
      </AuthShell>
    </>
  );
}
