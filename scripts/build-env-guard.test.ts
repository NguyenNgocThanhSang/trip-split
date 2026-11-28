/**
 * Kiểm thử hàm thuần `findProdEnvProblems` chặn build production trỏ vào emulator hoặc thiếu cấu hình.
 */
import { describe, expect, it } from 'vitest'
import { findProdEnvProblems } from './build-env-guard.ts'

// Cấu hình giống bản production đang chạy (project trip-split-4da89); giá trị key/app id là giả
const PROD_ENV = {
  VITE_FIREBASE_API_KEY: 'AIzaFakeKeyForTest',
  VITE_FIREBASE_AUTH_DOMAIN: 'trip-split-4da89.firebaseapp.com',
  VITE_FIREBASE_PROJECT_ID: 'trip-split-4da89',
  VITE_FIREBASE_APP_ID: '1:123456789:web:abcdef',
  VITE_ADMIN_UID: 'BdmGrQUlwkdSxvcPNpNG1qIdKCk1',
  VITE_USE_EMULATOR: 'false',
}

describe('findProdEnvProblems', () => {
  it('cho qua khi đủ cấu hình Firebase thật và tắt emulator', () => {
    expect(findProdEnvProblems(PROD_ENV)).toEqual([])
  })

  it('cho qua khi VITE_USE_EMULATOR để trống vì app chỉ nối emulator khi đúng bằng "true"', () => {
    expect(findProdEnvProblems({ ...PROD_ENV, VITE_USE_EMULATOR: undefined })).toEqual([])
  })

  it('chặn khi VITE_USE_EMULATOR=true', () => {
    const problems = findProdEnvProblems({ ...PROD_ENV, VITE_USE_EMULATOR: 'true' })
    expect(problems).toHaveLength(1)
    expect(problems[0]).toContain('VITE_USE_EMULATOR=true')
  })

  it('chặn khi projectId là project giả demo-*', () => {
    const problems = findProdEnvProblems({ ...PROD_ENV, VITE_FIREBASE_PROJECT_ID: 'demo-tripsplit' })
    expect(problems.some((p) => p.includes('demo-tripsplit'))).toBe(true)
  })

  it('chặn và liệt kê từng biến bắt buộc đang trống hoặc chỉ có khoảng trắng', () => {
    const problems = findProdEnvProblems({ ...PROD_ENV, VITE_FIREBASE_API_KEY: '  ', VITE_ADMIN_UID: '' })
    expect(problems).toEqual([
      expect.stringContaining('VITE_FIREBASE_API_KEY'),
      expect.stringContaining('VITE_ADMIN_UID'),
    ])
  })

  it('báo đủ mọi lỗi khi build bằng cấu hình .env.local của emulator', () => {
    // Đúng tình huống bản preview hỏng ngày 2026-11-28: 4 biến Firebase trống + emulator bật
    const problems = findProdEnvProblems({ VITE_USE_EMULATOR: 'true' })
    expect(problems).toHaveLength(6)
  })
})
