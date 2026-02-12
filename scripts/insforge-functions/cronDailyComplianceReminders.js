/**
 * InsForge Edge Function: cronDailyComplianceReminders
 * Scheduled job: document review dates, expiring training/medical, upcoming audits/inspections.
 * Invoke with cron (e.g. daily). No body required; uses admin/service key to query DB and send emails.
 */
const { createInternalClient, getUserSettings, getUserProfileEmail } = require('./escalationUtils');

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
      training_records: 0,
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

    // Training records expiring in next 30 days
    const { data: training, error: trainingError } = await client.database
      .from('training_records')
      .select('*')
      .not('expires_at', 'is', null)
      .lte('expires_at', in30Days);

    if (trainingError) {
      console.error('cronDailyComplianceReminders: failed to load training_records', trainingError);
    } else {
      for (const rec of training || []) {
        await notifyOwner(client, {
          companyId: rec.company_id,
          userId: rec.user_id,
          title: 'Training Expiring Soon',
          severity: 'medium',
          message: 'You have training that is expiring soon.',
          emailSubject: 'Training Expiring Soon',
          emailHtml: `<p>You have training that is expiring on ${escapeHtml(rec.expires_at)}.</p>`
        });
        summary.training_records += 1;
      }
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
        const { data, error } = await client.functions.invoke('emailSend', {
          body: {
            to: email,
            subject: emailSubject,
            html: emailHtml
          }
        });
        if (error || (data && data.ok === false)) {
          console.error('cronDailyComplianceReminders: failed to send email', error || data);
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

