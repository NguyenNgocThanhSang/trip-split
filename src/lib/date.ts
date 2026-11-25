/**
 * Các hàm thuần xử lý và định dạng ngày tháng cho TripSplit.
 * Hàm thuần — không import React hay Firebase.
 */

/**
 * Chuyển chuỗi ngày chuẩn ISO (`YYYY-MM-DD`) sang định dạng hiển thị Việt Nam (`dd/MM/yyyy`).
 * Giữ nguyên chuỗi gốc nếu không đúng mẫu `YYYY-MM-DD` để tránh làm vỡ giao diện.
 *
 * @param iso - Chuỗi ngày dạng `"YYYY-MM-DD"`, ví dụ `"2026-12-20"`
 * @returns Chuỗi ngày dạng `"dd/MM/yyyy"`
 * @example
 * formatDateVN('2026-12-20') // "20/12/2026"
 */
export function formatDateVN(iso: string): string {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!match) return iso
  return `${match[3]}/${match[2]}/${match[1]}`
}

/**
 * Lấy ngày hôm nay theo múi giờ cục bộ của thiết bị dưới dạng chuỗi ISO `"YYYY-MM-DD"`.
 * Không dùng `toISOString().slice(0, 10)` vì UTC có thể lệch ngày ở múi giờ Việt Nam (UTC+7) vào sáng sớm.
 *
 * @returns Chuỗi ngày hiện tại dạng `"YYYY-MM-DD"`
 * @example
 * todayISO() // "2026-12-20"
 */
export function todayISO(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
