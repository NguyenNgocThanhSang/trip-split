/**
 * Hook theo dõi trạng thái kết nối mạng (`online` / `offline`) của trình duyệt bằng `useSyncExternalStore`.
 */
import { useSyncExternalStore } from 'react'

/** Đăng ký lắng nghe hai sự kiện `online` và `offline` trên đối tượng `window`. */
function subscribeOnlineStatus(callback: () => void): () => void {
  if (typeof window === 'undefined') {
    return () => {}
  }
  window.addEventListener('online', callback)
  window.addEventListener('offline', callback)
  return () => {
    window.removeEventListener('online', callback)
    window.removeEventListener('offline', callback)
  }
}

/** Đọc trạng thái mạng hiện tại từ `navigator.onLine`. */
function getOnlineSnapshot(): boolean {
  if (typeof navigator === 'undefined') {
    return true
  }
  return navigator.onLine
}

/**
 * Cho biết thiết bị hiện có đang trực tuyến hay không để hiển thị `OfflineBanner`.
 *
 * @returns `true` nếu đang có kết nối mạng, `false` nếu trình duyệt đang ngoại tuyến
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(subscribeOnlineStatus, getOnlineSnapshot, () => true)
}
