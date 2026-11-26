/**
 * Các hàm thuần tạo tin nhắn nhắc nợ (nhóm & cá nhân) và xử lý tham số deep-link `?pay=`.
 * Hàm thuần — không import React hay Firebase.
 */
import { findBank } from './banks'
import { formatVND } from './money'
import type { Transfer, VND } from './types'
import { defaultTransferNote } from './vietqr'

/** Thông tin tối thiểu của một thành viên để soạn tin nhắn nhắc nợ. */
export interface ReminderMember {
  /** Mã định danh thành viên trong chuyến đi. */
  id: string
  /** Tên hiển thị của thành viên. */
  name: string
  /** Mã BIN 6 chữ số của ngân hàng nhận tiền (tùy chọn). */
  bankBin?: string
  /** Số tài khoản ngân hàng nhận tiền (tùy chọn). */
  accountNo?: string
  /** Tên chủ tài khoản (tùy chọn). */
  accountName?: string
}

/** Tham số tạo tin nhắn tổng kết chia tiền cho cả nhóm. */
export interface GroupReminderParams {
  /** Tên chuyến đi (vd: `"Đà Lạt 2026"`). */
  tripName: string
  /** Đường dẫn đầy đủ tới trang chuyến đi. */
  tripUrl: string
  /** Tổng số tiền đã chi hợp lệ của cả chuyến (VND nguyên). */
  totalSpent: VND
  /** Danh sách các khoản cần chuyển còn lại từ `settle`. */
  transfers: Transfer[]
  /** Danh sách các khoản đã chuyển trong sổ cái `payments`. */
  paid: Transfer[]
  /** Hàm ánh xạ `memberId` sang tên hiển thị. */
  nameOf: (id: string) => string
}

/** Tham số tạo tin nhắn nhắc nợ riêng cho một thành viên. */
export interface PersonalReminderParams {
  /** Tên chuyến đi (vd: `"Đà Lạt 2026"`). */
  tripName: string
  /** Đường dẫn đầy đủ tới trang chuyến đi. */
  tripUrl: string
  /** Khoản cần chuyển tiền giữa người gửi và người nhận. */
  transfer: Transfer
  /** Thành viên cần chuyển tiền. */
  from: ReminderMember
  /** Thành viên nhận tiền. */
  to: ReminderMember
}

/** Cặp mã người trả / người nhận được giải mã từ tham số URL `?pay=`. */
export interface PayTarget {
  /** Mã thành viên chuyển tiền. */
  fromId: string
  /** Mã thành viên nhận tiền. */
  toId: string
}

/**
 * Tạo đường dẫn mở thẳng sheet quét QR cho một giao dịch chuyển khoản cụ thể.
 * Dùng dấu `.` phân cách cặp ID để tránh xung đột với ký tự `-` có thể xuất hiện trong ID.
 *
 * @param tripUrl - Đường dẫn gốc của trang chuyến đi (không kèm query)
 * @param fromId - Mã người chuyển tiền
 * @param toId - Mã người nhận tiền
 * @returns Đường dẫn đầy đủ kèm tham số `?pay=<fromId>.<toId>`
 * @example
 * buildPayLink('https://x.pages.dev/t/k3x9p2qm7a', 'chung', 'sang')
 * // "https://x.pages.dev/t/k3x9p2qm7a?pay=chung.sang"
 */
export function buildPayLink(tripUrl: string, fromId: string, toId: string): string {
  const sep = tripUrl.includes('?') ? '&' : '?'
  return `${tripUrl}${sep}pay=${encodeURIComponent(fromId)}.${encodeURIComponent(toId)}`
}

/**
 * Phân tích giá trị tham số `?pay=` trên URL thành cặp `{ fromId, toId }`.
 * Trả về `null` nếu tham số rỗng, sai định dạng hoặc `fromId === toId`.
 *
 * @param v - Giá trị chuỗi của query param `pay` (hoặc `null` nếu không có)
 * @returns Cặp `{ fromId, toId }` hợp lệ hoặc `null`
 * @example
 * parsePayParam('chung.sang') // { fromId: 'chung', toId: 'sang' }
 */
