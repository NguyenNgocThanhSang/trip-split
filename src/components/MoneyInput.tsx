/**
 * Ô nhập số tiền VND hỗ trợ cách gõ viết tắt tiếng Việt (`190k`, `1tr2`, `45k5`) và hiển thị preview rõ ràng.
 * Dùng `inputMode="text"` trên di động để mở được bàn phím có chữ `k`/`tr`.
 */
import { type ChangeEvent, useState } from 'react'
import { Input } from '@/components/ui/input'
import { formatVND, parseVND } from '@/lib/money'
import type { VND } from '@/lib/types'
import { cn } from 'cn'

/** Props của component `MoneyInput`. */
export interface MoneyInputProps {
  /** Số tiền nguyên VND hiện tại, hoặc `null` nếu đang trống / không hợp lệ. */
  value: VND | null
  /** Callback được gọi mỗi khi người dùng thay đổi nội dung ô nhập. */
  onChange: (value: VND | null) => void
  /** Cho phép giá trị `0` (bật ở ô nhập số tiền cố định của từng người). */
  allowZero?: boolean
  /** Văn bản gợi ý trong ô nhập. */
  placeholder?: string
  /** Nhãn truy cập cho trình đọc màn hình và unit test khi không dùng `<Label>`. */
  'aria-label'?: string
  /** Thuộc tính `id` gắn với `<Label htmlFor>`. */
  id?: string
  /** Vô hiệu hóa ô nhập khi đang lưu hoặc đang khóa. */
  disabled?: boolean
  /** Class CSS bổ sung cho thẻ `<Input>`. */
  className?: string
  /** Báo cho form cha biết ô đang có văn bản sai định dạng (`text !== ''` nhưng `parseVND === null`). */
  onInvalidChange?: (invalid: boolean) => void
}

/**
 * Ô nhập tiền VND kèm dòng xem trước `= 190.000đ` hoặc cảnh báo `"Số tiền không hợp lệ"`.
 *
 * @param props - Giá trị `value`, callback `onChange` và các tùy chọn hiển thị
 * @returns Khối ô nhập tiền kèm dòng preview hoặc thông báo lỗi
 */
export function MoneyInput({
  value,
  onChange,
  allowZero = false,
  placeholder,
  'aria-label': ariaLabel,
  id,
  disabled,
  className,
  onInvalidChange,
}: MoneyInputProps) {
  const [text, setText] = useState<string>(() => (value !== null ? formatVND(value) : ''))
  const [prevValue, setPrevValue] = useState<VND | null>(value)

  // Chỉ đồng bộ lại chuỗi hiển thị khi prop `value` đổi từ bên ngoài khác với những gì `text` đang biểu diễn
  if (value !== prevValue) {
    setPrevValue(value)
    const parsedFromText = text.trim() ? parseVND(text, { allowZero }) : null
    if (parsedFromText !== value) {
      setText(value !== null ? formatVND(value) : '')
    }
  }

  const trimmed = text.trim()
  const parsed = trimmed ? parseVND(trimmed, { allowZero }) : null
  const isInvalid = trimmed.length > 0 && parsed === null

  /**
   * Phân tích ngay chuỗi người dùng vừa gõ bằng `parseVND` và cập nhật trạng thái hợp lệ cho form cha.
   *
   * @param event - Sự kiện change của ô `<Input>`
   */
  function handleChange(event: ChangeEvent<HTMLInputElement>) {
    const nextText = event.target.value
    setText(nextText)

    const nextTrimmed = nextText.trim()
    if (!nextTrimmed) {
      onInvalidChange?.(false)
      onChange(null)
      return
    }

    const nextParsed = parseVND(nextTrimmed, { allowZero })
    onInvalidChange?.(nextParsed === null)
    onChange(nextParsed)
  }

  return (
    <div className="flex flex-col gap-1">
      <Input
        id={id}
        type="text"
        inputMode="text"
        value={text}
        onChange={handleChange}
        placeholder={placeholder}
        aria-label={ariaLabel}
        aria-invalid={isInvalid}
        disabled={disabled}
        className={cn('min-h-11 tabular-nums', className)}
      />
      {trimmed.length > 0 && parsed !== null && (
        <p className="text-xs text-muted-foreground tabular-nums">= {formatVND(parsed)}</p>
      )}
      {isInvalid && (
        <p role="alert" className="text-xs text-destructive">
          Số tiền không hợp lệ
        </p>
      )}
    </div>
  )
}
