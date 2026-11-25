/**
 * Thuật toán chia tiền cho một khoản chi: hỗ trợ chia đều, cố định số tiền riêng cho một vài người,
 * tự chia phần dư và làm tròn số nguyên VND khớp tổng tuyệt đối.
 * Hàm thuần — không import React hay Firebase.
 */
import { formatVND, MAX_VND } from './money'
import type { VND } from './types'

/** Các mã lỗi nghiệp vụ có thể phát sinh khi kiểm tra và tính chia tiền một khoản chi. */
export type SplitError =
  | 'INVALID_AMOUNT'
  | 'NO_PARTICIPANTS'
  | 'FIXED_NOT_PARTICIPANT'
  | 'INVALID_FIXED'
  | 'FIXED_EXCEEDS_TOTAL'
  | 'ALL_FIXED_MISMATCH'

/** Kết quả trả về của `computeShares`: thành công kèm phần chia theo từng `memberId`, hoặc lỗi tiếng Việt. */
export type SplitResult =
  | {
      /** Trạng thái tính chia tiền hợp lệ. */
      ok: true
      /** Bản đồ số tiền phải chịu của từng thành viên tham gia (VND nguyên, tổng luôn bằng `amount`). */
      shares: Record<string, VND>
    }
  | {
      /** Trạng thái dữ liệu chia tiền không hợp lệ. */
      ok: false
      /** Mã lỗi phân loại để UI và unit test kiểm tra. */
      error: SplitError
      /** Thông báo lỗi bằng tiếng Việt hiển thị trực tiếp trên form. */
      message: string
    }

/** Tham số đầu vào cho hàm `computeShares`. */
export interface SplitInput {
  /** Tổng thành tiền khoản chi (số nguyên VND trong `[1, MAX_VND]`). */
  amount: VND
  /** Danh sách mã thành viên tham gia chia khoản chi (tối thiểu 1 người; tự khử trùng nếu lặp). */
  participantIds: string[]
  /** Bản đồ số tiền cố định riêng cho một số thành viên tham gia (VND nguyên ≥ 0). */
  fixedAmounts: Record<string, VND>
  /** Thứ tự thành viên trong chuyến (`trip.memberIds`) — quyết định thứ tự nhận 1đ lẻ để preview luôn khớp sau khi lưu. */
  memberOrder: string[]
}

/**
 * Tính phần tiền phải chịu cho từng người tham gia một khoản chi, hỗ trợ cố định một phần và tự chia đều phần dư.
 * Đảm bảo tổng các phần chia luôn bằng chính xác `amount` (không bao giờ dư/hụt 1đ).
 *
 * @param input - Dữ liệu khoản chi gồm thành tiền, danh sách tham gia, các mức cố định và thứ tự thành viên
 * @returns Kết quả `{ ok: true, shares }` hoặc `{ ok: false, error, message }`
 * @example
 * computeShares({
 *   amount: 190000,
 *   participantIds: ['sang', 'chung', 'mo', 'phung'],
 *   fixedAmounts: { chung: 45000, mo: 45000 },
 *   memberOrder: ['sang', 'chung', 'mo', 'phung'],
 * }) // { ok: true, shares: { sang: 50000, chung: 45000, mo: 45000, phung: 50000 } }
 */
export function computeShares(input: SplitInput): SplitResult {
  const { amount, participantIds, fixedAmounts, memberOrder } = input

  // 1. Khử trùng người tham gia và kiểm tra tính hợp lệ đầu vào theo thứ tự ưu tiên (DESIGN.md §8.2)
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_VND) {
    return {
      ok: false,
      error: 'INVALID_AMOUNT',
      message: 'Thành tiền phải là số nguyên từ 1đ đến 1.000.000.000đ',
    }
  }

  const uniqueParticipants: string[] = []
  const participantSet = new Set<string>()
  for (const id of participantIds) {
    if (!participantSet.has(id)) {
      participantSet.add(id)
      uniqueParticipants.push(id)
    }
  }

  if (uniqueParticipants.length === 0) {
    return {
      ok: false,
      error: 'NO_PARTICIPANTS',
      message: 'Phải chọn ít nhất 1 người tham gia',
    }
  }

  let fixedSum = 0
  for (const [id, fixedValue] of Object.entries(fixedAmounts)) {
    if (!participantSet.has(id)) {
      return {
        ok: false,
        error: 'FIXED_NOT_PARTICIPANT',
        message: 'Có số tiền riêng gắn cho người không tham gia khoản này',
      }
    }
    if (!Number.isInteger(fixedValue) || fixedValue < 0 || fixedValue > MAX_VND) {
      return {
        ok: false,
        error: 'INVALID_FIXED',
        message: 'Số tiền riêng phải là số nguyên không âm hợp lệ',
      }
    }
    fixedSum += fixedValue
  }

  // 2. Gom nhóm người chia phần dư (flex) theo đúng thứ tự memberOrder để 1đ lẻ không nhảy giữa preview và DB
  const flex: string[] = []
  const flexSeen = new Set<string>()
  for (const id of memberOrder) {
    if (participantSet.has(id) && fixedAmounts[id] === undefined && !flexSeen.has(id)) {
      flexSeen.add(id)
      flex.push(id)
    }
  }
  // Phòng vệ: nếu có thành viên hợp lệ nhưng chưa có mặt trong memberOrder thì nối tiếp vào cuối
  for (const id of uniqueParticipants) {
    if (fixedAmounts[id] === undefined && !flexSeen.has(id)) {
      flexSeen.add(id)
      flex.push(id)
    }
  }

  // 3. Kiểm tra phần dư sau khi trừ tổng các khoản cố định
  if (fixedSum > amount) {
    return {
      ok: false,
      error: 'FIXED_EXCEEDS_TOTAL',
      message: `Tổng số tiền riêng (${formatVND(fixedSum)}) vượt quá thành tiền (${formatVND(amount)})`,
    }
  }

  const remainder = amount - fixedSum
  if (flex.length === 0 && remainder !== 0) {
    return {
      ok: false,
      error: 'ALL_FIXED_MISMATCH',
      message: `Tổng các phần đã nhập (${formatVND(fixedSum)}) chưa khớp thành tiền (${formatVND(amount)})`,
    }
  }

  const shares: Record<string, VND> = {}
  for (const id of uniqueParticipants) {
    if (fixedAmounts[id] !== undefined) {
      shares[id] = fixedAmounts[id]
    }
  }

  if (flex.length === 0) {
    return { ok: true, shares }
  }

  // 4. Chia nguyên phần dư cho nhóm flex để tránh hoàn toàn sai số dấu phẩy động
  const base = Math.floor(remainder / flex.length)
  const extra = remainder - base * flex.length

  // 5. DESIGN.md §8.2: 1đ lẻ cho những người đầu tiên trong nhóm flex theo memberOrder
  for (let i = 0; i < flex.length; i++) {
    shares[flex[i]] = base + (i < extra ? 1 : 0)
  }

  return { ok: true, shares }
}
