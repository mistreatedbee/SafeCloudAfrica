/**
 * Seed demo data for Safe Cloud Africa (Phase 2).
 *
 * This script creates:
 * - Demo users (super admin, admins, consultants, employees)
 * - Demo companies
 * - Memberships (admin/consultant/employee)
 * - A few tasks + incidents per company
 *
 * Requirements:
 * - You must have applied `docs/phase2-schema.sql` to your InsForge database.
 * - For easiest demo logins: disable email verification in InsForge auth settings, OR set it to "link" and use your mailbox.
 *
 * Usage (PowerShell):
 *   $env:INSFORGE_BASE_URL="https://your-project.insforge.app"
 *   $env:INSFORGE_ANON_KEY="your-anon-key"
 *   node scripts/seed-demo.mjs
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

  // Try sign-in first (user might already exist)
  const signIn = await c.auth.signInWithPassword({ email, password });
  if (!signIn.error) {
    const session = await c.auth.getCurrentSession();
    return { client: c, user: session.data.session.user };
  }

  const signUp = await c.auth.signUp({ email, password, name });
  if (signUp.error) throw signUp.error;

  const signIn2 = await c.auth.signInWithPassword({ email, password });
  if (signIn2.error) {
    throw new Error(
      `Created user ${email} but cannot sign in yet. Email verification may be enabled. Disable verification for demo, then rerun.`
    );
  }

  const session = await c.auth.getCurrentSession();
  return { client: c, user: session.data.session.user };
}

async function createCompanyWithAdmin({ adminClient, adminUserId, name, license_type, employee_limit, metadata }) {
  const { data, error } = await adminClient.database
    .from('companies')
    .insert({
      name,
      license_type,
      employee_limit,
      primary_admin_user_id: adminUserId,
      metadata: metadata ?? null
    })
    .select('*')
    .single();
  if (error) throw error;

  // Seed admin membership for the creator
  const { error: mErr } = await adminClient.database.from('company_memberships').insert({
    company_id: data.id,
    user_id: adminUserId,
    role: 'admin'
  });
  if (mErr) throw mErr;

  return data;
}

async function addMembership({ adminClient, companyId, userId, role }) {
  const { error } = await adminClient.database.from('company_memberships').insert({
    company_id: companyId,
    user_id: userId,
    role
  });
  if (error) throw error;
}

async function seedIncidentsAndTasks({ adminClient, companyId, adminUserId }) {
  await adminClient.database.from('incidents').insert([
    {
      company_id: companyId,
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
      created_by_user_id: adminUserId
    },
    {
      company_id: companyId,
      module: 'hr',
      category: 'Behavioural',
      subcategory: 'Unsafe act',
      title: 'Unsafe act observed during shift change',
      description: 'PPE not worn correctly. Coaching required.',
      severity: 'low',
      status: 'investigating',
      occurred_at: new Date().toISOString(),
      location: 'Workshop',
      assignee_user_id: null,
      created_by_user_id: adminUserId
    }
  ]);

  await adminClient.database.from('tasks').insert([
    {
      company_id: companyId,
      module: 'safety',
      title: 'Conduct weekly safety inspection',
      description: 'Complete checklist and upload evidence photos.',
      priority: 'high',
      status: 'pending',
      due_at: new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString(),
      assignee_user_id: null,
      created_by_user_id: adminUserId
    },
    {
      company_id: companyId,
      module: 'legal',
      title: 'Review legal register updates',
      description: 'Confirm relevant legislative changes are captured.',
      priority: 'medium',
      status: 'in-progress',
      due_at: new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString(),
      assignee_user_id: null,
      created_by_user_id: adminUserId
    }
  ]);
}

async function main() {
  const accounts = [
    { label: 'Super Admin', email: 'superadmin@safecloud.africa', password: 'SafeCloud@123', name: 'Ashley Mashigo' },
    { label: 'Company A Admin', email: 'admin@khanyisa.co.za', password: 'SafeCloud@123', name: 'Lerato Ndlovu' },
    { label: 'Company A Consultant', email: 'consultant@khanyisa.co.za', password: 'SafeCloud@123', name: 'Thabo Mokoena' },
    { label: 'Company A Employee', email: 'employee@khanyisa.co.za', password: 'SafeCloud@123', name: 'Nomsa Khumalo' },
    { label: 'Company B Admin', email: 'admin@umzansi.co.za', password: 'SafeCloud@123', name: 'Sipho Dlamini' },
    { label: 'Company B Consultant', email: 'consultant@umzansi.co.za', password: 'SafeCloud@123', name: 'Kabelo Tshego' },
    { label: 'Company B Employee', email: 'employee@umzansi.co.za', password: 'SafeCloud@123', name: 'Ayanda Zulu' }
  ];

  console.log('Creating / validating demo users…');
  const created = {};
  for (const a of accounts) {
    const { client: c, user } = await ensureUser({ email: a.email, password: a.password, name: a.name });
    created[a.label] = { ...a, userId: user.id, client: c };
    console.log(`- OK: ${a.label} (${a.email}) -> ${user.id}`);
  }

  console.log('Creating companies…');
  const companyA = await createCompanyWithAdmin({
    adminClient: created['Company A Admin'].client,
    adminUserId: created['Company A Admin'].userId,
    name: 'Khanyisa Construction (Pty) Ltd',
    license_type: 'starter_6m',
    employee_limit: 4,
    metadata: { province: 'Gauteng', industry: 'Construction', contact_phone: '072 123 4567' }
  });
  console.log(`- OK: Company A -> ${companyA.id}`);

  const companyB = await createCompanyWithAdmin({
    adminClient: created['Company B Admin'].client,
    adminUserId: created['Company B Admin'].userId,
    name: 'Umzansi Logistics (Pty) Ltd',
    license_type: 'professional_12m',
    employee_limit: 20,
    metadata: { province: 'KwaZulu-Natal', industry: 'Logistics & Transport', contact_phone: '073 456 7890' }
  });
  console.log(`- OK: Company B -> ${companyB.id}`);

  console.log('Adding memberships…');
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
  console.log('- OK: memberships');

  console.log('Seeding incidents + tasks…');
  await seedIncidentsAndTasks({ adminClient: created['Company A Admin'].client, companyId: companyA.id, adminUserId: created['Company A Admin'].userId });
  await seedIncidentsAndTasks({ adminClient: created['Company B Admin'].client, companyId: companyB.id, adminUserId: created['Company B Admin'].userId });
  console.log('- OK: seeded demo records');

  console.log('\nDone.');
  console.log('Demo login password for all accounts: SafeCloud@123');
  console.log('Note: Super Admin needs platform_admins row added manually (see docs/test-accounts.md).');
}

main().catch((e) => {
  console.error('Seed failed:', e?.message ?? e);
  process.exit(1);
});

