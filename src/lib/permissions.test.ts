/**
 * Bộ kiểm thử đơn vị cho module kiểm tra quyền ghi thuần (`permissions.ts`).
 * Đối chiếu đầy đủ mọi nhánh quyền với `firestore.rules` (khách theo binding và Admin).
 */
import { describe, expect, it } from 'vitest'
import {
  canAddExpense,
  canEditExpense,
  canMarkTransfer,
  canUndoPayment,
  getAddExpenseBlockReason,
  getMarkTransferBlockReason,
  type TripPermissionContext,
} from './permissions'

const baseCtx: TripPermissionContext = {
  isAdmin: false,
  locked: false,
  allowGuestExpenses: true,
  boundMemberId: 'chung',
  bindingStatus: 'bound',
}

describe('canMarkTransfer & getMarkTransferBlockReason', () => {
  it('cho phép thành viên đã bind xác nhận khi là người trả hoặc người nhận và chuyến chưa khóa', () => {
    expect(canMarkTransfer(baseCtx, { fromId: 'chung', toId: 'sang' })).toBe(true)
    expect(canMarkTransfer(baseCtx, { fromId: 'sang', toId: 'chung' })).toBe(true)
    expect(getMarkTransferBlockReason(baseCtx, { fromId: 'chung', toId: 'sang' })).toBeNull()
  })

  it('chặn người thứ ba đã bind khi không phải người trả hay người nhận và trả lý do not-participant', () => {
    expect(canMarkTransfer(baseCtx, { fromId: 'mo', toId: 'sang' })).toBe(false)
    expect(getMarkTransferBlockReason(baseCtx, { fromId: 'mo', toId: 'sang' })).toBe('not-participant')
  })

  it('chặn khách chưa bind, mã thu hồi hoặc link không hợp lệ với đúng lý do', () => {
    const unbound: TripPermissionContext = { ...baseCtx, boundMemberId: null, bindingStatus: 'unbound' }
    expect(canMarkTransfer(unbound, { fromId: 'chung', toId: 'sang' })).toBe(false)
    expect(getMarkTransferBlockReason(unbound, { fromId: 'chung', toId: 'sang' })).toBe('unbound')

    const revoked: TripPermissionContext = { ...baseCtx, boundMemberId: null, bindingStatus: 'revoked' }
    expect(getMarkTransferBlockReason(revoked, { fromId: 'chung', toId: 'sang' })).toBe('revoked')

    const invalid: TripPermissionContext = { ...baseCtx, boundMemberId: null, bindingStatus: 'invalid' }
    expect(getMarkTransferBlockReason(invalid, { fromId: 'chung', toId: 'sang' })).toBe('invalid-link')
  })

  it('chặn toàn bộ khách khi chuyến đã khóa sổ nhưng vẫn cho Admin xác nhận mọi giao dịch', () => {
    const lockedGuest: TripPermissionContext = { ...baseCtx, locked: true }
    expect(canMarkTransfer(lockedGuest, { fromId: 'chung', toId: 'sang' })).toBe(false)
    expect(getMarkTransferBlockReason(lockedGuest, { fromId: 'chung', toId: 'sang' })).toBe('locked')

    const adminLocked: TripPermissionContext = {
      isAdmin: true,
      locked: true,
      allowGuestExpenses: false,
      boundMemberId: null,
      bindingStatus: 'unbound',
    }
    expect(canMarkTransfer(adminLocked, { fromId: 'mo', toId: 'sang' })).toBe(true)
    expect(getMarkTransferBlockReason(adminLocked, { fromId: 'mo', toId: 'sang' })).toBeNull()
  })
})

describe('canAddExpense & getAddExpenseBlockReason', () => {
  it('chỉ cho khách thêm chi tiêu khi đã bind, chuyến mở và allowGuestExpenses=true', () => {
    expect(canAddExpense(baseCtx)).toBe(true)
    expect(getAddExpenseBlockReason(baseCtx)).toBeNull()

    expect(canAddExpense({ ...baseCtx, allowGuestExpenses: false })).toBe(false)
    expect(getAddExpenseBlockReason({ ...baseCtx, allowGuestExpenses: false })).toBe(
      'guest-expenses-disabled',
    )

    expect(canAddExpense({ ...baseCtx, locked: true })).toBe(false)
    expect(getAddExpenseBlockReason({ ...baseCtx, locked: true })).toBe('locked')

    expect(
      getAddExpenseBlockReason({ ...baseCtx, boundMemberId: null, bindingStatus: 'unbound' }),
    ).toBe('unbound')
    expect(
      getAddExpenseBlockReason({ ...baseCtx, boundMemberId: null, bindingStatus: 'revoked' }),
    ).toBe('revoked')
    expect(
      getAddExpenseBlockReason({ ...baseCtx, boundMemberId: null, bindingStatus: 'invalid' }),
    ).toBe('invalid-link')
  })

  it('luôn cho phép Admin thêm chi tiêu bất kể cờ khóa sổ hay allowGuestExpenses', () => {
    expect(
      canAddExpense({
        isAdmin: true,
        locked: true,
        allowGuestExpenses: false,
        boundMemberId: null,
        bindingStatus: 'unbound',
      }),
    ).toBe(true)
  })
})

describe('canEditExpense & canUndoPayment', () => {
  it('chỉ cho khách sửa/xóa khoản chi của chính memberId mình và chặn khoản admin hoặc legacy', () => {
    expect(
      canEditExpense(baseCtx, { createdBy: 'guest', createdByMemberId: 'chung' }),
    ).toBe(true)
    expect(
      canEditExpense(baseCtx, { createdBy: 'guest', createdByMemberId: 'mo' }),
    ).toBe(false)
    expect(canEditExpense(baseCtx, { createdBy: 'guest' })).toBe(false)
    expect(canEditExpense(baseCtx, { createdBy: 'admin' })).toBe(false)
    expect(
      canEditExpense(
        { ...baseCtx, allowGuestExpenses: false },
        { createdBy: 'guest', createdByMemberId: 'chung' },
      ),
    ).toBe(false)
  })

  it('chỉ cho khách hoàn tác payment do chính memberId mình ghi khi chưa khóa; Admin sửa/xóa được tất cả', () => {
    expect(
      canUndoPayment(baseCtx, { markedBy: 'guest', createdByMemberId: 'chung' }),
    ).toBe(true)
    expect(
      canUndoPayment(baseCtx, { markedBy: 'guest', createdByMemberId: 'mo' }),
    ).toBe(false)
    expect(canUndoPayment(baseCtx, { markedBy: 'guest' })).toBe(false)
    expect(canUndoPayment(baseCtx, { markedBy: 'admin' })).toBe(false)
    expect(
      canUndoPayment(
        { ...baseCtx, locked: true },
        { markedBy: 'guest', createdByMemberId: 'chung' },
      ),
    ).toBe(false)

    const adminCtx: TripPermissionContext = {
      isAdmin: true,
      locked: true,
      allowGuestExpenses: false,
      boundMemberId: null,
      bindingStatus: 'unbound',
    }
    expect(canEditExpense(adminCtx, { createdBy: 'guest' })).toBe(true)
    expect(canUndoPayment(adminCtx, { markedBy: 'guest' })).toBe(true)
  })
})
