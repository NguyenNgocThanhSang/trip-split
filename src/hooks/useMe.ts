/**
 * Hook ghi nhớ lựa chọn "Bạn là ai" cho từng chuyến đi trong `localStorage`.
 * Đối chiếu với danh sách `memberIds` hiện hành để tự động xóa chọn nếu thành viên đó không còn trong chuyến.
 */
import { useCallback, useState } from 'react'
import { logWarn } from '@/lib/logger'

/** Kết quả trả về của hook `useMe`. */
export interface UseMeResult {
  /** Mã thành viên hiện đang chọn làm "Tôi", hoặc `null` nếu chưa chọn / không hợp lệ. */
  me: string | null
  /** Lưu mã thành viên được chọn vào `localStorage` và cập nhật state ngay lập tức. */
  setMe: (id: string) => void
  /** Xóa lựa chọn "Bạn là ai" hiện tại của chuyến đi. */
  clear: () => void
}

/**
 * Tạo khóa `localStorage` riêng theo từng chuyến đi để mỗi chuyến nhớ đúng người dùng.
 *
 * @param tripId - Mã chuyến đi 10 ký tự
 * @returns Chuỗi khóa `tripsplit:me:<tripId>`
 */
function storageKey(tripId: string): string {
  return `tripsplit:me:${tripId}`
}

/**
 * Đọc an toàn giá trị đã lưu trong `localStorage`, trả `null` nếu đang chạy ở SSR hoặc bị trình duyệt chặn.
 *
 * @param tripId - Mã chuyến đi cần đọc lựa chọn
 * @returns Giá trị chuỗi đã lưu hoặc `null`
 */
function readStoredMe(tripId: string): string | null {
  if (!tripId || typeof window === 'undefined') {
    return null
  }
  try {
    return window.localStorage.getItem(storageKey(tripId))
  } catch {
    // Chế độ duyệt web riêng tư trên một số trình duyệt có thể ném SecurityError khi đọc storage
    logWarn('useMe.storage', 'Không đọc được lựa chọn từ localStorage', { action: 'read' })
    return null
  }
}

/**
 * Hàm thuần đối chiếu ID đã lưu với danh sách `memberIds` hợp lệ của chuyến đi (Review Focus #5).
 *
 * @param stored - Giá trị đọc từ `localStorage` (có thể là `null` hoặc ID cũ không còn tồn tại)
 * @param memberIds - Danh sách mã thành viên hiện có của chuyến đi
 * @returns `stored` nếu nằm trong `memberIds`, ngược lại `null`
 * @example
 * resolveMe('sang', ['sang', 'mo']) // 'sang'
 * resolveMe('ghost', ['sang']) // null
 */
export function resolveMe(stored: string | null, memberIds: string[]): string | null {
  if (!stored) {
    return null
  }
  return memberIds.includes(stored) ? stored : null
}

/**
 * Hook quản lý trạng thái "Bạn là ai" cho một chuyến đi, lưu bền vững theo `tripsplit:me:${tripId}`.
 *
 * @param tripId - Mã chuyến đi hiện tại
 * @param memberIds - Danh sách mã thành viên hợp lệ trong chuyến
 * @returns Bộ `{ me, setMe, clear }` đã đồng bộ với `localStorage`
 */
export function useMe(tripId: string, memberIds: string[]): UseMeResult {
  const [entry, setEntry] = useState<{ tripId: string; stored: string | null }>(() => ({
    tripId,
    stored: readStoredMe(tripId),
  }))

  // Đọc trực tiếp khi tripId vừa đổi giữa các lần render để tránh gọi setState đồng bộ trong useEffect
  const currentStored = entry.tripId === tripId ? entry.stored : readStoredMe(tripId)
  const me = resolveMe(currentStored, memberIds)

  const setMe = useCallback(
    (id: string) => {
      if (!tripId) {
        return
      }
      try {
        window.localStorage.setItem(storageKey(tripId), id)
      } catch {
        // Vẫn cập nhật state bộ nhớ tạm để người dùng tiếp tục dùng trong phiên hiện tại
        logWarn('useMe.storage', 'Không lưu được lựa chọn vào localStorage', { action: 'write' })
      }
      setEntry({ tripId, stored: id })
    },
    [tripId],
  )

  const clear = useCallback(() => {
    if (!tripId) {
      return
    }
    try {
      window.localStorage.removeItem(storageKey(tripId))
    } catch {
      // Bỏ qua lỗi quyền truy cập storage ở chế độ riêng tư
      logWarn('useMe.storage', 'Không xóa được lựa chọn khỏi localStorage', { action: 'remove' })
    }
    setEntry({ tripId, stored: null })
  }, [tripId])

  return { me, setMe, clear }
}
