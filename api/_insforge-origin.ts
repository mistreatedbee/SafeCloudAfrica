import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function normalizeOrigin(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    return new URL(trimmed).origin;
  } catch {
    return trimmed.replace(/\/+$/, '');
  }
}

function readLinkedOrigin(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), '.insforge', 'project.json'),
    path.resolve(here, '..', '.insforge', 'project.json'),
    path.resolve(here, '.insforge', 'project.json')
  ];

  for (const projectPath of candidates) {
    try {
      const text = fs.readFileSync(projectPath, 'utf8');
      const json = JSON.parse(text) as { oss_host?: unknown };
      const host = typeof json.oss_host === 'string' ? json.oss_host : '';
      const normalized = normalizeOrigin(host);
      if (normalized) return normalized;
    } catch {
      // try the next candidate path
    }
  }

  return '';
}

export type ResolveInsforgeOriginOptions = {
  /** Allow Vite build-time variables to act as a fallback on the server. Defaults to false. */
  allowViteEnv?: boolean;
  /** Whether to fall back to `.insforge/project.json` when env vars are missing. Defaults to true. */
  allowLinkedProjectFallback?: boolean;
};

export function resolveInsforgeOrigin(options: ResolveInsforgeOriginOptions = {}): string {
  const allowViteEnv = options.allowViteEnv ?? false;
  const allowLinkedProjectFallback = options.allowLinkedProjectFallback ?? true;

  const fromEnv = normalizeOrigin(process.env.INSFORGE_BASE_URL ?? '');
  if (fromEnv) return fromEnv;

  if (allowViteEnv) {
    const fromViteEnv = normalizeOrigin(process.env.VITE_INSFORGE_BASE_URL ?? '');
    if (fromViteEnv) return fromViteEnv;
  }

  if (allowLinkedProjectFallback) {
    const linked = readLinkedOrigin();
    if (linked) return linked;
  }

  return '';
}
