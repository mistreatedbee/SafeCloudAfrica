import { insforge } from '../api/insforge/client';
import { getCurrentAuthSession, readAuthSessionResult } from '../api/insforge/sessionState';
import { ACTIVE_COMPANY_STORAGE_KEY } from '../tenant/TenantContext';

export type ReportClientErrorInput = {
  module: string;
  error: Error;
  componentStack?: string;
};

/** Fire-and-forget POST to /api/client-log (structured server log + optional operational row). */
export function reportClientError(payload: ReportClientErrorInput): void {
  void (async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    try {
      const current = await getCurrentAuthSession(insforge.auth as any);
      const token = readAuthSessionResult(current).accessToken;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // not signed in
    }

    let organization_id: string | null = null;
    try {
      organization_id = localStorage.getItem(ACTIVE_COMPANY_STORAGE_KEY);
    } catch {
      // ignore
    }

    try {
      await fetch('/api/client-log', {
        method: 'POST',
        cache: 'no-store',
        headers,
        credentials: 'include',
        body: JSON.stringify({
          module: payload.module,
          message: payload.error.message || String(payload.error),
          stack: payload.error.stack,
          componentStack: payload.componentStack,
          organization_id: organization_id || undefined,
          url: typeof window !== 'undefined' ? window.location.href : undefined,
          userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined
        })
      });
    } catch {
      // ignore
    }
  })();
}
