// @vitest-environment jsdom
/**
 * Kiểm thử khối thao tác nhắc nợ (`ReminderActions`) trên jsdom:
 * Copy vào clipboard, ẩn nút Chia sẻ khi không có Web Share API, im lặng khi hủy (AbortError) và fallback copy khi lỗi.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReminderActions } from './ReminderActions'

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}))

const sampleText = [
  '💸 Chia tiền Đà Lạt 2026',
  '💰 Tổng chi: 1.105.000đ',
  '• Chung → Sang: 273.750đ',
  'Xem chi tiết & quét QR: https://example.com/t/abc1234567',
].join('\n')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    writable: true,
    value: undefined,
  })
})

describe('ReminderActions', () => {
  it('hiển thị nội dung nhắc nợ và gọi clipboard.writeText khi bấm nút Copy', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)

    render(<ReminderActions text={sampleText} />)

    expect(screen.getByText(/Chia tiền Đà Lạt 2026/)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy' }))

    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(sampleText)
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Đã copy tin nhắn')
  })

  it('ẩn nút Chia sẻ khi trình duyệt không hỗ trợ navigator.share', () => {
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: undefined,
    })

    render(<ReminderActions text={sampleText} />)

    expect(screen.queryByRole('button', { name: 'Chia sẻ' })).not.toBeInTheDocument()
  })

  it('giữ im lặng (không báo lỗi, không fallback copy) khi người dùng hủy chia sẻ (AbortError)', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const shareMock = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: shareMock,
    })

    render(<ReminderActions text={sampleText} />)

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))

    expect(shareMock).toHaveBeenCalledWith({ text: sampleText })
    expect(writeText).not.toHaveBeenCalled()
    expect(vi.mocked(toast.error)).not.toHaveBeenCalled()
  })

  it('fallback sang clipboard.writeText khi navigator.share thất bại với lỗi khác AbortError', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const shareMock = vi.fn().mockRejectedValue(new Error('NotAllowedError'))
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: shareMock,
    })

    render(<ReminderActions text={sampleText} />)

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))

    expect(shareMock).toHaveBeenCalledWith({ text: sampleText })
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith(sampleText)
    expect(vi.mocked(toast.success)).toHaveBeenCalledWith('Đã copy tin nhắn')
  })

  it('gọi navigator.share({ text }) và không copy khi chia sẻ thành công', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    const shareMock = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', {
      configurable: true,
      writable: true,
      value: shareMock,
    })

    render(<ReminderActions text={sampleText} />)

    await user.click(screen.getByRole('button', { name: 'Chia sẻ' }))

    expect(shareMock).toHaveBeenCalledWith({ text: sampleText })
    expect(writeText).not.toHaveBeenCalled()
  })
})
