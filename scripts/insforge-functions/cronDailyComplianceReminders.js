/**
 * InsForge Edge Function: cronDailyComplianceReminders
 * Scheduled job: document review dates, expiring training/medical, upcoming audits/inspections.
 * Invoke with cron (e.g. daily). No body required; uses admin/service key to query DB and send emails.
 */
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
    // Stub: in production query documents (review_due_at), training_records (expires_at), medical_certificates (expires_at), audits, inspections; send reminders via emailSend
    return new Response(
      JSON.stringify({ ok: true, message: 'Daily reminders run (stub)', at: new Date().toISOString() }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
