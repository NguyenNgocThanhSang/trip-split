/**
 * Lớp truy cập `memberSecrets` (chỉ Admin) và `bindings` (liên kết danh tính khách qua link cá nhân `?k=`).
 * Quản lý việc cấp/xoay mã bí mật cho thành viên và theo dõi trạng thái xác minh `BindingStatus` ở client.
 */
import {
  collection,
  doc,
  type Firestore,
  onSnapshot,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import { useCallback, useEffect, useState } from 'react'
import { randomId } from '@/lib/id'
import { logError, logWarn } from '@/lib/logger'
import type { BindingStatus } from '@/lib/permissions'
import { ensureAnonymousAuth, useAuthUser } from './auth'
import { db } from './firebase'
import type { MemberBindingDoc, MemberSecret, MemberSecretDoc } from './types'

/** Trạng thái tải danh sách mã bí mật thành viên `memberSecrets` dành riêng cho Admin. */
export interface MemberSecretsState {
  /** Trạng thái tải (`idle` khi không phải Admin, `loading`, `ok`, hoặc `error`). */
  status: 'idle' | 'loading' | 'ok' | 'error'
  /** Bản đồ `memberId -> MemberSecret` hiện có của chuyến đi. */
  secrets: Record<string, MemberSecret>
}

/** Kết quả trả về của hook `useMemberBinding` theo dõi danh tính ghi đã xác minh của khách. */
export interface MemberBindingState {
  /** Trạng thái liên kết danh tính hiện tại (`loading`, `unbound`, `bound`, `revoked`, `invalid`). */
  status: BindingStatus
  /** Mã thành viên đã được xác minh qua `bindings/{uid}`, hoặc `null` nếu chưa bind / đã bị thu hồi. */
  boundMemberId: string | null
  /** Firebase Auth UID dùng cho thao tác ghi của khách, hoặc `null` nếu chưa có phiên ẩn danh. */
  uid: string | null
  /** Thực hiện đăng nhập ẩn danh (nếu cần) và ghi `bindings/{uid}` bằng mã bí mật từ `?k=`. */
  bindWithKey: (memberId: string, code: string) => Promise<'bound' | 'invalid' | 'error'>
  /** Đánh dấu link `?k=` vừa mở là không hợp lệ (sai định dạng hoặc thành viên không thuộc chuyến). */
  markInvalidLink: () => void
}

interface SnapshotRecord {
  key: string
  status: 'bound' | 'missing' | 'revoked'
  memberId: string | null
}

/** Kiểm tra lỗi Firestore có phải `permission-denied` hay không. */
function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'permission-denied'
  )
}

/**
 * Lắng nghe realtime subcollection `trips/{tripId}/memberSecrets` khi `enabled = true` (chỉ Admin).
 *
 * @param tripId - Mã chuyến đi
 * @param enabled - Chỉ bật listener khi người dùng hiện tại là Admin
 * @returns Trạng thái tải và bản đồ `secrets` theo `memberId`
 */
export function useMemberSecrets(tripId: string, enabled: boolean): MemberSecretsState {
  const [entry, setEntry] = useState<{ key: string; state: MemberSecretsState }>({
    key: '',
    state: { status: 'idle', secrets: {} },
  })
  const activeKey = enabled && tripId ? tripId : ''

  useEffect(() => {
    if (!activeKey) {
      return
    }

    const unsubscribe = onSnapshot(
      collection(db, 'trips', activeKey, 'memberSecrets'),
      (snap) => {
        const secrets: Record<string, MemberSecret> = {}
        for (const docSnap of snap.docs) {
          secrets[docSnap.id] = {
            ...(docSnap.data() as MemberSecretDoc),
            id: docSnap.id,
          }
        }
        setEntry({ key: activeKey, state: { status: 'ok', secrets } })
      },
      (error) => {
        logError('memberSecrets.subscribe', error, { tripId: activeKey })
        setEntry({ key: activeKey, state: { status: 'error', secrets: {} } })
      },
    )

    return () => unsubscribe()
  }, [activeKey])

  if (!activeKey) {
    return { status: 'idle', secrets: {} }
  }
  return entry.key === activeKey ? entry.state : { status: 'loading', secrets: {} }
}

