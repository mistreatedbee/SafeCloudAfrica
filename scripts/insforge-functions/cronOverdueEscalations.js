/**
 * InsForge Edge Function: cronOverdueEscalations
 * Scheduled job: reminder -> manager -> director escalation for incidents, NCRs, tasks, and audits.
 */
const {
  createInternalClient,
  buildEscalationChain,
  getUserSettings,
  getUserProfileEmail
} = require('./escalationUtils');

const EMAIL_API_URL =
  typeof process !== 'undefined' && process.env && process.env.EMAIL_API_URL
    ? process.env.EMAIL_API_URL
    : 'https://safe-cloud-africa.vercel.app/api/email/send';

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
    const now = new Date();
    const nowIso = now.toISOString();

    const summary = {
      incidents: 0,
      quality_ncrs: 0,
      tasks: 0,
      audits: 0
    };

    const overdueItems = await Promise.all([
      loadOverdueIncidents(client, nowIso),
      loadOverdueNcrs(client, nowIso),
      loadOverdueTasks(client, nowIso),
      loadOverdueAudits(client, nowIso)
    ]);

    for (const incident of overdueItems[0]) {
      await processEscalation(client, {
        entityType: 'incident',
        entityId: incident.id,
        companyId: incident.company_id,
        title: incident.title || `Incident ${incident.id}`,
        dueAt: incident.updated_at || incident.occurred_at,
        primaryUserId: incident.assignee_user_id || incident.created_by_user_id,
        metadata: {
          severity: incident.severity,
          status: incident.status
        }
      });
      summary.incidents += 1;
    }

    for (const ncr of overdueItems[1]) {
      if (ncr.status !== 'overdue') {
        await client.database
          .from('quality_ncrs')
          .update({ status: 'overdue', updated_at: nowIso })
          .eq('id', ncr.id);
      }

      await processEscalation(client, {
        entityType: 'quality_ncr',
        entityId: ncr.id,
        companyId: ncr.company_id,
        title: ncr.title || `NCR ${ncr.id}`,
        dueAt: ncr.corrective_action_due_date,
        primaryUserId: ncr.department_manager_user_id || ncr.auditee_user_id || ncr.created_by_user_id,
        metadata: {
          status: ncr.status
        }
      });
      summary.quality_ncrs += 1;
    }

    for (const task of overdueItems[2]) {
      if (task.status !== 'overdue') {
        await client.database
          .from('tasks')
          .update({ status: 'overdue', updated_at: nowIso })
          .eq('id', task.id);
      }

      await processEscalation(client, {
        entityType: 'task',
        entityId: task.id,
        companyId: task.company_id,
        title: task.title || `Task ${task.id}`,
        dueAt: task.due_at,
        primaryUserId: task.assignee_user_id || task.task_owner_user_id || task.created_by_user_id,
        metadata: {
          priority: task.priority,
          status: task.status
        }
      });
      summary.tasks += 1;
    }

    for (const audit of overdueItems[3]) {
      await processEscalation(client, {
        entityType: 'audit',
        entityId: audit.id,
        companyId: audit.company_id,
        title: audit.title || audit.objectives || `Audit ${audit.id}`,
        dueAt: audit.selected_date || (Array.isArray(audit.proposed_dates) ? audit.proposed_dates[0] : null),
        primaryUserId:
          audit.lead_auditor_user_id ||
          (Array.isArray(audit.auditor_user_ids) ? audit.auditor_user_ids[0] : null) ||
          audit.created_by_user_id,
        metadata: {
          status: audit.status,
          findings_count: audit.findings_count,
          nonconformances_count: audit.nonconformances_count
        }
      });
      summary.audits += 1;
    }

    return new Response(
      JSON.stringify({
        ok: true,
        ...summary,
        at: nowIso
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

async function loadOverdueIncidents(client, nowIso) {
  const { data, error } = await client.database
    .from('incidents')
    .select('id, company_id, title, severity, status, assignee_user_id, created_by_user_id, occurred_at, updated_at')
    .neq('status', 'closed')
    .lt('updated_at', nowIso);
  if (error) {
    console.error('cronOverdueEscalations: failed to load incidents', error);
    return [];
  }
  const staleCutoff = new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString();
  return (data || []).filter((incident) => String(incident.updated_at || incident.occurred_at || '') < staleCutoff);
}

async function loadOverdueNcrs(client, nowIso) {
  const { data, error } = await client.database
    .from('quality_ncrs')
    .select('*')
    .lt('corrective_action_due_date', nowIso)
    .neq('status', 'closed');
  if (error) {
    console.error('cronOverdueEscalations: failed to load quality_ncrs', error);
    return [];
  }
  return data || [];
}

async function loadOverdueTasks(client, nowIso) {
  const { data, error } = await client.database
    .from('tasks')
    .select('id, company_id, title, status, priority, due_at, assignee_user_id, task_owner_user_id, created_by_user_id')
    .not('status', 'in', '("approved","closed")')
    .lt('due_at', nowIso);
  if (error) {
    console.error('cronOverdueEscalations: failed to load tasks', error);
    return [];
  }
  return data || [];
}

async function loadOverdueAudits(client, nowIso) {
  const { data, error } = await client.database
    .from('audits')
    .select('id, company_id, title, objectives, status, selected_date, proposed_dates, findings_count, nonconformances_count, lead_auditor_user_id, auditor_user_ids, created_by_user_id')
    .not('status', 'in', '("completed","archived")');
  if (error) {
    console.error('cronOverdueEscalations: failed to load audits', error);
    return [];
  }

  return (data || []).filter((audit) => {
    const compareDate = audit.selected_date || (Array.isArray(audit.proposed_dates) ? audit.proposed_dates[0] : null);
    return compareDate && String(compareDate) < nowIso;
  });
}

async function processEscalation(client, item) {
  const policy = await getSlaPolicy(client, item.companyId, item.entityType);
  if (!policy || policy.enabled === false) return;

  const dueAt = item.dueAt ? new Date(item.dueAt) : null;
  if (!dueAt || Number.isNaN(dueAt.getTime())) return;

  const hoursOverdue = Math.max(0, Math.floor((Date.now() - dueAt.getTime()) / (1000 * 60 * 60)));
  const stages = [];
  if (hoursOverdue >= policy.reminder_after_hours) stages.push('reminder');
  if (hoursOverdue >= policy.manager_escalation_after_hours) stages.push('manager');
  if (hoursOverdue >= policy.director_escalation_after_hours) stages.push('director');

  for (const stage of stages) {
    const alreadySent = await escalationAlreadySent(client, item.companyId, item.entityType, item.entityId, stage);
    if (alreadySent) continue;
    await sendEscalationStage(client, item, stage, hoursOverdue);
  }
}

async function getSlaPolicy(client, companyId, entityType) {
  const { data, error } = await client.database
    .from('sla_policies')
    .select('*')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .maybeSingle();
  if (error) {
    console.error('Failed to load SLA policy', entityType, error);
    return {
      reminder_after_hours: 24,
      manager_escalation_after_hours: 48,
      director_escalation_after_hours: 72,
      enabled: true
    };
  }
  return (
    data || {
      reminder_after_hours: 24,
      manager_escalation_after_hours: 48,
      director_escalation_after_hours: 72,
      enabled: true
    }
  );
}

async function escalationAlreadySent(client, companyId, entityType, entityId, stage) {
  const { data, error } = await client.database
    .from('sla_escalation_events')
    .select('id')
    .eq('company_id', companyId)
    .eq('entity_type', entityType)
    .eq('entity_id', entityId)
    .eq('stage', stage)
    .limit(1);
  if (error) {
    console.error('Failed to check escalation history', error);
    return false;
  }
  return Array.isArray(data) && data.length > 0;
}

async function sendEscalationStage(client, item, stage, hoursOverdue) {
  const chain = await buildEscalationChain(client, item.companyId, item.primaryUserId);
  const recipients =
    stage === 'reminder' ? chain.primary :
    stage === 'manager' ? chain.managers :
    chain.admins;

  const recipientRows = [];
  for (const userId of recipients) {
    const prefs = await getUserSettings(client, item.companyId, userId);
    const email = await getUserProfileEmail(client, item.companyId, userId);
    const severity = stage === 'director' ? 'critical' : 'high';
    const title = `[${stage.toUpperCase()}] Overdue ${item.entityType.replace('_', ' ')}`;
    const message = `${item.title} is overdue by ${hoursOverdue} hour(s).`;

    if (prefs.inapp_notifications_enabled) {
      await createNotificationRow(client, item.companyId, userId, severity, title, message);
    }

    if (prefs.email_notifications_enabled && email) {
      await sendEmailNotification({
        to: email,
        subject: title,
        html: `<p>${escapeHtml(item.title)} is overdue by <strong>${hoursOverdue}</strong> hour(s).</p><p>Stage: ${escapeHtml(stage)}</p>`
      });
    }

    recipientRows.push({
      user_id: userId,
      email: email || null,
      stage
    });
  }

  const { error } = await client.database.from('sla_escalation_events').insert({
    company_id: item.companyId,
    entity_type: item.entityType,
    entity_id: item.entityId,
    stage,
    status: 'sent',
    recipients: recipientRows,
    payload: {
      title: item.title,
      due_at: item.dueAt,
      hours_overdue: hoursOverdue,
      metadata: item.metadata || {}
    }
  });

  if (error) {
    console.error('Failed to insert SLA escalation event', error);
  }
}

async function createNotificationRow(client, companyId, userId, severity, title, message) {
  const { error } = await client.database.from('notifications').insert({
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

async function sendEmailNotification(payload) {
  try {
    const response = await fetch(EMAIL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || (data && data.ok === false)) {
      console.error('Failed to send escalation email', data || response.statusText);
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
