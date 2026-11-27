/**
 * Lớp truy cập dữ liệu khoản chi (`trips/{tripId}/expenses`): lắng nghe realtime,
 * sắp xếp ở client theo ngày chi giảm dần và thực hiện CRUD chuẩn schema Firestore Rules.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  type Firestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { logError } from '@/lib/logger'
import type { VND } from '@/lib/types'
import { db, setPendingWritesSource } from './firebase'
import type { Expense, ExpenseDoc } from './types'

/** Dữ liệu đầu vào từ form thêm hoặc sửa một khoản chi tiêu. */
export interface ExpenseFormValues {
  /** Tên khoản chi (1..100 ký tự). */
  name: string
  /** Tổng thành tiền (số nguyên VND trong `1..1.000.000.000`). */
  amount: VND
  /** Mã thành viên đã ứng tiền. */
  payerId: string
  /** Danh sách mã thành viên tham gia chia (tối thiểu 1 người). */
  participantIds: string[]
  /** Các mức tiền cố định riêng theo từng `memberId` (`{}` nếu chia đều). */
  fixedAmounts: Record<string, VND>
  /** Ghi chú khoản chi (`""` nếu để trống). */
  note: string
  /** Ngày phát sinh khoản chi dạng ISO `"YYYY-MM-DD"`. */
  date: string
}

/** Kết quả trả về của hook `useExpenses`. */
export interface ExpensesState {
  /** Trạng thái tải danh sách khoản chi. */
  status: 'loading' | 'ok' | 'error'
  /** Danh sách khoản chi sắp theo `date` giảm dần rồi `createdAt` giảm dần. */
  expenses: Expense[]
}

/** Chuẩn hóa bản đồ số cố định, chỉ giữ thuộc tính tự thân có giá trị số nguyên hợp lệ. */
function sanitizeFixedAmounts(fixedAmounts: Record<string, VND>): Record<string, VND> {
  const clean: Record<string, VND> = {}
  for (const [id, val] of Object.entries(fixedAmounts)) {
    if (Number.isInteger(val) && val >= 0) {
      clean[id] = val
    }
  }
  return clean
}

/**
 * Lắng nghe realtime danh sách khoản chi của một chuyến đi và sắp xếp ở client (DESIGN.md §6).
 * Sắp xếp ở client giúp tránh phải tạo composite index trên Firestore khi lượng khoản chi < 100/chuyến.
 *
 * @param tripId - Mã chuyến đi
 * @returns Trạng thái tải và mảng `expenses` đã sắp xếp mới nhất trước
 */
export function useExpenses(tripId: string): ExpensesState {
  const [entry, setEntry] = useState<{ tripId: string; state: ExpensesState }>({
    tripId,
    state: { status: 'loading', expenses: [] },
  })

  useEffect(() => {
    if (!tripId) return

    const unsubscribe = onSnapshot(
      collection(db, 'trips', tripId, 'expenses'),
      { includeMetadataChanges: true },
      (snap) => {
        setPendingWritesSource('expenses', snap.metadata.hasPendingWrites)
        const expenses = snap.docs
          .map((d) => ({ ...(d.data() as ExpenseDoc), id: d.id }))
          .sort((a, b) => {
            if (b.date !== a.date) return b.date.localeCompare(a.date)
            const ta = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
            const tb = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
            return tb - ta
          })
        setEntry({ tripId, state: { status: 'ok', expenses } })
      },
      (err) => {
        logError('expenses.subscribe', err, { tripId })
        setPendingWritesSource('expenses', false)
        setEntry({ tripId, state: { status: 'error', expenses: [] } })
      },
    )

    return () => {
      unsubscribe()
      setPendingWritesSource('expenses', false)
    }
  }, [tripId])

  if (!tripId) {
    return { status: 'ok', expenses: [] }
  }
  return entry.tripId === tripId ? entry.state : { status: 'loading', expenses: [] }
}

/** Thông tin danh tính ghi của khách đã xác minh qua binding (tùy chọn, không truyền khi là Admin). */
export interface GuestWriteIdentity {
  /** Firebase Auth UID của khách khi thực hiện thao tác ghi. */
  uid: string
  /** Mã thành viên đã xác minh qua link cá nhân. */
  memberId: string
}

/**
 * Thêm một khoản chi mới vào `trips/{tripId}/expenses`.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param v - Dữ liệu khoản chi từ form
 * @param by - Vai trò người tạo (`'admin'` hoặc `'guest'`), phải khớp ngữ cảnh auth để qua rules
 * @param guestIdentity - Danh tính đã xác minh của khách (bắt buộc khi `by === 'guest'` trên rules mới)
 */
export async function addExpense(
  firestore: Firestore,
  tripId: string,
  v: ExpenseFormValues,
  by: 'admin' | 'guest',
  guestIdentity?: GuestWriteIdentity,
): Promise<void> {
  const docData: Record<string, unknown> = {
    name: v.name.trim(),
    amount: v.amount,
    payerId: v.payerId,
    participantIds: [...v.participantIds],
    fixedAmounts: sanitizeFixedAmounts(v.fixedAmounts),
    note: v.note.trim(),
    date: v.date,
    createdBy: by,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  if (by === 'guest' && guestIdentity) {
    docData.createdByUid = guestIdentity.uid
    docData.createdByMemberId = guestIdentity.memberId
  }
  await addDoc(collection(firestore, 'trips', tripId, 'expenses'), docData)
}

/**
 * Cập nhật một khoản chi đã có trong `trips/{tripId}/expenses/{id}` (giữ nguyên `createdBy` và `createdAt`).
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param id - Mã khoản chi cần sửa
 * @param v - Dữ liệu mới từ form
 */
export async function updateExpense(
  firestore: Firestore,
  tripId: string,
  id: string,
  v: ExpenseFormValues,
): Promise<void> {
  await updateDoc(doc(firestore, 'trips', tripId, 'expenses', id), {
    name: v.name.trim(),
    amount: v.amount,
    payerId: v.payerId,
    participantIds: [...v.participantIds],
    fixedAmounts: sanitizeFixedAmounts(v.fixedAmounts),
    note: v.note.trim(),
    date: v.date,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Xóa một khoản chi khỏi `trips/{tripId}/expenses/{id}`.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param id - Mã khoản chi cần xóa
 */
export async function deleteExpense(
  firestore: Firestore,
  tripId: string,
  id: string,
): Promise<void> {
  await deleteDoc(doc(firestore, 'trips', tripId, 'expenses', id))
}
