/**
 * Seed a single South African demo organisation with all roles (Owner, Admin, Manager, Supervisor, Employee, Auditor).
 * Respects tenant isolation: one company, one set of sample records.
 *
 * Prerequisites:
 * - Apply docs/phase2-schema.sql and docs/migrations/operating_model_roles_licensing.sql
 * - Set INSFORGE_BASE_URL and INSFORGE_ANON_KEY (or VITE_*)
 *
 * Usage (PowerShell):
 *   $env:INSFORGE_BASE_URL="https://your-project.insforge.app"
 *   $env:INSFORGE_ANON_KEY="your-anon-key"
 *   node scripts/seed-sa-single-org.mjs
 */

import { createClient } from '@insforge/sdk';

const INSFORGE_BASE_URL = process.env.INSFORGE_BASE_URL || process.env.VITE_INSFORGE_BASE_URL;
const INSFORGE_ANON_KEY = process.env.INSFORGE_ANON_KEY || process.env.VITE_INSFORGE_ANON_KEY;

if (!INSFORGE_BASE_URL) throw new Error('Missing INSFORGE_BASE_URL');
if (!INSFORGE_ANON_KEY) throw new Error('Missing INSFORGE_ANON_KEY');

function memoryStorage() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, v),
    removeItem: (k) => store.delete(k)
  };
}

function client() {
  return createClient({
    baseUrl: INSFORGE_BASE_URL,
    anonKey: INSFORGE_ANON_KEY,
    persistSession: true,
    autoRefreshToken: false,
    storage: memoryStorage()
  });
}

async function ensureUser({ email, password, name }) {
  const c = client();
  const signIn = await c.auth.signInWithPassword({ email, password });
  if (!signIn.error) {
    const session = await c.auth.getCurrentSession();
    return { client: c, user: session.data.session.user };
  }
  const signUp = await c.auth.signUp({ email, password, name });
  if (signUp.error) throw signUp.error;
  const signIn2 = await c.auth.signInWithPassword({ email, password });
  if (signIn2.error) throw new Error(`User ${email} created but cannot sign in (email verification?). Disable verification for demo.`);
  const session = await c.auth.getCurrentSession();
  return { client: c, user: session.data.session.user };
}

async function main() {
  const accounts = [
    { label: 'Owner', email: 'owner@mzanzisafety.co.za', password: 'SafeCloud@123', name: 'Sipho Nkosi', role: 'owner' },
    { label: 'Admin', email: 'admin@mzanzisafety.co.za', password: 'SafeCloud@123', name: 'Thandiwe Mthembu', role: 'admin' },
    { label: 'Manager', email: 'manager@mzanzisafety.co.za', password: 'SafeCloud@123', name: 'Bongani Dube', role: 'manager' },
    { label: 'Supervisor', email: 'supervisor@mzanzisafety.co.za', password: 'SafeCloud@123', name: 'Naledi Khumalo', role: 'supervisor' },
    { label: 'Employee', email: 'employee@mzanzisafety.co.za', password: 'SafeCloud@123', name: 'Lerato Sithole', role: 'employee' },
    { label: 'Auditor', email: 'auditor@mzanzisafety.co.za', password: 'SafeCloud@123', name: 'Mandla Vilakazi', role: 'auditor' }
  ];

  console.log('Creating / validating demo users…');
  const created = {};
  for (const a of accounts) {
    const { client: c, user } = await ensureUser({ email: a.email, password: a.password, name: a.name });
    created[a.label] = { ...a, userId: user.id, client: c };
    console.log(`- OK: ${a.label} (${a.email}) -> ${user.id}`);
  }

  const ownerClient = created['Owner'].client;
  const ownerUserId = created['Owner'].userId;
  const adminUserId = created['Admin'].userId;

  console.log('Creating company (Operating Model: base tier)…');
  const { data: company, error: companyError } = await ownerClient.database
    .from('companies')
    .insert({
      name: 'Mzanzi Safety (Pty) Ltd',
      license_type: 'base',
      employee_limit: 5,
      primary_admin_user_id: ownerUserId,
      subscription_duration_months: 12,
      metadata: { province: 'Gauteng', industry: 'Construction', contact_phone: '+27 11 234 5678' }
    })
    .select('*')
    .single();
  if (companyError) throw companyError;
  const companyId = company.id;
  console.log(`- OK: Company -> ${companyId}`);

  console.log('Adding memberships (Owner, Admin, Manager, Supervisor, Employee, Auditor)…');
  const roles = [
    { label: 'Owner', role: 'owner' },
    { label: 'Admin', role: 'admin' },
    { label: 'Manager', role: 'manager' },
    { label: 'Supervisor', role: 'supervisor' },
    { label: 'Employee', role: 'employee' },
    { label: 'Auditor', role: 'auditor' }
  ];
  for (const r of roles) {
    const { error: mErr } = await ownerClient.database.from('company_memberships').insert({
      company_id: companyId,
      user_id: created[r.label].userId,
      role: r.role
    });
    if (mErr) throw mErr;
  }
  console.log('- OK: memberships');

  console.log('Seeding sample incidents…');
  await ownerClient.database.from('incidents').insert([
    {
      company_id: companyId,
      module: 'safety',
      category: 'Injury',
      subcategory: 'First Aid Case',
      title: 'Site A: Minor cut during assembly',
      description: 'First aid applied. No lost time.',
      severity: 'low',
      status: 'closed',
      occurred_at: new Date().toISOString(),
      location: 'Assembly floor',
      created_by_user_id: adminUserId
    },
    {
      company_id: companyId,
      module: 'safety',
      category: 'Near Miss',
      subcategory: 'Other',
      title: 'Near miss: forklift and pedestrian',
      description: 'Pedestrian crossed without checking. Toolbox talk scheduled.',
      severity: 'medium',
      status: 'investigating',
      occurred_at: new Date().toISOString(),
      location: 'Warehouse',
      created_by_user_id: adminUserId
    }
  ]);
  console.log('- OK: incidents');

  console.log('Seeding sample tasks…');
  await ownerClient.database.from('tasks').insert([
    {
      company_id: companyId,
      module: 'safety',
      title: 'Complete monthly safety inspection',
      description: 'Use checklist and upload photos.',
      priority: 'high',
      status: 'in-progress',
      due_at: new Date(Date.now() + 5 * 24 * 3600 * 1000).toISOString(),
      created_by_user_id: adminUserId
    }
  ]);
  console.log('- OK: tasks');

  console.log('\nDone.');
  console.log('Demo login password for all accounts: SafeCloud@123');
  console.log('Org: Mzanzi Safety (Pty) Ltd — Owner, Admin, Manager, Supervisor, Employee, Auditor.');
  console.log('Add platform_admins row for Super Admin access (see docs/test-accounts.md).');
}

main().catch((e) => {
  console.error('Seed failed:', e?.message ?? e);
  process.exit(1);
});
