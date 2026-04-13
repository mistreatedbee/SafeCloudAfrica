export function toUserFacingError(error: unknown, fallback: string): string {
  if (!(error instanceof Error)) return fallback;
  const message = String(error.message ?? '').trim();
  if (!message) return fallback;

  const lower = message.toLowerCase();
  const technicalHints = [
    'sqlstate',
    'relation',
    'constraint',
    'stack',
    'trace',
    'rpc',
    'permission denied',
    'duplicate key',
    'syntax error',
    'failed to fetch'
  ];

  if (technicalHints.some((hint) => lower.includes(hint))) return fallback;
  return message;
}
