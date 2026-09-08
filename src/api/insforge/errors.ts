function isTransientStatus(status: number): boolean {
  return status === 502 || status === 503 || status === 504 || status === 429;
}

export function getErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;
  if (err instanceof Error && err.message && err.message !== '[object Object]') return err.message;

  const anyErr = err as Record<string, unknown>;
  const statusCode = Number(anyErr?.statusCode ?? anyErr?.status ?? 0);
  if (isTransientStatus(statusCode)) {
    return 'Service temporarily unavailable. Please try again.';
  }

  const message = anyErr?.message;
  if (typeof message === 'string' && message !== '[object Object]') return message;
  if (typeof anyErr?.error === 'string') return anyErr.error;
  if (typeof anyErr?.details === 'string') return anyErr.details;
  if (typeof anyErr?.hint === 'string') return anyErr.hint;

  const code = anyErr?.code;
  if (typeof code === 'string' && typeof message === 'string') {
    return `${code}: ${message}`;
  }

  try {
    const serialized = JSON.stringify(err);
    if (serialized && serialized !== '{}' && serialized !== '[object Object]') return serialized;
  } catch {
    // ignore circular structures
  }

  return 'Unknown error';
}

export function isTransientBackendError(err: unknown): boolean {
  if (!err) return false;
  const anyErr = err as Record<string, unknown>;
  const statusCode = Number(anyErr?.statusCode ?? anyErr?.status ?? 0);
  if (isTransientStatus(statusCode)) return true;

  const message = getErrorMessage(err).toLowerCase();
  return (
    message.includes('502') ||
    message.includes('503') ||
    message.includes('504') ||
    message.includes('bad gateway') ||
    message.includes('service unavailable') ||
    message.includes('temporarily unavailable') ||
    message.includes('timeout') ||
    message.includes('timed out') ||
    message.includes('abort') ||
    message.includes('pgrst001') ||
    message.includes('pgrst002') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('unknown error')
  );
}

