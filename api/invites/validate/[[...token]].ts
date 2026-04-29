import { validateInviteHandler } from '../../../server/invites/validateHandler.js';

export default async function handler(req: any, res: any) {
  const rawToken = req.query?.token;
  const tokenValue = Array.isArray(rawToken) ? rawToken.join('/') : rawToken;
  return validateInviteHandler(req, res, tokenValue);
}
