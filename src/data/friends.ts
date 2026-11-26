/**
 * Lớp truy cập danh bạ bạn bè (`friends/{friendId}`) dành riêng cho Admin.
 * Lưu thông tin ngân hàng và ảnh QR MoMo tĩnh để tái sử dụng khi tạo nhiều chuyến đi.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  type Firestore,
  onSnapshot,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import { useEffect, useState } from 'react'
import { logError } from '@/lib/logger'
import { db } from './firebase'
import type { Friend, FriendDoc } from './types'

/** Dữ liệu đầu vào để tạo mới hoặc cập nhật một hồ sơ bạn bè trong danh bạ. */
export type FriendInput = Omit<Friend, 'id' | 'createdAt' | 'updatedAt'> & {
  /** Mã document khi cập nhật; bỏ trống để tạo hồ sơ mới. */
  id?: string
}

/** Kết quả trả về của hook `useFriends`. */
export interface FriendsState {
  /** Trạng thái tải danh bạ bạn bè. */
  status: 'loading' | 'ok' | 'error'
  /** Danh sách bạn bè đã sắp xếp theo tên tiếng Việt. */
  friends: Friend[]
}

/**
 * Lắng nghe realtime danh bạ bạn bè của Admin và sắp theo tên tiếng Việt (`'vi'`).
 *
 * @returns Trạng thái tải và danh sách `friends`
 */
export function useFriends(): FriendsState {
  const [state, setState] = useState<FriendsState>({ status: 'loading', friends: [] })

  useEffect(() => {
    const unsubscribe = onSnapshot(
      collection(db, 'friends'),
      (snap) => {
        const friends = snap.docs
          .map((d) => ({ ...(d.data() as FriendDoc), id: d.id }))
          .sort((a, b) => a.name.localeCompare(b.name, 'vi'))
        setState({ status: 'ok', friends })
      },
      (err) => {
        logError('friends.subscribe', err)
        setState({ status: 'error', friends: [] })
      },
    )
    return () => unsubscribe()
  }, [])

  return state
}

/**
 * Lưu mới hoặc cập nhật một người bạn trong `friends`.
 * Các trường tùy chọn rỗng sẽ được bỏ qua khi tạo mới hoặc xóa bằng `deleteField()` khi cập nhật
 * để không vi phạm quy tắc `isText` / `isQrDataUrl` trong `firestore.rules`.
 *
 * @param firestore - Thực thể Firestore
 * @param f - Dữ liệu bạn bè cần lưu
 * @returns Mã `id` của document vừa tạo hoặc cập nhật
 */
export async function saveFriend(firestore: Firestore, f: FriendInput): Promise<string> {
  const name = f.name.trim()
  const bankBin = f.bankBin?.trim()
  const bankShortName = f.bankShortName?.trim()
  const accountNo = f.accountNo?.trim()
  const accountName = f.accountName?.trim()
  const momoQrDataUrl = f.momoQrDataUrl?.trim()

  if (f.id) {
    await updateDoc(doc(firestore, 'friends', f.id), {
      name,
      bankBin: bankBin || deleteField(),
      bankShortName: bankShortName || deleteField(),
      accountNo: accountNo || deleteField(),
      accountName: accountName || deleteField(),
      momoQrDataUrl: momoQrDataUrl || deleteField(),
      updatedAt: serverTimestamp(),
    })
    return f.id
  }

  const payload: Record<string, unknown> = {
    name,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }
  if (bankBin) payload.bankBin = bankBin
  if (bankShortName) payload.bankShortName = bankShortName
  if (accountNo) payload.accountNo = accountNo
  if (accountName) payload.accountName = accountName
  if (momoQrDataUrl) payload.momoQrDataUrl = momoQrDataUrl

  const createdRef = await addDoc(collection(firestore, 'friends'), payload)
  return createdRef.id
}

/**
 * Xóa một hồ sơ bạn bè khỏi danh bạ `friends/{id}`.
 * Không ảnh hưởng đến các chuyến đi đã tạo vì `members` được snapshot trong mỗi `TripDoc`.
 *
 * @param firestore - Thực thể Firestore
 * @param id - Mã document bạn bè cần xóa
 */
export async function deleteFriend(firestore: Firestore, id: string): Promise<void> {
  await deleteDoc(doc(firestore, 'friends', id))
}
