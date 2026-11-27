/**
 * Hộp thoại giải thích lý do chưa thể ghi nhận thanh toán hoặc thêm chi tiêu (khi dùng link chung, sai người hoặc mã bị thu hồi).
 * Giúp người dùng hiểu rõ sự khác biệt giữa "góc nhìn" (`WhoAmI`) và "danh tính ghi" (link cá nhân `?k=`).
 */
import { AlertCircle } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import type { WriteBlockReason } from '@/lib/permissions'
import { ResponsiveModal } from './ResponsiveModal'

/** Ngữ cảnh giải thích khi người dùng bấm nút ghi nhưng chưa đủ điều kiện phân quyền. */
export interface WriteAccessNotice {
  /** Thao tác người dùng vừa bấm (`'mark-paid'` hoặc `'add-expense'`). */
  action: 'mark-paid' | 'add-expense'
  /** Lý do bị chặn tính từ `src/lib/permissions.ts`. */
  reason: WriteBlockReason
  /** Tên thành viên đang được xác minh trên máy (nếu có). */
  boundName?: string | null
  /** Tên người trả của giao dịch (khi `action === 'mark-paid'`). */
  fromName?: string
  /** Tên người nhận của giao dịch (khi `action === 'mark-paid'`). */
  toName?: string
}

/** Props của component `WriteAccessNoticeSheet`. */
export interface WriteAccessNoticeSheetProps {
  /** Thông tin ngữ cảnh cần giải thích, hoặc `null` nếu đóng. */
  notice: WriteAccessNotice | null
  /** Callback đóng/mở hộp thoại. */
  onOpenChange: (open: boolean) => void
}

/**
 * Tạo nội dung giải thích tiếng Việt tương ứng từng lý do bị chặn ghi.
 *
 * @param notice - Ngữ cảnh thao tác và lý do bị chặn
 * @returns Đoạn thông báo hướng dẫn rõ ràng cho người dùng
 */
function buildNoticeMessage(notice: WriteAccessNotice): string {
  switch (notice.reason) {
    case 'revoked':
      return 'Link cá nhân của bạn đã hết hiệu lực vì trưởng nhóm đã tạo lại mã. Hãy liên hệ trưởng nhóm để lấy link mới.'
    case 'invalid-link':
      return 'Link cá nhân không hợp lệ. Hãy kiểm tra lại hoặc liên hệ trưởng nhóm để lấy link cá nhân mới.'
    case 'not-participant': {
      const bound = notice.boundName ?? 'thành viên khác'
      const from = notice.fromName ?? 'người trả'
      const to = notice.toName ?? 'người nhận'
      return `Bạn đang xác minh là ${bound}. Chỉ ${from}, ${to} hoặc trưởng nhóm mới được xác nhận giao dịch này.`
    }
    case 'locked':
      return 'Chuyến đi đã khóa sổ, hiện chỉ trưởng nhóm mới có thể thay đổi dữ liệu.'
    case 'guest-expenses-disabled':
      return 'Trưởng nhóm hiện đang tắt quyền tự thêm chi tiêu cho thành viên.'
    case 'unbound':
      return notice.action === 'mark-paid'
        ? 'Để xác nhận đã chuyển, mở link cá nhân trưởng nhóm gửi riêng cho bạn.'
        : 'Để thêm khoản chi, mở link cá nhân trưởng nhóm gửi riêng cho bạn.'
  }
}

/**
 * Modal thông báo khi khách bấm nút ghi mà chưa xác minh link cá nhân, bị thu hồi mã hoặc xem giao dịch của cặp khác.
 *
 * @param props - Thông tin `notice` và callback đóng modal
 * @returns `ResponsiveModal` chứa giải thích hoặc `null` khi đóng
 */
export function WriteAccessNoticeSheet({ notice, onOpenChange }: WriteAccessNoticeSheetProps) {
  if (!notice) {
    return null
  }

  const title =
    notice.action === 'mark-paid'
      ? 'Chưa thể xác nhận đã chuyển'
      : 'Chưa thể thêm khoản chi'

  return (
    <ResponsiveModal
      open
      onOpenChange={onOpenChange}
      title={title}
      footer={
        <Button type="button" className="min-h-11 w-full" onClick={() => onOpenChange(false)}>
          Đã hiểu
        </Button>
      }
    >
      <Alert variant={notice.reason === 'revoked' || notice.reason === 'invalid-link' ? 'destructive' : 'default'}>
        <AlertCircle />
        <AlertDescription>{buildNoticeMessage(notice)}</AlertDescription>
      </Alert>
    </ResponsiveModal>
  )
}
