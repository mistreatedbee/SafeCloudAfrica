import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

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

  return {
    define: {
      __APP_VERSION__: JSON.stringify(String(releaseId).slice(0, 12)),
    },
    plugins: [react()],
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
