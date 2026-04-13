import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const releaseId =
  process.env.VITE_APP_VERSION ||
  process.env.VERCEL_GIT_COMMIT_SHA ||
  process.env.COMMIT_SHA ||
  'dev'

// https://vitejs.dev/config/
// Force rebuild cache bust - v2
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(String(releaseId).slice(0, 12)),
  },
  plugins: [react()],
  server: {
    proxy: {
      '/api': {
        target: 'https://pas375jb.us-west.insforge.app',
        changeOrigin: true,
      },
    },
  },
})
