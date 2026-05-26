const PENDING_AUTH_REDIRECT_KEY = 'sca_pending_auth_redirect_v1';

export function safeAuthRedirectPath(value: string | null | undefined, fallback = '/app'): string {
  const raw = String(value ?? '').trim();
  if (!raw) return fallback;

  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return raw.startsWith('/') ? raw : fallback;
  }
}

export function getVerificationRedirectUrl(): string {
  return `${window.location.origin}/login`;
}

export function savePendingAuthRedirect(path: string): void {
  try {
    sessionStorage.setItem(PENDING_AUTH_REDIRECT_KEY, safeAuthRedirectPath(path));
  } catch {
    // Best-effort only; login can still use its default redirect logic.
  }
}

export function consumePendingAuthRedirect(): string | null {
  try {
    const path = safeAuthRedirectPath(sessionStorage.getItem(PENDING_AUTH_REDIRECT_KEY), '');
    sessionStorage.removeItem(PENDING_AUTH_REDIRECT_KEY);
    return path || null;
  } catch {
    return null;
  }
}
