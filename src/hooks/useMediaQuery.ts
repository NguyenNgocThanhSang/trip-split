/**
 * Hook theo dõi CSS media query trên trình duyệt (dùng `useSyncExternalStore` để tương thích React 19).
 */
import { useCallback, useSyncExternalStore } from 'react'

/**
 * Theo dõi kết quả khớp của một chuỗi CSS media query theo thời gian thực.
 *
 * @param query - Chuỗi media query (vd: `"(min-width: 768px)"`)
 * @returns `true` nếu viewport hiện tại khớp `query`, ngược lại `false`
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
        return () => {}
      }

      const mediaQueryList = window.matchMedia(query)
      // Hỗ trợ cả trình duyệt chuẩn (`addEventListener`) và một số mock cũ (`addListener`)
      if (typeof mediaQueryList.addEventListener === 'function') {
        mediaQueryList.addEventListener('change', onStoreChange)
        return () => mediaQueryList.removeEventListener('change', onStoreChange)
      }

      mediaQueryList.addListener(onStoreChange)
      return () => mediaQueryList.removeListener(onStoreChange)
    },
    [query],
  )

  const getSnapshot = useCallback(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
      return false
    }
    return window.matchMedia(query).matches
  }, [query])

  return useSyncExternalStore(subscribe, getSnapshot, () => false)
}
