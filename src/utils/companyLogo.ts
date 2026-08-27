import { insforge } from '../api/insforge/client';

export function getCompanyLogoUrl(metadata: Record<string, unknown> | null | undefined): string | null {
  const bucket = metadata?.logo_bucket as string | undefined;
  const key = metadata?.logo_key as string | undefined;
  if (!bucket || !key) return null;
  try {
    return insforge.storage.from(bucket).getPublicUrl(key);
  } catch {
    return null;
  }
}
