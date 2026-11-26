/**
 * Dải thông báo dính dưới đầu trang khi thiết bị mất mạng hoặc còn dữ liệu offline chờ đồng bộ Firestore.
 */
import { CloudUpload, WifiOff } from 'lucide-react'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'

/** Props của component `OfflineBanner`. */
export interface OfflineBannerProps {
  /** `true` nếu một trong các listener Firestore (`trip`, `expenses`, `payments`) còn bản ghi cục bộ chưa đồng bộ. */
  hasPendingWrites: boolean
}

/**
 * Hiển thị cảnh báo ngoại tuyến hoặc đang chờ đồng bộ ở đầu trang chuyến đi.
 * Tự ẩn hoàn toàn khi mạng bình thường và không còn dữ liệu chờ đồng bộ.
 *
 * @param props - Trạng thái còn thay đổi chờ đồng bộ từ Firestore
 * @returns Thanh banner trạng thái hoặc `null`
 */
export function OfflineBanner({ hasPendingWrites }: OfflineBannerProps) {
  const isOnline = useOnlineStatus()

  if (isOnline && !hasPendingWrites) {
    return null
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={
        !isOnline
          ? 'sticky top-0 z-20 flex items-center gap-2 border-b border-amber-500/30 bg-amber-50 px-4 py-2 text-xs font-medium text-amber-900 dark:bg-amber-950/90 dark:text-amber-200'
          : 'sticky top-0 z-20 flex items-center gap-2 border-b bg-muted/95 px-4 py-2 text-xs font-medium text-muted-foreground backdrop-blur-xs'
      }
    >
      {!isOnline ? (
        <>
          <WifiOff className="size-4 shrink-0" />
          <span>
            Đang ngoại tuyến — bạn vẫn xem được dữ liệu đã lưu và các thay đổi sẽ tự đồng bộ khi có mạng.
          </span>
        </>
      ) : (
        <>
          <CloudUpload className="size-4 shrink-0 animate-pulse" />
          <span>Đang đồng bộ thay đổi lên máy chủ...</span>
        </>
      )}
    </div>
  )
}
