/**
 * Kiểm thử khởi tạo (smoke test) để xác nhận Vitest và cấu hình TypeScript hoạt động bình thường.
 */
import { describe, expect, it } from 'vitest'

describe('Kiểm thử khởi tạo hệ thống', () => {
  it('tính toán cơ bản hoạt động chính xác', () => {
    expect(1 + 1).toBe(2)
  })
})
