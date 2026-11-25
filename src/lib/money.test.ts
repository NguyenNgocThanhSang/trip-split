/**
 * Bộ kiểm thử đơn vị cho module xử lý tiền tệ VND (`money.ts`).
 * Bao gồm định dạng hiển thị, định dạng có dấu và phân tích chuỗi nhập viết tắt tiếng Việt.
 */
import { describe, expect, it } from 'vitest'
import { formatSignedVND, formatVND, parseVND } from './money'

describe('formatVND', () => {
  it('định dạng số tiền dương, bằng 0 và âm theo dấu chấm hàng nghìn và hậu tố đ', () => {
    expect(formatVND(190000)).toBe('190.000đ')
    expect(formatVND(0)).toBe('0đ')
    expect(formatVND(-50000)).toBe('-50.000đ')
    // Tổng chi mẫu trong Google Sheet (575k + 260k + 80k + 190k)
    expect(formatVND(1105000)).toBe('1.105.000đ')
  })
})

describe('formatSignedVND', () => {
  it('hiển thị dấu + cho số dương, - cho số âm và không dấu cho 0đ', () => {
    // Số dư mẫu của Sang và Chung trong DESIGN.md §8.1
    expect(formatSignedVND(826250)).toBe('+826.250đ')
    expect(formatSignedVND(-273750)).toBe('-273.750đ')
    expect(formatSignedVND(0)).toBe('0đ')
  })
})

describe('parseVND', () => {
  it.each([
    ['190000', 190000],
    ['190.000', 190000],
    ['190,000', 190000],
    ['190 000', 190000],
    ['190.000đ', 190000],
    ['190000 vnd', 190000],
    ['190k', 190000],
    ['190K', 190000],
    ['45k5', 45500],
    ['45.5k', 45500],
    ['45,5k', 45500],
    ['1tr', 1000000],
    ['1m', 1000000],
    ['1 triệu', 1000000],
    ['1tr2', 1200000],
    ['1.2tr', 1200000],
    ['1,2tr', 1200000],
    ['1m2', 1200000],
    ['1tr25', 1250000],
    ['1tr250', 1250000],
    ['1tr05', 1050000],
    ['1tr050', 1050000],
    ['1tr50k', 1050000],
  ])('phân tích chuỗi hợp lệ %s → %i', (input, out) => {
    expect(parseVND(input)).toBe(out)
  })

  it.each(['0', '', 'abc', '-5k', '12.34.56', '1000000001', '2tr'.repeat(2)])(
    'từ chối chuỗi không hợp lệ hoặc vượt biên %s',
    (s) => {
      expect(parseVND(s)).toBeNull()
    },
  )

  it('cho phép số 0 khi bật tùy chọn allowZero (ô số cố định)', () => {
    expect(parseVND('0', { allowZero: true })).toBe(0)
  })

  it('xử lý khoảng trắng lạ (NBSP), dấu + ở đầu và từ chối số thập phân mơ hồ', () => {
    // Review Focus #3: dữ liệu dán từ iOS/Zalo thường dính non-breaking space (\u00A0)
    expect(parseVND('\u00A0190.000\u00A0đ ')).toBe(190000)
    expect(parseVND(' 190k ')).toBe(190000)
    expect(parseVND('+190k')).toBe(190000)
    expect(parseVND('1.5')).toBeNull()
  })
})
