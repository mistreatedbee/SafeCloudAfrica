// Reminds the responsible person for overdue/upcoming PPE corrective actions and
// Safety Objectives that they still have an incomplete item. Reuses the app's
// existing in-app notification infrastructure (notifications + notification_events,
// the same tables createNotification()/notifyRelevantUsers() write to -- see
// src/api/services/notificationsService.ts and notificationEventsService.ts) rather
// than introducing a new notification mechanism.
//
// Those service functions use the browser-authenticated `insforge` client (a signed-in
// user's session token), which doesn't exist in this server/cron context, so this
// handler writes to the same two tables directly through the service-role client
// (getServiceInsforge(), the same one generate-monthly-report.ts uses) instead of
// calling them. The row shapes are kept identical on purpose.
//
// Dedup: notification_events has a unique constraint on
// (company_id, recipient_user_id, channel, event_key). Each event_key is bucketed by
// day (`...:${YYYY-MM-DD}`), so re-running this cron the same day is a no-op for
// items already reminded today, and a genuinely still-incomplete item gets reminded
// again on each subsequent day it stays open -- satisfying "remind while still
// incomplete" without a separate reminder-tracking table.
//
// Configuration mirrors generate-monthly-report.ts: CRON_COMPANY_IDS (comma-separated)
// selects which companies to scan. If unset, nothing is processed (fails safe rather
// than scanning unknown companies).

import { readBearerToken, getServiceInsforge } from '../_insforge.js';
import { applyNoStoreHeaders } from '../_response.js';
import { logStructuredLine } from '../_observability.js';

const MODULE = 'api.cron.responsible-person-reminders';
const UPCOMING_WITHIN_DAYS = 3;

function authorizeCron(req: any): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const bearer = readBearerToken(req);
  if (bearer && bearer === secret) return true;
  const q = String(req.query?.secret ?? '');
  if (q && q === secret) return true;
  return false;
}

function todayStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

type ReminderItem = {
  id: string;
  responsibleUserId: string;
  title: string;
  message: string;
  severity: 'critical' | 'high' | 'medium';
  eventKeyPrefix: string;
  actionUrl: string;
};

async function collectPpeReminders(insforge: ReturnType<typeof getServiceInsforge>, companyId: string, todayIso: string, cutoffIso: string): Promise<ReminderItem[]> {
  if (!insforge) return [];
  const { data, error } = await insforge.database
    .from('ppe_issue_tracker')
    .select('id, responsible_user_id, target_completion_date, ppe_type, status')
    .eq('company_id', companyId)
    .eq('corrective_action_required', true)
    .neq('status', 'closed')
    .not('responsible_user_id', 'is', null)
    .not('target_completion_date', 'is', null)
    .lte('target_completion_date', cutoffIso);
  if (error) {
    logStructuredLine({ module: MODULE, level: 'error', message: 'Failed to query ppe_issue_tracker', extra: { companyId, error: String(error) } });
    return [];
  }
  return ((data ?? []) as any[]).map((row) => {
    const overdue = row.target_completion_date < todayIso;
    return {
      id: row.id,
      responsibleUserId: row.responsible_user_id,
      title: overdue ? 'Overdue PPE corrective action' : 'PPE corrective action due soon',
      message: `Corrective action for PPE issue (${row.ppe_type ?? 'PPE'}) is ${overdue ? 'overdue' : 'due soon'} -- target date ${row.target_completion_date}.`,
      severity: overdue ? 'critical' : 'high',
      eventKeyPrefix: `ppe-corrective:${row.id}`,
      actionUrl: '/dashboard/operations/ppe'
    } satisfies ReminderItem;
  });
}

