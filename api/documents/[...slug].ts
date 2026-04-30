import { applyNoStoreHeaders } from '../_response.js';
import editorConfigStatusHandler from '../../server/documents/editorConfigStatusHandler.js';
import editorConfigHandler from '../../server/documents/editorConfigHandler.js';
import fileHandler from '../../server/documents/fileHandler.js';
import onlyofficeCallbackHandler from '../../server/documents/onlyofficeCallbackHandler.js';

function parseSlug(req: any): string[] {
  const rawSlug = req.query?.slug;
  if (Array.isArray(rawSlug)) return rawSlug.map((part: unknown) => String(part || '').trim()).filter(Boolean);
  return String(rawSlug ?? '')
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
}

export default async function handler(req: any, res: any) {
  applyNoStoreHeaders(res);

  const slug = parseSlug(req);

  if (slug.length === 1 && slug[0] === 'editor-config') {
    return editorConfigHandler(req, res);
  }

  if (slug.length === 1 && slug[0] === 'editor-config-status') {
    return editorConfigStatusHandler(req, res);
  }

  if (slug.length === 1 && slug[0] === 'file') {
    return fileHandler(req, res);
  }

  if (slug.length === 2 && slug[0] === 'onlyoffice' && slug[1] === 'callback') {
    return onlyofficeCallbackHandler(req, res);
  }

  return res.status(404).json({ ok: false, error: 'Not found' });
}
