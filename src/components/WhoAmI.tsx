/**
 * Hộp thoại chọn góc nhìn "Bạn là ai" khi xem chuyến đi (lưu ở `localStorage`).
 * Tách biệt với danh tính ghi (`bindings`): hiển thị thêm nhãn `✓ đã xác minh` cho thành viên đã bind qua link cá nhân.
 */
import { Check, ShieldCheck } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
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
  /** Mã thành viên hiện đang chọn làm góc nhìn (hoặc `null` nếu đang xem chung). */
  currentMe: string | null
  /** Mã thành viên đã được xác minh qua link cá nhân trên máy này (nếu có). */
  verifiedMemberId?: string | null
  /** Callback khi người dùng bấm chọn một thành viên. */
  onSelect: (memberId: string) => void
  /** Callback khi người dùng bấm "Chỉ xem chung (không chọn)" để xóa lựa chọn khỏi `localStorage`. */
  onClear: () => void
}

/**
 * Modal cho phép mọi thành viên chọn góc nhìn của mình (hoặc quay lại chế độ xem chung).
 *
 * @param props - Trạng thái hộp thoại, danh sách thành viên, người đã xác minh và callback chọn/xóa
 * @returns `ResponsiveModal` chứa danh sách nút chọn thành viên
 */
export function WhoAmI({
  open,
  onOpenChange,
  members,
  currentMe,
  verifiedMemberId = null,
  onSelect,
  onClear,
}: WhoAmIProps) {
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
          onClick={() => {
            onClear()
            onOpenChange(false)
          }}
        >
          Chỉ xem chung (không chọn)
        </Button>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground">
          Chọn tên để xem nhanh số tiền cần trả hoặc nhận lại theo góc nhìn của người đó và điền sẵn người ứng.
        </p>

        <div className="flex flex-col gap-2">
          {members.map((member) => {
            const isSelected = currentMe === member.id
            const isVerified = verifiedMemberId === member.id
            return (
              <Button
                key={member.id}
                type="button"
                variant={isSelected ? 'default' : 'outline'}
                className="min-h-11 w-full justify-between gap-2"
                onClick={() => {
                  onSelect(member.id)
                  onOpenChange(false)
                }}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="truncate">{member.name}</span>
                  {isVerified && (
                    <Badge
                      variant={isSelected ? 'secondary' : 'outline'}
                      className="shrink-0 text-[11px]"
                    >
                      <ShieldCheck />
                      ✓ đã xác minh
                    </Badge>
                  )}
                </span>
                {isSelected && <Check className="size-4 shrink-0" />}
              </Button>
            )
          })}
        </div>
      </div>
    </ResponsiveModal>
  )
}
