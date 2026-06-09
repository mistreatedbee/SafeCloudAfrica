/**
 * InsForge Edge Function: cronGenerateMonthlyReports
 *
 * Runs on the 1st of each month at 06:00 UTC ("0 6 1 * *").
 * Loops all companies, resolves management emails, then calls the Vercel
 * /api/cron/generate-monthly-report endpoint to queue a monthly_compliance_reports
 * row for the previous calendar month.
 *
 * The sender (cronMonthlyComplianceReports, "0 7 1 * *") picks up the queued
 * rows one hour later and dispatches the emails.
 */

const APP_BASE_URL =
  typeof Deno !== 'undefined'
    ? (Deno.env.get('APP_BASE_URL') || 'https://safe-cloud-africa.vercel.app')
    : (process.env.APP_BASE_URL || 'https://safe-cloud-africa.vercel.app');

const CRON_SECRET =
  typeof Deno !== 'undefined'
    ? (Deno.env.get('CRON_SECRET') || '')
    : (process.env.CRON_SECRET || '');

const HEARTBEAT_URL = `${APP_BASE_URL}/api/cron/heartbeat`;

// Inline createInternalClient (edge functions are standalone — cannot require
// escalationUtils across all runtimes, so we mirror the pattern here).
function createInternalClient() {
  const createClient = (typeof Deno !== 'undefined')
    ? require('@insforge/sdk').createClient  // edge runtime
    : require('@insforge/sdk').createClient; // local/test

  const baseUrl =
    (typeof Deno !== 'undefined' ? Deno.env.get('INSFORGE_INTERNAL_URL') : process.env.INSFORGE_INTERNAL_URL)
    || 'http://insforge:7130';

  const serviceKey =
    (typeof Deno !== 'undefined'
      ? (Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('ANON_KEY'))
      : (process.env.SERVICE_ROLE_KEY || process.env.ANON_KEY));

  if (!serviceKey) throw new Error('SERVICE_ROLE_KEY (or ANON_KEY) is required');

  return createClient({ baseUrl, anonKey: serviceKey });
}

/** Return "YYYY-MM-01" for the first day of the previous calendar month. */
function previousMonthDate() {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

/** Fetch management emails (owner / admin / manager) for a company. */
async function getManagementEmails(client, companyId) {
  const { data: members, error: mErr } = await client.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId)
    .in('role', ['owner', 'admin', 'manager']);

  if (mErr || !members || members.length === 0) return [];

  const userIds = members.map((m) => m.user_id);

  const { data: profiles, error: pErr } = await client.database
    .from('user_profiles')
    .select('user_id, email')
    .eq('company_id', companyId)
    .in('user_id', userIds);

  if (pErr || !profiles) return [];

  // Respect email_notifications_enabled if set; default to enabled when absent.
  const { data: settings } = await client.database
    .from('user_settings')
    .select('user_id, email_notifications_enabled')
    .eq('company_id', companyId)
    .in('user_id', userIds);

  const settingsByUser = new Map((settings || []).map((s) => [s.user_id, s]));

  return profiles
    .filter((p) => {
      if (!p.email) return false;
      const s = settingsByUser.get(p.user_id);
      return !s || s.email_notifications_enabled !== false;
    })
    .map((p) => p.email)
    .filter(Boolean);
}

async function pingHeartbeat(status, message) {
  if (!CRON_SECRET) return;
  try {
    await fetch(`${HEARTBEAT_URL}?secret=${encodeURIComponent(CRON_SECRET)}&status=${status}&message=${encodeURIComponent(message || '')}`);
  } catch (_) {
    // heartbeat failure is non-fatal
  }
}

module.exports = async function (request) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const client = createInternalClient();
    const reportMonth = previousMonthDate();

    const { data: companies, error: cErr } = await client.database
      .from('companies')
      .select('id, name');

    if (cErr) throw cErr;

    let queued = 0;
    let failed = 0;

    for (const company of companies || []) {
      try {
        const recipientEmails = await getManagementEmails(client, company.id);

        const response = await fetch(`${APP_BASE_URL}/api/cron/generate-monthly-report`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${CRON_SECRET}`
          },
          body: JSON.stringify({ companyId: company.id, reportMonth, recipientEmails })
        });

        const payload = await response.json().catch(() => null);
        if (!response.ok || (payload && payload.ok === false)) {
          throw new Error((payload && payload.error) || response.statusText || 'Generate failed');
        }

        queued += 1;
        console.info(`[cronGenerateMonthlyReports] queued ${company.name || company.id} for ${reportMonth}`);
      } catch (e) {
        failed += 1;
        console.error(`[cronGenerateMonthlyReports] failed ${company.id}: ${e && e.message ? e.message : e}`);
      }
    }

    await pingHeartbeat('ok', `queued=${queued} failed=${failed}`);

    return new Response(
      JSON.stringify({ ok: true, reportMonth, queued, failed }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    const msg = String(e && e.message ? e.message : e);
    await pingHeartbeat('error', msg);
    return new Response(
      JSON.stringify({ ok: false, error: msg }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
