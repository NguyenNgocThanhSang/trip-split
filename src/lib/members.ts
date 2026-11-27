/**
 * Hàm thuần kiểm tra ràng buộc sử dụng thành viên trước khi cho phép xóa khỏi chuyến đi.
 * Hàm thuần — không import React hay Firebase.
 */
import type { ExpenseInput, PaymentInput } from './types'

/**
 * Kiểm tra một thành viên đã xuất hiện trong bất kỳ khoản chi hoặc giao dịch thanh toán nào chưa.
 * Dùng để chặn xóa thành viên đang có dữ liệu liên quan nhằm tránh làm gãy lịch sử chia tiền (DESIGN.md §6).
 *
 * @param memberId - Mã thành viên cần kiểm tra
 * @param expenses - Danh sách các khoản chi của chuyến đi
 * @param payments - Danh sách các giao dịch thanh toán của chuyến đi
 * @returns `true` nếu thành viên đang được tham chiếu, ngược lại `false`
 * @example
 * memberInUse('sang', [{ id: 'e1', amount: 100000, payerId: 'sang', participantIds: ['sang'], fixedAmounts: {} }], []) // true
 */
export function memberInUse(
  memberId: string,
  expenses: ExpenseInput[],
  payments: PaymentInput[],
): boolean {
  for (const expense of expenses) {
    if (
      expense.payerId === memberId ||
      expense.participantIds.includes(memberId) ||
      Object.hasOwn(expense.fixedAmounts, memberId) ||
      expense.createdByMemberId === memberId
    ) {
      return true
    }
  }

  for (const payment of payments) {
    if (
      payment.fromId === memberId ||
      payment.toId === memberId ||
      payment.createdByMemberId === memberId
    ) {
      return true
    }
  }

  return false
}
