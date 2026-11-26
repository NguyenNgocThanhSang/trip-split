/**
 * Các hàm thuần chuẩn hóa chuỗi không dấu và tạo đường dẫn ảnh VietQR động (Quick Link).
 * Hàm thuần — không import React hay Firebase.
 */
import type { VND } from './types'

/** Thông tin tài khoản ngân hàng của người nhận tiền để sinh mã VietQR. */
export interface BankAccount {
  /** Mã BIN 6 chữ số của ngân hàng thụ hưởng (vd: `"970436"` cho Vietcombank). */
  bankBin: string
  /** Số tài khoản hoặc tài khoản định danh của người nhận (1..25 ký tự). */
  accountNo: string
  /** Tên chủ tài khoản (tùy chọn; sẽ tự bỏ dấu và viết hoa khi đưa vào URL). */
  accountName?: string
}

/**
 * Chuẩn hóa chuỗi tiếng Việt sang ASCII thuần (bỏ dấu, `đ -> d`, `Đ -> D`, bỏ ký tự đặc biệt)
 * để tương thích mọi ứng dụng quét mã QR ngân hàng tại Việt Nam.
 *
 * @param s - Chuỗi tiếng Việt đầu vào
 * @returns Chuỗi chỉ gồm chữ cái ASCII, chữ số và một khoảng trắng giữa các từ
 * @example
 * toAscii('Chung trả tiền Đà Lạt (đợt 1)!') // "Chung tra tien Da Lat dot 1"
 */
export function toAscii(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9\s]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Tạo nội dung chuyển khoản mặc định không dấu tiếng Việt, giới hạn tối đa 50 ký tự theo chuẩn VietQR.
 *
 * @param payerName - Tên người chuyển tiền
 * @param tripName - Tên chuyến đi
 * @returns Nội dung chuyển khoản ngắn gọn không dấu (≤ 50 ký tự)
 * @example
 * defaultTransferNote('Chung', 'Đà Lạt 2026') // "Chung tra tien Da Lat 2026"
 */
export function defaultTransferNote(payerName: string, tripName: string): string {
  return toAscii(`${payerName} tra tien ${tripName}`).slice(0, 50).trim()
}

/**
 * Tạo đường dẫn ảnh PNG VietQR động (`img.vietqr.io`, mẫu `compact2`) điền sẵn số tiền và nội dung.
 * Không gọi API mạng — chỉ ghép URL chuẩn Quick Link để thẻ `<img>` tải trực tiếp.
 *
 * @param acc - Thông tin tài khoản ngân hàng người nhận
 * @param amount - Số tiền cần chuyển (số nguyên VND)
 * @param note - Nội dung chuyển khoản (tự động bỏ dấu và cắt tối đa 50 ký tự)
 * @returns URL ảnh PNG VietQR động hoàn chỉnh
 * @example
 * buildVietQrUrl(
 *   { bankBin: '970436', accountNo: '0123456789', accountName: 'Nguyễn Ngọc Sang' },
 *   273750,
 *   'Chung trả tiền Đà Lạt',
 * )
 * // "https://img.vietqr.io/image/970436-0123456789-compact2.png?amount=273750&addInfo=Chung+tra+tien+Da+Lat&accountName=NGUYEN+NGOC+SANG"
 */
export function buildVietQrUrl(acc: BankAccount, amount: VND, note: string): string {
  const bin = encodeURIComponent(acc.bankBin.trim())
  const accountNo = encodeURIComponent(acc.accountNo.trim())
  const base = `https://img.vietqr.io/image/${bin}-${accountNo}-compact2.png`

  const params = new URLSearchParams({
    amount: String(Math.round(amount)),
  })

  const memo = toAscii(note).slice(0, 50).trim()
  if (memo) {
    params.set('addInfo', memo)
  }

  if (acc.accountName) {
    const cleanAccountName = toAscii(acc.accountName).toUpperCase()
    if (cleanAccountName) {
      params.set('accountName', cleanAccountName)
    }
  }

  return `${base}?${params.toString()}`
}
