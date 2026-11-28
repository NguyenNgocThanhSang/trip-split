// @vitest-environment jsdom
/**
 * Kiểm thử trang chuyến đi (`TripPage`) cho cơ chế deep-link `?pay=` (Review Focus #5):
 * bỏ qua link `?pay=` cũ không còn trong kế hoạch thanh toán, và mở đúng `QrSheet` khi còn tồn tại.
 */
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdmin } from '@/data/auth'
import { useExpenses } from '@/data/expenses'
import { addPayment, usePayments } from '@/data/payments'
import { useTrip } from '@/data/trips'
import type { Expense, Payment, Trip } from '@/data/types'
import { TripPage } from './TripPage'

vi.mock('@/data/firebase', () => ({
  db: {},
}))

vi.mock('@/data/auth', () => ({
  useAdmin: vi.fn(),
}))

vi.mock('@/data/trips', () => ({
  useTrip: vi.fn(),
  updateTrip: vi.fn(),
}))

vi.mock('@/data/expenses', () => ({
  useExpenses: vi.fn(),
  addExpense: vi.fn(),
  updateExpense: vi.fn(),
  deleteExpense: vi.fn(),
}))

vi.mock('@/data/payments', () => ({
  usePayments: vi.fn(),
  addPayment: vi.fn(),
  deletePayment: vi.fn(),
  hasPendingWrites: vi.fn(() => false),
}))

vi.mock('@/data/memberQrs', () => ({
  getMemberQr: vi.fn().mockResolvedValue(null),
}))

const mockUseAdmin = vi.mocked(useAdmin)
const mockUseTrip = vi.mocked(useTrip)
const mockUseExpenses = vi.mocked(useExpenses)
const mockUsePayments = vi.mocked(usePayments)
const mockAddPayment = vi.mocked(addPayment)

const ts = {} as Trip['createdAt']

const sampleTrip: Trip = {
  id: 'trip123456',
  name: 'Đà Lạt 2026',
  members: [
    {
      id: 'sang',
      name: 'Sang',
      bankBin: '970436',
      bankShortName: 'Vietcombank',
      accountNo: '0123456789',
      accountName: 'NGUYEN NGOC SANG',
      hasStaticQr: false,
    },
    {
      id: 'chung',
      name: 'Chung',
      hasStaticQr: false,
    },
  ],
  memberIds: ['sang', 'chung'],
  allowGuestExpenses: false,
  locked: false,
  createdAt: ts,
  updatedAt: ts,
}

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

beforeEach(() => {
  window.localStorage.clear()
  mockUseAdmin.mockReturnValue({ status: 'signed-out' })
  mockUseTrip.mockReturnValue({ status: 'ok', trip: sampleTrip })
  mockUseExpenses.mockReturnValue({ status: 'ok', expenses: [] })
  mockUsePayments.mockReturnValue({ status: 'ok', payments: [] })
})

afterEach(() => {
  Object.defineProperty(navigator, 'onLine', {
    configurable: true,
    value: true,
  })
  cleanup()
  vi.clearAllMocks()
})

