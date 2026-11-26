/**
 * Lớp truy cập dữ liệu chuyến đi (`trips/{tripId}`): listener realtime, tạo/cập nhật kèm QR trong batch
 * và xóa dây chuyền toàn bộ subcollection khi xóa chuyến.
 */
import {
  collection,
  deleteField,
  doc,
  type DocumentReference,
  type Firestore,
  getDocs,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { randomId } from '@/lib/id'
import { db, setPendingWritesSource } from './firebase'
import type { Friend, Member, Trip, TripDoc } from './types'

/** Trạng thái tải một chuyến đi theo `tripId`, phân biệt rõ chưa tìm thấy với mất mạng lần đầu. */
export type TripState =
  | { status: 'loading' }
  | { status: 'ok'; trip: Trip }
  | { status: 'not-found' }
  | { status: 'offline-empty' }
  | { status: 'error'; message: string }

/** Dữ liệu đầu vào từ form tạo hoặc chỉnh sửa chuyến đi của Admin. */
export interface TripInput {
  /** Tên chuyến đi (1..100 ký tự). */
  name: string
  /** Ngày bắt đầu dạng `"YYYY-MM-DD"` (tùy chọn). */
  startDate?: string
  /** Ngày kết thúc dạng `"YYYY-MM-DD"` (tùy chọn). */
  endDate?: string
  /** Danh sách thành viên của chuyến (2..20 người). */
  members: Member[]
  /** Cho phép bạn bè tự nhập/sửa khoản chi của họ hay không. */
  allowGuestExpenses: boolean
  /** Khóa sổ chuyến đi. */
  locked: boolean
}

/** Kết quả trả về của hook `useTripList` cho màn hình quản trị. */
export interface TripListState {
  /** Trạng thái tải danh sách chuyến đi. */
  status: 'loading' | 'ok' | 'error'
  /** Danh sách chuyến đi sắp theo thời điểm tạo mới nhất trước. */
  trips: Trip[]
}

/**
 * Phân loại snapshot chuyến đi dựa trên cờ `exists` và `fromCache` của Firestore.
 * Giúp tránh báo nhầm "Link không đúng" khi mở chuyến lần đầu lúc điện thoại đang ngoại tuyến (Review Focus #4).
 *
 * @param s - Trạng thái tồn tại và nguồn cache của snapshot
 * @returns `'ok'` nếu có dữ liệu, `'not-found'` nếu server xác nhận không tồn tại, `'offline-empty'` nếu cache rỗng khi offline
 */
export function classifyTripSnapshot(s: {
  exists: boolean
  fromCache: boolean
}): 'ok' | 'not-found' | 'offline-empty' {
  if (s.exists) return 'ok'
  return s.fromCache ? 'offline-empty' : 'not-found'
}

/**
 * Chuyển một hồ sơ bạn bè trong danh bạ sang bản sao `Member` gắn trong chuyến đi.
 * Không nhúng chuỗi ảnh QR vào `Member` để giữ document `trip` nhẹ (dưới giới hạn 1 MiB).
 *
 * @param f - Hồ sơ bạn bè từ collection `friends`
 * @returns Đối tượng `Member` đã làm sạch các trường ngân hàng tùy chọn
 */
export function memberFromFriend(f: Friend): Member {
  const member: Member = {
    id: f.id,
    name: f.name,
    hasStaticQr: Boolean(f.momoQrDataUrl),
  }
  if (f.bankBin) member.bankBin = f.bankBin
  if (f.bankShortName) member.bankShortName = f.bankShortName
  if (f.accountNo) member.accountNo = f.accountNo
  if (f.accountName) member.accountName = f.accountName
  return member
}

/** Loại bỏ các trường tùy chọn rỗng khỏi `Member` để khớp chặt quy tắc schema trên Firestore. */
function sanitizeMember(m: Member): Member {
  const clean: Member = {
    id: m.id,
    name: m.name.trim(),
    hasStaticQr: Boolean(m.hasStaticQr),
  }
  const bankBin = m.bankBin?.trim()
  const bankShortName = m.bankShortName?.trim()
  const accountNo = m.accountNo?.trim()
  const accountName = m.accountName?.trim()
  if (bankBin) clean.bankBin = bankBin
  if (bankShortName) clean.bankShortName = bankShortName
  if (accountNo) clean.accountNo = accountNo
  if (accountName) clean.accountName = accountName
  return clean
}

/**
 * Theo dõi realtime một chuyến đi theo `tripId`, hỗ trợ offline cache và cập nhật trạng thái đồng bộ.
 *
 * @param tripId - Mã chuyến đi 10 ký tự trên URL
 * @returns Trạng thái hiện tại của chuyến đi (`TripState`)
 */
export function useTrip(tripId: string): TripState {
  const [entry, setEntry] = useState<{ tripId: string; state: TripState }>({
    tripId,
    state: { status: 'loading' },
  })

  useEffect(() => {
    if (!tripId) return

    const unsubscribe = onSnapshot(
      doc(db, 'trips', tripId),
      { includeMetadataChanges: true },
      (snap) => {
        setPendingWritesSource('trip', snap.metadata.hasPendingWrites)
        const kind = classifyTripSnapshot({
          exists: snap.exists(),
          fromCache: snap.metadata.fromCache,
        })
        if (kind === 'ok') {
          setEntry({
            tripId,
            state: { status: 'ok', trip: { ...(snap.data() as TripDoc), id: snap.id } },
          })
        } else if (kind === 'not-found') {
          setEntry({ tripId, state: { status: 'not-found' } })
        } else {
          setEntry({ tripId, state: { status: 'offline-empty' } })
        }
      },
      (err) => {
        setPendingWritesSource('trip', false)
        setEntry({ tripId, state: { status: 'error', message: err.message } })
      },
    )

    return () => {
      unsubscribe()
      setPendingWritesSource('trip', false)
    }
  }, [tripId])

  if (!tripId) {
    return { status: 'not-found' }
  }
  // Trả về loading nếu tripId vừa đổi mà snapshot mới chưa tới, tránh gọi setState đồng bộ trong useEffect
  return entry.tripId === tripId ? entry.state : { status: 'loading' }
}

/**
 * Lắng nghe toàn bộ danh sách chuyến đi cho trang quản trị Admin, sắp mới nhất lên đầu.
 *
 * @returns Trạng thái tải và mảng `trips` đã sắp xếp theo `createdAt` giảm dần
 */
export function useTripList(): TripListState {
  const [state, setState] = useState<TripListState>({ status: 'loading', trips: [] })

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'trips'),
      (snap) => {
        const trips = snap.docs
          .map((d) => ({ ...(d.data() as TripDoc), id: d.id }))
          .sort((a, b) => {
            const ta = a.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
            const tb = b.createdAt?.toMillis() ?? Number.MAX_SAFE_INTEGER
            return tb - ta
          })
        setState({ status: 'ok', trips })
      },
      () => {
        setState({ status: 'error', trips: [] })
      },
    )
    return () => unsubscribe()
  }, [])

  return state
}

