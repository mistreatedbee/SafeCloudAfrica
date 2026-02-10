/**
 * InsForge Edge Function: emailSend
 * Sends email via SendGrid/Mailgun (configure via env: SENDGRID_API_KEY or MAILGUN_*).
 * Body: { to, subject, html?, text?, from? }
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
    const body = request.method === 'POST' ? await request.json() : {};
    const { to, subject, html, text, from } = body;
    if (!to || !subject) {
      return new Response(
        JSON.stringify({ error: 'Missing to or subject' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
    // Stub: in production call SendGrid/Mailgun API using env vars
    const apiKey = process.env.SENDGRID_API_KEY || process.env.MAILGUN_API_KEY;
    if (!apiKey) {
      return new Response(
        JSON.stringify({ ok: false, message: 'Email provider not configured' }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
    // TODO: integrate SendGrid or Mailgun; for now return success
    return new Response(
      JSON.stringify({ ok: true, message: 'Email sent (stub)' }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
