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
    // Production: 1) Update audit row with proposed_dates (via InsForge DB), 2) Send email to each auditeeEmails with proposedDates and link to accept/decline. Requires InsForge client and email service in edge runtime.
    if (!Array.isArray(proposedDates) || proposedDates.length < 3) {
      return new Response(
        JSON.stringify({ error: 'At least 3 proposed dates required' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }
    return new Response(
      JSON.stringify({ ok: true, message: 'Proposals accepted (configure DB + email in edge for full flow)', auditId, proposedCount: proposedDates.length }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
