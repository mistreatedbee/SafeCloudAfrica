/**
 * InsForge Edge Function: cronPpeReorderChecks
 * Scheduled job: low stock / near-expiry PPE; create ppe_reorder_requests and notify.
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
    // Stub: in production query ppe_stock_items (quantity <= reorder_point or expiry_date near); insert ppe_reorder_requests; send notifications
    return new Response(
      JSON.stringify({ ok: true, message: 'PPE reorder checks run (stub)', at: new Date().toISOString() }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e.message || e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
