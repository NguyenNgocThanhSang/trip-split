/**
 * Hộp thoại chọn danh tính "Bạn là ai" khi lần đầu mở chuyến đi hoặc khi đổi người xem.
 * Lựa chọn được lưu vào `localStorage` để cá nhân hóa số dư, sắp xếp giao dịch và điền sẵn người ứng.
 */
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import type { Member } from '@/data/types'
import { ResponsiveModal } from './ResponsiveModal'

/** Props của component `WhoAmI`. */
export interface WhoAmIProps {
  /** Trạng thái mở/đóng hộp thoại. */
  open: boolean
  /** Callback cập nhật trạng thái đóng/mở. */
  onOpenChange: (open: boolean) => void
  /** Danh sách thành viên của chuyến đi. */
  members: Member[]
  /** Mã thành viên hiện đang chọn làm "Tôi" (hoặc `null` nếu chưa chọn). */
  currentMe: string | null
  /** Callback khi người dùng bấm chọn một thành viên. */
  onSelect: (memberId: string) => void
}

/**
 * Modal cho phép mỗi thành viên tự chọn tên của mình trong chuyến đi (không cần đăng nhập).
 *
 * @param props - Trạng thái hộp thoại, danh sách thành viên và callback chọn
 * @returns `ResponsiveModal` chứa danh sách nút chọn thành viên
 */
export function WhoAmI({ open, onOpenChange, members, currentMe, onSelect }: WhoAmIProps) {
  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title="Bạn là ai trong chuyến này?"
      footer={
        <Button
          type="button"
          variant="ghost"
          className="min-h-11 w-full"
          onClick={() => onOpenChange(false)}
        >
          Chỉ xem chung (không chọn)
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Chọn tên của bạn để xem nhanh số tiền cần trả hoặc nhận lại, và tự điền tên khi thêm khoản chi.
        </p>

        <div className="flex flex-col gap-2">
          {members.map((member) => {
            const isSelected = currentMe === member.id
            return (
              <Button
                key={member.id}
                type="button"
                variant={isSelected ? 'default' : 'outline'}
                className="min-h-11 w-full justify-between"
                onClick={() => {
                  onSelect(member.id)
                  onOpenChange(false)
                }}
              >
                <span className="truncate">{member.name}</span>
                {isSelected && <Check className="size-4 shrink-0" />}
              </Button>
            )
          })}
        </div>
      </div>
    </ResponsiveModal>
  )
}
