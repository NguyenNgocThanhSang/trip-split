/**
 * Kiểm thử hàm thuần `resolveMe` để bảo đảm chỉ giữ lại ID thành viên hợp lệ của chuyến đi.
 * Chạy trên môi trường Node, không phụ thuộc React hay localStorage thật.
 */
import { describe, expect, it } from 'vitest'
import { resolveMe } from './useMe'

describe('resolveMe', () => {
  it('trả về chính xác ID khi giá trị đã lưu nằm trong danh sách thành viên', () => {
    expect(resolveMe('sang', ['sang', 'mo'])).toBe('sang')
  })

  it('trả về null khi ID đã lưu không còn nằm trong chuyến đi (ví dụ đã bị xóa)', () => {
    expect(resolveMe('ghost', ['sang'])).toBeNull()
  })

  it('trả về null khi chưa có giá trị nào được lưu trong localStorage', () => {
    expect(resolveMe(null, ['sang', 'mo'])).toBeNull()
    expect(resolveMe('', ['sang', 'mo'])).toBeNull()
  })
})
