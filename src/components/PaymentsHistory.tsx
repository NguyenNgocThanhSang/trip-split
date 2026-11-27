/**
 * Lịch sử các khoản thanh toán thực tế trong sổ cái `payments`, hỗ trợ hoàn tác khi đủ quyền và chưa khóa sổ.
 */
import { useState } from 'react'
import { ArrowRight, RotateCcw } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import type { Payment } from '@/data/types'
import { formatVND } from '@/lib/money'

/** Props của component `PaymentsHistory`. */
export interface PaymentsHistoryProps {
  /** Danh sách giao dịch đã ghi nhận trong sổ cái `payments` (mới nhất lên đầu). */
  payments: Payment[]
  /** Hàm ánh xạ `memberId` sang tên hiển thị. */
  nameOf: (id: string) => string
  /** Kiểm tra người dùng hiện tại có được phép hoàn tác (xóa) bản ghi thanh toán hay không. */
  canUndo: (payment: Payment) => boolean
  /** Callback hoàn tác bản ghi thanh toán sau khi đã xác nhận. */
  onUndo: (payment: Payment) => Promise<void> | void
}

/**
 * Định dạng thời gian thanh toán Firestore sang chuỗi `HH:mm dd/MM/yyyy` gọn gàng.
 *
 * @param paidAt - Timestamp Firestore (có thể tạm `null` khi vừa ghi offline)
 * @returns Chuỗi thời gian hiển thị hoặc `"Vừa xong"`
 */
function formatPaidAt(paidAt: Payment['paidAt']): string {
  if (!paidAt || typeof paidAt.toDate !== 'function') {
    return 'Vừa xong'
  }
  const date = paidAt.toDate()
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  const dd = String(date.getDate()).padStart(2, '0')
  const mo = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${hh}:${mm} ${dd}/${mo}/${yyyy}`
}

/**
 * Định dạng nhãn người đã ghi nhận thanh toán để hai bên đối chiếu trên lịch sử.
 * Nếu chính người trả (`fromId`) ghi nhận thì thêm nhãn phụ `"tự ghi"` để người nhận kiểm tra lại dễ hơn.
 *
 * @param payment - Bản ghi thanh toán trong sổ cái
 * @param nameOf - Hàm ánh xạ `memberId` sang tên hiển thị
 * @returns Nhãn người ghi tiếng Việt
 */
function formatRecorderLabel(payment: Payment, nameOf: (id: string) => string): string {
  if (payment.markedBy === 'admin') {
    return 'Trưởng nhóm ghi'
  }
  if (payment.createdByMemberId) {
    const recorderName = nameOf(payment.createdByMemberId)
    return payment.createdByMemberId === payment.fromId
      ? `${recorderName} tự ghi`
      : `${recorderName} ghi`
  }
  return 'Thành viên ghi'
}

/**
 * Hiển thị lịch sử các giao dịch đã chuyển tiền và hộp thoại xác nhận hoàn tác.
 * Trả `null` nếu chuyến đi chưa có thanh toán nào.
 *
 * @param props - Danh sách thanh toán, hàm lấy tên, kiểm tra quyền hoàn tác và callback xóa
 * @returns Khối lịch sử thanh toán hoặc `null`
 */
export function PaymentsHistory({ payments, nameOf, canUndo, onUndo }: PaymentsHistoryProps) {
  const [undoingPayment, setUndoingPayment] = useState<Payment | null>(null)
  const [isUndoing, setIsUndoing] = useState(false)

  if (payments.length === 0) {
    return null
  }

  /**
   * Thực thi hoàn tác giao dịch sau khi người dùng xác nhận trong `AlertDialog`.
   */
  async function handleConfirmUndo() {
    if (!undoingPayment || isUndoing) {
      return
    }
    const target = undoingPayment
    setIsUndoing(true)
    try {
      await onUndo(target)
      setUndoingPayment(null)
    } finally {
      setIsUndoing(false)
    }
  }

  return (
    <section className="flex flex-col gap-2">
      <h2 className="text-sm font-semibold">Lịch sử đã trả ({payments.length})</h2>
      <ul className="flex flex-col gap-2">
        {payments.map((payment) => {
          const fromName = nameOf(payment.fromId)
          const toName = nameOf(payment.toId)
          const recorderLabel = formatRecorderLabel(payment, nameOf)

          return (
            <li key={payment.id}>
              <Card size="sm">
                <CardContent className="flex items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="truncate">{fromName}</span>
                      <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                      <span className="truncate">{toName}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      <span className="font-semibold text-foreground tabular-nums">
                        {formatVND(payment.amount)}
                      </span>
                      {' · '}
                      {formatPaidAt(payment.paidAt)}
                      {' · '}
                      {recorderLabel}
                    </p>
                    {payment.note && (
                      <p className="text-xs text-muted-foreground">{payment.note}</p>
                    )}
                  </div>

                  {canUndo(payment) && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="min-h-11 shrink-0 text-muted-foreground hover:text-destructive"
                      onClick={() => setUndoingPayment(payment)}
                    >
                      <RotateCcw />
                      Hoàn tác
                    </Button>
                  )}
                </CardContent>
              </Card>
            </li>
          )
        })}
      </ul>

      <AlertDialog
        open={undoingPayment !== null}
        onOpenChange={(open) => {
          if (!open && !isUndoing) {
            setUndoingPayment(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hoàn tác giao dịch này?</AlertDialogTitle>
            <AlertDialogDescription>
              Khoản chuyển{' '}
              {undoingPayment
                ? `${nameOf(undoingPayment.fromId)} → ${nameOf(undoingPayment.toId)} (${formatVND(undoingPayment.amount)})`
                : ''}{' '}
              sẽ bị xóa khỏi sổ cái và kế hoạch thanh toán sẽ tính lại.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={isUndoing}>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              disabled={isUndoing}
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmUndo()
              }}
            >
              {isUndoing ? 'Đang hoàn tác...' : 'Hoàn tác'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
