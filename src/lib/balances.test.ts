/**
 * Bộ kiểm thử đơn vị cho module tính số dư từng thành viên (`balances.ts`).
 * Kiểm tra dữ liệu Google Sheet mẫu, bất biến tổng bằng 0, trả đủ/một phần/dư và lọc khoản chi lỗi.
 */
import { describe, expect, it } from 'vitest'
import { computeBalances } from './balances'
import type { ExpenseInput } from './types'

const ids = ['sang', 'chung', 'mo', 'phung']

// Fixture dữ liệu Google Sheet mẫu (Sang ứng tất cả 1.105.000đ):
// Nhà nghỉ 575k chia 4 = 143.750; Cháo mực 260k chia 4 = 65.000;
// Tàu hủ 80k chia 4 = 20.000; Ăn sáng 190k (Chung 45k, Mơ 45k -> Sang 50k, Phụng 50k).
// Tổng phải chịu: Sang 278.750, Chung 273.750, Mơ 273.750, Phụng 278.750 -> net [+826.250, -273.750, -273.750, -278.750].
const sheet: ExpenseInput[] = [
  { id: 'e1', amount: 575000, payerId: 'sang', participantIds: ids, fixedAmounts: {} },
  { id: 'e2', amount: 260000, payerId: 'sang', participantIds: ids, fixedAmounts: {} },
  { id: 'e3', amount: 80000, payerId: 'sang', participantIds: ids, fixedAmounts: {} },
  {
    id: 'e4',
    amount: 190000,
    payerId: 'sang',
    participantIds: ids,
    fixedAmounts: { chung: 45000, mo: 45000 },
  },
]

const bal = (r: ReturnType<typeof computeBalances>, id: string) =>
  r.rows.find((x) => x.memberId === id)!.balance

describe('computeBalances', () => {
  it('tính đúng số dư và tổng chi trên bộ dữ liệu Google Sheet mẫu', () => {
    const r = computeBalances(ids, sheet, [])
    expect(r.rows.map((x) => x.balance)).toEqual([826250, -273750, -273750, -278750])
    expect(r.totalSpent).toBe(1105000)
    expect(r.invalidExpenseIds).toEqual([])
  })

  it('luôn giữ tổng số dư cuối cùng và tổng chênh lệch chi tiêu bằng 0', () => {
    const r = computeBalances(ids, sheet, [{ id: 'p1', fromId: 'mo', toId: 'sang', amount: 100000 }])
    expect(r.rows.reduce((a, x) => a + x.balance, 0)).toBe(0)
    expect(r.rows.reduce((a, x) => a + x.expenseNet, 0)).toBe(0)
  })

  it('cập nhật chính xác số dư khi trả đủ và trả một phần qua sổ cái payments', () => {
    const r = computeBalances(ids, sheet, [
      { id: 'p1', fromId: 'chung', toId: 'sang', amount: 273750 },
      { id: 'p2', fromId: 'mo', toId: 'sang', amount: 200000 },
    ])
    expect(bal(r, 'chung')).toBe(0)
    expect(bal(r, 'mo')).toBe(-73750)
    expect(bal(r, 'sang')).toBe(352500)
  })

  it('tự động hiện phần thiếu mới khi phát sinh thêm khoản chi sau khi đã trả nợ trước đó', () => {
    // Chung đã trả xong 273.750đ, sau đó phát sinh Gửi xe 20.000đ chia 4 -> Chung nợ thêm 5.000đ
    const parking: ExpenseInput = {
      id: 'e5',
      amount: 20000,
      payerId: 'sang',
      participantIds: ids,
      fixedAmounts: {},
    }
    const r = computeBalances(
      ids,
      [...sheet, parking],
      [{ id: 'p1', fromId: 'chung', toId: 'sang', amount: 273750 }],
    )
    expect(bal(r, 'chung')).toBe(-5000)
  })

  it('đổi dấu số dư sang dương khi chuyển dư tiền (tránh giấu hoặc lỗi NaN)', () => {
    // Review Focus #1: Chung chỉ nợ 273.750đ nhưng chuyển 300.000đ -> dư +26.250đ
    const r = computeBalances(ids, sheet, [{ id: 'p1', fromId: 'chung', toId: 'sang', amount: 300000 }])
    expect(bal(r, 'chung')).toBe(26250)
  })

  it('loại bỏ khoản chi chứa thành viên không còn trong chuyến hoặc chia lỗi, và bỏ qua payment ngoài nhóm', () => {
    // Review Focus #2: giữ tổng balance = 0 và báo rõ các khoản không hợp lệ trong invalidExpenseIds
    const ghost: ExpenseInput = {
      id: 'eX',
      amount: 50000,
      payerId: 'sang',
      participantIds: ['sang', 'ghost'],
      fixedAmounts: {},
    }
    const ghostPayer: ExpenseInput = {
      id: 'eP',
      amount: 30000,
      payerId: 'ghost',
      participantIds: ['sang', 'chung'],
      fixedAmounts: {},
    }
    const bad: ExpenseInput = {
      id: 'eY',
      amount: 50000,
      payerId: 'sang',
      participantIds: ['sang'],
      fixedAmounts: { sang: 60000 },
    }
    const r = computeBalances(
      ids,
      [...sheet, ghost, ghostPayer, bad],
      [{ id: 'p9', fromId: 'ghost', toId: 'sang', amount: 1000 }],
    )
    expect(r.invalidExpenseIds).toEqual(['eX', 'eP', 'eY'])
    expect(r.rows.map((x) => x.balance)).toEqual([826250, -273750, -273750, -278750])
    expect(r.totalSpent).toBe(1105000)
  })
})
