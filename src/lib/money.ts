/**
 * Các hàm thuần định dạng và phân tích tiền tệ Việt Nam Đồng (VND).
 * Hàm thuần — không import React hay Firebase.
 */
import type { VND } from './types'

/** Giới hạn số tiền tối đa hợp lệ cho một khoản chi hoặc thanh toán (1 tỷ VND). */
export const MAX_VND: VND = 1_000_000_000

/**
 * Định dạng số nguyên VND thành chuỗi hiển thị chuẩn Việt Nam (`190.000đ`).
 * Dùng regex chèn dấu `.` thay vì `Intl.NumberFormat` để đảm bảo hiển thị đồng nhất trên mọi thiết bị.
 * Trả về `"—"` nếu đầu vào không hữu hạn (`NaN`, `Infinity`) để tránh che giấu lỗi tính toán thành `"0đ"`.
 *
 * @param n - Số tiền nguyên (VND)
 * @returns Chuỗi tiền đã định dạng, ví dụ `"190.000đ"`, `"-50.000đ"`, hoặc `"—"` nếu `n` không hữu hạn
 * @example
 * formatVND(190000) // "190.000đ"
 */
export function formatVND(n: VND): string {
  // Chặn NaN/Infinity sớm vì `Math.round(NaN) || 0` sẽ biến lỗi tính toán thành "0đ" (trông như đã hết nợ)
  if (!Number.isFinite(n)) return '—'
  // Làm tròn phòng vệ và chuẩn hóa -0 về 0 để không bao giờ hiển thị "-0đ"
  const rounded = Math.round(n) || 0
  const sign = rounded < 0 ? '-' : ''
  const formatted = Math.abs(rounded)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, '.')
  return `${sign}${formatted}đ`
}

/**
 * Định dạng số dư VND kèm dấu `+` cho số dương, `-` cho số âm, `0đ` khi cân bằng và `"—"` nếu không hữu hạn.
 *
 * @param n - Số dư nguyên (VND)
 * @returns Chuỗi tiền có dấu ở đầu nếu khác 0, hoặc `"—"` nếu `n` không hữu hạn
 * @example
 * formatSignedVND(826250) // "+826.250đ"
 */
export function formatSignedVND(n: VND): string {
  // Không để lỗi tính toán bị hiển thị nhầm thành "0đ" (đã cân bằng)
  if (!Number.isFinite(n)) return '—'
  const rounded = Math.round(n) || 0
  if (rounded > 0) return `+${formatVND(rounded)}`
  return formatVND(rounded)
}

/**
 * Phân tích chuỗi tiền người dùng nhập (hỗ trợ viết tắt tiếng Việt như `190k`, `1tr2`, `45k5`)
 * thành số nguyên VND hợp lệ; trả về `null` nếu sai định dạng hoặc vượt ngưỡng cho phép.
 *
 * @param input - Chuỗi người dùng nhập hoặc dán vào ô tiền
 * @param opts - Tùy chọn phân tích (`allowZero: true` cho phép giá trị `0` ở ô số cố định)
 * @returns Số nguyên VND hợp lệ trong `[allowZero ? 0 : 1, MAX_VND]`, hoặc `null` nếu không hợp lệ
 * @example
 * parseVND('1tr2') // 1200000
 */
export function parseVND(input: string, opts?: { allowZero?: boolean }): VND | null {
  // 1. Chuẩn hóa Unicode NFD -> NFC (tránh lỗi text dán từ macOS/Word), gộp khoảng trắng (gồm NBSP), chuyển chữ thường và kiểm dấu âm
  let s = input.normalize('NFC').replace(/\s+/g, ' ').trim().toLowerCase()
  if (!s || s.includes('-')) return null

  // Bỏ dấu '+' đầu và các hậu tố đơn vị tiền phổ biến ở cuối chuỗi
  s = s.replace(/^\+\s*/, '').replace(/\s*(?:vnđ|vnd|đ|d)$/, '').trim()
  if (!s) return null

  let value: number | null = null
  let match: RegExpMatchArray | null

  // 2. Thử khớp các mẫu viết tắt tiếng Việt từ dạng ghép cụ thể đến dạng tổng quát (DESIGN.md §8.1)
  if ((match = s.match(/^(\d+)\s*(?:tr|triệu|trieu|m)\s*(\d+)\s*k$/))) {
    // Dạng ghép triệu + nghìn (vd: "1tr50k" -> 1.050.000)
    value = Number(match[1]) * 1_000_000 + Number(match[2]) * 1_000
  } else if ((match = s.match(/^(\d+)\s*(?:tr|triệu|trieu|m)\s*(\d+)$/))) {
    // Dạng số thập phân ghi sau hậu tố triệu (vd: "1tr2" -> 1.200.000, "1tr05" -> 1.050.000)
    value = Math.round(Number(match[1]) * 1_000_000 + Number(`0.${match[2]}`) * 1_000_000)
  } else if ((match = s.match(/^(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|trieu|m)$/))) {
    // Dạng triệu thuần hoặc có dấu thập phân trước hậu tố (vd: "1.2tr", "1 triệu")
    value = Math.round(Number(match[1].replace(',', '.')) * 1_000_000)
  } else if ((match = s.match(/^(\d+)\s*k\s*(\d+)$/))) {
    // Dạng nghìn có phần lẻ sau chữ k (vd: "45k5" -> 45.500)
    value = Math.round(Number(match[1]) * 1_000 + Number(`0.${match[2]}`) * 1_000)
  } else if ((match = s.match(/^(\d+(?:[.,]\d+)?)\s*k$/))) {
    // Dạng nghìn thuần hoặc có dấu thập phân (vd: "190k", "45,5k")
    value = Math.round(Number(match[1].replace(',', '.')) * 1_000)
  } else if (/^\d+$/.test(s)) {
    // 3a. Số nguyên thuần không dấu phân cách
    value = Number(s)
  } else if (/^\d{1,3}(?:(?:\.\d{3})+|(?:,\d{3})+|(?: \d{3})+)$/.test(s)) {
    // 3b. Số đầy đủ có dấu phân cách hàng nghìn nhất quán 3 chữ số (từ chối số mơ hồ như "1.5")
    value = Number(s.replace(/[., ]/g, ''))
  }

  // 4. Kiểm tra kiểu số nguyên an toàn và biên hợp lệ theo ràng buộc dự án
  const min = opts?.allowZero ? 0 : 1
  if (value === null || !Number.isSafeInteger(value) || value < min || value > MAX_VND) {
    return null
  }
  return value
}
