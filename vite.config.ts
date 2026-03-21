import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { visualizer } from 'rollup-plugin-visualizer'

function trimInsforgeProxyTarget(raw: string | undefined): string {
  const s = String(raw ?? '').trim()
  if (!s) return ''
  try {
    const u = new URL(s)
    return u.origin
  } catch {
    return s.replace(/\/+$/, '')
  }
}

function vendorManualChunks(id: string): string | undefined {
  if (!id.includes('node_modules')) return undefined
  if (id.includes('react-router')) return 'react-router'
  if (id.includes('react-dom')) return 'react-dom'
  if (id.includes('framer-motion')) return 'framer-motion'
  if (id.includes('recharts')) return 'recharts'
  if (id.includes('node_modules/react/')) return 'react'
  return undefined
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const releaseId =
    env.VITE_APP_VERSION ||
    process.env.VITE_APP_VERSION ||
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.COMMIT_SHA ||
    'dev'

  const proxyTarget = trimInsforgeProxyTarget(
    process.env.INSFORGE_DEV_PROXY_TARGET ||
      env.INSFORGE_DEV_PROXY_TARGET ||
      process.env.VITE_INSFORGE_BASE_URL ||
      env.VITE_INSFORGE_BASE_URL
  )

  const analyze = process.env.ANALYZE === '1'

  return {
    define: {
      __APP_VERSION__: JSON.stringify(String(releaseId).slice(0, 12)),
    },
    plugins: [
      react(),
      ...(analyze
        ? [
            visualizer({
              filename: 'stats.html',
              gzipSize: true,
              open: false,
            }),
          ]
        : []),
    ],
    build: {
      rollupOptions: {
        output: {
          manualChunks: vendorManualChunks,
        },
      },
    },
    server: {
      ...(proxyTarget
        ? {
            proxy: {
              '/api': {
                target: proxyTarget,
                changeOrigin: true,
              },
            },
          }
        : {}),
    },
  }
})
