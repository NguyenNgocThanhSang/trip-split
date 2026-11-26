// @vitest-environment jsdom
/**
 * Kiểm thử hộp thoại mã QR chuyển khoản (`QrSheet`) trên jsdom.
 * Kiểm tra ảnh VietQR kèm `referrerPolicy="no-referrer"`, fallback dạng chữ + Copy khi lỗi ảnh,
 * thông báo khi thiếu STK và tải lười QR MoMo tĩnh chỉ khi chuyển sang tab "QR MoMo".
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { getMemberQr } from '@/data/memberQrs'
import type { Member } from '@/data/types'
import { buildVietQrUrl } from '@/lib/vietqr'
import { QrSheet } from './QrSheet'

vi.mock('@/data/firebase', () => ({
  db: {},
}))

vi.mock('@/data/memberQrs', () => ({
  getMemberQr: vi.fn(),
}))

const mockGetMemberQr = vi.mocked(getMemberQr)

const fromChung: Member = {
  id: 'chung',
  name: 'Chung',
  hasStaticQr: false,
}

const toSangWithBank: Member = {
  id: 'sang',
  name: 'Sang',
  bankBin: '970436',
  bankShortName: 'Vietcombank',
  accountNo: '0123456789',
  accountName: 'NGUYEN NGOC SANG',
  hasStaticQr: false,
}

const toSangNoBank: Member = {
  id: 'sang',
  name: 'Sang',
  hasStaticQr: false,
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
  mockGetMemberQr.mockResolvedValue(null)
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('QrSheet', () => {
  it('hiển thị ảnh VietQR với URL chuẩn và thuộc tính referrerpolicy="no-referrer"', () => {
    render(
      <QrSheet
        open
        onOpenChange={vi.fn()}
        transfer={{ fromId: 'chung', toId: 'sang', amount: 273750 }}
        from={fromChung}
        to={toSangWithBank}
        tripName="Đà Lạt 2026"
        tripId="trip123456"
        onPaid={vi.fn()}
      />,
    )

    const expectedSrc = buildVietQrUrl(
      {
        bankBin: '970436',
        accountNo: '0123456789',
        accountName: 'NGUYEN NGOC SANG',
      },
      273750,
      'Chung tra tien Da Lat 2026',
    )

    const img = screen.getByRole('img', { name: /mã vietqr/i })
    expect(img).toHaveAttribute('src', expectedSrc)
    expect(img).toHaveAttribute('referrerpolicy', 'no-referrer')
  })

  it('chuyển sang khối chữ kèm các nút Copy khi ảnh VietQR lỗi và Copy STK đúng giá trị', async () => {
    const user = userEvent.setup()
    // Spy clipboard sau userEvent.setup() vì userEvent thay navigator.clipboard bằng stub riêng
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)

    render(
      <QrSheet
        open
        onOpenChange={vi.fn()}
        transfer={{ fromId: 'chung', toId: 'sang', amount: 273750 }}
        from={fromChung}
        to={toSangWithBank}
        tripName="Đà Lạt 2026"
        tripId="trip123456"
        onPaid={vi.fn()}
      />,
    )

    const img = screen.getByRole('img', { name: /mã vietqr/i })
    fireEvent.error(img)

    expect(screen.queryByRole('img', { name: /mã vietqr/i })).not.toBeInTheDocument()
    expect(screen.getByText('Vietcombank')).toBeInTheDocument()
    expect(screen.getByText('0123456789')).toBeInTheDocument()
    expect(screen.getByText('NGUYEN NGOC SANG')).toBeInTheDocument()
    expect(screen.getByText('273.750đ')).toBeInTheDocument()
    expect(screen.getByText('Chung tra tien Da Lat 2026')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Copy STK' }))
    expect(writeText).toHaveBeenCalledWith('0123456789')
  })

  it('thông báo rõ khi người nhận chưa có thông tin ngân hàng', () => {
    render(
      <QrSheet
        open
        onOpenChange={vi.fn()}
        transfer={{ fromId: 'chung', toId: 'sang', amount: 273750 }}
        from={fromChung}
        to={toSangNoBank}
        tripName="Đà Lạt 2026"
        tripId="trip123456"
        onPaid={vi.fn()}
      />,
    )

    expect(screen.getByText(/người nhận chưa có thông tin ngân hàng/i)).toBeInTheDocument()
  })

  it('chỉ gọi getMemberQr khi người dùng bấm sang tab "QR MoMo"', async () => {
    const user = userEvent.setup()
    mockGetMemberQr.mockResolvedValue('data:image/webp;base64,MOMOQR')

    render(
      <QrSheet
        open
        onOpenChange={vi.fn()}
        transfer={{ fromId: 'chung', toId: 'sang', amount: 273750 }}
        from={fromChung}
        to={{ ...toSangWithBank, hasStaticQr: true }}
        tripName="Đà Lạt 2026"
        tripId="trip123456"
        onPaid={vi.fn()}
      />,
    )

    expect(mockGetMemberQr).not.toHaveBeenCalled()

    await user.click(screen.getByRole('tab', { name: 'QR MoMo' }))

    expect(mockGetMemberQr).toHaveBeenCalledTimes(1)
    expect(mockGetMemberQr).toHaveBeenCalledWith(expect.anything(), 'trip123456', 'sang')
    const momoImg = await screen.findByRole('img', { name: /qr momo/i })
    expect(momoImg).toHaveAttribute('src', 'data:image/webp;base64,MOMOQR')
  })
})
