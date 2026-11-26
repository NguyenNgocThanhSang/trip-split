/**
 * Bảng tổng kết từng thành viên: Đã ứng | Phải chịu | Chênh lệch (DESIGN.md §9).
 * Tô màu trực quan theo số dư còn lại: xanh lá (+nhận lại), đỏ (-cần trả), xám (đã xong).
 */
import type { Member } from '@/data/types'
import { formatSignedVND, formatVND } from '@/lib/money'
import type { BalanceRow } from '@/lib/types'
import { cn } from 'cn'

/** Props của component `SummaryTable`. */
export interface SummaryTableProps {
  /** Danh sách thành viên để ánh xạ tên hiển thị. */
  members: Member[]
  /** Các dòng số dư đã tính từ `computeBalances` theo thứ tự thành viên. */
  rows: BalanceRow[]
  /** Mã thành viên hiện tại ("Bạn") để làm nổi bật dòng tương ứng. */
  me: string | null
}

/**
 * Hiển thị bảng cân đối thu chi của tất cả thành viên trong chuyến đi.
 *
 * @param props - Danh sách thành viên, dòng số dư và mã người đang xem
 * @returns Bảng HTML đáp ứng kích thước di động với số tiền căn phải (`tabular-nums`)
 */
export function SummaryTable({ members, rows, me }: SummaryTableProps) {
  const memberNameById = new Map(members.map((m) => [m.id, m.name]))

  return (
    <div className="overflow-x-auto rounded-xl border bg-card">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b bg-muted/50 text-xs text-muted-foreground">
            <th scope="col" className="px-3 py-2.5 text-left font-medium">
              Thành viên
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium">
              Đã ứng
            </th>
            <th scope="col" className="px-2 py-2.5 text-right font-medium">
              Phải chịu
            </th>
            <th scope="col" className="px-3 py-2.5 text-right font-medium">
              Còn lại
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const name = memberNameById.get(row.memberId) ?? row.memberId
            const isMe = me === row.memberId

            return (
              <tr
                key={row.memberId}
                className={cn(
                  'border-b last:border-b-0',
                  isMe && 'bg-primary/5 font-medium',
                )}
              >
                <td className="max-w-[7rem] truncate px-3 py-2.5">
                  {name}
                  {isMe && <span className="ml-1 text-xs text-primary">(Bạn)</span>}
                </td>
                <td className="px-2 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                  {formatVND(row.paid)}
                </td>
                <td className="px-2 py-2.5 text-right text-xs text-muted-foreground tabular-nums">
                  {formatVND(row.owed)}
                </td>
                <td
                  className={cn(
                    'px-3 py-2.5 text-right font-semibold tabular-nums',
                    row.balance > 0 && 'text-emerald-600 dark:text-emerald-400',
                    row.balance < 0 && 'text-destructive',
                    row.balance === 0 && 'text-muted-foreground',
                  )}
                >
                  {row.balance === 0 ? 'Đã xong' : formatSignedVND(row.balance)}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
