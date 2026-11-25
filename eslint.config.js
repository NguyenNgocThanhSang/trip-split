/**
 * Cấu hình ESLint (flat config) cho dự án TripSplit.
 * Kích hoạt kiểm tra TypeScript, React Hooks và React Refresh trên toàn bộ mã nguồn.
 */
import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
  },
  // Tắt cảnh báo export variants kèm component ở src/components/ui vì thư mục này do shadcn/ui
  // sinh tự động và theo quy ước dự án không chỉnh sửa tay vào các file bên trong.
  {
    files: ['src/components/ui/**/*.{ts,tsx}'],
    rules: {
      'react-refresh/only-export-components': 'off',
    },
  },
])
