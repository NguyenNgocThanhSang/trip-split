/**
 * Bộ kiểm thử đơn vị cho module tạo tin nhắn nhắc nợ và liên kết thanh toán (`reminder.ts`).
 * Kiểm tra định dạng nhắc nhóm, nhắc từng người và phân tích tham số `?pay=`.
 */
import { describe, expect, it } from 'vitest'
import {
  buildGroupReminder,
  buildPayLink,
  buildPersonalReminder,
  parsePayParam,
} from './reminder'

const nameOf = (id: string) =>
  ({ sang: 'Sang', chung: 'Chung', mo: 'Mơ', phung: 'Phụng' })[id]!

describe('buildGroupReminder', () => {
  it('tạo tin nhắn tổng kết nhóm gồm khoản cần trả, khoản đã trả và link chuyến đi', () => {
    expect(
      buildGroupReminder({
        tripName: 'Đà Lạt 2026',
        tripUrl: 'https://x.pages.dev/t/k3x9p2qm7a',
        totalSpent: 1105000,
        transfers: [
          { fromId: 'chung', toId: 'sang', amount: 273750 },
          { fromId: 'mo', toId: 'sang', amount: 273750 },
        ],
        paid: [{ fromId: 'phung', toId: 'sang', amount: 278750 }],
        nameOf,
      }),
    ).toBe(
      [
        '💸 Chia tiền Đà Lạt 2026',
        '💰 Tổng chi: 1.105.000đ',
        '• Chung → Sang: 273.750đ',
        '• Mơ → Sang: 273.750đ',
        '✅ Đã trả: Phụng → Sang 278.750đ',
        'Xem chi tiết & quét QR: https://x.pages.dev/t/k3x9p2qm7a',
      ].join('\n'),
    )
  })

  it('hiển thị thông báo hoàn tất khi không còn khoản nào cần chuyển', () => {
    expect(
      buildGroupReminder({
        tripName: 'T',
        tripUrl: 'u',
        totalSpent: 0,
        transfers: [],
        paid: [],
        nameOf,
      }),
    ).toContain('✅ Cả nhóm đã thanh toán xong!')
  })
})

describe('buildPersonalReminder', () => {
  it('tạo tin nhắn nhắc riêng kèm thông tin ngân hàng, nội dung không dấu và link QR', () => {
    const text = buildPersonalReminder({
      tripName: 'Đà Lạt 2026',
      tripUrl: 'https://x.pages.dev/t/k3x9p2qm7a',
      transfer: { fromId: 'chung', toId: 'sang', amount: 273750 },
      from: { id: 'chung', name: 'Chung' },
      to: {
        id: 'sang',
        name: 'Sang',
        bankBin: '970436',
        accountNo: '0123456789',
        accountName: 'NGUYEN NGOC SANG',
      },
    })
    expect(text.split('\n')).toEqual([
      '👋 Chung ơi, phần của bạn chuyến Đà Lạt 2026 là 273.750đ (chuyển cho Sang).',
      '🏦 Vietcombank - 0123456789 (NGUYEN NGOC SANG)',
      '📝 Nội dung: Chung tra tien Da Lat 2026',
      '🔗 Quét QR điền sẵn tiền: https://x.pages.dev/t/k3x9p2qm7a?pay=chung.sang',
    ])
  })

  it('bỏ dòng thông tin ngân hàng khi người nhận chưa có số tài khoản', () => {
    const text = buildPersonalReminder({
      tripName: 'T',
      tripUrl: 'u',
      transfer: { fromId: 'a', toId: 'b', amount: 1000 },
      from: { id: 'a', name: 'A' },
      to: { id: 'b', name: 'B' },
    })
    expect(text).not.toContain('🏦')
  })

  it('hiển thị dòng ngân hàng gọn khi không có tên chủ tài khoản', () => {
    const text = buildPersonalReminder({
      tripName: 'T',
      tripUrl: 'u',
      transfer: { fromId: 'a', toId: 'b', amount: 1000 },
      from: { id: 'a', name: 'A' },
      to: { id: 'b', name: 'B', bankBin: '970436', accountNo: '0123456789' },
    })
    expect(text).toContain('🏦 Vietcombank - 0123456789\n')
    expect(text).not.toContain('()')
  })
})

describe('buildPayLink & parsePayParam', () => {
  it('tạo và phân tích đúng tham số ?pay= với dấu chấm phân cách', () => {
    expect(buildPayLink('https://x.pages.dev/t/k3x9p2qm7a', 'chung', 'sang')).toBe(
      'https://x.pages.dev/t/k3x9p2qm7a?pay=chung.sang',
    )
    // Review Focus #5: chỉ chấp nhận cặp ID khác nhau và đều khác rỗng
    expect(parsePayParam('chung.sang')).toEqual({ fromId: 'chung', toId: 'sang' })
    expect(parsePayParam(null)).toBeNull()
    expect(parsePayParam('chung')).toBeNull()
    expect(parsePayParam('a.a')).toBeNull()
    expect(parsePayParam('.sang')).toBeNull()
    expect(parsePayParam('chung.')).toBeNull()
    expect(parsePayParam('a.b.c')).toBeNull()
    expect(parsePayParam(' . ')).toBeNull()
  })
})
