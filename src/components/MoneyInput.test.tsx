// @vitest-environment jsdom
/**
 * Kiểm thử ô nhập tiền VND (`MoneyInput`) trên jsdom: hỗ trợ viết tắt `190k`, `allowZero`,
 * preview giá trị định dạng, thông báo khi không hợp lệ và bàn phím `inputMode="text"`.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { MoneyInput } from './MoneyInput'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('MoneyInput', () => {
  it('phân tích chuỗi viết tắt "190k" thành 190000 và hiển thị preview "= 190.000đ"', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyInput value={null} onChange={onChange} aria-label="Số tiền" />)

    const input = screen.getByLabelText('Số tiền')
    await user.type(input, '190k')

    expect(onChange).toHaveBeenLastCalledWith(190000)
    expect(screen.getByText('= 190.000đ')).toBeInTheDocument()
  })

  it('trả về null và hiện thông báo "Số tiền không hợp lệ" khi nhập "abc"', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyInput value={null} onChange={onChange} aria-label="Số tiền" />)

    await user.type(screen.getByLabelText('Số tiền'), 'abc')

    expect(onChange).toHaveBeenLastCalledWith(null)
    expect(screen.getByRole('alert')).toHaveTextContent('Số tiền không hợp lệ')
  })

  it('chấp nhận giá trị 0 khi bật allowZero', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<MoneyInput value={null} onChange={onChange} allowZero aria-label="Số riêng" />)

    await user.type(screen.getByLabelText('Số riêng'), '0')

    expect(onChange).toHaveBeenLastCalledWith(0)
    expect(screen.getByText('= 0đ')).toBeInTheDocument()
  })

  it('đặt thuộc tính inputMode="text" để bàn phím điện thoại gõ được ký tự k/tr', () => {
    render(<MoneyInput value={null} onChange={vi.fn()} aria-label="Số tiền" />)

    expect(screen.getByLabelText('Số tiền')).toHaveAttribute('inputmode', 'text')
  })
})
