/**
 * InsForge Edge Function: auditProposalRespond
 * Auditee selects or declines a proposed date; transitions audit status. Body: { auditId, selectedDate?, declined: boolean }
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
    const { auditId, selectedDate, declined } = body;
    if (!auditId) {
      return new Response(
        JSON.stringify({ error: 'Missing auditId' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
    // Stub: in production update audits table (selected_date, lifecycle_status)
    return new Response(
      JSON.stringify({ ok: true, message: 'Proposal response recorded (stub)', auditId, selectedDate, declined }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
