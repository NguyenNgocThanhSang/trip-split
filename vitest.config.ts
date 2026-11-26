/**
 * Cấu hình Vitest cho TripSplit.
 * Mặc định `npm test` chỉ quét `src/**`; khi chạy `vitest run --dir tests` sẽ quét `tests/**`.
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
    dir: 'src',
    environment: 'node',
    include: ['**/*.test.{ts,tsx}'],
    setupFiles: [path.resolve(import.meta.dirname, './src/test-setup.ts')],
    // Chạy tuần tự giữa các file test để tránh xung đột dữ liệu trên Firestore Emulator
    fileParallelism: false,
  },
})