describe('TripPage deep-link ?pay=', () => {
  it('ignores stale pay link: không mở hộp thoại nào khi ?pay=chung.sang nhưng kế hoạch thanh toán rỗng', () => {
    render(
      <MemoryRouter initialEntries={['/t/trip123456?pay=chung.sang']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('heading', { name: 'Đà Lạt 2026' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('tự mở QrSheet đúng cặp chuyển khoản khi ?pay=chung.sang còn nằm trong kế hoạch thanh toán', () => {
    const sharedExpense: Expense = {
      id: 'e1',
      name: 'Tiền phòng',
      amount: 200000,
      payerId: 'sang',
      participantIds: ['sang', 'chung'],
      fixedAmounts: {},
      note: '',
      date: '2026-12-20',
      createdBy: 'admin',
      createdAt: ts,
      updatedAt: ts,
    }
    mockUseExpenses.mockReturnValue({ status: 'ok', expenses: [sharedExpense] })

    render(
      <MemoryRouter initialEntries={['/t/trip123456?pay=chung.sang']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Chung → Sang (100.000đ)')
    expect(screen.getByRole('img', { name: /mã vietqr chuyển cho sang/i })).toBeInTheDocument()
  })

  it('đóng MarkPaidSheet và xếp hàng ghi thanh toán ngay khi đang ngoại tuyến (offline)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    // Firestore khi mất mạng giữ Promise pending tới khi đồng bộ xong với máy chủ
    mockAddPayment.mockImplementation(() => new Promise<void>(() => {}))

    const sharedExpense: Expense = {
      id: 'e1',
      name: 'Tiền phòng',
      amount: 200000,
      payerId: 'sang',
      participantIds: ['sang', 'chung'],
      fixedAmounts: {},
      note: '',
      date: '2026-12-20',
      createdBy: 'admin',
      createdAt: ts,
      updatedAt: ts,
    }
    mockUseExpenses.mockReturnValue({ status: 'ok', expenses: [sharedExpense] })

    render(
      <MemoryRouter initialEntries={['/t/trip123456']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Đã chuyển' }))
    await user.click(screen.getByRole('button', { name: 'Xác nhận đã chuyển' }))

    expect(mockAddPayment).toHaveBeenCalledWith(
      expect.anything(),
      'trip123456',
      {
        fromId: 'chung',
        toId: 'sang',
        amount: 100000,
        note: '',
      },
      'guest',
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('ẩn toàn bộ nút ghi đối với khách khi chuyến đã khóa sổ (locked = true)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    mockUseTrip.mockReturnValue({
      status: 'ok',
      trip: { ...sampleTrip, allowGuestExpenses: true, locked: true },
    })
    const guestExpense: Expense = {
      id: 'e1',
      name: 'Ăn tối',
      amount: 200000,
      payerId: 'sang',
      participantIds: ['sang', 'chung'],
      fixedAmounts: {},
      note: '',
      date: '2026-12-20',
      createdBy: 'guest',
      createdAt: ts,
      updatedAt: ts,
    }
    const guestPayment: Payment = {
      id: 'p1',
      fromId: 'chung',
      toId: 'sang',
      amount: 50000,
      note: '',
      markedBy: 'guest',
      paidAt: ts,
    }
    mockUseExpenses.mockReturnValue({ status: 'ok', expenses: [guestExpense] })
    mockUsePayments.mockReturnValue({ status: 'ok', payments: [guestPayment] })

    render(
      <MemoryRouter initialEntries={['/t/trip123456']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.queryByRole('button', { name: 'Thêm khoản chi' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Đã chuyển' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Hoàn tác' })).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /quét qr/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Tôi đã chuyển' })).not.toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('tab', { name: /chi tiêu/i }))
    await user.click(screen.getByText('Ăn tối'))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Sửa' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xóa' })).not.toBeInTheDocument()
  })

  it('tự chuyển QrSheet sang khối copy dạng chữ khi thiết bị đang ngoại tuyến (chế độ máy bay)', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    const sharedExpense: Expense = {
      id: 'e1',
      name: 'Tiền phòng',
      amount: 200000,
      payerId: 'sang',
      participantIds: ['sang', 'chung'],
      fixedAmounts: {},
      note: '',
      date: '2026-12-20',
      createdBy: 'admin',
      createdAt: ts,
      updatedAt: ts,
    }
    mockUseExpenses.mockReturnValue({ status: 'ok', expenses: [sharedExpense] })

    render(
      <MemoryRouter initialEntries={['/t/trip123456']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByRole('status')).toHaveTextContent(/đang ngoại tuyến/i)

    await user.click(screen.getByRole('button', { name: /quét qr/i }))
    expect(screen.queryByRole('img', { name: /mã vietqr/i })).not.toBeInTheDocument()
    expect(screen.getByText('Vietcombank')).toBeInTheDocument()
    expect(screen.getByText('0123456789')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Copy STK' })).toBeInTheDocument()
  })
})
