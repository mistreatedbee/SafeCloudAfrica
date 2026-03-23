import { createClient } from '@insforge/sdk';

// IMPORTANT:
// - Vite injects env at build time; set VITE_INSFORGE_BASE_URL in .env / Vercel (no default tenant URL).
// - If baseUrl is empty, @insforge/sdk defaults to http://localhost:7130.
const configuredBaseUrl =
  String(((import.meta as any)?.env?.VITE_INSFORGE_BASE_URL as string | undefined) ?? '').trim();
const anonKey = ((import.meta as any)?.env?.VITE_INSFORGE_ANON_KEY as string | undefined) ?? '';

function resolveBaseUrl(rawBaseUrl: string): string {
  if (typeof window === 'undefined') return rawBaseUrl;
  try {
    const targetOrigin = new URL(rawBaseUrl).origin;
    // Use same-origin proxy in browser when target origin differs.
    // InsForge SDK issues requests under /api/* (auth/database/storage/functions),
    // so the base URL should be the same-origin root.
    if (window.location.origin !== targetOrigin) return window.location.origin;
  } catch {
    // If base URL is relative, normalize to absolute.
    if (rawBaseUrl.startsWith('/')) return `${window.location.origin}${rawBaseUrl}`;
  }
  return rawBaseUrl;
}

export const insforge = createClient({
  baseUrl: resolveBaseUrl(configuredBaseUrl),
  anonKey,
  // Use SDK-managed session persistence + refresh.
  persistSession: true,
  // Disable SDK auto-refresh so we can control refresh timing via `SessionManagerProvider`.
  // The app performs silent refresh when it's safe (active users + form editing), and switches to
  // a modal-only flow for the inactivity window (45 min warning / 60 min logout).
  autoRefreshToken: false
});