/**
 * Tạo mã bí mật ngẫu nhiên 12 ký tự cho những thành viên chưa có `memberSecrets/{id}`
 * (hữu ích cho các chuyến cũ tạo trước khi bật tính năng link cá nhân).
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param memberIds - Danh sách mã thành viên hiện tại của chuyến
 * @param existingSecrets - Bản đồ `memberSecrets` đang có để giữ nguyên mã cũ
 * @returns Số lượng thành viên vừa được tạo mã mới
 */
export async function generateMissingSecrets(
  firestore: Firestore,
  tripId: string,
  memberIds: string[],
  existingSecrets: Record<string, MemberSecret>,
): Promise<number> {
  const missingIds = memberIds.filter((id) => !Object.hasOwn(existingSecrets, id))
  if (missingIds.length === 0) {
    return 0
  }

  const batch = writeBatch(firestore)
  for (const memberId of missingIds) {
    batch.set(doc(firestore, 'trips', tripId, 'memberSecrets', memberId), {
      code: randomId(12),
      updatedAt: serverTimestamp(),
    })
  }
  await batch.commit()
  return missingIds.length
}

/**
 * Tạo lại (xoay vòng) mã bí mật mới cho một thành viên, làm vô hiệu hóa mọi link cá nhân cũ của người đó.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param memberId - Mã thành viên cần đổi mã
 * @param currentCode - Mã hiện tại (tùy chọn, dùng để bảo đảm mã mới khác mã cũ)
 * @returns Chuỗi mã bí mật 12 ký tự mới vừa lưu lên Firestore
 */
export async function rotateMemberSecret(
  firestore: Firestore,
  tripId: string,
  memberId: string,
  currentCode?: string,
): Promise<string> {
  let nextCode = randomId(12)
  // Đảm bảo mã mới khác hẳn mã cũ dù xác suất trùng của 31^12 gần như bằng 0
  while (nextCode === currentCode) {
    nextCode = randomId(12)
  }

  await setDoc(doc(firestore, 'trips', tripId, 'memberSecrets', memberId), {
    code: nextCode,
    updatedAt: serverTimestamp(),
  })
  return nextCode
}

/**
 * Ghi document `trips/{tripId}/bindings/{uid}` để xác nhận quyền ghi của khách cho `memberId`.
 * Firestore Rules sẽ kiểm tra `code` khớp với `memberSecrets/{memberId}.code`.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param uid - Firebase Auth UID của khách
 * @param memberId - Mã thành viên cần liên kết
 * @param code - Mã bí mật lấy từ `?k=`
 */
export async function bindMemberWithCode(
  firestore: Firestore,
  tripId: string,
  uid: string,
  memberId: string,
  code: string,
): Promise<void> {
  await setDoc(doc(firestore, 'trips', tripId, 'bindings', uid), {
    memberId,
    code,
    updatedAt: serverTimestamp(),
  })
}

/**
 * Hook quản lý liên kết danh tính ghi của khách cho chuyến đi `/t/:tripId`.
 * Tự động lắng nghe `bindings/{uid}` cho mọi phiên ẩn danh đã được Firebase khôi phục (kể cả khi mở link chung),
 * đồng thời hỗ trợ re-subscribe lại listener nếu người dùng mở link mới sau trạng thái `revoked`.
 *
 * @param tripId - Mã chuyến đi hiện tại
 * @param isAdmin - `true` nếu đang đăng nhập Google Admin (bỏ qua listener binding của khách)
 * @returns Trạng thái `MemberBindingState` và hàm `bindWithKey` / `markInvalidLink`
 */
