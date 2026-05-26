const PENDING_AUTH_REDIRECT_KEY = 'sca_pending_auth_redirect_v1';
const PENDING_INVITE_CONTEXT_KEY = 'sca_pending_invite_context_v1';
const PENDING_INVITE_MAX_AGE_MS = 14 * 24 * 60 * 60 * 1000;

export type PendingInviteContext = {
  token: string;
  email?: string | null;
  redirectPath: string;
  savedAt: number;
};

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

export function getInviteTokenFromRedirectPath(path: string | null | undefined): string | null {
  const safePath = safeAuthRedirectPath(path, '');
  if (!safePath) return null;

  try {
    const url = new URL(safePath, window.location.origin);
    if (url.origin !== window.location.origin || url.pathname !== '/invite/accept') return null;
    const token = url.searchParams.get('token')?.trim();
    return token || null;
  } catch {
    return null;
  }
}

function normalizePendingInviteContext(value: unknown): PendingInviteContext | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<PendingInviteContext>;
  const token = String(raw.token ?? '').trim();
  if (!token) return null;

  const redirectPath = safeAuthRedirectPath(raw.redirectPath, `/invite/accept?token=${encodeURIComponent(token)}`);
  if (getInviteTokenFromRedirectPath(redirectPath) !== token) return null;

  const savedAt = Number(raw.savedAt || 0);
  if (!Number.isFinite(savedAt) || savedAt <= 0 || Date.now() - savedAt > PENDING_INVITE_MAX_AGE_MS) return null;

  const email = typeof raw.email === 'string' && raw.email.trim()
    ? raw.email.trim().toLowerCase()
    : null;

  return { token, email, redirectPath, savedAt };
}

function readPendingInviteFromStorage(storage: Storage): PendingInviteContext | null {
  try {
    const raw = storage.getItem(PENDING_INVITE_CONTEXT_KEY);
    if (!raw) return null;
    return normalizePendingInviteContext(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function savePendingInviteContext(input: {
  token?: string | null;
  email?: string | null;
  redirectPath?: string | null;
}): void {
  const redirectPath = safeAuthRedirectPath(input.redirectPath, '');
  const token = String(input.token ?? getInviteTokenFromRedirectPath(redirectPath) ?? '').trim();
  if (!token) return;

  const context: PendingInviteContext = {
    token,
    email: input.email?.trim().toLowerCase() || null,
    redirectPath: redirectPath || `/invite/accept?token=${encodeURIComponent(token)}`,
    savedAt: Date.now()
  };
  const serialized = JSON.stringify(context);

  try {
    localStorage.setItem(PENDING_INVITE_CONTEXT_KEY, serialized);
  } catch {
    // Best-effort only.
  }
  try {
    sessionStorage.setItem(PENDING_INVITE_CONTEXT_KEY, serialized);
  } catch {
    // Best-effort only.
  }
}

export function getPendingInviteContext(): PendingInviteContext | null {
  const sessionValue = (() => {
    try {
      return readPendingInviteFromStorage(sessionStorage);
    } catch {
      return null;
    }
  })();
  if (sessionValue) return sessionValue;

  try {
    return readPendingInviteFromStorage(localStorage);
  } catch {
    return null;
  }
}

export function clearPendingInviteContext(): void {
  try {
    sessionStorage.removeItem(PENDING_INVITE_CONTEXT_KEY);
  } catch {
    // ignore
  }
  try {
    localStorage.removeItem(PENDING_INVITE_CONTEXT_KEY);
  } catch {
    // ignore
  }
}

export function getPendingInviteContextFromRedirect(path: string | null | undefined): PendingInviteContext | null {
  const redirectPath = safeAuthRedirectPath(path, '');
  const token = getInviteTokenFromRedirectPath(redirectPath);
  if (!token) return null;
  return {
    token,
    email: null,
    redirectPath,
    savedAt: Date.now()
  };
}

export function savePendingAuthRedirect(path: string): void {
  try {
    const safePath = safeAuthRedirectPath(path);
    sessionStorage.setItem(PENDING_AUTH_REDIRECT_KEY, safePath);
    const token = getInviteTokenFromRedirectPath(safePath);
    if (token) savePendingInviteContext({ token, redirectPath: safePath });
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
