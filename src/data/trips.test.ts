/**
 * Bộ kiểm thử đơn vị thuần cho các hàm hỗ trợ trong `src/data/trips.ts`.
 * Kiểm tra phân loại snapshot offline/cache (Review Focus #4) và chuyển đổi Friend -> Member.
 */
import type { Timestamp } from 'firebase/firestore'
import { describe, expect, it } from 'vitest'
import { classifyTripSnapshot, memberFromFriend } from './trips'
import type { Friend } from './types'

describe('classifyTripSnapshot', () => {
  it('phân loại đúng trạng thái chuyến đi theo exists và fromCache (Review Focus #4)', () => {
    expect(classifyTripSnapshot({ exists: true, fromCache: true })).toBe('ok')
    expect(classifyTripSnapshot({ exists: true, fromCache: false })).toBe('ok')
    expect(classifyTripSnapshot({ exists: false, fromCache: false })).toBe('not-found')
    // Mở link lần đầu khi mất mạng: cache trống nên không được báo nhầm là "Link không đúng"
    expect(classifyTripSnapshot({ exists: false, fromCache: true })).toBe('offline-empty')
  })
})

describe('memberFromFriend', () => {
  it('chuyển đổi Friend sang Member, giữ thông tin ngân hàng và bỏ qua ảnh QR thô', () => {
    const ts = {} as Timestamp
    const friendWithQr: Friend = {
      id: 'sang',
      name: 'Sang',
      bankBin: '970436',
      bankShortName: 'Vietcombank',
      accountNo: '0123456789',
      accountName: 'NGUYEN NGOC SANG',
      momoQrDataUrl: 'data:image/webp;base64,AAAA',
      createdAt: ts,
      updatedAt: ts,
    }
    const member = memberFromFriend(friendWithQr)
    expect(member).toEqual({
      id: 'sang',
      name: 'Sang',
      bankBin: '970436',
      bankShortName: 'Vietcombank',
      accountNo: '0123456789',
      accountName: 'NGUYEN NGOC SANG',
      hasStaticQr: true,
    })
    expect('momoQrDataUrl' in member).toBe(false)

    const friendWithoutQr: Friend = {
      id: 'chung',
      name: 'Chung',
      createdAt: ts,
      updatedAt: ts,
    }
    expect(memberFromFriend(friendWithoutQr)).toEqual({
      id: 'chung',
      name: 'Chung',
      hasStaticQr: false,
    })
  })
})
