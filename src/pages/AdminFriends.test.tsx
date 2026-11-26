// @vitest-environment jsdom
/**
 * Kiểm thử giao diện trang quản lý danh bạ bạn bè (`AdminFriends`) trên môi trường jsdom.
 * Mock lớp dữ liệu Firestore (`@/data/friends`) để kiểm tra chuẩn hóa chủ tài khoản, chọn ngân hàng, ràng buộc STK và thao tác sửa/xóa.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteFriend, saveFriend, useFriends } from '@/data/friends'
import type { Friend } from '@/data/types'
import { AdminFriends } from './AdminFriends'

vi.mock('@/data/firebase', () => ({
  db: {},
}))

vi.mock('@/data/friends', () => ({
  useFriends: vi.fn(),
  saveFriend: vi.fn(),
  deleteFriend: vi.fn(),
}))

const mockUseFriends = vi.mocked(useFriends)
const mockSaveFriend = vi.mocked(saveFriend)
const mockDeleteFriend = vi.mocked(deleteFriend)

const sampleFriend: Friend = {
  id: 'f1',
  name: 'Sang',
  bankBin: '970436',
  bankShortName: 'Vietcombank',
  accountNo: '0123456789',
  accountName: 'NGUYEN NGOC SANG',
  createdAt: {} as Friend['createdAt'],
  updatedAt: {} as Friend['updatedAt'],
}

beforeAll(() => {
  // Giả lập màn hình desktop (>= 768px) để ResponsiveModal dùng Dialog thay vì Drawer vaul trong jsdom
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

  // cmdk sử dụng ResizeObserver và scrollIntoView khi lọc danh sách ngân hàng
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
  Element.prototype.scrollIntoView = vi.fn()
})

beforeEach(() => {
  mockUseFriends.mockReturnValue({ status: 'ok', friends: [] })
  mockSaveFriend.mockResolvedValue('friend-new')
  mockDeleteFriend.mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

/**
 * Render `AdminFriends` bên trong `MemoryRouter` để hỗ trợ các liên kết quay lại trang quản trị.
 */
function renderAdminFriends() {
  return render(
    <MemoryRouter>
      <AdminFriends />
    </MemoryRouter>,
  )
}

describe('AdminFriends', () => {
  it('chuẩn hóa tên chủ tài khoản không dấu viết hoa và gọi saveFriend với thông tin ngân hàng đã chọn', async () => {
    const user = userEvent.setup()
    renderAdminFriends()

    await user.click(screen.getByRole('button', { name: 'Thêm bạn' }))

    await user.type(screen.getByLabelText(/^Tên \*/), 'Sang')

    // Mở BankPicker và chọn Vietcombank (BIN 970436)
    await user.click(screen.getByRole('combobox', { name: /ngân hàng/i }))
    await user.type(screen.getByPlaceholderText(/tìm ngân hàng/i), 'Vietcombank')
    await user.click(screen.getByText(/Vietcombank \(VCB\)/i))

    await user.type(screen.getByLabelText(/số tài khoản/i), '0123456789')
    await user.type(screen.getByLabelText(/tên chủ tài khoản/i), 'Nguyễn Ngọc Sang')

    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(mockSaveFriend).toHaveBeenCalledTimes(1)
    expect(mockSaveFriend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        name: 'Sang',
        bankBin: '970436',
        bankShortName: 'Vietcombank',
        accountNo: '0123456789',
        accountName: 'NGUYEN NGOC SANG',
      }),
    )
  })

  it('vô hiệu hóa nút Lưu khi tên bạn bè bị bỏ trống hoặc chỉ chứa khoảng trắng', async () => {
    const user = userEvent.setup()
    renderAdminFriends()

    await user.click(screen.getByRole('button', { name: 'Thêm bạn' }))

    const saveButton = screen.getByRole('button', { name: 'Lưu' })
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText(/^Tên \*/), '   ')
    expect(saveButton).toBeDisabled()
  })

  it('báo lỗi và không gọi saveFriend khi số tài khoản chứa ký tự ngoài chữ và số', async () => {
    const user = userEvent.setup()
    renderAdminFriends()

    await user.click(screen.getByRole('button', { name: 'Thêm bạn' }))
    await user.type(screen.getByLabelText(/^Tên \*/), 'Sang')
    await user.type(screen.getByLabelText(/số tài khoản/i), '0123-456 789')

    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(screen.getByRole('alert')).toHaveTextContent(
      /số tài khoản chỉ được chứa chữ cái không dấu và chữ số/i,
    )
    expect(mockSaveFriend).not.toHaveBeenCalled()
  })

  it('nạp sẵn thông tin khi sửa bạn bè và gọi saveFriend kèm id', async () => {
    const user = userEvent.setup()
    mockUseFriends.mockReturnValue({ status: 'ok', friends: [sampleFriend] })
    renderAdminFriends()

    await user.click(screen.getByRole('button', { name: 'Sửa Sang' }))

    const nameInput = screen.getByLabelText(/^Tên \*/) as HTMLInputElement
    expect(nameInput.value).toBe('Sang')

    await user.clear(nameInput)
    await user.type(nameInput, 'Sang Nguyễn')
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(mockSaveFriend).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        id: 'f1',
        name: 'Sang Nguyễn',
        bankBin: '970436',
        bankShortName: 'Vietcombank',
      }),
    )
  })

  it('mở hộp thoại xác nhận và gọi deleteFriend khi người dùng đồng ý xóa', async () => {
    const user = userEvent.setup()
    mockUseFriends.mockReturnValue({ status: 'ok', friends: [sampleFriend] })
    renderAdminFriends()

    await user.click(screen.getByRole('button', { name: 'Xóa Sang' }))
    await user.click(screen.getByRole('button', { name: 'Xóa' }))

    expect(mockDeleteFriend).toHaveBeenCalledTimes(1)
    expect(mockDeleteFriend).toHaveBeenCalledWith(expect.anything(), 'f1')
  })
})
