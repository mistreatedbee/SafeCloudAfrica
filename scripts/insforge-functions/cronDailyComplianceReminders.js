/**
 * InsForge Edge Function: cronDailyComplianceReminders
 * Scheduled job: document review dates, expiring training/medical, upcoming audits/inspections.
 * Training: expiry windows (30/14/7/0 days), outstanding training, escalation to supervisor/admin.
 */
const { createInternalClient, getUserSettings, getUserProfileEmail, buildEscalationChain } = require('./escalationUtils');

const TRAINING_EXPIRY_WINDOWS = [
  { days: 30, type: 'expiry_30' },
  { days: 14, type: 'expiry_14' },
  { days: 7, type: 'expiry_7' },
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

