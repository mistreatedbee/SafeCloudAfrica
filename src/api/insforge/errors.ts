export function getErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;

  const anyErr = err as any;
  const statusCode: number | undefined = anyErr?.statusCode;
  if (statusCode === 502 || statusCode === 503 || statusCode === 504) {
    return 'Service temporarily unavailable. Please try again.';
  }
  if (typeof anyErr?.message === 'string') return anyErr.message;
  if (typeof anyErr?.error === 'string') return anyErr.error;
  return 'Unknown error';
}

