/**
 * Component modal đáp ứng kích thước màn hình: dùng `Dialog` trên màn hình lớn (`>= 768px`),
 * và trên di động hỗ trợ `Drawer` (mặc định cho sheet ngắn) hoặc `Dialog` toàn màn hình (`mobileVariant="fullscreen"`)
 * để bàn phím ảo trên iOS Safari / Android Chrome không đẩy lệch trang hay che mất ô nhập (DESIGN.md §9).
 */
import { type FocusEvent, type ReactNode, useEffect, useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from '@/components/ui/drawer'
import { useMediaQuery } from '@/hooks/useMediaQuery'

/** Props của component `ResponsiveModal`. */
export interface ResponsiveModalProps {
  /** Trạng thái mở/đóng hộp thoại. */
  open: boolean
  /** Callback cập nhật trạng thái mở/đóng khi người dùng bấm đóng hoặc chạm ra ngoài. */
  onOpenChange: (open: boolean) => void
  /** Tiêu đề hiển thị ở phần đầu hộp thoại. */
  title: string
  /** Nội dung chính bên trong hộp thoại. */
  children: ReactNode
  /** Vùng nút hành động ở chân hộp thoại (tùy chọn). */
  footer?: ReactNode
  /** Kiểu hiển thị trên màn hình nhỏ (`< 768px`): `'drawer'` (mặc định) hoặc `'fullscreen'` trên Radix Dialog. */
  mobileVariant?: 'drawer' | 'fullscreen'
}

/**
 * Đo phần chiều cao bị bàn phím ảo che phủ qua `window.visualViewport` (chủ yếu cho iOS Safari,
 * vì iOS bỏ qua `interactive-widget=resizes-content`; trên Android Chrome `innerHeight` tự co nên hiệu số ≈ 0).
 *
 * @param enabled - Chỉ lắng nghe khi modal fullscreen trên mobile đang mở
 * @returns Chiều cao cần bù `paddingBottom` tính bằng pixel
 */
function useVisualViewportKeyboardInset(enabled: boolean): number {
  const [inset, setInset] = useState(0)

  useEffect(() => {
    if (!enabled || typeof window === 'undefined' || !window.visualViewport) {
      return
    }
    const vv = window.visualViewport
    const update = () => {
      const next = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop))
      setInset(next)
    }
    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('resize', update)
    return () => {
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('resize', update)
    }
  }, [enabled])

  return enabled ? inset : 0
}

/**
 * Cuộn ô nhập đang được focus vào giữa vùng cuộn sau khi bàn phím di động mở xong (~150ms).
 *
 * @param event - Sự kiện `onFocusCapture` từ vùng thân modal
 */
function handleFocusCapture(event: FocusEvent<HTMLDivElement>) {
  const target = event.target
  if (
    !(
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      target instanceof HTMLSelectElement
    )
  ) {
    return
  }
  window.setTimeout(() => {
    if (document.activeElement === target && typeof target.scrollIntoView === 'function') {
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
    }
  }, 150)
}

/**
 * Hiển thị `Dialog` trên desktop (`min-width: 768px`), hoặc `Drawer` / `Dialog` toàn màn hình trên di động.
 *
 * @param props - Thông tin điều khiển, kiểu hiển thị mobile và nội dung hộp thoại
 * @returns Phần tử `Dialog` hoặc `Drawer` tương ứng kích thước màn hình
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  children,
  footer,
  mobileVariant = 'drawer',
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')
  const isMobileFullscreen = !isDesktop && mobileVariant === 'fullscreen'
  const keyboardInset = useVisualViewportKeyboardInset(open && isMobileFullscreen)

  if (isDesktop) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {/* Mô tả ẩn cho trình đọc màn hình để tránh cảnh báo thiếu Description từ Radix */}
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>
          <div>{children}</div>
          {footer && <DialogFooter>{footer}</DialogFooter>}
        </DialogContent>
      </Dialog>
    )
  }

  if (isMobileFullscreen) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent
          className="inset-0 top-0 left-0 flex h-dvh max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none bg-background p-0 ring-0 sm:max-w-none"
          style={keyboardInset > 0 ? { paddingBottom: `${keyboardInset}px` } : undefined}
        >
          <DialogHeader className="shrink-0 border-b bg-background px-4 py-3.5 pr-12 text-left">
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription className="sr-only">{title}</DialogDescription>
          </DialogHeader>
          <div
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4"
            onFocusCapture={handleFocusCapture}
          >
            {children}
          </div>
          {footer && (
            <div className="shrink-0 border-t bg-background px-4 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              {footer}
            </div>
          )}
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
      <DrawerContent className="data-[vaul-drawer-direction=bottom]:max-h-[85dvh]">
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{title}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4" onFocusCapture={handleFocusCapture}>
          {children}
        </div>
        {footer && <DrawerFooter className="border-t">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  )
}
