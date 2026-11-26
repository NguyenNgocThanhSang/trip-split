/**
 * Bộ kiểm thử đơn vị cho module tạo URL VietQR động (`vietqr.ts`) và danh sách ngân hàng tĩnh (`banks.ts`).
 * Kiểm tra chuẩn hóa ASCII tiếng Việt, độ dài nội dung chuyển khoản, tham số URL và tra cứu BIN ngân hàng.
 */
import { describe, expect, it } from 'vitest'
import { BANKS, findBank } from './banks'
import { buildVietQrUrl, defaultTransferNote, toAscii } from './vietqr'

describe('toAscii', () => {
  it('bỏ dấu tiếng Việt, chuyển đ/Đ và loại bỏ ký tự đặc biệt', () => {
    expect(toAscii('Chung trả tiền Đà Lạt (đợt 1)!')).toBe('Chung tra tien Da Lat dot 1')
    expect(toAscii('  Phụng   Mơ ')).toBe('Phung Mo')
    // Khoảng trắng NBSP dán từ iOS không được làm dính chữ
    expect(toAscii('Phụng\u00A0Mơ')).toBe('Phung Mo')
  })
})

describe('defaultTransferNote', () => {
  it('tạo nội dung chuyển khoản không dấu và cắt tối đa 50 ký tự', () => {
    expect(defaultTransferNote('Chung', 'Đà Lạt 2026')).toBe('Chung tra tien Da Lat 2026')
    const longNote = defaultTransferNote(
      'Nguyễn Văn Chung',
      'Chuyến đi Phú Quốc cùng cả lớp năm 2026 vui vẻ',
    )
    expect(longNote.length).toBeLessThanOrEqual(50)
    expect(longNote).toMatch(/^[A-Za-z0-9 ]+$/)
    expect(longNote).toBe(longNote.trim())
  })
})

describe('buildVietQrUrl', () => {
  it('tạo URL VietQR compact2 đúng chuẩn kèm amount, addInfo và accountName viết hoa không dấu', () => {
    const url = new URL(
      buildVietQrUrl(
        { bankBin: '970436', accountNo: ' 0123456789 ', accountName: 'Nguyễn Ngọc Sang' },
        273750,
        'Chung trả tiền Đà Lạt',
      ),
    )
    expect(url.origin + url.pathname).toBe(
      'https://img.vietqr.io/image/970436-0123456789-compact2.png',
    )
    expect(url.searchParams.get('amount')).toBe('273750')
    expect(url.searchParams.get('addInfo')).toBe('Chung tra tien Da Lat')
    expect(url.searchParams.get('accountName')).toBe('NGUYEN NGOC SANG')
  })

  it('bỏ qua accountName khi không truyền hoặc rỗng sau chuẩn hóa', () => {
    expect(
      new URL(buildVietQrUrl({ bankBin: '970436', accountNo: '1' }, 1000, 'x')).searchParams.has(
        'accountName',
      ),
    ).toBe(false)
    expect(
      new URL(
        buildVietQrUrl({ bankBin: '970436', accountNo: '1', accountName: '   !!!   ' }, 1000, 'x'),
      ).searchParams.has('accountName'),
    ).toBe(false)
  })

  it('cắt addInfo truyền trực tiếp tối đa 50 ký tự và bỏ qua nếu rỗng sau chuẩn hóa', () => {
    const longUrl = new URL(
      buildVietQrUrl(
        { bankBin: '970436', accountNo: '1' },
        50000,
        'Chuyển tiền ăn uống du lịch Đà Lạt cùng nhóm bạn thân năm 2026',
      ),
    )
    const addInfo = longUrl.searchParams.get('addInfo') ?? ''
    expect(addInfo.length).toBeGreaterThan(0)
    expect(addInfo.length).toBeLessThanOrEqual(50)

    const emptyMemoUrl = new URL(
      buildVietQrUrl({ bankBin: '970436', accountNo: '1' }, 50000, '---'),
    )
    expect(emptyMemoUrl.searchParams.has('addInfo')).toBe(false)
  })
})

describe('BANKS & findBank', () => {
  it('chứa danh sách ngân hàng tĩnh đầy đủ và tra cứu được Vietcombank theo mã BIN', () => {
    expect(BANKS.length).toBeGreaterThanOrEqual(40)
    expect(findBank('970436')?.shortName).toBe('Vietcombank')
    expect(findBank('000000')).toBeUndefined()
    // Đảm bảo tra cứu bằng Map không trả về thuộc tính của Object.prototype
    expect(findBank('constructor')).toBeUndefined()
  })
})
