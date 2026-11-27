/**
 * Hàm thuần tạo và phân tích tham số link cá nhân `?k=<memberId>.<code>` cho từng thành viên.
 * Hàm thuần — không import React hay Firebase.
 */

/** Biểu thức chính quy kiểm tra mã bí mật thành viên: 12..32 ký tự chữ thường và số `[a-z0-9]`. */
export const MEMBER_CODE_PATTERN = /^[a-z0-9]{12,32}$/

/** Cặp mã thành viên và mã bí mật tách ra từ tham số URL `?k=`. */
export interface ParsedMemberKey {
  /** Mã định danh thành viên trong chuyến đi. */
  memberId: string
  /** Mã bí mật 12..32 ký tự `[a-z0-9]`. */
  code: string
}

/**
 * Kiểm tra chuỗi mã bí mật có khớp định dạng hợp lệ của `firestore.rules` hay không.
 *
 * @param code - Chuỗi mã bí mật cần kiểm tra
 * @returns `true` nếu dài 12..32 ký tự thuộc `[a-z0-9]`
 * @example
 * isValidMemberCode('chungcode1234') // true
 * isValidMemberCode('short') // false
 */
export function isValidMemberCode(code: string): boolean {
  return MEMBER_CODE_PATTERN.test(code)
}

/**
 * Tạo đường dẫn cá nhân cho một thành viên kèm tham số `?k=<memberId>.<code>`.
 *
 * @param origin - Origin của ứng dụng (vd: `window.location.origin`)
 * @param tripId - Mã chuyến đi 10 ký tự
 * @param memberId - Mã thành viên
 * @param code - Mã bí mật của thành viên đó
 * @returns Đường dẫn đầy đủ kèm query `?k=`
 * @example
 * buildPersonalTripUrl('https://tripsplit.workers.dev', 'k3x9p2qm7a', 'chung', 'chungcode1234')
 * // "https://tripsplit.workers.dev/t/k3x9p2qm7a?k=chung.chungcode1234"
 */
export function buildPersonalTripUrl(
  origin: string,
  tripId: string,
  memberId: string,
  code: string,
): string {
  const cleanOrigin = origin.replace(/\/+$/, '')
  return `${cleanOrigin}/t/${tripId}?k=${encodeURIComponent(memberId)}.${encodeURIComponent(code)}`
}

/**
 * Tách tham số `?k=<memberId>.<code>` thành `{ memberId, code }`.
 * Dùng `lastIndexOf('.')` để hỗ trợ trường hợp `memberId` tự sinh hoặc có chứa dấu chấm.
 *
 * @param raw - Giá trị chuỗi lấy từ `searchParams.get('k')`
 * @returns Đối tượng `{ memberId, code }` hợp lệ hoặc `null` nếu sai định dạng
 * @example
 * parseMemberKeyParam('chung.chungcode1234') // { memberId: 'chung', code: 'chungcode1234' }
 * parseMemberKeyParam('chung.short') // null
 */
export function parseMemberKeyParam(raw: string | null): ParsedMemberKey | null {
  if (!raw) {
    return null
  }
  const dotIndex = raw.lastIndexOf('.')
  if (dotIndex <= 0 || dotIndex >= raw.length - 1) {
    return null
  }
  const memberId = raw.slice(0, dotIndex).trim()
  const code = raw.slice(dotIndex + 1).trim()
  if (!memberId || !isValidMemberCode(code)) {
    return null
  }
  return { memberId, code }
}
