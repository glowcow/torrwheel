import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// The daemon serves the built files from its root, next to rpc; the build is
// relative so a proxy may mount it under any path.
export default defineConfig({
  base: './',
  plugins: [react(), tailwindcss()],
  build: {
    emptyOutDir: true,
    // Nothing is inlined: 271 small flags would otherwise land in the bundle as data URIs.
    assetsInlineLimit: 0,
  },
  server: {
    host: '0.0.0.0',
    port: 5173,
    watch: {
      usePolling: true,
    },
    // Dev only: the RPC goes to a daemon; the Host header stays the browser's.
    proxy: {
      '/rpc': {
        target: process.env.VITE_API_HOST || 'http://localhost:9091',
      },
    },
  },
})
