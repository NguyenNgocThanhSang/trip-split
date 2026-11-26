/**
 * Danh sách các khoản chi tiêu của chuyến đi và hộp thoại xem chi tiết phần chia từng người.
 * Cho phép Sửa/Xóa trực tiếp từ chi tiết khoản chi khi người dùng hiện tại có quyền ghi.
 */
import { useMemo, useState } from 'react'
import { AlertCircle, Pencil, Plus, Trash2 } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Expense, Member } from '@/data/types'
import { formatDateVN } from '@/lib/date'
import { formatVND } from '@/lib/money'
import { computeShares } from '@/lib/split'
import { ResponsiveModal } from './ResponsiveModal'

/** Props của component `ExpenseList`. */
export interface ExpenseListProps {
  /** Danh sách các khoản chi của chuyến (đã sắp mới nhất lên đầu). */
  expenses: Expense[]
  /** Danh sách thành viên trong chuyến đi. */
  members: Member[]
  /** Có được phép thêm khoản chi mới hay không (hiện nút CTA khi danh sách trống). */
  canAdd: boolean
  /** Hàm kiểm tra người dùng hiện tại có quyền sửa/xóa một khoản chi cụ thể hay không. */
  canEditExpense: (expense: Expense) => boolean
  /** Callback mở form thêm khoản chi đầu tiên. */
  onAddClick: () => void
  /** Callback mở form chỉnh sửa khi người dùng bấm "Sửa" trong chi tiết khoản chi. */
  onEdit: (expense: Expense) => void
  /** Callback xóa khoản chi sau khi đã xác nhận. */
  onDelete: (expenseId: string) => Promise<void>
}

/**
 * Tạo nhãn ngắn gọn mô tả nhóm người tham gia chia một khoản chi.
 *
 * @param expense - Khoản chi cần hiển thị
 * @param members - Danh sách thành viên chuyến đi
 * @param memberNameById - Bản đồ tra nhanh `memberId -> name`
 * @returns Chuỗi nhãn ngắn (`Cả nhóm (N)`, `Chia riêng`, hoặc tên người tham gia)
 */
function formatParticipantBadge(
  expense: Expense,
  members: Member[],
  memberNameById: Map<string, string>,
): string {
  const hasCustomFixed = Object.keys(expense.fixedAmounts).length > 0
  if (hasCustomFixed) {
    return 'Chia riêng'
  }
  if (expense.participantIds.length === members.length) {
    return `Cả nhóm (${members.length})`
  }
  if (expense.participantIds.length <= 3) {
    return expense.participantIds.map((id) => memberNameById.get(id) ?? id).join(', ')
  }
  return `${expense.participantIds.length} người`
}

/**
 * Hiển thị danh sách khoản chi tiêu của chuyến đi và modal chi tiết chia tiền từng người.
 *
 * @param props - Danh sách khoản chi, thành viên, quyền chỉnh sửa và các callback
 * @returns Danh sách khoản chi hoặc màn hình rỗng kèm nút thêm mới
 */
