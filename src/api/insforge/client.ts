import { createClient } from '@insforge/sdk';

// IMPORTANT:
// - Vite injects env vars at build time.
// - If baseUrl is missing, @insforge/sdk defaults to http://localhost:7130, which breaks Vercel.
// - We fallback to your InsForge project URL to ensure we never hit localhost in production.
const configuredBaseUrl =
  ((import.meta as any)?.env?.VITE_INSFORGE_BASE_URL as string | undefined) ??
  'https://pas375jb.us-west.insforge.app';
const anonKey = ((import.meta as any)?.env?.VITE_INSFORGE_ANON_KEY as string | undefined) ?? '';

function resolveBaseUrl(rawBaseUrl: string): string {
  if (typeof window === 'undefined') return rawBaseUrl;
  try {
    const targetOrigin = new URL(rawBaseUrl).origin;
    // Use same-origin proxy route in browser when target origin differs.
    if (window.location.origin !== targetOrigin) return '/api/insforge';
  } catch {
    // If base URL is already relative, keep it.
  }
  return rawBaseUrl;
}

export const insforge = createClient({
  baseUrl: resolveBaseUrl(configuredBaseUrl),
  anonKey,
  // Use SDK-managed session persistence + refresh.
  persistSession: true,
  autoRefreshToken: true
});

