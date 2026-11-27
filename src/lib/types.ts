/**
 * Các kiểu dữ liệu miền thuần (domain types) cho bài toán chia tiền TripSplit.
 * Không import React hay Firebase để tầng `src/lib` hoàn toàn độc lập và dễ kiểm thử.
 */

/** Số tiền tính bằng đồng Việt Nam (luôn là số nguyên, đơn vị: VND). */
export type VND = number

/** Dữ liệu đầu vào tối thiểu của một khoản chi để tính phần chia và số dư. */
export interface ExpenseInput {
  /** Mã định danh duy nhất của khoản chi trong chuyến đi. */
  id: string
  /** Tổng số tiền của khoản chi (số nguyên VND, phạm vi 1..1.000.000.000). */
  amount: VND
  /** Mã thành viên đã ứng tiền trả khoản chi này. */
  payerId: string
  /** Danh sách mã thành viên tham gia chia khoản chi (tối thiểu 1 người). */
  participantIds: string[]
  /** Bản đồ số tiền cố định riêng theo từng `memberId` (VND nguyên ≥ 0; rỗng nếu chia đều). */
  fixedAmounts: Record<string, VND>
  /** Mã thành viên đã nhập khoản chi này (tùy chọn, dùng kiểm tra ràng buộc xóa thành viên). */
  createdByMemberId?: string
}

/** Dữ liệu đầu vào của một giao dịch đã chuyển tiền thực tế trong sổ cái thanh toán. */
export interface PaymentInput {
  /** Mã định danh duy nhất của giao dịch thanh toán. */
  id: string
  /** Mã thành viên đã chuyển tiền trả nợ. */
  fromId: string
  /** Mã thành viên nhận tiền. */
  toId: string
  /** Số tiền thực tế đã chuyển (số nguyên VND > 0, cho phép trả một phần). */
  amount: VND
  /** Mã thành viên đã ghi nhận giao dịch này (tùy chọn, dùng kiểm tra ràng buộc xóa thành viên). */
  createdByMemberId?: string
}

/** Một giao dịch đề xuất hoặc đã trả trong kế hoạch thanh toán giữa hai thành viên. */
export interface Transfer {
  /** Mã thành viên cần chuyển tiền. */
  fromId: string
  /** Mã thành viên nhận tiền. */
  toId: string
  /** Số tiền cần chuyển (số nguyên VND > 0). */
  amount: VND
}

/** Dòng tổng hợp số dư tài chính của một thành viên trong chuyến đi. */
export interface BalanceRow {
  /** Mã định danh của thành viên. */
  memberId: string
  /** Tổng số tiền thành viên đã ứng trước cho các khoản chi (VND). */
  paid: VND
  /** Tổng số tiền thành viên phải chịu sau khi chia các khoản chi (VND). */
  owed: VND
  /** Chênh lệch thuần từ chi tiêu (`paid - owed`; dương = nhận lại, âm = cần trả). */
  expenseNet: VND
  /** Tổng số tiền thành viên đã chuyển trả nợ thông qua sổ cái `payments` (VND). */
  sent: VND
  /** Tổng số tiền thành viên đã nhận được từ người khác trả qua `payments` (VND). */
  received: VND
  /** Số dư còn lại cuối cùng (`expenseNet + sent - received`; dương = còn được nhận, âm = còn nợ). */
  balance: VND
}
