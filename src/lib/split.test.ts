/**
 * Bộ kiểm thử đơn vị cho thuật toán chia tiền (`split.ts`).
 * Kiểm tra chia đều, chia theo nhóm nhỏ, cố định một phần + chia phần dư và làm tròn khớp tuyệt đối VND.
 */
import { describe, expect, it } from 'vitest'
import { computeShares, type SplitResult } from './split'

// Thứ tự thành viên chuẩn theo dữ liệu Google Sheet mẫu (Sang, Chung, Mơ, Phụng)
const order = ['sang', 'chung', 'mo', 'phung']

const sum = (r: SplitResult) =>
  r.ok ? Object.values(r.shares).reduce((a, b) => a + b, 0) : NaN

describe('computeShares', () => {
  it('chia phần cố định trước rồi chia đều phần dư cho những người còn lại (ví dụ chuẩn 190.000đ)', () => {
    // Ví dụ chuẩn trong DESIGN.md §8.2: Ăn sáng 190k, Chung 45k, Mơ 45k -> Sang & Phụng mỗi người 50k
    const r = computeShares({
      amount: 190000,
      participantIds: order,
      fixedAmounts: { chung: 45000, mo: 45000 },
      memberOrder: order,
    })
    expect(r).toEqual({
      ok: true,
      shares: { sang: 50000, chung: 45000, mo: 45000, phung: 50000 },
    })
  })

  it('chia 100.000đ cho 3 người thì 1đ lẻ rơi vào người đứng đầu theo memberOrder', () => {
    // participantIds truyền lệch thứ tự để xác minh ưu tiên theo memberOrder (Sang đứng trước Chung, Mơ)
    const r = computeShares({
      amount: 100000,
      participantIds: ['mo', 'sang', 'chung'],
      fixedAmounts: {},
      memberOrder: order,
    })
    expect(r).toEqual({
      ok: true,
      shares: { sang: 33334, chung: 33333, mo: 33333 },
    })
  })

  it('chia 10đ cho 3 người ra 4, 3, 3 và tổng khớp chính xác 10đ', () => {
    const r = computeShares({
      amount: 10,
      participantIds: ['sang', 'chung', 'mo'],
      fixedAmounts: {},
      memberOrder: order,
    })
    expect(r.ok && r.shares).toEqual({ sang: 4, chung: 3, mo: 3 })
  })

  it('chỉ chia trong nhóm người tham gia được chọn (không gán 0đ cho người ngoài)', () => {
    // Ví dụ tiền xăng 100k chỉ Sang & Mơ đi chung xe
    const r = computeShares({
      amount: 100000,
      participantIds: ['sang', 'mo'],
      fixedAmounts: {},
      memberOrder: order,
    })
    expect(r.ok && r.shares).toEqual({ sang: 50000, mo: 50000 })
  })

  it('cho phép cố định 0đ cho một người tham gia', () => {
    const r = computeShares({
      amount: 90000,
      participantIds: ['sang', 'chung', 'mo'],
      fixedAmounts: { mo: 0 },
      memberOrder: order,
    })
    expect(r.ok && r.shares).toEqual({ sang: 45000, chung: 45000, mo: 0 })
  })

  it('chấp nhận khi tất cả đều nhập số cố định và tổng khớp thành tiền', () => {
    const r = computeShares({
      amount: 190000,
      participantIds: order,
      fixedAmounts: { sang: 50000, chung: 45000, mo: 45000, phung: 50000 },
      memberOrder: order,
    })
    expect(r.ok).toBe(true)
  })

  it('khử trùng mã người tham gia bị lặp trước khi tính chia tiền', () => {
    expect(
      sum(
        computeShares({
          amount: 100000,
          participantIds: ['sang', 'sang', 'mo'],
          fixedAmounts: {},
          memberOrder: order,
        }),
      ),
    ).toBe(100000)
  })

  it.each([
    [{ amount: 0, participantIds: ['sang'], fixedAmounts: {} }, 'INVALID_AMOUNT'],
    [{ amount: 100.5, participantIds: ['sang'], fixedAmounts: {} }, 'INVALID_AMOUNT'],
    [{ amount: 100000, participantIds: [], fixedAmounts: {} }, 'NO_PARTICIPANTS'],
    [{ amount: 100000, participantIds: ['sang'], fixedAmounts: { mo: 1000 } }, 'FIXED_NOT_PARTICIPANT'],
    [{ amount: 100000, participantIds: ['sang', 'mo'], fixedAmounts: { mo: -1 } }, 'INVALID_FIXED'],
    [
      { amount: 190000, participantIds: ['sang', 'mo', 'chung'], fixedAmounts: { sang: 100000, mo: 100000 } },
      'FIXED_EXCEEDS_TOTAL',
    ],
    [
      { amount: 190000, participantIds: order, fixedAmounts: { sang: 50000, chung: 45000, mo: 45000, phung: 40000 } },
      'ALL_FIXED_MISMATCH',
    ],
  ])('trả về mã lỗi và thông báo tiếng Việt hợp lệ cho trường hợp %#', (input, error) => {
    const r = computeShares({ ...input, memberOrder: order })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.error).toBe(error)
      expect(r.message.length).toBeGreaterThan(0)
    }
  })
})
