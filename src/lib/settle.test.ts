/**
 * Bộ kiểm thử đơn vị cho thuật toán tối ưu kế hoạch thanh toán (`settle.ts`).
 * Kiểm tra khớp đối xứng ưu tiên, tham lam lớn-nhỏ, hoàn tiền khi trả dư và tính xác định của kết quả.
 */
import { describe, expect, it } from 'vitest'
import { settle } from './settle'

const rows = (o: Record<string, number>) =>
  Object.entries(o).map(([memberId, balance]) => ({ memberId, balance }))

describe('settle', () => {
  it('lập đúng 3 giao dịch trả cho Sang từ số dư Google Sheet mẫu', () => {
    // Phụng nợ nhiều nhất (278.750đ) xếp trước, tiếp theo là Chung và Mơ (273.750đ) theo memberOrder
    expect(
      settle(
        rows({ sang: 826250, chung: -273750, mo: -273750, phung: -278750 }),
        ['sang', 'chung', 'mo', 'phung'],
      ),
    ).toEqual([
      { fromId: 'phung', toId: 'sang', amount: 278750 },
      { fromId: 'chung', toId: 'sang', amount: 273750 },
      { fromId: 'mo', toId: 'sang', amount: 273750 },
    ])
  })

  it('ưu tiên ghép các cặp nợ và nhận có cùng số tiền chính xác trước khi tham lam', () => {
    // A nợ 100k khớp C nhận 100k; B nợ 50k khớp D nhận 50k -> chỉ 2 giao dịch thay vì trộn chéo
    const t = settle(rows({ a: -100000, b: -50000, c: 100000, d: 50000 }), ['a', 'b', 'c', 'd'])
    expect(t).toEqual([
      { fromId: 'a', toId: 'c', amount: 100000 },
      { fromId: 'b', toId: 'd', amount: 50000 },
    ])
  })

  it('tối đa n - 1 giao dịch và đưa số dư tất cả thành viên về 0', () => {
    const input = rows({ a: 70000, b: 30000, c: -45000, d: -35000, e: -20000 })
    const t = settle(input, ['a', 'b', 'c', 'd', 'e'])
    expect(t.length).toBeLessThanOrEqual(4)

    const net: Record<string, number> = { a: 70000, b: 30000, c: -45000, d: -35000, e: -20000 }
    t.forEach((x) => {
      net[x.fromId] += x.amount
      net[x.toId] -= x.amount
    })
    expect(Object.values(net).every((v) => v === 0)).toBe(true)
  })

  it('tạo giao dịch chiều ngược lại khi một thành viên chuyển dư tiền', () => {
    // Review Focus #1: Chung trả dư cho Sang 26.250đ -> kế hoạch hiện Sang trả lại Chung 26.250đ
    expect(settle(rows({ sang: -26250, chung: 26250 }), ['sang', 'chung'])).toEqual([
      { fromId: 'sang', toId: 'chung', amount: 26250 },
    ])
  })

  it('trả về danh sách rỗng khi tất cả đã cân bằng 0đ', () => {
    expect(settle(rows({ a: 0, b: 0 }), ['a', 'b'])).toEqual([])
  })

  it('cho kết quả xác định bất kể thứ tự mảng đầu vào', () => {
    const order = ['a', 'b', 'c', 'd']
    const x = rows({ a: 50000, b: 50000, c: -50000, d: -50000 })
    expect(settle([...x].reverse(), order)).toEqual(settle(x, order))
  })
})
