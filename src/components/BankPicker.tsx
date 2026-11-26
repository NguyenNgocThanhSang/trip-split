/**
 * Bộ chọn ngân hàng Việt Nam dạng combobox có ô tìm kiếm theo tên ngắn, mã viết tắt, tên đầy đủ và mã BIN.
 * Sử dụng dữ liệu tĩnh `BANKS` trong `src/lib/banks.ts`, không gọi API mạng.
 */
import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { BANKS, findBank } from '@/lib/banks'
import { toAscii } from '@/lib/vietqr'

/** Props của component `BankPicker`. */
export interface BankPickerProps {
  /** Mã `id` gắn với `<Label htmlFor>` để hỗ trợ truy cập và kiểm thử theo nhãn. */
  id?: string
  /** Mã BIN 6 chữ số của ngân hàng đang chọn (chuỗi rỗng hoặc `undefined` nếu chưa chọn). */
  value?: string
  /** Callback được gọi khi người dùng chọn một ngân hàng hoặc bấm bỏ chọn (trả `""`). */
  onChange: (bin: string) => void
}

/**
 * Combobox chọn ngân hàng hỗ trợ VietQR/NAPAS dùng `Popover` + `Command`.
 * Cho phép gõ tiếng Việt có dấu hoặc không dấu để tìm theo `shortName`, `code` hoặc `name`.
 *
 * @param props - Mã BIN hiện tại và callback khi thay đổi lựa chọn
 * @returns Nút combobox mở danh sách tìm kiếm ngân hàng
 */
export function BankPicker({ id, value, onChange }: BankPickerProps) {
  const [open, setOpen] = useState(false)
  const selectedBank = value ? findBank(value) : undefined

  return (
    // Bật modal=true để danh sách trong Popover nhận sự kiện cuộn và click bình thường khi đặt bên trong Dialog/Drawer
    <Popover open={open} onOpenChange={setOpen} modal>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="min-h-11 w-full justify-between font-normal"
        >
          <span className="truncate">
            {selectedBank ? `${selectedBank.shortName} (${selectedBank.code})` : 'Chọn ngân hàng...'}
          </span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(22rem,calc(100vw-2rem))] p-0">
        <Command>
          <CommandInput placeholder="Tìm ngân hàng (VCB, MB, Techcombank...)" />
          <CommandList>
            <CommandEmpty>Không tìm thấy ngân hàng phù hợp.</CommandEmpty>
            <CommandGroup>
              {BANKS.map((bank) => {
                // Ghép cả tên có dấu, không dấu và mã BIN vào value để cmdk lọc chính xác khi gõ không dấu
                const searchValue = `${bank.shortName} ${bank.code} ${bank.name} ${toAscii(bank.name)} ${bank.bin}`
                const isSelected = value === bank.bin

                return (
                  <CommandItem
                    key={bank.bin}
                    value={searchValue}
                    data-checked={isSelected}
                    className="min-h-10"
                    onSelect={() => {
                      onChange(bank.bin)
                      setOpen(false)
                    }}
                  >
                    <div className="flex min-w-0 flex-1 flex-col">
                      <span className="truncate font-medium">
                        {bank.shortName} ({bank.code})
                      </span>
                      <span className="truncate text-xs text-muted-foreground">{bank.name}</span>
                    </div>
                  </CommandItem>
                )
              })}
            </CommandGroup>
          </CommandList>
          {selectedBank && (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="min-h-10 w-full text-muted-foreground"
                onClick={() => {
                  onChange('')
                  setOpen(false)
                }}
              >
                Bỏ chọn ngân hàng
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  )
}
