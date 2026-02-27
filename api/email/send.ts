import { Resend } from 'resend';

type EmailRequest = {
  to: string | string[];
  subject: string;
  html?: string;
  text?: string;
  meta?: Record<string, unknown>;
};

function asArray(value: string | string[]): string[] {
  return Array.isArray(value) ? value : [value];
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.EMAIL_FROM;
  if (!apiKey || !from) {
    return res.status(500).json({
      ok: false,
      error: 'Email provider not configured. Set RESEND_API_KEY (replace re_xxxxxxxxx with your real key) and EMAIL_FROM.'
    });
  }
  const resend = new Resend(apiKey);

  const body = (req.body ?? {}) as EmailRequest;
  const to = asArray(body.to ?? []).map((entry) => String(entry || '').trim()).filter(Boolean);
  const subject = String(body.subject ?? '').trim();
  const html = String(body.html ?? '').trim();
  const text = String(body.text ?? '').trim();

  if (to.length === 0 || !subject || (!html && !text)) {
    return res.status(400).json({ ok: false, error: 'Invalid payload' });
  }

  try {
    const { error } = await resend.emails.send({
        from,
        to,
        subject,
        html: html || undefined,
        text: text || undefined
    });
    if (error) {
      return res.status(502).json({ ok: false, error: error.message || 'Resend send failed' });
    }

    return res.status(200).json({ ok: true });
  } catch (error: any) {
    return res.status(500).json({ ok: false, error: error?.message ?? 'Email request failed' });
  }
}
