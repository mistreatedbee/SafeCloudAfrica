/**
 * Rewrites InsForge destinations in vercel.json to match INSFORGE_BASE_URL or VITE_INSFORGE_BASE_URL.
 * Usage: INSFORGE_BASE_URL=https://xxx.us-west.insforge.app node scripts/sync-vercel-insforge-rewrites.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const vercelPath = join(root, 'vercel.json');

const raw =
  process.env.INSFORGE_BASE_URL?.trim() ||
  process.env.VITE_INSFORGE_BASE_URL?.trim() ||
  '';
if (!raw) {
  console.error('Set INSFORGE_BASE_URL or VITE_INSFORGE_BASE_URL to your InsForge origin.');
  process.exit(1);
}

let origin;
try {
  origin = new URL(raw).origin;
} catch {
  console.error('Invalid InsForge URL:', raw);
  process.exit(1);
}

const json = JSON.parse(readFileSync(vercelPath, 'utf8'));
const rewrites = json.rewrites;
if (!Array.isArray(rewrites)) {
  console.error('vercel.json: missing rewrites array');
  process.exit(1);
}

let updated = 0;
for (const rule of rewrites) {
  if (!rule || typeof rule.destination !== 'string') continue;
  const d = rule.destination;
  if (d.endsWith('/api/functions/invoke/$1')) {
    rule.destination = `${origin}/api/functions/invoke/$1`;
    updated++;
  } else if (d.endsWith('/api/$1') && rule.source === '/api/(.*)') {
    rule.destination = `${origin}/api/$1`;
    updated++;
  }
}

if (updated !== 2) {
  console.warn(`Expected to update 2 InsForge rewrite rules; updated ${updated}. Check vercel.json manually.`);
}

writeFileSync(vercelPath, `${JSON.stringify(json, null, 2)}\n`, 'utf8');
console.log('Updated vercel.json InsForge destinations to', origin);
