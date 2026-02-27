/**
 * InsForge Edge Function: cronReviewMeetingReminders
 * Scheduled job: next meeting reminders + review action due/overdue escalation.
 */
const { createInternalClient, getUserSettings, getUserProfileEmail, buildEscalationChain } = require('./escalationUtils');
const EMAIL_API_URL = (typeof process !== 'undefined' && process.env && process.env.EMAIL_API_URL)
  ? process.env.EMAIL_API_URL
  : 'https://safe-cloud-africa.vercel.app/api/email/send';

const OVERDUE_ADMIN_ESCALATION_DAYS = 3;

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

    const { data: meetings, error: meetingsError } = await client.database
      .from('review_meetings')
      .select('*')
      .in('status', ['DRAFT', 'ACTIVE', 'SIGNED'])
      .limit(1000);

    if (meetingsError) {
      throw new Error(`Failed to load review meetings: ${meetingsError.message}`);
    }

    let meetingReminders = 0;
    let itemReminders = 0;
    let overdueEscalations = 0;

    for (const meeting of meetings || []) {
      const { data: items } = await client.database
        .from('review_meeting_items')
        .select('*')
        .eq('company_id', meeting.company_id)
        .eq('meeting_id', meeting.id);

      if (meeting.next_meeting_date) {
        const days = daysBetween(now, new Date(meeting.next_meeting_date));
        const isMorningOf = days === 0 && now.getHours() < 12;
        if (days === 7 || days === 1 || isMorningOf) {
          const reminderType = isMorningOf ? 'meeting_0d_morning' : `meeting_${days}d`;
          const alreadySent = await wasReminderSent(client, meeting.company_id, meeting.id, null, reminderType);
          if (!alreadySent) {
            await notifyMeetingRecipients(client, {
              companyId: meeting.company_id,
              meeting,
              items: items || [],
              title: 'Upcoming Management Review Meeting',
              message: `Reminder: next management review meeting is on ${meeting.next_meeting_date}.`
            });
            await markReminderSent(client, meeting.company_id, meeting.id, null, reminderType);
            meetingReminders += 1;
          }
        }
      }

      for (const item of items || []) {
        if (!item.target_date || item.status === 'COMPLETED') continue;
        const days = daysBetween(now, new Date(item.target_date));

        if (days === 7 || days === 1) {
          const reminderType = `action_due_${days}d`;
          const alreadySent = await wasReminderSent(client, meeting.company_id, meeting.id, item.id, reminderType);
          if (!alreadySent) {
            await notifyMeetingRecipients(client, {
              companyId: meeting.company_id,
              meeting,
              items: [item],
              title: 'Review Action Reminder',
              message: `Action "${item.review_item}" is due on ${item.target_date}.`
            });
            await markReminderSent(client, meeting.company_id, meeting.id, item.id, reminderType);
            itemReminders += 1;
          }
        }

        if (days < 0) {
          const overdueDays = Math.abs(days);
          const reminderType = `action_overdue_${overdueDays}d`;
          const alreadySent = await wasReminderSent(client, meeting.company_id, meeting.id, item.id, reminderType);
          if (alreadySent) continue;

          const recipientIds = new Set();
          if (item.responsible_user_id) {
            recipientIds.add(item.responsible_user_id);
            const chain = await buildEscalationChain(client, meeting.company_id, item.responsible_user_id);
            (chain.managers || []).forEach((id) => recipientIds.add(id));
            if (overdueDays >= OVERDUE_ADMIN_ESCALATION_DAYS) {
              (chain.admins || []).forEach((id) => recipientIds.add(id));
            }
          }

          for (const userId of recipientIds) {
            await notifyUser(client, {
              companyId: meeting.company_id,
              userId,
              title: 'Overdue Review Action Escalation',
              severity: 'high',
              message: `Action "${item.review_item}" is overdue (target ${item.target_date}).`
            });
          }

          await notifyMeetingRecipients(client, {
            companyId: meeting.company_id,
            meeting,
            items: [item],
            title: 'Overdue Review Action',
            message: `Escalation: action "${item.review_item}" is overdue.`
          });
          await markReminderSent(client, meeting.company_id, meeting.id, item.id, reminderType);
          overdueEscalations += 1;
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, meetingReminders, itemReminders, overdueEscalations, at: new Date().toISOString() }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e?.message || e) }), {
      status: 500,
      headers: { ...cors, 'Content-Type': 'application/json' }
    });
  }
};

function daysBetween(from, to) {
  const a = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  const b = new Date(to.getFullYear(), to.getMonth(), to.getDate()).getTime();
  return Math.round((b - a) / (1000 * 60 * 60 * 24));
}

async function wasReminderSent(client, companyId, meetingId, meetingItemId, reminderType) {
  let q = client.database
    .from('review_meeting_reminder_events')
    .select('id')
    .eq('company_id', companyId)
    .eq('meeting_id', meetingId)
    .eq('reminder_type', reminderType);

  q = meetingItemId ? q.eq('meeting_item_id', meetingItemId) : q.is('meeting_item_id', null);
  const { data } = await q.maybeSingle();
  return !!data;
}

async function markReminderSent(client, companyId, meetingId, meetingItemId, reminderType) {
  await client.database.from('review_meeting_reminder_events').insert({
    company_id: companyId,
    meeting_id: meetingId,
    meeting_item_id: meetingItemId,
    reminder_type: reminderType
  });
}

async function notifyMeetingRecipients(client, { companyId, meeting, items, title, message }) {
  const recipientIds = new Set([...(meeting.attendee_user_ids || [])]);
  for (const item of items || []) {
    if (item.responsible_user_id) recipientIds.add(item.responsible_user_id);
  }

  for (const userId of recipientIds) {
    await notifyUser(client, { companyId, userId, title, severity: 'medium', message });
  }

  const emails = (meeting.email_list || []).map((v) => String(v).trim().toLowerCase()).filter(Boolean);
  if (emails.length) {
    await sendEmail(client, {
      to: emails,
      subject: title,
      html: `<p>${escapeHtml(message)}</p>`
    });
  }
}

async function notifyUser(client, { companyId, userId, title, severity, message }) {
  if (!userId) return;
  const prefs = await getUserSettings(client, companyId, userId);

  if (prefs.inapp_notifications_enabled) {
    await client.database.from('notifications').insert({
      company_id: companyId,
      user_id: userId,
      title,
      message,
      severity,
      read_at: null
    });
  }

  if (prefs.email_notifications_enabled) {
    const email = await getUserProfileEmail(client, companyId, userId);
    if (email) {
      await sendEmail(client, { to: email, subject: title, html: `<p>${escapeHtml(message)}</p>` });
    }
  }
}

async function sendEmail(client, payload) {
  try {
    const response = await fetch(EMAIL_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || (data && data.ok === false)) {
      console.error('cronReviewMeetingReminders: failed to send email', data || response.statusText);
    }
  } catch (error) {
    console.error('cronReviewMeetingReminders: failed to send email', error);
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
