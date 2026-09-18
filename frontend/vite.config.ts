import { fileURLToPath, URL } from 'node:url'

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Backend chạy ở cổng khác. Proxy `/api/*` thay vì bật CORS: trình duyệt chỉ
  // thấy một origin, nên không có preflight và không phải khai danh sách origin.
  // Thay cho `rewrites()` của Next (xem frontend/legacy/mail-next/next.config.mjs).
  server: {
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
})
