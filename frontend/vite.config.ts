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
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('/data/floors/floor-16/floor16.layout.json')) return 'floor-16-layout'
          if (id.includes('/data/floors/floor-16/floor16.overview.json')) return 'floor-16-overview'
          if (id.includes('/data/floors/floor-16/')) return 'floor-16-data'
          return undefined
        },
      },
      plugins: [
        {
          name: 'assert-floor-layout-is-not-entry',
          generateBundle(_options, bundle) {
            for (const output of Object.values(bundle)) {
              if (output.type === 'chunk' && output.isEntry && Object.keys(output.modules).some((id) => id.includes('/data/floors/floor-16/floor16.layout.json'))) {
                this.error('Floor 16 layout geometry must remain outside the entry chunk')
              }
            }
          },
        },
      ],
    },
  },
})
