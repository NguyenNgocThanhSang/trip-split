/**
 * Thuật toán tối ưu kế hoạch thanh toán (ai chuyển cho ai bao nhiêu tiền) với ít giao dịch nhất.
 * Ưu tiên khớp đối xứng 1-1 trước rồi dùng tham lam lớn-nhất-với-lớn-nhất, cho kết quả xác định.
 * Hàm thuần — không import React hay Firebase.
 */
import type { BalanceRow, Transfer, VND } from './types'

/** Trạng thái nội bộ của một thành viên đang còn nợ hoặc đang chờ nhận lại tiền. */
interface Party {
  memberId: string
  amount: VND
}

/**
 * Lập kế hoạch chuyển khoản tối thiểu để cân bằng số dư của tất cả thành viên.
 * Luôn tạo tối đa `n - 1` giao dịch, thứ tự ổn định theo số tiền giảm dần và `memberOrder`
 * để giao diện không bị nhảy dòng giữa các lần render.
 *
 * @param rows - Danh sách số dư của từng thành viên (`memberId` và `balance`)
 * @param memberOrder - Thứ tự thành viên trong chuyến (`trip.memberIds`) dùng làm khóa phụ khi hòa số tiền
 * @returns Danh sách các giao dịch chuyển khoản đề xuất `{ fromId, toId, amount }`
 * @example
 * settle(
 *   [
 *     { memberId: 'sang', balance: 826250 },
 *     { memberId: 'chung', balance: -273750 },
 *     { memberId: 'mo', balance: -273750 },
 *     { memberId: 'phung', balance: -278750 },
 *   ],
 *   ['sang', 'chung', 'mo', 'phung'],
 * )
 * // [
 * //   { fromId: 'phung', toId: 'sang', amount: 278750 },
 * //   { fromId: 'chung', toId: 'sang', amount: 273750 },
 * //   { fromId: 'mo', toId: 'sang', amount: 273750 },
 * // ]
 */
export function settle(
  rows: Pick<BalanceRow, 'memberId' | 'balance'>[],
  memberOrder: string[],
): Transfer[] {
  // Dùng Map ánh xạ vị trí trong memberOrder để sắp xếp xác định và tránh đụng key Object.prototype
  const orderIndex = new Map<string, number>()
  memberOrder.forEach((id, index) => {
    if (!orderIndex.has(id)) {
      orderIndex.set(id, index)
    }
  })

  const compareParty = (a: Party, b: Party): number => {
    if (b.amount !== a.amount) return b.amount - a.amount
    const idxA = orderIndex.get(a.memberId) ?? Number.MAX_SAFE_INTEGER
    const idxB = orderIndex.get(b.memberId) ?? Number.MAX_SAFE_INTEGER
    if (idxA !== idxB) return idxA - idxB
    return a.memberId.localeCompare(b.memberId)
  }

  // 1. Tách nhóm người còn nợ (balance < 0) và nhóm người cần nhận lại (balance > 0); bỏ người 0đ (DESIGN.md §8.4)
  const debtors: Party[] = []
  const creditors: Party[] = []

  for (const row of rows) {
    if (!Number.isFinite(row.balance) || row.balance === 0) continue
    if (row.balance < 0) {
      debtors.push({ memberId: row.memberId, amount: -row.balance })
    } else {
      creditors.push({ memberId: row.memberId, amount: row.balance })
    }
  }

  const transfers: Transfer[] = []

  // 2. Khớp chính xác trước: ghép các cặp nợ/có bằng nhau tuyệt đối để giảm tối đa số giao dịch trung gian
  debtors.sort(compareParty)
  creditors.sort(compareParty)

  const remainingDebtors: Party[] = []
  for (const debtor of debtors) {
    const exactIndex = creditors.findIndex((c) => c.amount === debtor.amount)
    if (exactIndex !== -1) {
      const [matchedCreditor] = creditors.splice(exactIndex, 1)
      transfers.push({
        fromId: debtor.memberId,
        toId: matchedCreditor.memberId,
        amount: debtor.amount,
      })
    } else {
      remainingDebtors.push(debtor)
    }
  }

  // 3. Tham lam: lặp lại việc sắp xếp giảm dần và ghép người nợ nhiều nhất với người cần nhận nhiều nhất
  while (remainingDebtors.length > 0 && creditors.length > 0) {
    remainingDebtors.sort(compareParty)
    creditors.sort(compareParty)

    const debtor = remainingDebtors[0]
    const creditor = creditors[0]
    const transferAmount = Math.min(debtor.amount, creditor.amount)

    transfers.push({
      fromId: debtor.memberId,
      toId: creditor.memberId,
      amount: transferAmount,
    })

    debtor.amount -= transferAmount
    creditor.amount -= transferAmount

    if (debtor.amount === 0) {
      remainingDebtors.shift()
    }
    if (creditor.amount === 0) {
      creditors.shift()
    }
  }

  return transfers
}
