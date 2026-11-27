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

  it('trả về true khi thành viên chỉ xuất hiện ở trường createdByMemberId của khoản chi hoặc thanh toán', () => {
    // Ngăn admin gỡ thành viên khi họ là tác giả bản ghi (dù không nằm trong payer/participants)
    expect(
      memberInUse(
        'mo',
        [{ id: 'e2', amount: 50000, payerId: 'sang', participantIds: ['sang'], fixedAmounts: {}, createdByMemberId: 'mo' }],
        [],
      ),
    ).toBe(true)
    expect(
      memberInUse('lan', [], [{ id: 'p2', fromId: 'mo', toId: 'phung', amount: 50000, createdByMemberId: 'lan' }]),
    ).toBe(true)
  })

  it('trả về false khi thành viên chưa xuất hiện trong bất kỳ khoản chi hay thanh toán nào', () => {
    expect(memberInUse('lan', baseExpenses, basePayments)).toBe(false)
    expect(memberInUse('sang', [], [])).toBe(false)
  })
})
