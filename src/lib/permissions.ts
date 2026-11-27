/**
 * Hàm thuần kiểm tra quyền ghi trên giao diện, phản chiếu chính xác quy tắc trong `firestore.rules`.
 * Hàm thuần — không import React hay Firebase.
 */

/** Trạng thái liên kết danh tính ghi của phiên hiện tại với một thành viên trong chuyến đi. */
export type BindingStatus = 'loading' | 'unbound' | 'bound' | 'revoked' | 'invalid'

/** Lý do từ chối thao tác ghi trên giao diện để hiển thị thông báo hướng dẫn phù hợp. */
export type WriteBlockReason =
  | 'locked'
  | 'guest-expenses-disabled'
  | 'revoked'
  | 'invalid-link'
  | 'unbound'
  | 'not-participant'

/** Ngữ cảnh phân quyền hiện tại của người đang mở trang chuyến đi. */
export interface TripPermissionContext {
  /** `true` nếu người dùng đã đăng nhập bằng đúng tài khoản Google Admin. */
  isAdmin: boolean
  /** Trạng thái khóa sổ của chuyến đi (`trip.locked`). */
  locked: boolean
  /** Trạng thái cho phép thành viên tự nhập/sửa chi tiêu (`trip.allowGuestExpenses`). */
  allowGuestExpenses: boolean
  /** Mã thành viên đã xác minh qua link cá nhân (`bindings/{uid}`), hoặc `null` nếu chưa bind. */
  boundMemberId: string | null
  /** Trạng thái hiện tại của liên kết danh tính khách. */
  bindingStatus: BindingStatus
}

/**
 * Kiểm tra người dùng hiện tại có được phép ghi nhận đã chuyển tiền cho một giao dịch hay không.
 * Phản chiếu quy tắc `payments` create trong `firestore.rules`: Admin hoặc thành viên là `fromId`/`toId` khi chưa khóa.
 *
 * @param ctx - Ngữ cảnh quyền hiện tại (tách biệt hoàn toàn với góc nhìn `useMe`)
 * @param transfer - Cặp người trả (`fromId`) và người nhận (`toId`) của giao dịch
 * @returns `true` nếu được phép mở bước xác nhận và ghi thanh toán
 * @example
 * canMarkTransfer(
 *   { isAdmin: false, locked: false, allowGuestExpenses: false, boundMemberId: 'chung', bindingStatus: 'bound' },
 *   { fromId: 'chung', toId: 'sang' },
 * ) // true
 */
export function canMarkTransfer(
  ctx: TripPermissionContext,
  transfer: { fromId: string; toId: string },
): boolean {
  if (ctx.isAdmin) {
    return true
  }
  if (ctx.locked || ctx.bindingStatus !== 'bound' || ctx.boundMemberId === null) {
    return false
  }
  return ctx.boundMemberId === transfer.fromId || ctx.boundMemberId === transfer.toId
}

/**
 * Trả về lý do bị chặn khi người dùng bấm "Đã chuyển" / "Tôi đã chuyển", hoặc `null` nếu hợp lệ.
 *
 * @param ctx - Ngữ cảnh quyền hiện tại
 * @param transfer - Giao dịch chuyển khoản cần kiểm tra
 * @returns Mã lý do bị chặn (`WriteBlockReason`) hoặc `null` nếu được phép
 * @example
 * getMarkTransferBlockReason(
 *   { isAdmin: false, locked: false, allowGuestExpenses: false, boundMemberId: 'mo', bindingStatus: 'bound' },
 *   { fromId: 'chung', toId: 'sang' },
 * ) // 'not-participant'
 */
export function getMarkTransferBlockReason(
  ctx: TripPermissionContext,
  transfer: { fromId: string; toId: string },
): WriteBlockReason | null {
  if (canMarkTransfer(ctx, transfer)) {
    return null
  }
  if (ctx.locked) {
    return 'locked'
  }
  if (ctx.bindingStatus === 'revoked') {
    return 'revoked'
  }
  if (ctx.bindingStatus === 'invalid') {
    return 'invalid-link'
  }
  if (ctx.bindingStatus !== 'bound' || !ctx.boundMemberId) {
    return 'unbound'
  }
  return 'not-participant'
}