export function useMemberBinding(tripId: string, isAdmin: boolean): MemberBindingState {
  const authUser = useAuthUser()
  const [subscribeEpoch, setSubscribeEpoch] = useState(0)
  const [snapshot, setSnapshot] = useState<SnapshotRecord | null>(null)
  const [invalidTripId, setInvalidTripId] = useState<string | null>(null)
  const [optimistic, setOptimistic] = useState<{
    tripId: string
    uid: string
    memberId: string
  } | null>(null)

  const anonUid =
    !isAdmin && authUser.status === 'ready' && authUser.uid && authUser.isAnonymous
      ? authUser.uid
      : null
  const activeKey = tripId && anonUid ? `${tripId}:${anonUid}:${subscribeEpoch}` : ''

  useEffect(() => {
    if (!activeKey || !tripId || !anonUid) {
      return
    }

    const unsubscribe = onSnapshot(
      doc(db, 'trips', tripId, 'bindings', anonUid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as MemberBindingDoc
          setSnapshot({ key: activeKey, status: 'bound', memberId: data.memberId })
        } else {
          setSnapshot({ key: activeKey, status: 'missing', memberId: null })
        }
      },
      (error) => {
        if (isPermissionDenied(error)) {
          logWarn('memberBinding.revoked', 'Liên kết cá nhân không còn khớp mã bí mật hiện tại', {
            tripId,
          })
          // Listener đã dừng sau permission-denied; giữ trạng thái revoked cho tới khi re-bind tăng subscribeEpoch
          setSnapshot({ key: activeKey, status: 'revoked', memberId: null })
        } else {
          logError('memberBinding.subscribe', error, { tripId })
          setSnapshot({ key: activeKey, status: 'missing', memberId: null })
        }
      },
    )

    return () => unsubscribe()
  }, [activeKey, tripId, anonUid])

  const markInvalidLink = useCallback(() => {
    if (tripId) {
      setInvalidTripId(tripId)
    }
  }, [tripId])

  const bindWithKey = useCallback(
    async (memberId: string, code: string): Promise<'bound' | 'invalid' | 'error'> => {
      if (!tripId) {
        return 'invalid'
      }
      try {
        const uid = await ensureAnonymousAuth()
        await bindMemberWithCode(db, tripId, uid, memberId, code)
        setInvalidTripId(null)
        setOptimistic({ tripId, uid, memberId })
        // Tăng epoch để gắn lại listener mới nếu phiên trước đó từng rơi vào trạng thái revoked (listener chết)
        setSubscribeEpoch((prev) => prev + 1)
        return 'bound'
      } catch (error) {
        if (isPermissionDenied(error)) {
          logWarn('memberBinding.invalidKey', 'Mã cá nhân trong URL bị rules từ chối', {
            tripId,
            memberId,
          })
          setInvalidTripId(tripId)
          setOptimistic(null)
          return 'invalid'
        }
        logError('memberBinding.bind', error, { tripId, memberId })
        return 'error'
      }
    },
    [tripId],
  )

  if (isAdmin) {
    return {
      status: 'unbound',
      boundMemberId: null,
      uid: null,
      bindWithKey,
      markInvalidLink,
    }
  }

  if (authUser.status === 'loading') {
    return {
      status: 'loading',
      boundMemberId: null,
      uid: null,
      bindWithKey,
      markInvalidLink,
    }
  }

  const hasInvalidLink = invalidTripId === tripId

  if (!anonUid) {
    return {
      status: hasInvalidLink ? 'invalid' : 'unbound',
      boundMemberId: null,
      uid: null,
      bindWithKey,
      markInvalidLink,
    }
  }

  if (snapshot && snapshot.key === activeKey) {
    if (snapshot.status === 'bound' && snapshot.memberId) {
      return {
        status: 'bound',
        boundMemberId: snapshot.memberId,
        uid: anonUid,
        bindWithKey,
        markInvalidLink,
      }
    }
    if (snapshot.status === 'revoked') {
      return {
        status: 'revoked',
        boundMemberId: null,
        uid: anonUid,
        bindWithKey,
        markInvalidLink,
      }
    }
    return {
      status: hasInvalidLink ? 'invalid' : 'unbound',
      boundMemberId: null,
      uid: anonUid,
      bindWithKey,
      markInvalidLink,
    }
  }

  if (optimistic && optimistic.tripId === tripId && optimistic.uid === anonUid) {
    return {
      status: 'bound',
      boundMemberId: optimistic.memberId,
      uid: anonUid,
      bindWithKey,
      markInvalidLink,
    }
  }

  return {
    status: 'loading',
    boundMemberId: null,
    uid: anonUid,
    bindWithKey,
    markInvalidLink,
  }
}
