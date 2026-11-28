/**
 * Bộ kiểm thử đơn vị cho hàm kiểm tra thành viên đang được sử dụng (`members.ts`).
 */
import { describe, expect, it } from 'vitest'
import { memberInUse } from './members'
import type { ExpenseInput, PaymentInput } from './types'

const baseExpenses: ExpenseInput[] = [
  { id: 'e1', amount: 100000, payerId: 'sang', participantIds: ['sang', 'chung'], fixedAmounts: {} },
]

const basePayments: PaymentInput[] = [
  { id: 'p1', fromId: 'mo', toId: 'phung', amount: 50000 },
]

describe('memberInUse', () => {
  it('trả về true khi thành viên là người ứng tiền, người tham gia hoặc nằm trong payment', () => {
    expect(memberInUse('sang', baseExpenses, [])).toBe(true)
    expect(memberInUse('chung', baseExpenses, [])).toBe(true)
    expect(memberInUse('mo', [], basePayments)).toBe(true)
    expect(memberInUse('phung', [], basePayments)).toBe(true)
  })

  it('trả về false khi thành viên chưa xuất hiện trong bất kỳ khoản chi hay thanh toán nào', () => {
    expect(memberInUse('lan', baseExpenses, basePayments)).toBe(false)
    expect(memberInUse('sang', [], [])).toBe(false)
  })
})
