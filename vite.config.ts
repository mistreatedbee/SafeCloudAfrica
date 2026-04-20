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
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return;

          if (
            id.includes('\\react\\') ||
            id.includes('/react/') ||
            id.includes('\\react-dom\\') ||
            id.includes('/react-dom/') ||
            id.includes('\\react-router\\') ||
            id.includes('/react-router/') ||
            id.includes('\\react-router-dom\\') ||
            id.includes('/react-router-dom/')
          ) {
            return 'react-vendor';
          }

          if (id.includes('\\lucide-react\\') || id.includes('/lucide-react/')) {
            return 'icons-vendor';
          }

          if (id.includes('\\recharts\\') || id.includes('/recharts/')) {
            return 'charts-vendor';
          }

          if (id.includes('\\framer-motion\\') || id.includes('/framer-motion/')) {
            return 'motion-vendor';
          }

          if (
            id.includes('\\@insforge\\sdk\\') ||
            id.includes('/@insforge/sdk/') ||
            id.includes('\\@insforge\\react\\') ||
            id.includes('/@insforge/react/')
          ) {
            return 'insforge-vendor';
          }
        },
      },
    },
  },
  server: {
    proxy: {
      '/api': {
        target: devProxyTarget || 'http://localhost:7130',
        changeOrigin: true,
      },
    },
  },
})
