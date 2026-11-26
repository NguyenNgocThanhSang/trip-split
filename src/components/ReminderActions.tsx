/**
 * Khối xem trước và chia sẻ/sao chép tin nhắn nhắc nợ (nhóm hoặc cá nhân) sang Messenger/Zalo.
 * Dùng Web Share API khi trình duyệt hỗ trợ và tự fallback sang clipboard nếu chia sẻ bị lỗi.
 */
import { Copy, Share2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'

/** Props của component `ReminderActions`. */
export interface ReminderActionsProps {
  /** Nội dung tin nhắn nhắc nợ đã định dạng sẵn để xem trước, copy hoặc chia sẻ. */
  text: string
}

/**
 * Kiểm tra lỗi ném ra từ `navigator.share` có phải do người dùng chủ động đóng hộp thoại chia sẻ hay không.
 * Kiểm tra theo thuộc tính `name` để tương thích cả `DOMException` trên các bản jsdom/Safari khác nhau.
 *
 * @param error - Lỗi bắt được từ `navigator.share`
 * @returns `true` nếu là `AbortError`
 */
function isAbortError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  )
}

/**
 * Hiển thị khung xem trước tin nhắn nhắc nợ cùng nút Copy và nút Chia sẻ (nếu thiết bị hỗ trợ Web Share API).
 *
 * @param props - Chuỗi tin nhắn nhắc nợ cần chia sẻ
 * @returns Khối xem trước tin nhắn và hàng nút thao tác tối thiểu 44px
 */
export function ReminderActions({ text }: ReminderActionsProps) {
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function'

  /**
   * Sao chép nội dung tin nhắn nhắc nợ vào clipboard và thông báo kết quả bằng toast.
   */
  async function copyMessage() {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Đã copy tin nhắn')
    } catch {
      toast.error('Không thể copy tự động. Hãy chạm giữ đoạn tin nhắn ở trên để sao chép.')
    }
  }

  /**
   * Mở bảng chia sẻ gốc của hệ điều hành (Zalo/Messenger...); bỏ qua im lặng nếu người dùng tự hủy,
   * và fallback sang copy clipboard nếu trình duyệt từ chối Web Share.
   */
  async function handleShare() {
    if (!canShare) {
      return
    }
    try {
      await navigator.share({ text })
    } catch (error) {
      if (isAbortError(error)) {
        return
      }
      await copyMessage()
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <pre className="max-h-64 overflow-y-auto rounded-xl border bg-muted/40 p-3 font-sans text-sm leading-relaxed whitespace-pre-wrap break-words">
        {text}
      </pre>

      <div className="flex gap-2">
        <Button type="button" variant="outline" className="min-h-11 flex-1" onClick={() => void copyMessage()}>
          <Copy />
          Copy
        </Button>

        {canShare && (
          <Button type="button" className="min-h-11 flex-1" onClick={() => void handleShare()}>
            <Share2 />
            Chia sẻ
          </Button>
        )}
      </div>
    </div>
  )
}
