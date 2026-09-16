import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import type { PreviewServer, ViteDevServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import './scripts/prepare-pdf-assets.mjs'

function advertisePdfRanges(server: ViteDevServer | PreviewServer): void {
  // Sirv serves byte ranges but omits this header on the initial 200 response.
  // PDF.js otherwise falls back to downloading the entire scanned textbook.
  server.middlewares.use((request, response, next) => {
    if (request.url?.split('?')[0]?.endsWith('.pdf')) response.setHeader('Accept-Ranges', 'bytes')
    next()
  })
}

export default defineConfig({
  plugins: [
    vue(),
    {
      name: 'local-pdf-range-loading',
      configureServer: advertisePdfRanges,
      configurePreviewServer: advertisePdfRanges,
    },
  ],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
})
