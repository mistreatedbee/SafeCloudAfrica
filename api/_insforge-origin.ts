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
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const projectPath = path.resolve(here, '..', '.insforge', 'project.json');
    const text = fs.readFileSync(projectPath, 'utf8');
    const json = JSON.parse(text) as { oss_host?: unknown };
    const host = typeof json.oss_host === 'string' ? json.oss_host : '';
    return normalizeOrigin(host);
  } catch {
    return '';
  }
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

