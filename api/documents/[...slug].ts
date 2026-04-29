import { applyNoStoreHeaders } from '../_response.js';
import editorConfigHandler from '../../server/documents/editorConfigHandler.js';
import fileHandler from '../../server/documents/fileHandler.js';
import onlyofficeCallbackHandler from '../../server/documents/onlyofficeCallbackHandler.js';

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  const rawSlug = req.query?.slug;
  const slug = Array.isArray(rawSlug) ? rawSlug.map((part: unknown) => String(part || '').trim()).filter(Boolean) : [];

  if (slug.length === 1 && slug[0] === 'editor-config') {
    return editorConfigHandler(req, res);
  }

  if (slug.length === 1 && slug[0] === 'file') {
    return fileHandler(req, res);
  }

  if (slug.length === 2 && slug[0] === 'onlyoffice' && slug[1] === 'callback') {
    return onlyofficeCallbackHandler(req, res);
  }

  return res.status(404).json({ ok: false, error: 'Not found' });
}
