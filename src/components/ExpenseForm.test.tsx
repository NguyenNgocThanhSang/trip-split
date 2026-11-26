// @vitest-environment jsdom
/**
 * Kiểm thử biểu mẫu nhập/sửa khoản chi (`ExpenseForm`) theo đúng ví dụ trong DESIGN.md §8.2 và §9.
 */
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Member } from '@/data/types'
import { todayISO } from '@/lib/date'
import { ExpenseForm } from './ExpenseForm'

const members: Member[] = [
  { id: 'sang', name: 'Sang', hasStaticQr: false },
  { id: 'chung', name: 'Chung', hasStaticQr: false },
  { id: 'mo', name: 'Mơ', hasStaticQr: false },
  { id: 'phung', name: 'Phụng', hasStaticQr: false },
]

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('ExpenseForm', () => {
  it('mặc định chọn tất cả người tham gia, người ứng là defaultPayerId và ngày là hôm nay', async () => {
    const user = userEvent.setup()
    render(
      <ExpenseForm
        members={members}
        defaultPayerId="sang"
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    )

    const payerGroup = screen.getByRole('group', { name: /người ứng/i })
    const participantGroup = screen.getByRole('group', { name: /người tham gia/i })

    expect(within(payerGroup).getByText('Sang')).toHaveAttribute('data-state', 'on')
    expect(within(payerGroup).getByText('Chung')).toHaveAttribute('data-state', 'off')

    for (const m of members) {
      expect(within(participantGroup).getByText(m.name)).toHaveAttribute('data-state', 'on')
    }

    await user.click(screen.getByRole('button', { name: /thêm chi tiết/i }))
    const dateInput = screen.getByLabelText(/ngày/i) as HTMLInputElement
    expect(dateInput.value).toBe(todayISO())
  })

  it('tính preview và gửi đúng payload cho ví dụ Ăn sáng 190k (Chung 45k, Mơ 45k)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <ExpenseForm
        members={members}
        defaultPayerId="sang"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/tên khoản chi/i), 'Ăn sáng')
    await user.type(screen.getByLabelText(/số tiền$/i), '190k')
    await user.click(screen.getByRole('button', { name: /chia không đều/i }))

    await user.type(screen.getByLabelText('Số tiền riêng của Chung'), '45k')
    await user.type(screen.getByLabelText('Số tiền riêng của Mơ'), '45k')

    expect(screen.getAllByText('Tự tính: 50.000đ')).toHaveLength(2)
    expect(screen.getByText('✔ Khớp 190.000đ')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(onSubmit).toHaveBeenCalledTimes(1)
    expect(onSubmit).toHaveBeenCalledWith({
      name: 'Ăn sáng',
      amount: 190000,
      payerId: 'sang',
      participantIds: ['sang', 'chung', 'mo', 'phung'],
      fixedAmounts: { chung: 45000, mo: 45000 },
      note: '',
      date: todayISO(),
    })
  })

  it('khóa nút Lưu và hiện thông báo khi tổng số cố định vượt thành tiền (FIXED_EXCEEDS_TOTAL)', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <ExpenseForm
        members={members}
        defaultPayerId="sang"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/tên khoản chi/i), 'Ăn tối')
    await user.type(screen.getByLabelText(/số tiền$/i), '100k')
    await user.click(screen.getByRole('button', { name: /chia không đều/i }))
    await user.type(screen.getByLabelText('Số tiền riêng của Chung'), '60k')
    await user.type(screen.getByLabelText('Số tiền riêng của Mơ'), '60k')

    expect(screen.getByRole('alert')).toHaveTextContent(/vượt quá thành tiền/i)
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('khóa nút Lưu và hiện thông báo khi bỏ hết người tham gia', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn()

    render(
      <ExpenseForm
        members={members}
        defaultPayerId="sang"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/tên khoản chi/i), 'Ăn trưa')
    await user.type(screen.getByLabelText(/số tiền$/i), '100k')
    await user.click(screen.getByRole('button', { name: 'Bỏ hết' }))

    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
    expect(screen.getByText(/ít nhất 1 người tham gia/i)).toBeInTheDocument()
    expect(onSubmit).not.toHaveBeenCalled()
  })

  it('loại bỏ số cố định của thành viên khi bỏ chọn người đó khỏi danh sách tham gia', async () => {
    const user = userEvent.setup()
    const onSubmit = vi.fn().mockResolvedValue(undefined)

    render(
      <ExpenseForm
        members={members}
        defaultPayerId="sang"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/tên khoản chi/i), 'Ăn sáng')
    await user.type(screen.getByLabelText(/số tiền$/i), '190k')
    await user.click(screen.getByRole('button', { name: /chia không đều/i }))
    await user.type(screen.getByLabelText('Số tiền riêng của Chung'), '45k')
    await user.type(screen.getByLabelText('Số tiền riêng của Mơ'), '45k')

    // Bỏ chọn Chung khỏi nhóm người tham gia → fixedAmounts không còn key 'chung'
    const participantGroup = screen.getByRole('group', { name: /người tham gia/i })
    await user.click(within(participantGroup).getByText('Chung'))

    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        participantIds: ['sang', 'mo', 'phung'],
        fixedAmounts: { mo: 45000 },
      }),
    )
  })

  it('vô hiệu hóa nút Lưu khi onSubmit đang xử lý và chỉ gọi 1 lần nếu bấm đúp', async () => {
    const user = userEvent.setup()
    let resolveSubmit!: () => void
    const onSubmit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        }),
    )

    render(
      <ExpenseForm
        members={members}
        defaultPayerId="sang"
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    )

    await user.type(screen.getByLabelText(/tên khoản chi/i), 'Cà phê')
    await user.type(screen.getByLabelText(/số tiền$/i), '50k')

    const saveButton = screen.getByRole('button', { name: 'Lưu' })
    await user.dblClick(saveButton)

    expect(saveButton).toBeDisabled()
    expect(onSubmit).toHaveBeenCalledTimes(1)

    resolveSubmit()
  })
})
