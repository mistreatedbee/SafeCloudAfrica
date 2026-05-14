import { validateInviteHandler } from '../../server/invites/validateHandler.js';
export default function handler(req: any, res: any) {
  return validateInviteHandler(req, res);
}