export function parsePayParam(v: string | null): PayTarget | null {
  if (!v) return null
  const parts = v.split('.')
  // Chỉ chấp nhận đúng 2 phần tử phân tách bằng dấu "." vì định dạng chuẩn là `${fromId}.${toId}`
  if (parts.length !== 2) return null
  const fromId = parts[0].trim()
  const toId = parts[1].trim()
  if (!fromId || !toId || fromId === toId) return null
  return { fromId, toId }
}

/**
 * Soạn nội dung tin nhắn tổng kết chia tiền cả nhóm để copy hoặc chia sẻ vào Messenger/Zalo.
 *
 * @param p - Thông tin chuyến đi, tổng chi, các khoản cần chuyển, các khoản đã trả và hàm lấy tên
 * @returns Chuỗi tin nhắn hoàn chỉnh theo định dạng `DESIGN.md` §8.6
 * @example
 * buildGroupReminder({
 *   tripName: 'Đà Lạt 2026',
 *   tripUrl: 'https://x.pages.dev/t/k3x9p2qm7a',
 *   totalSpent: 1105000,
 *   transfers: [{ fromId: 'chung', toId: 'sang', amount: 273750 }],
 *   paid: [],
 *   nameOf: (id) => id,
 * })
 */
export function buildGroupReminder(p: GroupReminderParams): string {
  const lines: string[] = [
    `💸 Chia tiền ${p.tripName}`,
    `💰 Tổng chi: ${formatVND(p.totalSpent)}`,
  ]

  if (p.transfers.length === 0) {
    lines.push('✅ Cả nhóm đã thanh toán xong!')
  } else {
    for (const t of p.transfers) {
      lines.push(`• ${p.nameOf(t.fromId)} → ${p.nameOf(t.toId)}: ${formatVND(t.amount)}`)
    }
  }

  for (const item of p.paid) {
    lines.push(`✅ Đã trả: ${p.nameOf(item.fromId)} → ${p.nameOf(item.toId)} ${formatVND(item.amount)}`)
  }

  lines.push(`Xem chi tiết & quét QR: ${p.tripUrl}`)
  return lines.join('\n')
}

/**
 * Soạn nội dung tin nhắn nhắc nợ riêng cho một thành viên, kèm STK (nếu có),
 * nội dung chuyển khoản không dấu và deep-link mở thẳng mã QR.
 *
 * @param p - Thông tin chuyến đi, giao dịch cần trả và thông tin hai thành viên
 * @returns Chuỗi tin nhắn nhắc riêng theo định dạng `DESIGN.md` §8.6
 * @example
 * buildPersonalReminder({
 *   tripName: 'Đà Lạt 2026',
 *   tripUrl: 'https://x.pages.dev/t/k3x9p2qm7a',
 *   transfer: { fromId: 'chung', toId: 'sang', amount: 273750 },
 *   from: { id: 'chung', name: 'Chung' },
 *   to: { id: 'sang', name: 'Sang', bankBin: '970436', accountNo: '0123456789', accountName: 'NGUYEN NGOC SANG' },
 * })
 */
export function buildPersonalReminder(p: PersonalReminderParams): string {
  const lines: string[] = [
    `👋 ${p.from.name} ơi, phần của bạn chuyến ${p.tripName} là ${formatVND(p.transfer.amount)} (chuyển cho ${p.to.name}).`,
  ]

  const accountNo = p.to.accountNo?.trim()
  if (p.to.bankBin && accountNo) {
    const bankLabel = findBank(p.to.bankBin)?.shortName ?? p.to.bankBin
    const owner = p.to.accountName?.trim()
    const ownerSuffix = owner ? ` (${owner})` : ''
    lines.push(`🏦 ${bankLabel} - ${accountNo}${ownerSuffix}`)
  }

  lines.push(`📝 Nội dung: ${defaultTransferNote(p.from.name, p.tripName)}`)
  lines.push(`🔗 Quét QR điền sẵn tiền: ${buildPayLink(p.tripUrl, p.from.id, p.to.id)}`)
  return lines.join('\n')
}
