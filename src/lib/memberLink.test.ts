/**
 * Bộ kiểm thử đơn vị cho module xử lý liên kết cá nhân thành viên (`memberLink.ts`).
 */
import { describe, expect, it } from 'vitest'
import {
  buildPersonalTripUrl,
  isValidMemberCode,
  parseMemberKeyParam,
} from './memberLink'

describe('isValidMemberCode', () => {
  it('chấp nhận mã dài 12..32 ký tự chỉ gồm [a-z0-9] và từ chối mã ngắn/sai ký tự', () => {
    expect(isValidMemberCode('abcdefgh2345')).toBe(true)
    expect(isValidMemberCode('a'.repeat(32))).toBe(true)
    expect(isValidMemberCode('short123456')).toBe(false)
    expect(isValidMemberCode('a'.repeat(33))).toBe(false)
    expect(isValidMemberCode('Abcdefgh2345')).toBe(false)
    expect(isValidMemberCode('abcdefgh234-')).toBe(false)
  })
})

describe('buildPersonalTripUrl & parseMemberKeyParam', () => {
  it('tạo link cá nhân dạng /t/:tripId?k=<memberId>.<code> và chuẩn hóa dấu / cuối origin', () => {
    expect(buildPersonalTripUrl('https://tripsplit.workers.dev/', 'k3x9p2qm7a', 'chung', 'chungcode1234')).toBe(
      'https://tripsplit.workers.dev/t/k3x9p2qm7a?k=chung.chungcode1234',
    )
  })

  it('phân tích đúng ?k=<memberId>.<code> kể cả khi memberId có dấu chấm', () => {
    expect(parseMemberKeyParam('chung.chungcode1234')).toEqual({
      memberId: 'chung',
      code: 'chungcode1234',
    })
    expect(parseMemberKeyParam('nguyen.chung.chungcode1234')).toEqual({
      memberId: 'nguyen.chung',
      code: 'chungcode1234',
    })
  })

  it('trả về null khi ?k= rỗng, thiếu dấu chấm, thiếu memberId hoặc mã không hợp lệ', () => {
    expect(parseMemberKeyParam(null)).toBeNull()
    expect(parseMemberKeyParam('')).toBeNull()
    expect(parseMemberKeyParam('chungcode1234')).toBeNull()
    expect(parseMemberKeyParam('.chungcode1234')).toBeNull()
    expect(parseMemberKeyParam('chung.short')).toBeNull()
    expect(parseMemberKeyParam('chung.INVALIDCODE12')).toBeNull()
  })
})