async function collectObjectiveReminders(insforge: ReturnType<typeof getServiceInsforge>, companyId: string, todayIso: string, cutoffIso: string): Promise<ReminderItem[]> {
  if (!insforge) return [];
  const { data, error } = await insforge.database
    .from('module_targets')
    .select('id, responsible_user_id, target_date, name, status')
    .eq('company_id', companyId)
    .in('status', ['not_started', 'in_progress'])
    .not('responsible_user_id', 'is', null)
    .not('target_date', 'is', null)
    .lte('target_date', cutoffIso);
  if (error) {
    logStructuredLine({ module: MODULE, level: 'error', message: 'Failed to query module_targets', extra: { companyId, error: String(error) } });
    return [];
  }
  return ((data ?? []) as any[]).map((row) => {
    const overdue = row.target_date < todayIso;
    return {
      id: row.id,
      responsibleUserId: row.responsible_user_id,
      title: overdue ? 'Overdue objective' : 'Objective due soon',
      message: `Objective "${row.name}" is ${overdue ? 'overdue' : 'due soon'} -- target date ${row.target_date}.`,
      severity: overdue ? 'critical' : 'high',
      eventKeyPrefix: `objective:${row.id}`,
      actionUrl: '/dashboard/management/objectives-targets'
    } satisfies ReminderItem;
  });
}

async function sendReminder(insforge: NonNullable<ReturnType<typeof getServiceInsforge>>, companyId: string, item: ReminderItem, day: string): Promise<'sent' | 'duplicate' | 'failed'> {
  const eventKey = `${item.eventKeyPrefix}:${day}`;

  const { error: eventError } = await insforge.database.from('notification_events').insert({
    company_id: companyId,
    recipient_user_id: item.responsibleUserId,
    channel: 'in_app',
    event_key: eventKey,
    event_type: 'responsible_person_reminder',
    title: item.title,
    message: item.message,
    metadata: { actionUrl: item.actionUrl },
    status: 'queued'
  });
  if (eventError) {
    const text = String(eventError).toLowerCase();
    if (text.includes('duplicate') || text.includes('unique') || text.includes('23505')) return 'duplicate';
    logStructuredLine({ module: MODULE, level: 'error', message: 'Failed to record notification event', extra: { companyId, eventKey, error: String(eventError) } });
    return 'failed';
  }

  const { error: notifyError } = await insforge.database.from('notifications').insert({
    company_id: companyId,
    user_id: item.responsibleUserId,
    title: item.title,
    message: item.message,
    severity: item.severity,
    read_at: null,
    metadata: { actionUrl: item.actionUrl, eventKey }
  });
  if (notifyError) {
    logStructuredLine({ module: MODULE, level: 'error', message: 'Failed to create in-app notification', extra: { companyId, eventKey, error: String(notifyError) } });
    return 'failed';
  }
  return 'sent';
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  if (!authorizeCron(req)) {
    logStructuredLine({ module: MODULE, level: 'warn', message: 'Unauthorized request' });
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }

  const insforge = getServiceInsforge();
  if (!insforge) {
    logStructuredLine({ module: MODULE, level: 'error', message: 'INSFORGE_SERVICE_ROLE_KEY not configured' });
    return res.status(200).json({ ok: true, processed: 0, skipped: 'service_role_key_not_configured' });
  }

  const companyIds = (process.env.CRON_COMPANY_IDS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (companyIds.length === 0) {
    return res.status(200).json({ ok: true, processed: 0, skipped: 'no_companies_configured' });
  }

  const todayIso = todayStamp();
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() + UPCOMING_WITHIN_DAYS);
  const cutoffIso = cutoff.toISOString().slice(0, 10);

  let sent = 0;
  let duplicate = 0;
  let failed = 0;

  for (const companyId of companyIds) {
    try {
      const [ppeItems, objectiveItems] = await Promise.all([
        collectPpeReminders(insforge, companyId, todayIso, cutoffIso),
        collectObjectiveReminders(insforge, companyId, todayIso, cutoffIso)
      ]);
      for (const item of [...ppeItems, ...objectiveItems]) {
        const outcome = await sendReminder(insforge, companyId, item, todayIso);
        if (outcome === 'sent') sent++;
        else if (outcome === 'duplicate') duplicate++;
        else failed++;
      }
    } catch (err) {
      failed++;
      logStructuredLine({ module: MODULE, level: 'error', message: 'Unhandled error processing company', extra: { companyId, error: err instanceof Error ? err.message : String(err) } });
    }
  }

  logStructuredLine({ module: MODULE, level: 'info', message: 'Reminder run complete', extra: { sent, duplicate, failed, companies: companyIds.length } });
  return res.status(200).json({ ok: true, sent, duplicate, failed });
}
