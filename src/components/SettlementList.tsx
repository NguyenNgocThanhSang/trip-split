/**
 * Danh sách kế hoạch thanh toán ("Ai trả cho ai") cho tab Tổng kết & Thanh toán (DESIGN.md §9).
 * Ưu tiên đưa giao dịch liên quan tới `me` lên đầu, hiển thị nút Quét QR, Đã chuyển và Copy nhắc riêng.
 */
import { ArrowRight, Bell, Check, QrCode } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { formatVND } from '@/lib/money'
import type { Transfer } from '@/lib/types'

/** Props của component `SettlementList`. */
export interface SettlementListProps {
  /** Danh sách giao dịch chuyển khoản tối ưu tính từ `settle`. */
  transfers: Transfer[]
  /** Mã thành viên hiện đang xem (`"Tôi"`), hoặc `null` nếu chưa chọn. */
  me: string | null
  /** Hàm ánh xạ `memberId` sang tên hiển thị. */
  nameOf: (id: string) => string
  /** Callback mở hộp thoại quét QR cho một giao dịch. */
  onQr: (transfer: Transfer) => void
  /** Callback mở hộp thoại đánh dấu đã chuyển tiền cho một giao dịch. */
  onPaid: (transfer: Transfer) => void
  /** Callback sao chép tin nhắn nhắc nợ riêng cho một giao dịch. */
  onCopyReminder: (transfer: Transfer) => void
  /** `true` nếu người xem hiện tại có quyền ghi nhận thanh toán (`isAdmin || !trip.locked`). */
  canMarkPaid: boolean
}

/**
 * Hiển thị danh sách đề xuất chuyển khoản hoặc thông báo đã thanh toán xong toàn bộ.
 *
 * @param props - Kế hoạch chuyển khoản, thành viên hiện tại, quyền ghi và các callback
 * @returns Danh sách thẻ giao dịch hoặc thẻ chúc mừng khi rỗng
 */
export function SettlementList({
  transfers,
  me,
  nameOf,
  onQr,
  onPaid,
  onCopyReminder,
  canMarkPaid,
}: SettlementListProps) {
  if (transfers.length === 0) {
    return (
      <Card size="sm">
        <CardContent className="py-4 text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
          🎉 Cả nhóm đã thanh toán xong!
        </CardContent>
      </Card>
    )
  }

  // Đưa các giao dịch có mặt `me` lên đầu để người dùng thấy ngay việc của mình, vẫn giữ nguyên thứ tự còn lại
  const ordered = me
    ? [
        ...transfers.filter((t) => t.fromId === me || t.toId === me),
        ...transfers.filter((t) => t.fromId !== me && t.toId !== me),
      ]
    : transfers

  return (
    <ul className="flex flex-col gap-2.5">
      {ordered.map((t) => {
        const fromName = nameOf(t.fromId)
        const toName = nameOf(t.toId)
        const involvesMe = me !== null && (t.fromId === me || t.toId === me)

        return (
          <li key={`${t.fromId}-${t.toId}`}>
            <Card size="sm" className={involvesMe ? 'ring-primary/50' : undefined}>
              <CardContent className="flex flex-col gap-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5 text-sm font-semibold">
                    <span className="truncate">{fromName}</span>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                    <span className="truncate">{toName}</span>
                  </span>
                  <span className="shrink-0 text-base font-bold tabular-nums">
                    {formatVND(t.amount)}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="min-h-11 flex-1"
                    onClick={() => onQr(t)}
                  >
                    <QrCode />
                    Quét QR
                  </Button>

                  {canMarkPaid && (
                    <Button
                      type="button"
                      className="min-h-11 flex-1"
                      onClick={() => onPaid(t)}
                    >
                      <Check />
                      Đã chuyển
                    </Button>
                  )}

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="min-h-11 min-w-11 shrink-0"
                    aria-label={`Copy nhắc nợ ${fromName} trả ${toName}`}
                    onClick={() => onCopyReminder(t)}
                  >
                    <Bell />
                  </Button>
                </div>
              </CardContent>
            </Card>
          </li>
        )
      })}
    </ul>
  )
}
