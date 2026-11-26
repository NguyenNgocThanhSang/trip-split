/**
 * Bộ kiểm thử đơn vị cho hàm sinh mã ngẫu nhiên an toàn (`id.ts`).
 */
import { describe, expect, it } from 'vitest'
import { ID_ALPHABET, randomId } from './id'

describe('randomId', () => {
  it('sinh 1.000 mã dài 10 ký tự hợp lệ thuộc ID_ALPHABET và không trùng lặp', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      const id = randomId()
      expect(id).toHaveLength(10)
      expect(id).toMatch(/^[a-z0-9]{10}$/)
      for (const ch of id) {
        expect(ID_ALPHABET).toContain(ch)
      }
      seen.add(id)
    }
    expect(seen.size).toBe(1000)
  })

  it('hỗ trợ độ dài tùy chỉnh và ném RangeError nếu độ dài không hợp lệ', () => {
    expect(randomId(6)).toHaveLength(6)
    expect(() => randomId(0)).toThrow(RangeError)
    expect(() => randomId(-1)).toThrow(RangeError)
  })
})
