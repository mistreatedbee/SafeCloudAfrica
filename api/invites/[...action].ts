import acceptInviteHandler from '../../server/invites/acceptHandler.js';
import createInviteHandler from '../../server/invites/createHandler.js';
import resendInviteHandler from '../../server/invites/resendHandler.js';
import { validateInviteHandler } from '../../server/invites/validateHandler.js';

function parseAction(req: any): string[] {
  const raw = req.query?.action;
  if (Array.isArray(raw)) return raw.map((part) => String(part || '').trim()).filter(Boolean);
  return String(raw ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

export default async function handler(req: any, res: any) {
  const [action, ...rest] = parseAction(req);

  if (action === 'create' && rest.length === 0) {
    return createInviteHandler(req, res);
  }

  if (action === 'accept' && rest.length === 0) {
    return acceptInviteHandler(req, res);
  }

  if (action === 'resend' && rest.length === 0) {
    return resendInviteHandler(req, res);
  }

  if (action === 'validate') {
    const tokenValue = rest.length > 0 ? rest.join('/') : undefined;
    return validateInviteHandler(req, res, tokenValue);
  }

  return res.status(404).json({ ok: false, error: 'Not found' });
}
