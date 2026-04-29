import { validateInviteHandler } from '../validate.js';

export default async function handler(req: any, res: any) {
  const tokenValue = Array.isArray(req.query?.token) ? req.query.token[0] : req.query?.token;
  return validateInviteHandler(req, res, tokenValue);
}
