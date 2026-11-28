/**
 * Plugin Vite chặn `vite build` (mode production) khi cấu hình Firebase không phải môi trường thật.
 * Ngăn lặp lại sự cố bản build trỏ vào Firestore Emulator (127.0.0.1) hoặc project giả `demo-*`
 * khiến điện thoại không tải được dữ liệu. Chỉ đọc biến môi trường — không import mã ứng dụng `src/`.
 */
import type { Plugin } from 'vite'
import { loadEnv } from 'vite'

/** Các biến bắt buộc phải có giá trị khi build production (nhúng vào JS lúc build, xem `src/data/firebase.ts`). */
export const REQUIRED_PROD_ENV = [
  'VITE_FIREBASE_API_KEY',
  'VITE_FIREBASE_AUTH_DOMAIN',
  'VITE_FIREBASE_PROJECT_ID',
  'VITE_FIREBASE_APP_ID',
  'VITE_ADMIN_UID',
] as const

/**
 * Liệt kê các lỗi cấu hình khiến bản build production không dùng được.
 * Tách thành hàm thuần để unit test mà không cần chạy Vite.
 *
 * @param env - Bản đồ biến môi trường đã nạp (từ `loadEnv` hoặc `process.env`)
 * @returns Danh sách thông báo lỗi tiếng Việt; mảng rỗng nghĩa là cấu hình hợp lệ
 * @example
 * findProdEnvProblems({ VITE_USE_EMULATOR: 'true' })
 * // ['VITE_USE_EMULATOR=true: bản build sẽ gọi Firestore Emulator 127.0.0.1 thay vì Firebase thật', ...]
 */
export function findProdEnvProblems(env: Record<string, string | undefined>): string[] {
  const problems: string[] = []

  // src/data/firebase.ts chỉ nối emulator khi giá trị đúng là 'true'
  if (env.VITE_USE_EMULATOR === 'true') {
    problems.push(
      'VITE_USE_EMULATOR=true: bản build sẽ gọi Firestore Emulator 127.0.0.1 thay vì Firebase thật',
    )
  }

  for (const key of REQUIRED_PROD_ENV) {
    if (!env[key]?.trim()) {
      problems.push(`${key} đang trống: app sẽ rơi về cấu hình giả demo-tripsplit`)
    }
  }

  const projectId = env.VITE_FIREBASE_PROJECT_ID?.trim()
  if (projectId?.startsWith('demo-')) {
    problems.push(`VITE_FIREBASE_PROJECT_ID=${projectId}: project "demo-*" chỉ tồn tại trên emulator`)
  }

  return problems
}

/**
 * Plugin Vite chạy lúc bắt đầu `vite build` ở mode `production`; ném lỗi để dừng build nếu cấu hình sai.
 * Bỏ qua `vite dev` và mode khác (vd. `vitest` dùng mode `test`).
 * Đặt `SKIP_ENV_GUARD=1` để build thử cấu hình emulator một cách có chủ đích (vd. kiểm tra bundle trong CI).
 *
 * @returns Plugin Vite `tripsplit:build-env-guard`
 * @throws {Error} Khi `findProdEnvProblems` trả về ít nhất một lỗi
 */
export function buildEnvGuard(): Plugin {
  return {
    name: 'tripsplit:build-env-guard',
    apply: 'build',
    configResolved(config) {
      if (config.mode !== 'production' || process.env.SKIP_ENV_GUARD === '1') {
        return
      }
      // loadEnv đọc .env, .env.local, .env.production(.local); process.env (biến build trên Cloudflare) được ưu tiên
      const env = { ...loadEnv(config.mode, config.envDir || process.cwd(), 'VITE_'), ...process.env }
      const problems = findProdEnvProblems(env)
      if (problems.length > 0) {
        throw new Error(
          [
            'Dừng build: cấu hình Firebase không phải môi trường production.',
            ...problems.map((p) => `  - ${p}`),
            'Điền cấu hình thật vào .env.production.local (build trên máy) hoặc Cloudflare → Settings → Build → Variables.',
            'Xem docs/DEPLOY.md.',
          ].join('\n'),
        )
      }
    },
  }
}
