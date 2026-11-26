/**
 * Hộp thoại xác nhận đã chuyển tiền (`MarkPaidSheet`), hỗ trợ trả một phần hoặc trả dư (có cảnh báo).
 * Chống double-submit bằng cả state `isSubmitting` và ref đồng bộ (Review Focus #1).
 */
import { type FormEvent, useRef, useState } from 'react'
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { formatVND } from '@/lib/money'
import type { Transfer, VND } from '@/lib/types'
import { MoneyInput } from './MoneyInput'
import { ResponsiveModal } from './ResponsiveModal'

/** Props của component `MarkPaidSheet`. */
export interface MarkPaidSheetProps {
  /** Trạng thái mở/đóng hộp thoại. */
  open: boolean
  /** Callback cập nhật trạng thái mở/đóng. */
  onOpenChange: (open: boolean) => void
  /** Giao dịch gợi ý làm cơ sở điền sẵn số tiền cần trả. */
  transfer: Transfer
  /** Hàm ánh xạ `memberId` sang tên hiển thị. */
  nameOf: (id: string) => string
  /** Hàm bất đồng bộ ghi giao dịch vào sổ cái `payments`; khóa nút trong lúc chờ. */
  onConfirm: (amount: VND, note: string) => Promise<void>
}

/**
 * Modal nhập số tiền thực tế đã chuyển (mặc định bằng gợi ý, sửa được nếu trả một phần) kèm ghi chú.
 *
 * @param props - Giao dịch gợi ý, hàm lấy tên và callback xác nhận ghi thanh toán
 * @returns `ResponsiveModal` xác nhận thanh toán
 */
export function MarkPaidSheet({
  open,
  onOpenChange,
  transfer,
  nameOf,
  onConfirm,
}: MarkPaidSheetProps) {
  const sheetKey = `${transfer.fromId}:${transfer.toId}:${transfer.amount}:${open}`
  const [prevKey, setPrevKey] = useState(sheetKey)
  const [amount, setAmount] = useState<VND | null>(transfer.amount)
  const [isAmountInvalid, setIsAmountInvalid] = useState(false)
  const [note, setNote] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Ref chặn đồng bộ ngay trong cùng tick nếu người dùng bấm đúp quá nhanh
  const submittingRef = useRef(false)

  // Khởi tạo lại số tiền gợi ý và ghi chú khi mở sheet cho giao dịch mới
  if (sheetKey !== prevKey) {
    setPrevKey(sheetKey)
    setAmount(transfer.amount)
    setIsAmountInvalid(false)
    setNote('')
  }

  const isConfirmDisabled = amount === null || isAmountInvalid || isSubmitting
  const isOverpaying = amount !== null && amount > transfer.amount

  /**
   * Thực thi `onConfirm` một lần duy nhất cho tới khi Promise hoàn tất.
   */
  async function handleConfirm() {
    if (isConfirmDisabled || submittingRef.current || amount === null) {
      return
    }
    submittingRef.current = true
    setIsSubmitting(true)
    try {
      await onConfirm(amount, note.trim())
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  /**
   * Hỗ trợ nhấn Enter trong ô nhập để xác nhận.
   *
   * @param event - Sự kiện submit của `<form>`
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleConfirm()
  }

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={(nextOpen) => {
        if (!isSubmitting) {
          onOpenChange(nextOpen)
        }
      }}
      title="Xác nhận đã chuyển"
      footer={
        <div className="flex w-full gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={() => onOpenChange(false)}
            disabled={isSubmitting}
          >
            Hủy
          </Button>
          <Button
            type="button"
            className="min-h-11 flex-1"
            onClick={() => void handleConfirm()}
            disabled={isConfirmDisabled}
          >
            {isSubmitting ? 'Đang ghi...' : 'Xác nhận đã chuyển'}
          </Button>
        </div>
      }
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          Ghi nhận giao dịch từ <strong className="text-foreground">{nameOf(transfer.fromId)}</strong>{' '}
          chuyển cho <strong className="text-foreground">{nameOf(transfer.toId)}</strong> (gợi ý{' '}
          {formatVND(transfer.amount)}).
        </p>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mark-paid-amount">Số tiền đã chuyển</Label>
          <MoneyInput
            id="mark-paid-amount"
            value={amount}
            onChange={setAmount}
            onInvalidChange={setIsAmountInvalid}
            placeholder="Ví dụ: 200k"
            disabled={isSubmitting}
          />
        </div>

        {isOverpaying && (
          <Alert>
            <AlertCircle />
            <AlertDescription>
              Số tiền lớn hơn số cần trả ({formatVND(transfer.amount)}). Phần chênh lệch sẽ tự bù trừ trong bảng tổng kết.
            </AlertDescription>
          </Alert>
        )}

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="mark-paid-note">Ghi chú (tùy chọn)</Label>
          <Input
            id="mark-paid-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={120}
            placeholder="Ví dụ: Chuyển trước một phần"
            className="min-h-11"
            disabled={isSubmitting}
          />
        </div>
      </form>
    </ResponsiveModal>
  )
}
