import { createClient } from '@insforge/sdk';

// IMPORTANT:
// - Vite injects env vars at build time.
// - If baseUrl is missing, @insforge/sdk defaults to http://localhost:7130, which breaks Vercel.
// - We fallback to your InsForge project URL to ensure we never hit localhost in production.
const baseUrl =
  ((import.meta as any)?.env?.VITE_INSFORGE_BASE_URL as string | undefined) ??
  'https://pas375jb.us-west.insforge.app';
const anonKey = ((import.meta as any)?.env?.VITE_INSFORGE_ANON_KEY as string | undefined) ?? '';

export const insforge = createClient({
  baseUrl,
  anonKey,
  // Use SDK-managed session persistence + refresh.
  persistSession: true,
  autoRefreshToken: true
});

