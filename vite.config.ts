import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
// Force rebuild cache bust - v2
export default defineConfig({
  plugins: [react()],
})
