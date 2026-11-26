/**
 * Nhóm chip chọn thành viên theo một lựa chọn (người ứng) hoặc nhiều lựa chọn (người tham gia chia).
 * Dùng shadcn `ToggleGroup` với kích thước nút tối thiểu 44px cho thao tác chạm một tay trên di động.
 */
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'

/** Props của component `MemberChips`. */
export interface MemberChipsProps {
  /** Danh sách thành viên gọn (`id` và `name`) cần hiển thị theo đúng thứ tự. */
  members: { id: string; name: string }[]
  /** Chế độ chọn một (`'single'`) hoặc chọn nhiều (`'multi'`). */
  mode: 'single' | 'multi'
  /** Danh sách `id` thành viên đang được chọn (với `'single'`, dùng phần tử đầu tiên). */
  value: string[]
  /** Callback trả về danh sách `id` mới khi người dùng chạm vào chip. */
  onChange: (ids: string[]) => void
  /** Nhãn truy cập cho nhóm chip (`aria-label`). */
  'aria-label'?: string
}

/**
 * Hiển thị hàng chip thành viên có thể xuống dòng tự nhiên trên màn hình nhỏ.
 *
 * @param props - Danh sách thành viên, chế độ chọn và trạng thái đang chọn
 * @returns Nhóm chip `ToggleGroup` tương ứng chế độ `single` hoặc `multi`
 */
export function MemberChips({
  members,
  mode,
  value,
  onChange,
  'aria-label': ariaLabel,
}: MemberChipsProps) {
  const itemClassName =
    'min-h-11 rounded-full px-3.5 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground'

  if (mode === 'single') {
    return (
      <ToggleGroup
        type="single"
        variant="outline"
        value={value[0] ?? ''}
        onValueChange={(next) => {
          // Chế độ single dùng cho người ứng tiền nên bỏ qua thao tác bấm lại để luôn giữ 1 người chọn
          if (next) {
            onChange([next])
          }
        }}
        aria-label={ariaLabel}
        className="w-full flex-wrap justify-start gap-2"
      >
        {members.map((member) => (
          <ToggleGroupItem key={member.id} value={member.id} className={itemClassName}>
            {member.name}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    )
  }

  return (
    <ToggleGroup
      type="multiple"
      variant="outline"
      value={value}
      onValueChange={onChange}
      aria-label={ariaLabel}
      className="w-full flex-wrap justify-start gap-2"
    >
      {members.map((member) => (
        <ToggleGroupItem key={member.id} value={member.id} className={itemClassName}>
          {member.name}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
