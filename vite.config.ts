/**
 * Cấu hình Vite cho TripSplit (React + Tailwind CSS v4 + alias `@`).
 * Kèm `buildEnvGuard` để `vite build` production dừng ngay nếu cấu hình Firebase trỏ vào emulator/project giả.
 */
import path from 'path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { buildEnvGuard } from './scripts/build-env-guard.ts'

export default defineConfig({
  plugins: [react(), tailwindcss(), buildEnvGuard()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, './src'),
    },
  },
})
