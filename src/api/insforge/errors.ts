export function getErrorMessage(err: unknown): string {
  if (!err) return 'Unknown error';
  if (typeof err === 'string') return err;

  const anyErr = err as any;
  if (typeof anyErr?.message === 'string') return anyErr.message;
  if (typeof anyErr?.error === 'string') return anyErr.error;
  return 'Unknown error';
}