/**
 * Kiểm tra người dùng hiện tại có được phép thêm khoản chi mới hay không.
 * Phản chiếu quy tắc `expenses` create trong `firestore.rules`.
 *
 * @param ctx - Ngữ cảnh quyền hiện tại
 * @returns `true` nếu được phép thêm khoản chi
 * @example
 * canAddExpense({
 *   isAdmin: false,
 *   locked: false,
 *   allowGuestExpenses: true,
 *   boundMemberId: 'chung',
 *   bindingStatus: 'bound',
 * }) // true
 */
export function canAddExpense(ctx: TripPermissionContext): boolean {
  if (ctx.isAdmin) {
    return true
  }
  return (
    ctx.allowGuestExpenses &&
    !ctx.locked &&
    ctx.bindingStatus === 'bound' &&
    ctx.boundMemberId !== null
  )
}

/**
 * Trả về lý do bị chặn khi người dùng bấm thêm khoản chi mới, hoặc `null` nếu hợp lệ.
 *
 * @param ctx - Ngữ cảnh quyền hiện tại
 * @returns Mã lý do bị chặn (`WriteBlockReason`) hoặc `null` nếu được phép
 * @example
 * getAddExpenseBlockReason({
 *   isAdmin: false,
 *   locked: false,
 *   allowGuestExpenses: true,
 *   boundMemberId: null,
 *   bindingStatus: 'unbound',
 * }) // 'unbound'
 */
export function getAddExpenseBlockReason(ctx: TripPermissionContext): WriteBlockReason | null {
  if (canAddExpense(ctx)) {
    return null
  }
  if (ctx.locked) {
    return 'locked'
  }
  if (!ctx.allowGuestExpenses) {
    return 'guest-expenses-disabled'
  }
  if (ctx.bindingStatus === 'revoked') {
    return 'revoked'
  }
  if (ctx.bindingStatus === 'invalid') {
    return 'invalid-link'
  }
  return 'unbound'
}

/**
 * Kiểm tra người dùng hiện tại có quyền sửa hoặc xóa một khoản chi cụ thể hay không.
 * Dữ liệu cũ không có `createdByMemberId` chỉ Admin mới được sửa/xóa.
 *
 * @param ctx - Ngữ cảnh quyền hiện tại
 * @param expense - Thông tin nguồn tạo của khoản chi
 * @returns `true` nếu được phép sửa hoặc xóa khoản chi
 * @example
 * canEditExpense(
 *   { isAdmin: false, locked: false, allowGuestExpenses: true, boundMemberId: 'chung', bindingStatus: 'bound' },
 *   { createdBy: 'guest', createdByMemberId: 'chung' },
 * ) // true
 */
export function canEditExpense(
  ctx: TripPermissionContext,
  expense: { createdBy: 'admin' | 'guest'; createdByMemberId?: string },
): boolean {
  if (ctx.isAdmin) {
    return true
  }
  return (
    canAddExpense(ctx) &&
    expense.createdBy === 'guest' &&
    Boolean(expense.createdByMemberId) &&
    expense.createdByMemberId === ctx.boundMemberId
  )
}

/**
 * Kiểm tra người dùng hiện tại có quyền hoàn tác (xóa) một bản ghi thanh toán hay không.
 * Khách chỉ được hoàn tác bản ghi do chính thành viên đã bind của mình tạo khi chuyến chưa khóa.
 *
 * @param ctx - Ngữ cảnh quyền hiện tại
 * @param payment - Thông tin nguồn ghi của bản ghi thanh toán
 * @returns `true` nếu được phép hoàn tác bản ghi thanh toán
 * @example
 * canUndoPayment(
 *   { isAdmin: false, locked: false, allowGuestExpenses: false, boundMemberId: 'chung', bindingStatus: 'bound' },
 *   { markedBy: 'guest', createdByMemberId: 'chung' },
 * ) // true
 */
export function canUndoPayment(
  ctx: TripPermissionContext,
  payment: { markedBy: 'admin' | 'guest'; createdByMemberId?: string },
): boolean {
  if (ctx.isAdmin) {
    return true
  }
  return (
    !ctx.locked &&
    ctx.bindingStatus === 'bound' &&
    ctx.boundMemberId !== null &&
    payment.markedBy === 'guest' &&
    Boolean(payment.createdByMemberId) &&
    payment.createdByMemberId === ctx.boundMemberId
  )
}
