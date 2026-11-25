/**
 * Thuật toán tổng hợp số dư tài chính theo từng thành viên từ danh sách chi tiêu và sổ cái thanh toán.
 * Hàm thuần — không import React hay Firebase.
 */
import { computeShares } from './split'
import type { BalanceRow, ExpenseInput, PaymentInput, VND } from './types'

/** Bộ tích lũy nội bộ cho mỗi thành viên trong quá trình duyệt chi tiêu và thanh toán. */
interface MemberAccumulator {
  paid: VND
  owed: VND
  sent: VND
  received: VND
}

/** Kết quả tổng hợp số dư cả chuyến đi từ `computeBalances`. */
export interface BalancesResult {
  /** Danh sách dòng số dư theo đúng thứ tự `memberIds` của chuyến đi. */
  rows: BalanceRow[]
  /** Danh sách mã các khoản chi bị lỗi chia tiền hoặc tham chiếu thành viên không tồn tại. */
  invalidExpenseIds: string[]
  /** Tổng số tiền đã chi của tất cả các khoản chi hợp lệ (VND nguyên). */
  totalSpent: VND
}

/**
 * Tính tổng đã ứng, tổng phải chịu, chênh lệch chi tiêu và số dư cuối cùng (sau khi trừ/cộng
 * các giao dịch trong sổ cái `payments`) cho từng thành viên theo thứ tự `memberIds`.
 * Các khoản chi không hợp lệ bị loại khỏi tính toán và ghi nhận vào `invalidExpenseIds`
 * để đảm bảo bất biến `Σ balance === 0`.
 *
 * @param memberIds - Danh sách mã thành viên hợp lệ theo thứ tự hiển thị của chuyến (`trip.memberIds`)
 * @param expenses - Danh sách các khoản chi tiêu thô của chuyến đi
 * @param payments - Danh sách các giao dịch đã chuyển tiền thực tế trong sổ cái `payments`
 * @returns Kết quả gồm `rows`, `invalidExpenseIds` và `totalSpent`
 * @example
 * computeBalances(
 *   ['sang', 'chung', 'mo', 'phung'],
 *   [{ id: 'e1', amount: 190000, payerId: 'sang', participantIds: ['sang', 'chung', 'mo', 'phung'], fixedAmounts: { chung: 45000, mo: 45000 } }],
 *   [],
 * ) // totalSpent: 190000, balances: [+140000, -45000, -45000, -50000]
 */
export function computeBalances(
  memberIds: string[],
  expenses: ExpenseInput[],
  payments: PaymentInput[],
): BalancesResult {
  // 1. Khởi tạo bộ tích lũy bằng Map (tránh đụng key Object.prototype) và giữ đúng thứ tự memberIds
  const orderedIds: string[] = []
  const accMap = new Map<string, MemberAccumulator>()
  for (const id of memberIds) {
    if (!accMap.has(id)) {
      orderedIds.push(id)
      accMap.set(id, { paid: 0, owed: 0, sent: 0, received: 0 })
    }
  }

  const invalidExpenseIds: string[] = []
  let totalSpent: VND = 0

  // 2. Duyệt các khoản chi: kiểm tham chiếu thành viên và tính phần chia qua computeShares (DESIGN.md §8.3)
  for (const expense of expenses) {
    const payerAcc = accMap.get(expense.payerId)
    const hasUnknownParticipant = expense.participantIds.some((id) => !accMap.has(id))
    if (!payerAcc || hasUnknownParticipant) {
      // Review Focus #2: khoản tham chiếu người không còn trong chuyến bị loại hoàn toàn để giữ Σ balance = 0
      invalidExpenseIds.push(expense.id)
      continue
    }

    const split = computeShares({
      amount: expense.amount,
      participantIds: expense.participantIds,
      fixedAmounts: expense.fixedAmounts,
      memberOrder: orderedIds,
    })

    if (!split.ok) {
      invalidExpenseIds.push(expense.id)
      continue
    }

    totalSpent += expense.amount
    payerAcc.paid += expense.amount
    for (const [participantId, share] of Object.entries(split.shares)) {
      const partAcc = accMap.get(participantId)
      if (partAcc) {
        partAcc.owed += share
      }
    }
  }

  // 3. Duyệt sổ cái thanh toán thực tế; bỏ qua bản ghi sai/ngoài nhóm để bảo toàn tổng bằng 0
  for (const payment of payments) {
    const fromAcc = accMap.get(payment.fromId)
    const toAcc = accMap.get(payment.toId)
    if (
      !fromAcc ||
      !toAcc ||
      payment.fromId === payment.toId ||
      !Number.isInteger(payment.amount) ||
      payment.amount < 1
    ) {
      continue
    }
    fromAcc.sent += payment.amount
    toAcc.received += payment.amount
  }

  // 4. Tính chênh lệch thuần từ chi tiêu và số dư còn lại sau khi đã bù trừ payments
  const rows: BalanceRow[] = orderedIds.map((memberId) => {
    const acc = accMap.get(memberId)!
    const expenseNet = acc.paid - acc.owed
    const balance = expenseNet + acc.sent - acc.received
    return {
      memberId,
      paid: acc.paid,
      owed: acc.owed,
      expenseNet,
      sent: acc.sent,
      received: acc.received,
      balance,
    }
  })

  return { rows, invalidExpenseIds, totalSpent }
}
