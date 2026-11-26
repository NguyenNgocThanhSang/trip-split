// @vitest-environment jsdom
/**
 * Kiểm thử trang chuyến đi (`TripPage`) cho cơ chế deep-link `?pay=` (Review Focus #5):
 * bỏ qua link `?pay=` cũ không còn trong kế hoạch thanh toán, và mở đúng `QrSheet` khi còn tồn tại.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdmin } from '@/data/auth'
import { useExpenses } from '@/data/expenses'
import { usePayments } from '@/data/payments'
import { useTrip } from '@/data/trips'
import type { Expense, Trip } from '@/data/types'
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
})
