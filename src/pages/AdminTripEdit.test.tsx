// @vitest-environment jsdom
/**
 * Kiểm thử màn hình tạo và chỉnh sửa chuyến đi (`AdminTripEdit`) trên jsdom.
 * Mock các hook và thao tác Firestore để kiểm tra thứ tự thành viên, lọc `memberQrs`, khóa thành viên đang dùng và xóa dây chuyền.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExpenses } from '@/data/expenses'
import { useFriends } from '@/data/friends'
import { usePayments } from '@/data/payments'
import { createTrip, deleteTripCascade, updateTrip, useTrip } from '@/data/trips'
import type { Expense, Friend, Payment, Trip } from '@/data/types'
import { AdminTripEdit } from './AdminTripEdit'

vi.mock('@/data/firebase', () => ({
  db: {},
}))

vi.mock('@/data/friends', () => ({
  useFriends: vi.fn(),
}))

vi.mock('@/data/expenses', () => ({
  useExpenses: vi.fn(),
}))

vi.mock('@/data/payments', () => ({
  usePayments: vi.fn(),
}))

vi.mock('@/data/trips', async () => {
  const actual = await vi.importActual<typeof import('@/data/trips')>('@/data/trips')
  return {
    ...actual,
    useTrip: vi.fn(),
    createTrip: vi.fn(),
    updateTrip: vi.fn(),
    deleteTripCascade: vi.fn(),
  }
})

const mockUseFriends = vi.mocked(useFriends)
const mockUseExpenses = vi.mocked(useExpenses)
const mockUsePayments = vi.mocked(usePayments)
const mockUseTrip = vi.mocked(useTrip)
const mockCreateTrip = vi.mocked(createTrip)
const mockUpdateTrip = vi.mocked(updateTrip)
const mockDeleteTripCascade = vi.mocked(deleteTripCascade)

const ts = {} as Friend['createdAt']

const friendMo: Friend = {
  id: 'mo',
  name: 'Mơ',
  bankBin: '970422',
  bankShortName: 'MB',
  accountNo: '222222',
  accountName: 'TRAN THI MO',
  createdAt: ts,
  updatedAt: ts,
}

const friendSang: Friend = {
  id: 'sang',
  name: 'Sang',
  bankBin: '970436',
  bankShortName: 'Vietcombank',
  accountNo: '0123456789',
  accountName: 'NGUYEN NGOC SANG',
  momoQrDataUrl: 'data:image/webp;base64,SANGQR',
  createdAt: ts,
  updatedAt: ts,
}

const friendChung: Friend = {
  id: 'chung',
  name: 'Chung',
  bankBin: '970407',
  bankShortName: 'Techcombank',
  accountNo: '19001122',
  accountName: 'LE VAN CHUNG',
  momoQrDataUrl: 'data:image/jpeg;base64,CHUNGQR',
  createdAt: ts,
  updatedAt: ts,
}

const existingTrip: Trip = {
  id: 'trip123456',
  name: 'Đà Lạt 2026',
  startDate: '2026-12-20',
  endDate: '2026-12-22',
  members: [
    {
      id: 'sang',
      name: 'Sang',
      bankBin: '970436',
      bankShortName: 'Vietcombank',
      accountNo: '0000000000',
      accountName: 'NGUYEN NGOC SANG',
      hasStaticQr: false,
    },
    {
      id: 'mo',
      name: 'Mơ',
      bankBin: '970422',
      bankShortName: 'MB',
      accountNo: '222222',
      accountName: 'TRAN THI MO',
      hasStaticQr: false,
    },
    {
      id: 'chung',
      name: 'Chung',
      hasStaticQr: false,
    },
  ],
  memberIds: ['sang', 'mo', 'chung'],
  allowGuestExpenses: false,
  locked: false,
  createdAt: ts,
  updatedAt: ts,
}

/** Hiển thị mã chuyến đích sau khi tạo mới thành công để test kiểm tra điều hướng. */
function EditDestinationMarker() {
  const { tripId } = useParams()
  return <div data-testid="created-trip-route">Chuyến {tripId}</div>
}

beforeAll(() => {
  // Radix Switch dùng @radix-ui/react-use-size nên cần ResizeObserver trong jsdom
  class MockResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  globalThis.ResizeObserver = MockResizeObserver as unknown as typeof ResizeObserver
})

