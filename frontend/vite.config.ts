import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Dataset mặt bằng nằm ngoài `frontend/` để backend đọc được cùng một
      // nguồn — xem data/README.md.
      // Keep this specific prefix before the broad `@` alias.
      '@data': fileURLToPath(new URL('../data', import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  // Backend chạy ở cổng khác. Proxy `/api/*` thay vì bật CORS: trình duyệt chỉ
  // thấy một origin, nên không có preflight và không phải khai danh sách origin.
  // Thay cho `rewrites()` của Next (xem frontend/legacy/mail-next/next.config.mjs).
  server: {
    // Dev server phải được phép đọc `data/` ở ngoài thư mục gốc của Vite.
    fs: { allow: ['..'] },
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
  build: {
    // Floor artifacts are fetched as static `.json` (see data/floorAssets.ts).
    // Inlining one as a base64 data URI would put it back in a JS chunk, a
    // third larger than the file it replaces.
    assetsInlineLimit: (filePath) => (filePath.endsWith('.json') ? false : undefined),
    rollupOptions: {
      output: {
        // Floor data reaching the JS graph is a bug, not a layout the bundle
        // should optimise — but a consumer outside floor-planning still
        // imports a floor JSON as a module. Give any such file its own chunk
        // per floor so it is never folded into someone else's, whatever the
        // floor id.
        manualChunks(id) {
          const floor = /[/\\]data[/\\]floors[/\\]([^/\\]+)[/\\][^/\\]+\.json$/.exec(id)
          return floor ? `${floor[1]}-data` : undefined
        },
      },
      plugins: [
        {
          // The layout artifact is 2.9 MB for Floor 16 alone. Entering the
          // entry chunk means every page waits on every floor's geometry, and
          // a single new import edge is enough to cause it silently.
          name: 'assert-floor-data-is-not-entry',
          generateBundle(_options, bundle) {
            const isFloorData = (id: string) => /[/\\]data[/\\]floors[/\\][^/\\]+[/\\][^/\\]+\.json$/.test(id)
            for (const output of Object.values(bundle)) {
              if (output.type !== 'chunk' || !output.isEntry) continue
              const offenders = Object.keys(output.modules).filter(isFloorData)
              if (offenders.length > 0) {
                this.error(`Floor geometry must remain outside the entry chunk: ${offenders.join(', ')}`)
              }
            }
          },
        },
      ],
    },
  },
})
