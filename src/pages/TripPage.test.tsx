// @vitest-environment jsdom
/**
 * Kiểm thử trang chuyến đi (`TripPage`) cho deep-link `?pay=`, tách góc nhìn (`useMe`) khỏi danh tính ghi (`useMemberBinding`),
 * các cổng phân quyền qua `WriteAccessNoticeSheet`, `WhoAmI` clear, nhắc nợ `?k=` và minh bạch người ghi/nhập.
 */
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { toast } from 'sonner'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { useAdmin } from '@/data/auth'
import { useExpenses } from '@/data/expenses'
import {
  generateMissingSecrets,
  rotateMemberSecret,
  useMemberBinding,
  useMemberSecrets,
} from '@/data/memberAccess'
import { addPayment, usePayments } from '@/data/payments'
import { useTrip } from '@/data/trips'
import type { Expense, MemberSecret, Payment, Trip } from '@/data/types'
import { TripPage } from './TripPage'

vi.mock('@/data/firebase', () => ({
  db: {},
}))

vi.mock('@/data/auth', () => ({
  useAdmin: vi.fn(),
}))

vi.mock('@/data/memberAccess', () => ({
  useMemberBinding: vi.fn(),
  useMemberSecrets: vi.fn(),
  generateMissingSecrets: vi.fn(),
  rotateMemberSecret: vi.fn(),
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
const mockUseMemberBinding = vi.mocked(useMemberBinding)
const mockUseMemberSecrets = vi.mocked(useMemberSecrets)
const mockGenerateMissingSecrets = vi.mocked(generateMissingSecrets)
const mockRotateMemberSecret = vi.mocked(rotateMemberSecret)
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
    {
      id: 'mo',
      name: 'Mơ',
      hasStaticQr: false,
    },
  ],
  memberIds: ['sang', 'chung', 'mo'],
  allowGuestExpenses: false,
  locked: false,
  createdAt: ts,
  updatedAt: ts,
}

const twoMemberTrip: Trip = {
  ...sampleTrip,
  members: sampleTrip.members.slice(0, 2),
  memberIds: ['sang', 'chung'],
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
  mockUseMemberBinding.mockReturnValue({
    status: 'unbound',
    boundMemberId: null,
    uid: null,
    bindWithKey: vi.fn().mockResolvedValue('bound'),
    markInvalidLink: vi.fn(),
  })
  mockUseMemberSecrets.mockReturnValue({ status: 'idle', secrets: {} })
  mockGenerateMissingSecrets.mockResolvedValue(0)
  mockRotateMemberSecret.mockResolvedValue('newcode123456')
  mockUseTrip.mockReturnValue({ status: 'ok', trip: twoMemberTrip })
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

describe('TripPage', () => {
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

  it('đóng MarkPaidSheet và xếp hàng ghi thanh toán ngay khi đang ngoại tuyến (offline) với khách đã bind', async () => {
    const user = userEvent.setup()
    Object.defineProperty(navigator, 'onLine', {
      configurable: true,
      value: false,
    })
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    mockUseMemberBinding.mockReturnValue({
      status: 'bound',
      boundMemberId: 'chung',
      uid: 'anon-chung',
      bindWithKey: vi.fn().mockResolvedValue('bound'),
      markInvalidLink: vi.fn(),
    })
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
      { uid: 'anon-chung', memberId: 'chung' },
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('mở sheet giải thích và không gọi addPayment khi góc nhìn khác danh tính ghi hoặc khách chưa bind', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    mockUseTrip.mockReturnValue({ status: 'ok', trip: sampleTrip })
    // Khách đã bind là Mơ nhưng đang chọn góc nhìn của Chung
    mockUseMemberBinding.mockReturnValue({
      status: 'bound',
      boundMemberId: 'mo',
      uid: 'anon-mo',
      bindWithKey: vi.fn().mockResolvedValue('bound'),
      markInvalidLink: vi.fn(),
    })

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

    expect(screen.getByText(/đang xem góc nhìn của/i)).toHaveTextContent(
      'Đang xem góc nhìn của Chung — chỉ xem (bạn đang xác minh là Mơ)',
    )

    await user.click(screen.getByRole('button', { name: 'Đã chuyển' }))
    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveTextContent('Chưa thể xác nhận đã chuyển')
    expect(dialog).toHaveTextContent(
      'Bạn đang xác minh là Mơ. Chỉ Chung, Sang hoặc trưởng nhóm mới được xác nhận giao dịch này.',
    )
    expect(mockAddPayment).not.toHaveBeenCalled()
  })

  it('hiển thị cảnh báo hết hiệu lực khi binding bị thu hồi (revoked) và chặn mở form ghi', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    mockUseTrip.mockReturnValue({
      status: 'ok',
      trip: { ...twoMemberTrip, allowGuestExpenses: true },
    })
    mockUseMemberBinding.mockReturnValue({
      status: 'revoked',
      boundMemberId: null,
      uid: 'anon-chung',
      bindWithKey: vi.fn().mockResolvedValue('bound'),
      markInvalidLink: vi.fn(),
    })

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

    expect(
      screen.getByText('Link cá nhân của bạn đã hết hiệu lực. Liên hệ trưởng nhóm để lấy link mới.'),
    ).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Đã chuyển' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Link cá nhân của bạn đã hết hiệu lực')
    await user.click(screen.getByRole('button', { name: 'Đã hiểu' }))

    await user.click(screen.getByRole('button', { name: 'Thêm khoản chi' }))
    expect(screen.getByRole('dialog')).toHaveTextContent('Chưa thể thêm khoản chi')
    expect(screen.getByRole('dialog')).toHaveTextContent('Link cá nhân của bạn đã hết hiệu lực')
  })

  it('bấm "Chỉ xem chung (không chọn)" trong WhoAmI gọi clear(), xóa localStorage và ẩn thẻ số dư cá nhân', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    mockUseMemberBinding.mockReturnValue({
      status: 'bound',
      boundMemberId: 'chung',
      uid: 'anon-chung',
      bindWithKey: vi.fn().mockResolvedValue('bound'),
      markInvalidLink: vi.fn(),
    })

    render(
      <MemoryRouter initialEntries={['/t/trip123456']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText('Số dư của bạn (Chung)')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /tôi: chung/i }))
    expect(screen.getByText('✓ đã xác minh')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /chỉ xem chung/i }))
    expect(window.localStorage.getItem('tripsplit:me:trip123456')).toBeNull()
    expect(screen.queryByText('Số dư của bạn (Chung)')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Chọn tên' })).toBeInTheDocument()
  })

  it('tin nhắc nhóm không bao giờ chứa ?k=; khách copy nhắc riêng không chứa ?k=, còn Admin copy có ?k= của người nợ', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
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

    // 1. Vai trò khách: nhắc nhóm & nhắc riêng đều KHÔNG có ?k=
    const { unmount } = render(
      <MemoryRouter initialEntries={['/t/trip123456']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Nhắc nợ' }))
    const groupPre = screen.getByRole('dialog').querySelector('pre')!
    expect(groupPre).toHaveTextContent(`${window.location.origin}/t/trip123456`)
    expect(groupPre.textContent).not.toContain('?k=')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: /copy nhắc nợ chung trả sang/i }))
    expect(writeText).toHaveBeenLastCalledWith(
      expect.stringContaining(`${window.location.origin}/t/trip123456?pay=chung.sang`),
    )
    expect(writeText.mock.calls.at(-1)?.[0]).not.toContain('?k=')
    unmount()

    // 2. Vai trò Admin: nhắc riêng có ?k= của người nợ, nhắc nhóm vẫn không có ?k=
    const secrets: Record<string, MemberSecret> = {
      chung: { id: 'chung', code: 'chungsecret12', updatedAt: ts },
    }
    mockUseAdmin.mockReturnValue({ status: 'admin', uid: 'admin-uid' })
    mockUseMemberSecrets.mockReturnValue({ status: 'ok', secrets })

    render(
      <MemoryRouter initialEntries={['/t/trip123456']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    await user.click(screen.getByRole('button', { name: 'Nhắc nợ' }))
    expect(screen.getByRole('dialog').querySelector('pre')?.textContent).not.toContain('?k=')
    await user.keyboard('{Escape}')

    await user.click(screen.getByRole('button', { name: /copy nhắc nợ chung trả sang/i }))
    expect(writeText).toHaveBeenLastCalledWith(
      expect.stringContaining(
        `${window.location.origin}/t/trip123456?k=chung.chungsecret12&pay=chung.sang`,
      ),
    )
  })

  it('hiển thị rõ người ghi trên PaymentsHistory (kể cả tự ghi) và người nhập trên từng dòng ExpenseList', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    const expenses: Expense[] = [
      {
        id: 'e1',
        name: 'Ăn sáng',
        amount: 200000,
        payerId: 'sang',
        participantIds: ['sang', 'chung'],
        fixedAmounts: {},
        note: '',
        date: '2026-12-20',
        createdBy: 'guest',
        createdByUid: 'u1',
        createdByMemberId: 'chung',
        createdAt: ts,
        updatedAt: ts,
      },
      {
        id: 'e2',
        name: 'Nhà nghỉ',
        amount: 400000,
        payerId: 'sang',
        participantIds: ['sang', 'chung'],
        fixedAmounts: {},
        note: '',
        date: '2026-12-20',
        createdBy: 'admin',
        createdAt: ts,
        updatedAt: ts,
      },
    ]
    const payments: Payment[] = [
      {
        id: 'p1',
        fromId: 'chung',
        toId: 'sang',
        amount: 50000,
        note: '',
        markedBy: 'guest',
        createdByUid: 'u1',
        createdByMemberId: 'chung',
        paidAt: ts,
      },
      {
        id: 'p2',
        fromId: 'chung',
        toId: 'sang',
        amount: 30000,
        note: '',
        markedBy: 'guest',
        createdByUid: 'u2',
        createdByMemberId: 'sang',
        paidAt: ts,
      },
      {
        id: 'p3',
        fromId: 'chung',
        toId: 'sang',
        amount: 20000,
        note: '',
        markedBy: 'admin',
        paidAt: ts,
      },
    ]
    mockUseExpenses.mockReturnValue({ status: 'ok', expenses })
    mockUsePayments.mockReturnValue({ status: 'ok', payments })

    render(
      <MemoryRouter initialEntries={['/t/trip123456']}>
        <Routes>
          <Route path="/t/:tripId" element={<TripPage />} />
        </Routes>
      </MemoryRouter>,
    )

    expect(screen.getByText(/Chung tự ghi/)).toBeInTheDocument()
    expect(screen.getByText(/Sang ghi/)).toBeInTheDocument()
    expect(screen.getByText(/Trưởng nhóm ghi/)).toBeInTheDocument()

    await user.click(screen.getByRole('tab', { name: /chi tiêu/i }))
    const expenseTab = screen.getByRole('tabpanel')
    expect(within(expenseTab).getByText(/Chung nhập/)).toBeInTheDocument()
    expect(within(expenseTab).getByText(/Trưởng nhóm nhập/)).toBeInTheDocument()
  })

  it('ẩn toàn bộ nút ghi đối với khách khi chuyến đã khóa sổ (locked = true)', async () => {
    const user = userEvent.setup()
    window.localStorage.setItem('tripsplit:me:trip123456', 'chung')
    mockUseTrip.mockReturnValue({
      status: 'ok',
      trip: { ...twoMemberTrip, allowGuestExpenses: true, locked: true },
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
      createdByUid: 'u1',
      createdByMemberId: 'chung',
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
      createdByUid: 'u1',
      createdByMemberId: 'chung',
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

  it('xử lý xong ?k= (xóa ?k khỏi URL, setMe và toast) ngay cả khi component re-render và nhận object binding mới trong lúc bindWithKey đang chờ', async () => {
    const user = userEvent.setup()
    const toastSuccessSpy = vi.spyOn(toast, 'success')
    let resolveBind!: (val: 'bound' | 'invalid' | 'error') => void
    const stableBindWithKey = vi.fn(
      () =>
        new Promise<'bound' | 'invalid' | 'error'>((resolve) => {
          resolveBind = resolve
        }),
    )
    const stableMarkInvalidLink = vi.fn()

    // Giả lập useMemberBinding trả về một object mới mỗi lần render (hành vi thật của hook)
    mockUseMemberBinding.mockImplementation(() => ({
      status: 'unbound',
      boundMemberId: null,
      uid: null,
      bindWithKey: stableBindWithKey,
      markInvalidLink: stableMarkInvalidLink,
    }))

    function LocationSearchMarker() {
      const location = useLocation()
      return <div data-testid="location-search">{location.search}</div>
    }

    render(
      <MemoryRouter initialEntries={['/t/trip123456?k=chung.chungcode1234']}>
        <Routes>
          <Route
            path="/t/:tripId"
            element={
              <>
                <TripPage />
                <LocationSearchMarker />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
    )

    expect(stableBindWithKey).toHaveBeenCalledTimes(1)
    expect(stableBindWithKey).toHaveBeenCalledWith('chung', 'chungcode1234')

    // Kích hoạt re-render trong lúc bindWithKey còn đang pending
    await user.click(screen.getByRole('tab', { name: /chi tiêu/i }))
    expect(screen.getByTestId('location-search')).toHaveTextContent('?k=chung.chungcode1234')

    // Hoàn tất bindWithKey -> phải xóa ?k=, lưu localStorage và hiện toast thành công
    resolveBind('bound')
    await waitFor(() => {
      expect(screen.getByTestId('location-search').textContent).toBe('')
    })
    expect(window.localStorage.getItem('tripsplit:me:trip123456')).toBe('chung')
    expect(toastSuccessSpy).toHaveBeenCalledWith('Đã xác minh là Chung')
  })
})