/**
 * Tạo chuyến đi mới cùng ảnh QR MoMo tĩnh của các thành viên trong một `writeBatch` nguyên tử.
 *
 * @param firestore - Thực thể Firestore (truyền vào để test được trên Emulator)
 * @param input - Thông tin chuyến đi và danh sách thành viên
 * @param qrs - Bản đồ `memberId -> dataUrl` cho những thành viên có ảnh QR MoMo tĩnh
 * @returns Mã `tripId` ngẫu nhiên 10 ký tự vừa tạo
 */
export async function createTrip(
  firestore: Firestore,
  input: TripInput,
  qrs: Record<string, string>,
): Promise<string> {
  const tripId = randomId(10)
  const members = input.members.map(sanitizeMember)
  const memberIds = members.map((m) => m.id)

  const tripData: Record<string, unknown> = {
    name: input.name.trim(),
    members,
    memberIds,
    allowGuestExpenses: input.allowGuestExpenses,
    locked: input.locked,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  const startDate = input.startDate?.trim()
  const endDate = input.endDate?.trim()
  if (startDate) tripData.startDate = startDate
  if (endDate) tripData.endDate = endDate

  // Ghi trip và toàn bộ memberQrs trong 1 batch (rules dùng existsAfter/getAfter để duyệt nguyên tử)
  const batch = writeBatch(firestore)
  batch.set(doc(firestore, 'trips', tripId), tripData)

  for (const [memberId, dataUrl] of Object.entries(qrs)) {
    if (dataUrl && memberIds.includes(memberId)) {
      batch.set(doc(firestore, 'trips', tripId, 'memberQrs', memberId), {
        dataUrl,
        updatedAt: serverTimestamp(),
      })
    }
  }

  await batch.commit()
  return tripId
}

/**
 * Cập nhật thông tin chuyến đi, đồng bộ `memberIds` và thêm/xóa `memberQrs` trong một `writeBatch`.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi cần cập nhật
 * @param input - Dữ liệu chuyến đi mới
 * @param qrs - Bản đồ thay đổi QR: chuỗi để ghi/cập nhật, `null` để xóa khỏi `memberQrs`
 */
export async function updateTrip(
  firestore: Firestore,
  tripId: string,
  input: TripInput,
  qrs: Record<string, string | null>,
): Promise<void> {
  const members = input.members.map(sanitizeMember)
  const memberIds = members.map((m) => m.id)
  const startDate = input.startDate?.trim()
  const endDate = input.endDate?.trim()

  const batch = writeBatch(firestore)
  batch.update(doc(firestore, 'trips', tripId), {
    name: input.name.trim(),
    // Dùng deleteField() khi người dùng xóa ngày để không lưu chuỗi rỗng (sai regex isDate trong rules)
    startDate: startDate || deleteField(),
    endDate: endDate || deleteField(),
    members,
    memberIds,
    allowGuestExpenses: input.allowGuestExpenses,
    locked: input.locked,
    updatedAt: serverTimestamp(),
  })

  for (const [memberId, dataUrl] of Object.entries(qrs)) {
    const qrRef = doc(firestore, 'trips', tripId, 'memberQrs', memberId)
    if (dataUrl === null) {
      batch.delete(qrRef)
    } else if (dataUrl && memberIds.includes(memberId)) {
      batch.set(qrRef, {
        dataUrl,
        updatedAt: serverTimestamp(),
      })
    }
  }

  await batch.commit()
}

/**
 * Xóa hoàn toàn một chuyến đi cùng toàn bộ subcollection (`expenses`, `payments`, `memberQrs`).
 * Firestore không tự xóa subcollection khi xóa document cha nên phải chia batch tối đa 450 thao tác.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi cần xóa
 */
export async function deleteTripCascade(firestore: Firestore, tripId: string): Promise<void> {
  const [expensesSnap, paymentsSnap, qrsSnap] = await Promise.all([
    getDocs(collection(firestore, 'trips', tripId, 'expenses')),
    getDocs(collection(firestore, 'trips', tripId, 'payments')),
    getDocs(collection(firestore, 'trips', tripId, 'memberQrs')),
  ])

  const refs: DocumentReference[] = [
    ...expensesSnap.docs.map((d) => d.ref),
    ...paymentsSnap.docs.map((d) => d.ref),
    ...qrsSnap.docs.map((d) => d.ref),
    // Đặt document cha cuối cùng để các subcollection được dọn sạch trước
    doc(firestore, 'trips', tripId),
  ]

  const BATCH_LIMIT = 450
  for (let i = 0; i < refs.length; i += BATCH_LIMIT) {
    const batch = writeBatch(firestore)
    for (const ref of refs.slice(i, i + BATCH_LIMIT)) {
      batch.delete(ref)
    }
    await batch.commit()
  }
}
