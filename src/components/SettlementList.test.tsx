// @vitest-environment jsdom
/**
 * Kiểm thử danh sách kế hoạch chuyển khoản (`SettlementList`) trên jsdom.
 * Kiểm tra việc đưa giao dịch liên quan đến `me` lên đầu, ẩn nút Đã chuyển khi khóa sổ và thông báo khi hết nợ.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Transfer } from '@/lib/types'
import { SettlementList } from './SettlementList'

const names: Record<string, string> = {
  sang: 'Sang',
  chung: 'Chung',
  mo: 'Mơ',
  phung: 'Phụng',
}
const nameOf = (id: string) => names[id] ?? id

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('SettlementList', () => {
  it('đưa các giao dịch có liên quan đến "me" lên đầu và giữ nguyên thứ tự tương đối còn lại', () => {
    const transfers: Transfer[] = [
      { fromId: 'chung', toId: 'sang', amount: 273750 },
      { fromId: 'phung', toId: 'chung', amount: 100000 },
      { fromId: 'mo', toId: 'sang', amount: 273750 },
    ]

    render(
      <SettlementList
        transfers={transfers}
        me="mo"
        nameOf={nameOf}
        onQr={vi.fn()}
        onPaid={vi.fn()}
        onCopyReminder={vi.fn()}
        canMarkPaid
      />,
    )

    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    expect(items[0]).toHaveTextContent('Mơ')
    expect(items[0]).toHaveTextContent('Sang')
    expect(items[1]).toHaveTextContent('Chung')
    expect(items[2]).toHaveTextContent('Phụng')
  })

  it('hiển thị "🎉 Cả nhóm đã thanh toán xong!" khi danh sách chuyển khoản rỗng', () => {
    render(
      <SettlementList
        transfers={[]}
        me="sang"
        nameOf={nameOf}
        onQr={vi.fn()}
        onPaid={vi.fn()}
        onCopyReminder={vi.fn()}
        canMarkPaid
      />,
    )

    expect(screen.getByText('🎉 Cả nhóm đã thanh toán xong!')).toBeInTheDocument()
  })

  it('ẩn nút "Đã chuyển" khi canMarkPaid = false (chuyến đã khóa sổ)', async () => {
    const user = userEvent.setup()
    const onQr = vi.fn()
    const onCopyReminder = vi.fn()
    const t: Transfer = { fromId: 'chung', toId: 'sang', amount: 273750 }

    render(
      <SettlementList
        transfers={[t]}
        me={null}
        nameOf={nameOf}
        onQr={onQr}
        onPaid={vi.fn()}
        onCopyReminder={onCopyReminder}
        canMarkPaid={false}
      />,
    )

    expect(screen.queryByRole('button', { name: /đã chuyển/i })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /quét qr/i }))
    expect(onQr).toHaveBeenCalledWith(t)

    await user.click(screen.getByRole('button', { name: /nhắc/i }))
    expect(onCopyReminder).toHaveBeenCalledWith(t)
  })
})
