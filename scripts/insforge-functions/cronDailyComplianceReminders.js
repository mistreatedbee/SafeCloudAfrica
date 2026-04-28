/**
 * InsForge Edge Function: cronDailyComplianceReminders
 * Scheduled job: document review dates, expiring training/medical, upcoming audits/inspections.
 * Training: expiry windows (30/14/7/0 days), outstanding training, escalation to supervisor/admin.
 */
const { createInternalClient, getUserSettings, getUserProfileEmail, buildEscalationChain } = require('./escalationUtils');
const EMAIL_API_URL = (typeof process !== 'undefined' && process.env && process.env.EMAIL_API_URL)
  ? process.env.EMAIL_API_URL
  : 'https://safe-cloud-africa.vercel.app/api/email/send';

const TRAINING_EXPIRY_WINDOWS = [
  { days: 30, type: 'expiry_30' },
  { days: 14, type: 'expiry_14' },
  { days: 7, type: 'expiry_7' },
  { days: 0, type: 'expiry_0' }
];

const DOCUMENT_EXPIRY_WINDOWS = [
  { days: 30, type: 'expiry_30' },
  { days: 14, type: 'expiry_14' },
  { days: 7, type: 'expiry_7' },
  { days: 1, type: 'expiry_1' },
  { days: 0, type: 'expiry_0' }
];

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
    const now = new Date();
    const todayIso = now.toISOString();
    const in30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const summary = {
      documents: 0,
      document_expiry: 0,
      training_records: 0,
      training_outstanding: 0,
      medical_certificates: 0
    };

    // Documents with review_due_at between today and next 30 days (or overdue)
    const { data: documents, error: docError } = await client.database
      .from('documents')
      .select('*')
      .not('review_due_at', 'is', null)
      .lte('review_due_at', in30Days);

    if (docError) {
      console.error('cronDailyComplianceReminders: failed to load documents', docError);
    } else {
      for (const doc of documents || []) {
        await notifyOwner(client, {
          companyId: doc.company_id,
          userId: doc.owner_user_id,
          title: 'Document Review Due',
          severity: 'medium',
          message: `Document "${doc.title}" is due for review on ${doc.review_due_at}.`,
          emailSubject: 'Document Review Due',
          emailHtml: `<p>Document "<strong>${escapeHtml(doc.title)}</strong>" is due for review on ${escapeHtml(
            doc.review_due_at
          )}.</p>`
        });
        summary.documents += 1;
      }
    }

    // Document expiry reminders with dedupe and restricted-doc executive routing.
    const { data: expiringDocuments, error: expiringDocumentsError } = await client.database
      .from('documents')
      .select('id, company_id, title, document_number, document_owner_name, owner_user_id, expiry_date, is_restricted')
      .not('expiry_date', 'is', null)
      .lte('expiry_date', in30Days.slice(0, 10));

    if (expiringDocumentsError) {
      console.error('cronDailyComplianceReminders: failed to load expiring documents', expiringDocumentsError);
    } else {
      for (const doc of expiringDocuments || []) {
        const expiryDate = new Date(`${doc.expiry_date}T00:00:00Z`);
        const daysUntil = Math.ceil((expiryDate - now) / (24 * 60 * 60 * 1000));
        let reminderType = null;
        for (const windowDef of DOCUMENT_EXPIRY_WINDOWS) {
          const inWindow = windowDef.days === 0
            ? daysUntil <= 0 && daysUntil > -1
            : daysUntil <= windowDef.days && daysUntil > windowDef.days - 1;
          if (inWindow) {
            reminderType = windowDef.type;
            break;
          }
        }
        if (!reminderType && daysUntil < 0) reminderType = 'expired';
        if (!reminderType) continue;

        const recipients = await getDocumentReminderRecipients(client, doc);
        for (const recipientUserId of recipients) {
          let sent = null;
          try {
            const sentResult = await client.database
              .from('document_expiry_reminder_sent')
              .select('id')
              .eq('document_id', doc.id)
              .eq('recipient_user_id', recipientUserId)
              .eq('reminder_type', reminderType)
              .maybeSingle();
            sent = sentResult.data;
          } catch (_) {}
          if (sent) continue;

          const label = doc.document_number ? `${doc.document_number} — ${doc.title}` : doc.title;
          const statusText = reminderType === 'expired'
            ? `expired on ${doc.expiry_date}`
            : reminderType === 'expiry_0'
              ? `expires today (${doc.expiry_date})`
              : `expires in ${reminderType.replace('expiry_', '')} day(s) (${doc.expiry_date})`;
          await notifyOwner(client, {
            companyId: doc.company_id,
            userId: recipientUserId,
            title: 'Document Expiry Reminder',
            severity: reminderType === 'expired' || reminderType === 'expiry_0' || reminderType === 'expiry_1' ? 'high' : 'medium',
            message: `Document "${label}" ${statusText}.`,
            emailSubject: `Document expiry reminder: ${label}`,
            emailHtml: `<p>Document "<strong>${escapeHtml(label)}</strong>" ${escapeHtml(statusText)}.</p><p>Compiler: ${escapeHtml(doc.document_owner_name || 'Not specified')}</p>`
          });
          try {
            await client.database.from('document_expiry_reminder_sent').insert({
              company_id: doc.company_id,
              document_id: doc.id,
              recipient_user_id: recipientUserId,
              reminder_type: reminderType
            });
          } catch (insertError) {
            console.warn('document_expiry_reminder_sent insert failed', insertError?.message);
          }
          summary.document_expiry += 1;
        }
      }
    }

    // Training: expiry reminders (30/14/7/0 days) with dedupe via training_reminder_sent
    const { data: trainingExpiring, error: trainingError } = await client.database
      .from('training_records')
      .select('*')
      .eq('status', 'COMPLETED')
      .not('expires_at', 'is', null)
      .lte('expires_at', in30Days);

    if (trainingError) {
      console.error('cronDailyComplianceReminders: failed to load training_records', trainingError);
    } else {
      for (const rec of trainingExpiring || []) {
        const expiresAt = new Date(rec.expires_at);
        const daysUntil = Math.ceil((expiresAt - now) / (24 * 60 * 60 * 1000));
        for (const w of TRAINING_EXPIRY_WINDOWS) {
          const inWindow = w.days === 0 ? daysUntil <= 0 && daysUntil > -1 : daysUntil <= w.days && daysUntil > w.days - 1;
          if (!inWindow) continue;
          let sent = null;
          try {
            const r = await client.database
              .from('training_reminder_sent')
              .select('id')
              .eq('training_record_id', rec.id)
              .eq('reminder_type', w.type)
              .maybeSingle();
            sent = r.data;
          } catch (_) {}
          if (sent) continue;
          const msg = w.days === 0 ? 'expires today' : `expires in ${w.days} days`;
          await notifyOwner(client, {
            companyId: rec.company_id,
            userId: rec.user_id,
            title: 'Training Expiring Soon',
            severity: w.days <= 7 ? 'high' : 'medium',
            message: `You have training that ${msg} (${rec.expires_at}).`,
            emailSubject: `Training ${msg}`,
            emailHtml: `<p>You have training that ${msg}. Expiry: ${escapeHtml(rec.expires_at)}.</p>`
          });
          try {
            await client.database.from('training_reminder_sent').insert({
              training_record_id: rec.id,
              reminder_type: w.type
            });
          } catch (e) {
            console.warn('training_reminder_sent insert failed (table may not exist)', e?.message);
          }
          summary.training_records += 1;
          await notifySupervisorAndAdmin(client, rec);
          break;
        }
      }
    }

    // Outstanding training (REQUIRED / OVERDUE or SCHEDULED with arranged_at in the past)
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const { data: outstanding, error: outError } = await client.database
      .from('training_records')
      .select('*')
      .in('status', ['REQUIRED', 'OVERDUE'])
      .limit(500);

    if (!outError && outstanding?.length) {
      for (const rec of outstanding) {
        let sent = null;
        try {
          const r = await client.database
            .from('training_reminder_sent')
            .select('id')
            .eq('training_record_id', rec.id)
            .eq('reminder_type', 'outstanding')
            .maybeSingle();
          sent = r.data;
        } catch (_) {}
        if (sent) continue;
        await notifyOwner(client, {
          companyId: rec.company_id,
          userId: rec.user_id,
          title: 'Outstanding Training',
          severity: 'medium',
          message: 'You have required training that is not yet scheduled or completed.',
          emailSubject: 'Outstanding Training Required',
          emailHtml: '<p>You have required training that is not yet scheduled or completed. Please arrange or complete it.</p>'
        });
        try {
          await client.database.from('training_reminder_sent').insert({
            training_record_id: rec.id,
            reminder_type: 'outstanding'
          });
        } catch (e) {
          console.warn('training_reminder_sent insert failed', e?.message);
        }
        summary.training_outstanding += 1;
        await notifySupervisorAndAdmin(client, rec);
      }
    }

    const { data: scheduledPast } = await client.database
      .from('training_records')
      .select('*')
      .eq('status', 'SCHEDULED')
      .lt('arranged_at', todayStart)
      .limit(200);

    for (const rec of scheduledPast || []) {
      let sent = null;
      try {
        const r = await client.database
          .from('training_reminder_sent')
          .select('id')
          .eq('training_record_id', rec.id)
          .eq('reminder_type', 'outstanding')
          .maybeSingle();
        sent = r.data;
      } catch (_) {}
      if (sent) continue;
      await notifyOwner(client, {
        companyId: rec.company_id,
        userId: rec.user_id,
        title: 'Training Overdue',
        severity: 'high',
        message: 'Scheduled training date has passed. Please complete or reschedule.',
        emailSubject: 'Training Overdue',
        emailHtml: '<p>Scheduled training date has passed. Please complete or reschedule.</p>'
      });
      try {
        await client.database.from('training_reminder_sent').insert({
          training_record_id: rec.id,
          reminder_type: 'outstanding'
        });
      } catch (e) {
        console.warn('training_reminder_sent insert failed', e?.message);
      }
      summary.training_outstanding += 1;
      await notifySupervisorAndAdmin(client, rec);
    }

    // Medical certificates expiring in next 30 days
    const { data: medical, error: medicalError } = await client.database
      .from('medical_certificates')
      .select('*')
      .not('expires_at', 'is', null)
      .lte('expires_at', in30Days);

    if (medicalError) {
      console.error('cronDailyComplianceReminders: failed to load medical_certificates', medicalError);
    } else {
      for (const cert of medical || []) {
        await notifyOwner(client, {
          companyId: cert.company_id,
          userId: cert.user_id,
          title: 'Medical Certificate Expiring Soon',
          severity: 'medium',
          message: 'Your medical certificate is expiring soon.',
          emailSubject: 'Medical Certificate Expiring Soon',
          emailHtml: `<p>Your medical certificate "${escapeHtml(cert.certificate_type)}" is expiring on ${escapeHtml(
            cert.expires_at
          )}.</p>`
        });
        summary.medical_certificates += 1;
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
    console.error('cronDailyComplianceReminders: unhandled error', e);
    return new Response(
      JSON.stringify({ error: String(e && e.message ? e.message : e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};

async function notifySupervisorAndAdmin(client, trainingRecord) {
  const companyId = trainingRecord.company_id;
  const employeeUserId = trainingRecord.user_id;
  const { data: profile } = await client.database
    .from('user_profiles')
    .select('supervisor_user_id, full_name')
    .eq('company_id', companyId)
    .eq('user_id', employeeUserId)
    .maybeSingle();
  const supervisorId = profile?.supervisor_user_id || null;
  const employeeName = profile?.full_name || `User ${String(employeeUserId).slice(0, 8)}`;
  const chain = await buildEscalationChain(client, companyId, employeeUserId);
  const adminId = chain.admins && chain.admins[0] ? chain.admins[0] : null;
  const title = 'Training reminder (employee)';
  const message = `${employeeName} has training that is expiring or overdue.`;
  const emailSubject = 'Training reminder – employee action needed';
  const emailHtml = `<p>${escapeHtml(employeeName)} has training that is expiring or overdue. Please follow up.</p>`;
  if (supervisorId && supervisorId !== employeeUserId) {
    await notifyOwner(client, { companyId, userId: supervisorId, title, severity: 'medium', message, emailSubject, emailHtml });
  }
  if (adminId && adminId !== employeeUserId && adminId !== supervisorId) {
    await notifyOwner(client, { companyId, userId: adminId, title, severity: 'medium', message, emailSubject, emailHtml });
  }
}

async function getDocumentReminderRecipients(client, doc) {
  const recipients = new Set();
  const { data: memberships, error } = await client.database
    .from('company_memberships')
    .select('user_id, role, status')
    .eq('company_id', doc.company_id);

  if (error) {
    console.warn('cronDailyComplianceReminders: failed to load document reminder recipients', doc.company_id, error);
    if (doc.owner_user_id) recipients.add(doc.owner_user_id);
    return Array.from(recipients);
  }

  const activeMemberships = (memberships || []).filter((row) => !row.status || row.status === 'ACTIVE');
  if (doc.is_restricted) {
    for (const row of activeMemberships) {
      if (row.role === 'owner' || row.role === 'admin') recipients.add(row.user_id);
    }
    return Array.from(recipients);
  }

  if (doc.owner_user_id) recipients.add(doc.owner_user_id);
  for (const row of activeMemberships) {
    if (row.role === 'owner' || row.role === 'admin') recipients.add(row.user_id);
  }
  return Array.from(recipients);
}

async function notifyOwner(client, { companyId, userId, title, severity, message, emailSubject, emailHtml }) {
  if (!userId) return;

  const prefs = await getUserSettings(client, companyId, userId);

  if (prefs.inapp_notifications_enabled) {
    const { error: nError } = await client.database
      .from('notifications')
      .insert({
        company_id: companyId,
        user_id: userId,
        title,
        message,
        severity,
        read_at: null
      });
    if (nError) {
      console.error('cronDailyComplianceReminders: failed to insert notification', nError);
    }
  }

  if (prefs.email_notifications_enabled) {
    const email = await getUserProfileEmail(client, companyId, userId);
    if (email) {
      try {
        const response = await fetch(EMAIL_API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            to: email,
            subject: emailSubject,
            html: emailHtml
          })
        });
        const data = await response.json().catch(() => null);
        if (!response.ok || (data && data.ok === false)) {
          console.error('cronDailyComplianceReminders: failed to send email', data || response.statusText);
        }
      } catch (e) {
        console.error('cronDailyComplianceReminders: exception sending email', e);
      }
    }
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
