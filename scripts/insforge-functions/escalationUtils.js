/**
 * Shared escalation helpers for InsForge Edge Functions.
 *
 * NOTE: This file is used from cronOverdueEscalations and other scheduled jobs.
 * It assumes `createClient` is available in the Edge Function runtime.
 */

function createInternalClient() {
  const baseUrl = Deno.env.get('INSFORGE_INTERNAL_URL') || 'http://insforge:7130';
  const serviceKey = Deno.env.get('SERVICE_ROLE_KEY') || Deno.env.get('ANON_KEY');

  if (!serviceKey) {
    throw new Error('SERVICE_ROLE_KEY (or ANON_KEY) is required for internal cron jobs');
  }

  return createClient({
    baseUrl,
    anonKey: serviceKey
  });
}

async function getUserSettings(client, companyId, userId) {
  const { data, error } = await client.database
    .from('user_settings')
    .select('email_notifications_enabled, inapp_notifications_enabled')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to load user_settings', companyId, userId, error);
    return { email_notifications_enabled: true, inapp_notifications_enabled: true };
  }

  if (!data) {
    return { email_notifications_enabled: true, inapp_notifications_enabled: true };
  }

  return {
    email_notifications_enabled:
      (data.email_notifications_enabled === null || typeof data.email_notifications_enabled === 'undefined')
        ? true
        : !!data.email_notifications_enabled,
    inapp_notifications_enabled:
      (data.inapp_notifications_enabled === null || typeof data.inapp_notifications_enabled === 'undefined')
        ? true
        : !!data.inapp_notifications_enabled
  };
}

async function getUserProfileEmail(client, companyId, userId) {
  const { data, error } = await client.database
    .from('user_profiles')
    .select('email')
    .eq('company_id', companyId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    console.warn('Failed to load user profile for email', companyId, userId, error);
    return null;
  }

  return (data && data.email) || null;
}

/**
 * Build a simple escalation chain:
 *  - primary: the directly responsible user (e.g. owner/assignee)
 *  - managers: company managers/supervisors
 *  - admins: company admins
 */
async function buildEscalationChain(client, companyId, primaryUserId) {
  const primary = primaryUserId ? [primaryUserId] : [];

  const { data: memberships, error } = await client.database
    .from('company_memberships')
    .select('user_id, role')
    .eq('company_id', companyId);

  if (error) {
    console.warn('Failed to load company_memberships for escalation', companyId, error);
    return {
      primary,
      managers: [],
      admins: []
    };
  }

  const managers = [];
  const admins = [];

  for (const row of memberships || []) {
    if (row.role === 'manager' || row.role === 'supervisor') {
      managers.push(row.user_id);
    } else if (row.role === 'admin') {
      admins.push(row.user_id);
    }
  }

  return {
    primary,
    managers,
    admins
  };
}

module.exports = {
  createInternalClient,
  buildEscalationChain,
  getUserSettings,
  getUserProfileEmail
};

