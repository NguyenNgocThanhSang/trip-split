/**
 * Bộ kiểm thử đơn vị cho module định dạng và lấy ngày (`date.ts`).
 */
import { describe, expect, it } from 'vitest'
import { formatDateVN, todayISO } from './date'

describe('formatDateVN', () => {
  it('chuyển chuỗi ngày ISO YYYY-MM-DD sang định dạng dd/MM/yyyy', () => {
    expect(formatDateVN('2026-12-20')).toBe('20/12/2026')
    expect(formatDateVN('2026-01-05')).toBe('05/01/2026')
  })
})

describe('todayISO', () => {
  it('trả về ngày hiện tại đúng định dạng YYYY-MM-DD theo giờ máy', () => {
    const today = todayISO()
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/)

    const now = new Date()
    const expected = [
      now.getFullYear(),
      String(now.getMonth() + 1).padStart(2, '0'),
      String(now.getDate()).padStart(2, '0'),
    ].join('-')
    expect(today).toBe(expected)
  })
})