beforeEach(() => {
  mockUseFriends.mockReturnValue({
    status: 'ok',
    friends: [friendMo, friendSang, friendChung],
  })
  mockUseExpenses.mockReturnValue({ status: 'ok', expenses: [] })
  mockUsePayments.mockReturnValue({ status: 'ok', payments: [] })
  mockUseTrip.mockReturnValue({ status: 'not-found' })
  mockCreateTrip.mockResolvedValue('newtrip999')
  mockUpdateTrip.mockResolvedValue()
  mockDeleteTripCascade.mockResolvedValue()
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('AdminTripEdit', () => {
  it('vô hiệu hóa nút Lưu và báo "Cần ít nhất 2 thành viên" khi chọn dưới 2 bạn', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin/trips/new']}>
        <Routes>
          <Route path="/admin/trips/new" element={<AdminTripEdit />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/tên chuyến đi/i), 'Đà Lạt 2026')
    expect(screen.getByText(/cần ít nhất 2 thành viên/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()

    await user.click(screen.getByRole('checkbox', { name: 'Sang' }))
    expect(screen.getByText(/cần ít nhất 2 thành viên/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Lưu' })).toBeDisabled()
  })

  it('khóa checkbox kèm thông báo "Đã có trong khoản chi/thanh toán" cho thành viên đang có dữ liệu', () => {
    const expenseBySang: Expense = {
      id: 'e1',
      name: 'Ăn sáng',
      amount: 100000,
      payerId: 'sang',
      participantIds: ['sang', 'mo'],
      fixedAmounts: {},
      note: '',
      date: '2026-12-20',
      createdBy: 'admin',
      createdAt: ts,
      updatedAt: ts,
    }
    const paymentToChung: Payment = {
      id: 'p1',
      fromId: 'mo',
      toId: 'chung',
      amount: 50000,
      note: '',
      markedBy: 'admin',
      paidAt: ts,
    }

    mockUseTrip.mockReturnValue({ status: 'ok', trip: existingTrip })
    mockUseExpenses.mockReturnValue({ status: 'ok', expenses: [expenseBySang] })
    mockUsePayments.mockReturnValue({ status: 'ok', payments: [paymentToChung] })

    render(
      <MemoryRouter initialEntries={['/admin/trips/trip123456']}>
        <Routes>
          <Route path="/admin/trips/:tripId" element={<AdminTripEdit />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('checkbox', { name: 'Sang' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Mơ' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Chung' })).toBeDisabled()
    expect(screen.getAllByText(/đã có trong khoản chi\/thanh toán/i)).toHaveLength(3)
  })

  it('tạo chuyến mới với danh sách thành viên đúng thứ tự tick và qrs chỉ gồm người có ảnh', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/admin/trips/new']}>
        <Routes>
          <Route path="/admin/trips/new" element={<AdminTripEdit />} />
          <Route path="/admin/trips/:tripId" element={<EditDestinationMarker />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/tên chuyến đi/i), 'Đà Lạt 2026')
    await user.click(screen.getByRole('checkbox', { name: 'Mơ' }))
    await user.click(screen.getByRole('checkbox', { name: 'Sang' }))
    await user.click(screen.getByRole('checkbox', { name: 'Chung' }))

    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(mockCreateTrip).toHaveBeenCalledTimes(1)
    const [, tripInput, qrs] = mockCreateTrip.mock.calls[0]
    expect(tripInput.name).toBe('Đà Lạt 2026')
    expect(tripInput.members.map((m) => m.id)).toEqual(['mo', 'sang', 'chung'])
    expect(tripInput.members.map((m) => m.hasStaticQr)).toEqual([false, true, true])
    expect(qrs).toEqual({
      sang: 'data:image/webp;base64,SANGQR',
      chung: 'data:image/jpeg;base64,CHUNGQR',
    })
    expect(screen.getByTestId('created-trip-route')).toHaveTextContent('Chuyến newtrip999')
  })

  it('cập nhật lại snapshot ngân hàng và ảnh QR từ danh bạ khi bấm "Cập nhật từ danh bạ"', async () => {
    const user = userEvent.setup()
    mockUseTrip.mockReturnValue({ status: 'ok', trip: existingTrip })

    render(
      <MemoryRouter initialEntries={['/admin/trips/trip123456']}>
        <Routes>
          <Route path="/admin/trips/:tripId" element={<AdminTripEdit />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /cập nhật từ danh bạ/i }))
    await user.click(screen.getByRole('button', { name: 'Lưu' }))

    expect(mockUpdateTrip).toHaveBeenCalledTimes(1)
    const [, tripId, tripInput, qrs] = mockUpdateTrip.mock.calls[0]
    expect(tripId).toBe('trip123456')
    const sangMember = tripInput.members.find((m) => m.id === 'sang')
    expect(sangMember).toMatchObject({
      accountNo: '0123456789',
      hasStaticQr: true,
    })
    expect(qrs).toEqual({
      sang: 'data:image/webp;base64,SANGQR',
      mo: null,
      chung: 'data:image/jpeg;base64,CHUNGQR',
    })
  })

  it('xóa dây chuyền chuyến đi sau khi xác nhận AlertDialog và quay về danh sách chuyến', async () => {
    const user = userEvent.setup()
    mockUseTrip.mockReturnValue({ status: 'ok', trip: existingTrip })

    render(
      <MemoryRouter initialEntries={['/admin/trips/trip123456']}>
        <Routes>
          <Route path="/admin/trips/:tripId" element={<AdminTripEdit />} />
          <Route path="/admin/trips" element={<div data-testid="trips-list-route">Danh sách</div>} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: /xóa chuyến đi/i }))
    await user.click(screen.getByRole('button', { name: 'Xóa chuyến' }))

    expect(mockDeleteTripCascade).toHaveBeenCalledWith(expect.anything(), 'trip123456')
    expect(screen.getByTestId('trips-list-route')).toBeInTheDocument()
  })
})
