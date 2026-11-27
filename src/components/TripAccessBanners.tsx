/**
 * Các banner trạng thái danh tính hiển thị trên trang chuyến đi `/t/:tripId`:
 * báo link cá nhân bị thu hồi/không hợp lệ và chú thích khi góc nhìn (`WhoAmI`) khác danh tính ghi đã xác minh.
 */
import { AlertTriangle, Eye } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import type { BindingStatus } from '@/lib/permissions'

/** Props của component `TripAccessBanners`. */
export interface TripAccessBannersProps {
  /** `true` nếu người xem hiện tại là Admin (không hiển thị banner khách). */
  isAdmin: boolean
  /** Trạng thái liên kết danh tính khách hiện tại. */
  bindingStatus: BindingStatus
  /** Mã thành viên đã xác minh trên máy (`null` nếu chưa bind). */
  boundMemberId: string | null
  /** Tên thành viên đã xác minh trên máy (nếu có). */
  boundName: string | null
  /** Mã thành viên đang chọn ở góc nhìn `WhoAmI` (`null` nếu xem chung). */
  lensId: string | null
  /** Tên thành viên đang chọn ở góc nhìn `WhoAmI` (nếu có). */
  lensName: string | null
}

/**
 * Hiển thị cảnh báo thu hồi/lỗi mã cá nhân hoặc dòng nhắc chế độ chỉ xem khi đổi góc nhìn khác danh tính ghi.
 *
 * @param props - Trạng thái Admin, binding và góc nhìn hiện tại
 * @returns Khối banner trạng thái hoặc `null` khi không có gì cần nhắc
 */
export function TripAccessBanners({
  isAdmin,
  bindingStatus,
  boundMemberId,
  boundName,
  lensId,
  lensName,
}: TripAccessBannersProps) {
  if (isAdmin) {
    return null
  }

  const showRevoked = bindingStatus === 'revoked'
  const showInvalid = bindingStatus === 'invalid'
  const showLensMismatch = Boolean(lensId && lensName && lensId !== boundMemberId)

  if (!showRevoked && !showInvalid && !showLensMismatch) {
    return null
  }

  return (
    <div className="flex flex-col gap-2 px-4 pt-3">
      {showRevoked && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Link cá nhân của bạn đã hết hiệu lực. Liên hệ trưởng nhóm để lấy link mới.
          </AlertDescription>
        </Alert>
      )}

      {showInvalid && (
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertDescription>
            Link cá nhân không hợp lệ. Liên hệ trưởng nhóm để lấy link mới.
          </AlertDescription>
        </Alert>
      )}

      {showLensMismatch && (
        <p className="flex items-center gap-1.5 rounded-lg border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Eye className="size-3.5 shrink-0" />
          <span>
            Đang xem góc nhìn của <strong className="text-foreground">{lensName}</strong> — chỉ xem
            {boundName ? ` (bạn đang xác minh là ${boundName})` : ''}
          </span>
        </p>
      )}
    </div>
  )
}
