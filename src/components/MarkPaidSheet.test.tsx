// @vitest-environment jsdom
/**
 * Kiểm thử hộp thoại xác nhận đã chuyển tiền (`MarkPaidSheet`) trên jsdom.
 * Kiểm tra điền sẵn số tiền gợi ý, cho phép trả một phần hoặc trả dư (có cảnh báo), và chống double-submit.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Transfer } from '@/lib/types'
import { MarkPaidSheet } from './MarkPaidSheet'

const transfer: Transfer = {
  fromId: 'mo',
  toId: 'sang',
  amount: 273750,
}

const nameOf = (id: string) => ({ mo: 'Mơ', sang: 'Sang' }[id] ?? id)

beforeAll(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)',
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MarkPaidSheet', () => {
  it('điền sẵn transfer.amount và gọi onConfirm(200000, "") khi sửa thành 200k (trả một phần)', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    render(
      <MarkPaidSheet
        open
        onOpenChange={vi.fn()}
        transfer={transfer}
        nameOf={nameOf}
        onConfirm={onConfirm}
      />,
    )

    const amountInput = screen.getByLabelText(/số tiền đã chuyển/i) as HTMLInputElement
    expect(amountInput.value).toBe('273.750đ')

    await user.clear(amountInput)
    await user.type(amountInput, '200k')
    await user.click(screen.getByRole('button', { name: /xác nhận đã chuyển/i }))

    expect(onConfirm).toHaveBeenCalledTimes(1)
    expect(onConfirm).toHaveBeenCalledWith(200000, '')
  })

  it('cảnh báo "Số tiền lớn hơn số cần trả" khi nhập 300k nhưng vẫn cho xác nhận', async () => {
    const user = userEvent.setup()
    const onConfirm = vi.fn().mockResolvedValue(undefined)

    render(
      <MarkPaidSheet
        open
        onOpenChange={vi.fn()}
        transfer={transfer}
        nameOf={nameOf}
        onConfirm={onConfirm}
      />,
    )

    const amountInput = screen.getByLabelText(/số tiền đã chuyển/i)
    await user.clear(amountInput)
    await user.type(amountInput, '300k')

    expect(screen.getByText(/số tiền lớn hơn số cần trả/i)).toBeInTheDocument()

    const confirmButton = screen.getByRole('button', { name: /xác nhận đã chuyển/i })
    expect(confirmButton).not.toBeDisabled()
    await user.click(confirmButton)

    expect(onConfirm).toHaveBeenCalledWith(300000, '')
  })

  it('MarkPaidSheet submits once: chỉ gọi onConfirm đúng 1 lần khi click đúp lúc đang xử lý', async () => {
    const user = userEvent.setup()
    let resolveConfirm!: () => void
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConfirm = resolve
        }),
    )

    render(
      <MarkPaidSheet
        open
        onOpenChange={vi.fn()}
        transfer={transfer}
        nameOf={nameOf}
        onConfirm={onConfirm}
      />,
    )

    const confirmButton = screen.getByRole('button', { name: /xác nhận đã chuyển/i })
    await user.dblClick(confirmButton)

    expect(confirmButton).toBeDisabled()
    expect(onConfirm).toHaveBeenCalledTimes(1)

    resolveConfirm()
  })
})
