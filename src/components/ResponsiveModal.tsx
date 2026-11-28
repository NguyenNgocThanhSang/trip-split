/**
 * Component modal đáp ứng kích thước màn hình: dùng `Dialog` trên màn hình lớn (`>= 768px`)
 * và `Drawer` trượt từ dưới lên trên điện thoại để thao tác một tay thoải mái (DESIGN.md §9).
 */
import type { ReactNode } from 'react'
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
}

/**
 * Hiển thị `Dialog` trên desktop (`min-width: 768px`) hoặc bottom-sheet `Drawer` trên di động.
 *
 * @param props - Thông tin điều khiển và nội dung hộp thoại
 * @returns Phần tử `Dialog` hoặc `Drawer` tương ứng kích thước màn hình
 */
export function ResponsiveModal({
  open,
  onOpenChange,
  title,
  children,
  footer,
}: ResponsiveModalProps) {
  const isDesktop = useMediaQuery('(min-width: 768px)')

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

  return (
    <Drawer open={open} onOpenChange={onOpenChange}>
      <DrawerContent>
        <DrawerHeader className="text-left">
          <DrawerTitle>{title}</DrawerTitle>
          <DrawerDescription className="sr-only">{title}</DrawerDescription>
        </DrawerHeader>
        <div className="overflow-y-auto px-4 pb-4">{children}</div>
        {footer && <DrawerFooter className="border-t">{footer}</DrawerFooter>}
      </DrawerContent>
    </Drawer>
  )
}
