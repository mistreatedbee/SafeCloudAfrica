export type AuthCompatRouteMatch = {
  legacyPath: string;
  legacyMethod: 'GET' | 'POST';
  responseTransform: 'normalize-user-payload' | null;
};

type AuthCompatRouteInput = {
  method: string;
  path: string;
  upstreamStatus: number;
};

function isMethodMismatchStatus(status: number): boolean {
  return status === 404 || status === 405;
}

export function matchLegacyAuthRoute(input: AuthCompatRouteInput): AuthCompatRouteMatch | null {
  if (!isMethodMismatchStatus(input.upstreamStatus)) return null;

  if (input.method === 'POST' && input.path === 'auth/sessions') {
    return {
      legacyPath: '/api/auth/login',
      legacyMethod: 'POST',
      responseTransform: null
    };
  }

  if (input.method === 'GET' && input.path === 'auth/sessions/current') {
    return {
      legacyPath: '/api/auth/me',
      legacyMethod: 'GET',
      responseTransform: 'normalize-user-payload'
    };
  }

  if (input.method === 'POST' && input.path === 'auth/logout') {
    return {
      legacyPath: '/api/auth/logout',
      legacyMethod: 'POST',
      responseTransform: null
    };
  }

  return null;
}

export function shouldMapRefreshToNotFound(input: AuthCompatRouteInput): boolean {
  return input.method === 'POST' && input.path === 'auth/refresh' && [404, 405].includes(input.upstreamStatus);
}

export function normalizeLegacyAuthPayload(payload: unknown): Record<string, unknown> {
  if (payload && typeof payload === 'object' && 'user' in (payload as Record<string, unknown>)) {
    return payload as Record<string, unknown>;
  }
  return { user: payload };
}
