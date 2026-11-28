/**
 * Định nghĩa kiểu dữ liệu các document lưu trên Cloud Firestore cho TripSplit (DESIGN.md §6).
 * Tái sử dụng kiểu `VND` từ `src/lib/types.ts` để thống nhất tiền luôn là số nguyên.
 */
import type { Timestamp } from 'firebase/firestore'
import type { VND } from '@/lib/types'

/** Dữ liệu thô của một người bạn trong collection `friends/{friendId}` (chỉ Admin truy cập). */
export interface FriendDoc {
  /** Tên hiển thị trong danh bạ (1..40 ký tự). */
  name: string
  /** Mã BIN 6 chữ số của ngân hàng NAPAS (tùy chọn, vd: `"970436"`). */
  bankBin?: string
  /** Tên ngắn ngân hàng (tùy chọn, 1..30 ký tự, vd: `"Vietcombank"`). */
  bankShortName?: string
  /** Số tài khoản ngân hàng (tùy chọn, 1..25 ký tự). */
  accountNo?: string
  /** Tên chủ tài khoản IN HOA KHÔNG DẤU (tùy chọn, 1..60 ký tự). */
  accountName?: string
  /** Ảnh QR MoMo tĩnh đã nén thành data URL base64 (tùy chọn, <= 100.000 ký tự). */
  momoQrDataUrl?: string
  /** Thời điểm tạo trên máy chủ Firestore (`serverTimestamp()`). */
  createdAt: Timestamp
  /** Thời điểm cập nhật gần nhất trên máy chủ Firestore (`serverTimestamp()`). */
  updatedAt: Timestamp
}

/** Bản ghi bạn bè kèm mã document Firestore `id`. */
export interface Friend extends FriendDoc {
  /** Mã định danh document trong collection `friends`. */
  id: string
}

/** Bản sao thông tin thành viên gắn cố định trong một chuyến đi (không chứa ảnh QR để giữ trip nhẹ). */
export interface Member {
  /** Mã thành viên trong chuyến (thường lấy bằng `friendId`). */
  id: string
  /** Tên hiển thị của thành viên trong chuyến (1..40 ký tự). */
  name: string
  /** Mã BIN 6 chữ số của ngân hàng nhận tiền (tùy chọn). */
  bankBin?: string
  /** Tên ngắn ngân hàng (tùy chọn). */
  bankShortName?: string
  /** Số tài khoản ngân hàng (tùy chọn). */
  accountNo?: string
  /** Tên chủ tài khoản không dấu viết hoa (tùy chọn). */
  accountName?: string
  /** `true` nếu thành viên có ảnh QR MoMo tĩnh trong subcollection `memberQrs/{id}`. */
  hasStaticQr: boolean
}

/** Dữ liệu thô của document chuyến đi trong collection `trips/{tripId}`. */
export interface TripDoc {
  /** Tên chuyến đi (1..100 ký tự, vd: `"Đà Lạt 2026"`). */
  name: string
  /** Ngày bắt đầu chuyến đi dạng ISO `"YYYY-MM-DD"` (tùy chọn). */
  startDate?: string
  /** Ngày kết thúc chuyến đi dạng ISO `"YYYY-MM-DD"` (tùy chọn). */
  endDate?: string
  /** Danh sách thành viên của chuyến (2..20 người, theo thứ tự hiển thị). */
  members: Member[]
  /** Danh sách ID đồng bộ từ `members.map(m => m.id)` để Firestore Rules kiểm tra `in` / `hasOnly`. */
  memberIds: string[]
  /** Bật/tắt quyền tự thêm, sửa, xóa khoản chi của khách (mặc định `false`). */
  allowGuestExpenses: boolean
  /** Trạng thái chốt sổ; khi `true` mọi thao tác ghi từ khách bị chặn. */
  locked: boolean
  /** Thời điểm tạo trên máy chủ Firestore. */
  createdAt: Timestamp
  /** Thời điểm cập nhật gần nhất trên máy chủ Firestore. */
  updatedAt: Timestamp
}

/** Bản ghi chuyến đi kèm `id` (10 ký tự ngẫu nhiên dùng trong URL `/t/:tripId`). */
export interface Trip extends TripDoc {
  /** Mã chuyến đi 10 ký tự `[a-z0-9]`. */
  id: string
}

/** Dữ liệu thô của một khoản chi trong `trips/{tripId}/expenses/{expenseId}`. */
export interface ExpenseDoc {
  /** Tên khoản chi (1..100 ký tự, vd: `"Ăn sáng"`). */
  name: string
  /** Thành tiền nguyên VND (`1..1.000.000.000`). */
  amount: VND
  /** Mã thành viên đã ứng tiền (thuộc `trip.memberIds`). */
  payerId: string
  /** Danh sách mã thành viên tham gia chia (1..20, tập con `trip.memberIds`). */
  participantIds: string[]
  /** Số tiền cố định cho một số thành viên (`keys ⊆ participantIds`); `{}` nếu chia đều. */
  fixedAmounts: Record<string, VND>
  /** Ghi chú thêm (0..200 ký tự, `""` nếu không có). */
  note: string
  /** Ngày chi tiêu dạng ISO `"YYYY-MM-DD"`. */
  date: string
  /** Nguồn tạo khoản chi (`'admin'` hoặc `'guest'`, bất biến sau khi tạo). */
  createdBy: 'admin' | 'guest'
  /** Thời điểm tạo trên máy chủ Firestore (bất biến). */
  createdAt: Timestamp
  /** Thời điểm cập nhật gần nhất trên máy chủ Firestore. */
  updatedAt: Timestamp
}

/** Bản ghi khoản chi kèm mã document `id`. */
export interface Expense extends ExpenseDoc {
  /** Mã định danh document trong subcollection `expenses`. */
  id: string
}

/** Dữ liệu thô của một giao dịch đã chuyển tiền trong `trips/{tripId}/payments/{paymentId}`. */
export interface PaymentDoc {
  /** Mã thành viên chuyển tiền (thuộc `trip.memberIds`). */
  fromId: string
  /** Mã thành viên nhận tiền (thuộc `trip.memberIds`, khác `fromId`). */
  toId: string
  /** Số tiền thực tế đã chuyển (số nguyên VND > 0, cho phép trả một phần). */
  amount: VND
  /** Ghi chú giao dịch (0..120 ký tự, `""` nếu không có). */
  note: string
  /** Nguồn đánh dấu thanh toán (`'admin'` hoặc `'guest'`). */
  markedBy: 'admin' | 'guest'
  /** Thời điểm ghi nhận thanh toán trên máy chủ Firestore. */
  paidAt: Timestamp
}

/** Bản ghi thanh toán kèm mã document `id`. */
export interface Payment extends PaymentDoc {
  /** Mã định danh document trong subcollection `payments`. */
  id: string
}

/** Ảnh QR MoMo tĩnh của thành viên trong subcollection `trips/{tripId}/memberQrs/{memberId}`. */
export interface MemberQrDoc {
  /** Chuỗi data URL base64 đã nén (`<= 100.000` ký tự). */
  dataUrl: string
  /** Thời điểm cập nhật trên máy chủ Firestore. */
  updatedAt: Timestamp
}

/** Bản ghi ảnh QR MoMo tĩnh kèm `id` (trùng với `memberId`). */
export interface MemberQr extends MemberQrDoc {
  /** Mã thành viên sở hữu ảnh QR. */
  id: string
}
