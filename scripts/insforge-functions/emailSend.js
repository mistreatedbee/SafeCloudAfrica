/**
 * InsForge Edge Function: emailSend
 * Sends email via SendGrid or Mailgun (configure via env: SENDGRID_API_KEY or MAILGUN_API_KEY + MAILGUN_DOMAIN).
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
    let { to, subject, html, text, from } = body;

    if (!to || !subject) {
      return new Response(
        JSON.stringify({ error: 'Missing to or subject' }),
        { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    const sendgridKey = Deno.env.get('SENDGRID_API_KEY');
    const mailgunKey = Deno.env.get('MAILGUN_API_KEY');
    const mailgunDomain = Deno.env.get('MAILGUN_DOMAIN');
    const defaultFrom = Deno.env.get('EMAIL_FROM') || Deno.env.get('SENDGRID_FROM') || 'no-reply@safecould.africa';

    from = from || defaultFrom;

    const recipients = Array.isArray(to) ? to : [to];

    let provider = null;

    if (sendgridKey) {
      provider = 'sendgrid';

      const sgPayload = {
        personalizations: [
          {
            to: recipients.map((email) => ({ email })),
          },
        ],
        from: { email: from },
        subject,
        content: [
          {
            type: html ? 'text/html' : 'text/plain',
            value: html || text || '',
          },
        ],
      };

      const resp = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sendgridKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(sgPayload),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return new Response(
          JSON.stringify({
            ok: false,
            provider,
            status: resp.status,
            error: errText || 'Failed to send via SendGrid',
          }),
          { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }
    } else if (mailgunKey && mailgunDomain) {
      provider = 'mailgun';

      const form = new URLSearchParams();
      form.set('from', from);
      form.set('to', recipients.join(','));
      form.set('subject', subject);
      if (text) form.set('text', text);
      if (html) form.set('html', html);

      const resp = await fetch(`https://api.mailgun.net/v3/${mailgunDomain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${btoa(`api:${mailgunKey}`)}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: form.toString(),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => '');
        return new Response(
          JSON.stringify({
            ok: false,
            provider,
            status: resp.status,
            error: errText || 'Failed to send via Mailgun',
          }),
          { status: 502, headers: { ...cors, 'Content-Type': 'application/json' } }
        );
      }
    } else {
      return new Response(
        JSON.stringify({ ok: false, message: 'Email provider not configured' }),
        { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, provider }),
      { status: 200, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ error: String(e && e.message ? e.message : e) }),
      { status: 500, headers: { ...cors, 'Content-Type': 'application/json' } }
    );
  }
};
