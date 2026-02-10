/**
 * InsForge Edge Function: auditProposalsSend
 * Sends 3 date proposals to auditee(s) for an audit. Body: { auditId, companyId, proposedDates[], auditeeEmails[] }
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
    const { auditId, companyId, proposedDates, auditeeEmails } = body;
    if (!auditId || !companyId) {
      return new Response(
        JSON.stringify({ error: 'Missing auditId or companyId' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
    // Stub: in production look up audit, send emails via emailSend
    return new Response(
      JSON.stringify({ ok: true, message: 'Proposals send (stub)', auditId }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
