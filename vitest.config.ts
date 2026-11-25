/**
 * Cấu hình Vitest cho TripSplit.
 * Mặc định chạy ở môi trường Node cho logic thuần; test UI tự khai báo `@vitest-environment jsdom`.
 */
import path from 'path'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['./src/test-setup.ts'],
  },
})
