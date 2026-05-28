import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'

const releaseId =
  process.env.VITE_APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  'dev'

function readLinkedInsforgeHost(): string | null {
  try {
    const projectPath = path.resolve(process.cwd(), '.insforge', 'project.json')
    const text = fs.readFileSync(projectPath, 'utf8')
    const json = JSON.parse(text) as { oss_host?: unknown }
    return typeof json.oss_host === 'string' && json.oss_host.trim() ? json.oss_host.trim() : null
  } catch {
    return null
  }
}

const devProxyTarget =
  process.env.INSFORGE_DEV_PROXY_TARGET ||
  process.env.VITE_INSFORGE_BASE_URL ||
  readLinkedInsforgeHost() ||
  ''

// https://vitejs.dev/config/
// Force rebuild cache bust - v2
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(String(releaseId).slice(0, 12)),
  },
  plugins: [
    react(),
    {
      name: 'local-invites-api',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const url = req.url ?? '';
          const m = url.match(/^\/api\/invites\/([^/?]+)/);
          if (!m) return next();

          const body = await new Promise<unknown>((resolve) => {
            const chunks: Buffer[] = [];
            req.on('data', (c: Buffer) => chunks.push(c));
            req.on('end', () => {
              try { resolve(JSON.parse(Buffer.concat(chunks).toString())); }
              catch { resolve({}); }
            });
          });

          (req as any).query = { action: m[1] };
          (req as any).body = body;

          let statusCode = 200;
          (res as any).status = (code: number) => { statusCode = code; return res; };
          (res as any).json = (data: unknown) => {
            if (!res.headersSent) {
              res.writeHead(statusCode, { 'Content-Type': 'application/json' });
            }
            res.end(JSON.stringify(data));
          };

          try {
            const mod = await server.ssrLoadModule('/api/invites-router.ts');
            await (mod.default as (req: any, res: any) => Promise<void>)(req, res);
          } catch (err) {
            console.error('[local-invites-api]', err);
            if (!res.headersSent) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ ok: false, error: 'Internal server error' }));
            }
          }
        });
      }
    }
  ],
  server: {
    proxy: {
      '/api': {
        target: devProxyTarget || 'http://localhost:7130',
        changeOrigin: true,
      },
    },
  },
})
