/**
 * InsForge Edge Function: cronOverdueEscalations
 * Scheduled job: overdue CAPA, overdue NCR, missing pre-audit docs. Escalate to management.
 */
const { createInternalClient, buildEscalationChain, getUserSettings, getUserProfileEmail } = require('./escalationUtils');

module.exports = async function (request) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  };

  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: cors });
  }

  try {
    const client = createInternalClient();
    const nowIso = new Date().toISOString();

    const summary = {
      corrective_actions: 0,
      quality_ncrs: 0
    };

    // Overdue corrective actions: due_at < now AND status != 'closed'
    const { data: actions, error: actionsError } = await client.database
      .from('corrective_actions')
      .select('*')
      .lt('due_at', nowIso)
      .neq('status', 'closed');

    if (actionsError) {
      console.error('cronOverdueEscalations: failed to load corrective_actions', actionsError);
    } else {
      for (const action of actions || []) {
        await handleCorrectiveActionEscalation(client, action);
        summary.corrective_actions += 1;
      }
    }

    // Overdue NCRs: corrective_action_due_date < now AND status NOT IN ('closed')
    const { data: ncrs, error: ncrError } = await client.database
      .from('quality_ncrs')
      .select('*')
      .lt('corrective_action_due_date', nowIso)
      .neq('status', 'closed');

    if (ncrError) {
      console.error('cronOverdueEscalations: failed to load quality_ncrs', ncrError);
    } else {
      for (const ncr of ncrs || []) {
        // Mark status as overdue if not already
        if (ncr.status !== 'overdue') {
          await client.database
            .from('quality_ncrs')
            .update({
              status: 'overdue',
              updated_at: nowIso
            })
            .eq('id', ncr.id);
        }

        await handleNcrEscalation(client, ncr);
        summary.quality_ncrs += 1;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ...summary,
        at: new Date().toISOString()
      }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    console.error('cronOverdueEscalations: unhandled error', e);
    return new Response(
      JSON.stringify({ error: String(e && e.message ? e.message : e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};

async function handleCorrectiveActionEscalation(client, action) {
  const companyId = action.company_id;
  const primaryUserId = action.owner_user_id;

  const chain = await buildEscalationChain(client, companyId, primaryUserId);
  const levels = [
    { name: 'primary', users: chain.primary, severity: 'high' },
    { name: 'managers', users: chain.managers, severity: 'high' },
    { name: 'admins', users: chain.admins, severity: 'critical' }
  ];

  for (const level of levels) {
    for (const userId of level.users) {
      const prefs = await getUserSettings(client, companyId, userId);

      if (prefs.inapp_notifications_enabled) {
        await createNotificationRow(
          client,
          companyId,
          userId,
          level.severity,
          'Overdue Corrective Action',
          `Corrective action "${action.title}" is overdue and requires escalation.`
        );
      }

      if (prefs.email_notifications_enabled) {
        const email = await getUserProfileEmail(client, companyId, userId);
        if (email) {
          await sendEmailNotification(client, {
            to: email,
            subject: 'Overdue Corrective Action',
            html: `<p>Corrective action "<strong>${escapeHtml(action.title)}</strong>" is overdue and requires your attention.</p>`
          });
        }
      }
    }
  }
}

async function handleNcrEscalation(client, ncr) {
  const companyId = ncr.company_id;
  const primaryUserId = ncr.department_manager_user_id || ncr.auditee_user_id;

  const chain = await buildEscalationChain(client, companyId, primaryUserId);
  const levels = [
    { name: 'primary', users: chain.primary, severity: 'high' },
    { name: 'managers', users: chain.managers, severity: 'high' },
    { name: 'admins', users: chain.admins, severity: 'critical' }
  ];

  for (const level of levels) {
    for (const userId of level.users) {
      const prefs = await getUserSettings(client, companyId, userId);

      if (prefs.inapp_notifications_enabled) {
        await createNotificationRow(
          client,
          companyId,
          userId,
          level.severity,
          'Overdue NCR Corrective Action',
          `NCR "${ncr.title}" has an overdue corrective action and requires escalation.`
        );
      }

      if (prefs.email_notifications_enabled) {
        const email = await getUserProfileEmail(client, companyId, userId);
        if (email) {
          await sendEmailNotification(client, {
            to: email,
            subject: 'Overdue NCR Corrective Action',
            html: `<p>NCR "<strong>${escapeHtml(ncr.title)}</strong>" has an overdue corrective action and requires your attention.</p>`
          });
        }
      }
    }
  }
}

async function createNotificationRow(client, companyId, userId, severity, title, message) {
  const { error } = await client.database
    .from('notifications')
    .insert({
      company_id: companyId,
      user_id: userId,
      title,
      message,
      severity,
      read_at: null
    });

  if (error) {
    console.error('Failed to insert notification', error);
  }
}

async function sendEmailNotification(client, payload) {
  try {
    const { data, error } = await client.functions.invoke('emailSend', {
      body: payload
    });
    if (error || (data && data.ok === false)) {
      console.error('Failed to send escalation email', error || data);
    }
  } catch (e) {
    console.error('Exception sending escalation email', e);
  }
}

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