export function ExpenseList({
  expenses,
  members,
  canAdd,
  canEditExpense,
  onAddClick,
  onEdit,
  onDelete,
}: ExpenseListProps) {
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  const memberNameById = useMemo(
    () => new Map(members.map((m) => [m.id, m.name])),
    [members],
  )
  const memberOrder = useMemo(() => members.map((m) => m.id), [members])

  const detailSplit = useMemo(() => {
    if (!selectedExpense) {
      return null
    }
    return computeShares({
      amount: selectedExpense.amount,
      participantIds: selectedExpense.participantIds,
      fixedAmounts: selectedExpense.fixedAmounts,
      memberOrder,
    })
  }, [selectedExpense, memberOrder])

  /**
   * Xóa khoản chi đang chọn sau khi người dùng xác nhận trên `AlertDialog`.
   */
  async function handleConfirmDelete() {
    if (!selectedExpense || isDeleting) {
      return
    }
    setIsDeleting(true)
    try {
      await onDelete(selectedExpense.id)
      setConfirmDeleteOpen(false)
      setSelectedExpense(null)
    } finally {
      setIsDeleting(false)
    }
  }

  if (expenses.length === 0) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
          <p className="text-sm text-muted-foreground">Chưa có khoản chi nào trong chuyến đi này.</p>
          {canAdd && (
            <Button type="button" className="min-h-11" onClick={onAddClick}>
              <Plus />
              Thêm khoản chi đầu tiên
            </Button>
          )}
        </CardContent>
      </Card>
    )
  }

  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {expenses.map((expense) => {
          const payerName = memberNameById.get(expense.payerId) ?? expense.payerId
          const badgeLabel = formatParticipantBadge(expense, members, memberNameById)

          return (
            <li key={expense.id}>
              <button
                type="button"
                className="min-h-11 w-full rounded-xl border bg-card p-3.5 text-left transition-colors hover:bg-muted/40 active:bg-muted/60"
                onClick={() => setSelectedExpense(expense)}
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="line-clamp-2 font-medium">{expense.name}</span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatVND(expense.amount)}
                  </span>
                </div>

                <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {payerName} ứng · {formatDateVN(expense.date)}
                  </span>
                  <Badge variant="secondary">{badgeLabel}</Badge>
                </div>
              </button>
            </li>
          )
        })}
      </ul>

      <ResponsiveModal
        open={selectedExpense !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setSelectedExpense(null)
          }
        }}
        title={selectedExpense?.name ?? 'Chi tiết khoản chi'}
        footer={
          selectedExpense && canEditExpense(selectedExpense) ? (
            <div className="flex w-full gap-2">
              <Button
                type="button"
                variant="outline"
                className="min-h-11 flex-1 text-destructive hover:text-destructive"
                onClick={() => setConfirmDeleteOpen(true)}
              >
                <Trash2 />
                Xóa
              </Button>
              <Button
                type="button"
                className="min-h-11 flex-1"
                onClick={() => {
                  const target = selectedExpense
                  setSelectedExpense(null)
                  onEdit(target)
                }}
              >
                <Pencil />
                Sửa
              </Button>
            </div>
          ) : undefined
        }
      >
        {selectedExpense && (
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-2 rounded-lg bg-muted/50 px-3 py-2.5">
              <span className="text-sm text-muted-foreground">
                {memberNameById.get(selectedExpense.payerId) ?? selectedExpense.payerId} đã ứng
              </span>
              <span className="text-lg font-bold tabular-nums">
                {formatVND(selectedExpense.amount)}
              </span>
            </div>

            <div className="text-xs text-muted-foreground">
              Ngày chi: {formatDateVN(selectedExpense.date)}
              {selectedExpense.note && (
                <p className="mt-1 text-sm text-foreground">{selectedExpense.note}</p>
              )}
            </div>

            <div className="flex flex-col gap-1.5 border-t pt-3">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Phần chia từng người
              </h3>

              {detailSplit && !detailSplit.ok && (
                <Alert variant="destructive">
                  <AlertCircle />
                  <AlertDescription>{detailSplit.message}</AlertDescription>
                </Alert>
              )}

              {detailSplit?.ok && (
                <ul className="flex flex-col gap-1.5">
                  {selectedExpense.participantIds.map((pid) => {
                    const share = detailSplit.shares[pid]
                    const isFixed = Object.hasOwn(selectedExpense.fixedAmounts, pid)
                    return (
                      <li
                        key={pid}
                        className="flex items-center justify-between gap-2 text-sm"
                      >
                        <span className="truncate">
                          {memberNameById.get(pid) ?? pid}
                          {isFixed && (
                            <span className="ml-1.5 text-xs text-muted-foreground">(cố định)</span>
                          )}
                        </span>
                        <span className="font-medium tabular-nums">
                          {share !== undefined ? formatVND(share) : '—'}
                        </span>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </ResponsiveModal>

      <AlertDialog
        open={confirmDeleteOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setConfirmDeleteOpen(open)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa khoản &ldquo;{selectedExpense?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Số dư và kế hoạch thanh toán của cả nhóm sẽ được tính lại ngay sau khi xóa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={isDeleting}>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmDelete()
              }}
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
