import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Force rebuild cache bust - v2
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api/insforge': {
        target: 'https://pas375jb.us-west.insforge.app',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/insforge/, ''),
      },
    },
  },
})
