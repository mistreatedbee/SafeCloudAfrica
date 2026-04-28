import { applyNoStoreHeaders } from '../_response.js';
import { getServerInsforge, getServiceInsforge, readBearerToken, resolveServerUser } from '../_insforge.js';

export type ViewerRole = 'owner' | 'admin' | 'manager' | 'supervisor' | 'consultant' | 'employee' | 'external' | string;

export function applyJson(res: any, status: number, payload: any): void {
  applyNoStoreHeaders(res);
  res.status(status).json(payload);
}

export function getAppPublicOrigin(req: any): string {
  const fromEnv = String(process.env.APP_PUBLIC_ORIGIN || '').trim();
  if (fromEnv) return fromEnv.replace(/\/+$/, '');
  const proto = String(req?.headers?.['x-forwarded-proto'] || 'https').split(',')[0]?.trim() || 'https';
  const host = String(req?.headers?.['x-forwarded-host'] || req?.headers?.host || '').split(',')[0]?.trim();
  if (!host) throw new Error('Unable to resolve public origin.');
  return `${proto}://${host}`;
}

export function requireOnlyofficeConfigured(): { docServerOrigin: string; jwtSecret: string } {
  const docServerOrigin = String(process.env.ONLYOFFICE_DOCSERVER_ORIGIN || '').trim().replace(/\/+$/, '');
  const jwtSecret = String(process.env.ONLYOFFICE_JWT_SECRET || '').trim();
  if (!docServerOrigin) throw new Error('ONLYOFFICE_DOCSERVER_ORIGIN not configured.');
  if (!jwtSecret) throw new Error('ONLYOFFICE_JWT_SECRET not configured.');
  return { docServerOrigin, jwtSecret };
}

export function getDmsFileAccessSecret(): string {
  const s = String(process.env.DMS_FILE_ACCESS_JWT_SECRET || '').trim();
  if (s) return s;
  return String(process.env.ONLYOFFICE_JWT_SECRET || '').trim();
}

export async function requireViewer(req: any): Promise<{ token: string; userId: string; email: string | null }> {
  const token = readBearerToken(req);
  if (!token) throw new Error('Missing Authorization bearer token.');
  const insforge = getServerInsforge(token);
  const viewer = await resolveServerUser(insforge, token);
  if (!viewer.userId) throw new Error('Unable to resolve signed-in user.');
  return { token, userId: viewer.userId, email: viewer.email ?? null };
}

export async function getViewerRole(input: { token: string; companyId: string; userId: string }): Promise<ViewerRole | null> {
  const insforge = getServerInsforge(input.token);
  const { data, error } = await insforge.database
    .from('company_memberships')
    .select('role,status')
    .eq('company_id', input.companyId)
    .eq('user_id', input.userId)
    .maybeSingle();
  if (error) return null;
  const status = (data as any)?.status ? String((data as any).status) : 'ACTIVE';
  if (status && status !== 'ACTIVE') return null;
  return (data as any)?.role ? (String((data as any).role) as ViewerRole) : null;
}

export function canEditDocuments(role: ViewerRole | null): boolean {
  return role === 'owner' || role === 'admin' || role === 'manager' || role === 'supervisor' || role === 'consultant';
}

export function canViewRestrictedDocuments(role: ViewerRole | null): boolean {
  return role === 'owner' || role === 'admin';
}

export function getServiceClientOrThrow() {
  const svc = getServiceInsforge();
  if (!svc) throw new Error('INSFORGE_SERVICE_ROLE_KEY not configured.');
  return svc;
}
