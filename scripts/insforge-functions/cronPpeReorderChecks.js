/**
 * InsForge Edge Function: cronPpeReorderChecks
 * Scheduled job: low stock / near-expiry PPE; create ppe_reorder_requests and notify.
 */
const { createInternalClient, getUserSettings, getUserProfileEmail, buildEscalationChain } = require('./escalationUtils');

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

    const summary = {
      low_stock: 0
    };

    // Low stock PPE: on_hand_qty <= reorder_level AND is_active = true
    const { data: stockRows, error: stockError } = await client.database
      .from('ppe_stock')
      .select('*')
      .eq('is_active', true)
      .lte('on_hand_qty', 'reorder_level');

    if (stockError) {
      console.error('cronPpeReorderChecks: failed to load ppe_stock', stockError);
    } else {
      for (const stock of stockRows || []) {
        await handleLowStock(client, stock);
        summary.low_stock += 1;
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
    console.error('cronPpeReorderChecks: unhandled error', e);
    return new Response(
      JSON.stringify({ error: String(e && e.message ? e.message : e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};

async function handleLowStock(client, stock) {
  const companyId = stock.company_id;

  // Optional: create a draft reorder request for tracking
  try {
    const { error: rrError } = await client.database.from('ppe_reorder_requests').insert({
      company_id: companyId,
      stock_id: stock.id,
      requested_qty: stock.reorder_qty || 0,
      reason: 'Auto-generated from low PPE stock check',
      status: 'requested',
      requested_by_user_id: stock.created_by_user_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (rrError) {
      console.error('cronPpeReorderChecks: failed to create auto reorder request', rrError);
    }
  } catch (e) {
    console.error('cronPpeReorderChecks: exception creating reorder request', e);
  }

  // Escalate to managers/admins
  const chain = await buildEscalationChain(client, companyId, stock.updated_by_user_id || stock.created_by_user_id);
  const targets = [...new Set([...chain.managers, ...chain.admins])];

  for (const userId of targets) {
    const prefs = await getUserSettings(client, companyId, userId);

    if (prefs.inapp_notifications_enabled) {
      const { error: nError } = await client.database
        .from('notifications')
        .insert({
          company_id: companyId,
          user_id: userId,
          title: 'Low PPE Stock',
          message: 'A PPE stock item has fallen below its reorder level.',
          severity: 'high',
          read_at: null
        });
      if (nError) {
        console.error('cronPpeReorderChecks: failed to insert notification', nError);
      }
    }

    if (prefs.email_notifications_enabled) {
      const email = await getUserProfileEmail(client, companyId, userId);
      if (email) {
        try {
          const { data, error } = await client.functions.invoke('emailSend', {
            body: {
              to: email,
              subject: 'Low PPE Stock',
              html: `<p>A PPE stock item has fallen below its reorder level. Stock ID: ${
                stock.id
              }, On hand: ${stock.on_hand_qty}, Reorder level: ${stock.reorder_level}.</p>`
            }
          });
          if (error || (data && data.ok === false)) {
            console.error('cronPpeReorderChecks: failed to send email', error || data);
          }
        } catch (e) {
          console.error('cronPpeReorderChecks: exception sending email', e);
        }
      }
    }
  }
}

