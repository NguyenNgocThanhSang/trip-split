/**
 * Lớp truy cập dữ liệu sổ cái thanh toán (`trips/{tripId}/payments`).
 * Cho phép tạo và hoàn tác (xóa) giao dịch đã chuyển; không cho cập nhật để giữ nguyên lịch sử sổ cái.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  type Firestore,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { logError } from '@/lib/logger'
import type { VND } from '@/lib/types'
import { db, getHasPendingWrites, setPendingWritesSource } from './firebase'
import type { Payment, PaymentDoc } from './types'

/** Dữ liệu đầu vào để ghi nhận một giao dịch đã chuyển tiền. */
export interface PaymentInputData {
  /** Mã thành viên chuyển tiền. */
  fromId: string
  /** Mã thành viên nhận tiền. */
  toId: string
  /** Số tiền thực tế đã chuyển (VND nguyên > 0). */
  amount: VND
  /** Ghi chú tùy chọn (`""` nếu không có). */
  note: string
}

/** Kết quả trả về của hook `usePayments`. */
export interface PaymentsState {
  /** Trạng thái tải sổ cái thanh toán. */
  status: 'loading' | 'ok' | 'error'
  /** Danh sách các khoản đã chuyển sắp theo `paidAt` giảm dần. */
  payments: Payment[]
}

/**
 * Lắng nghe realtime sổ cái thanh toán của một chuyến đi, sắp xếp giao dịch mới nhất lên đầu.
 *
 * @param tripId - Mã chuyến đi
 * @returns Trạng thái tải và mảng `payments`
 */
export function usePayments(tripId: string): PaymentsState {
  const [entry, setEntry] = useState<{ tripId: string; state: PaymentsState }>({
    tripId,
    state: { status: 'loading', payments: [] },
  })

  useEffect(() => {
    if (!tripId) return

    const unsubscribe = onSnapshot(
      collection(db, 'trips', tripId, 'payments'),
      { includeMetadataChanges: true },
      (snap) => {
        setPendingWritesSource('payments', snap.metadata.hasPendingWrites)
        const payments = snap.docs
          .map((d) => ({ ...(d.data() as PaymentDoc), id: d.id }))
          .sort((a, b) => {
            const ta = a.paidAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
            const tb = b.paidAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
            return tb - ta
          })
        setEntry({ tripId, state: { status: 'ok', payments } })
      },
      (err) => {
        logError('payments.subscribe', err, { tripId })
        setPendingWritesSource('payments', false)
        setEntry({ tripId, state: { status: 'error', payments: [] } })
      },
    )

    return () => {
      unsubscribe()
      setPendingWritesSource('payments', false)
    }
  }, [tripId])

  if (!tripId) {
    return { status: 'ok', payments: [] }
  }
  return entry.tripId === tripId ? entry.state : { status: 'loading', payments: [] }
}

/**
 * Ghi nhận một lần chuyển tiền thực tế vào sổ cái `trips/{tripId}/payments`.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param p - Thông tin người trả, người nhận, số tiền và ghi chú
 * @param by - Vai trò người đánh dấu (`'admin'` hoặc `'guest'`)
 */
export async function addPayment(
  firestore: Firestore,
  tripId: string,
  p: PaymentInputData,
  by: 'admin' | 'guest',
): Promise<void> {
  await addDoc(collection(firestore, 'trips', tripId, 'payments'), {
    fromId: p.fromId,
    toId: p.toId,
    amount: p.amount,
    note: p.note.trim(),
    markedBy: by,
    paidAt: serverTimestamp(),
  })
}

/**
 * Hoàn tác (xóa) một bản ghi thanh toán khỏi `trips/{tripId}/payments/{id}`.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param id - Mã bản ghi thanh toán cần xóa
 */
export async function deletePayment(
  firestore: Firestore,
  tripId: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(firestore, 'trips', tripId, 'payments', id))
}

/**
 * Cho biết có thao tác ghi offline nào trên chuyến đi đang xếp hàng chờ đồng bộ hay không.
 * Dùng cho `OfflineBanner` kết hợp với `useOnlineStatus`.
 *
 * @returns `true` nếu còn dữ liệu cục bộ chưa đẩy lên máy chủ Firestore
 */
export function hasPendingWrites(): boolean {
  return getHasPendingWrites()
}
