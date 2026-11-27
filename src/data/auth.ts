/**
 * Lớp xác thực Firebase Auth dùng chung cho Admin (Google Sign-In popup) và khách (Anonymous Auth).
 * Chứa hàm thuần `adminStateFor`, các hook `useAdmin`/`useAuthUser` và thao tác đăng nhập/đăng xuất.
 */
import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
  signInAnonymously,
  signInWithPopup,
  signOut as firebaseSignOut,
} from 'firebase/auth'
import { auth } from './firebase'

/**
 * Trạng thái phân quyền quản trị viên ở phía giao diện.
 * Lưu ý: đây chỉ là trạng thái hiển thị UI; quyền thực tế do `firestore.rules` kiểm soát.
 */
export type AdminState =
  | {
      /** Đang chờ Firebase Auth khôi phục phiên đăng nhập ban đầu. */
      status: 'loading'
    }
  | {
      /** Chưa có người dùng Google nào đăng nhập (kể cả khi đang giữ phiên ẩn danh). */
      status: 'signed-out'
    }
  | {
      /** Đã đăng nhập Google nhưng UID không khớp với `VITE_ADMIN_UID`. */
      status: 'not-admin'
      /** Email của tài khoản Google vừa đăng nhập (nếu có) để người dùng nhận biết nhầm tài khoản. */
      email: string | null
    }
  | {
      /** Đã đăng nhập đúng tài khoản quản trị viên. */
      status: 'admin'
      /** Firebase Auth UID của quản trị viên. */
      uid: string
    }

/** Trạng thái phiên Firebase Auth hiện tại (bao gồm cả phiên ẩn danh của khách). */
export type AuthUserState =
  | {
      /** Đang chờ Firebase Auth khôi phục phiên từ IndexedDB. */
      status: 'loading'
    }
  | {
      /** Đã khôi phục xong phiên đăng nhập hiện tại. */
      status: 'ready'
      /** Firebase Auth UID nếu có phiên, hoặc `null` nếu chưa đăng nhập. */
      uid: string | null
      /** `true` nếu phiên hiện tại là tài khoản ẩn danh của khách. */
      isAnonymous: boolean
    }

/**
 * Suy luận trạng thái phân quyền quản trị từ thông tin người dùng hiện tại và UID admin cấu hình.
 * Phiên ẩn danh (`isAnonymous === true`) luôn trả `signed-out` để màn hình `/admin` vẫn hiện nút Google Sign-In.
 *
 * @param user Thông tin tối thiểu của người dùng Firebase Auth, hoặc `null` nếu chưa đăng nhập
 * @param adminUid UID quản trị viên kỳ vọng (thường lấy từ `import.meta.env.VITE_ADMIN_UID`)
 * @returns Trạng thái `AdminState` tương ứng
 */
export function adminStateFor(
  user: { uid: string; email: string | null; isAnonymous?: boolean } | null,
  adminUid: string,
): AdminState {
  if (user === null || user.isAnonymous === true) {
    return { status: 'signed-out' }
  }

  const expectedUid = adminUid.trim()
  // Nếu chưa cấu hình adminUid hoặc rỗng thì không bao giờ cấp quyền admin kể cả khi uid rỗng
  if (expectedUid.length > 0 && user.uid === expectedUid) {
    return { status: 'admin', uid: user.uid }
  }

  return {
    status: 'not-admin',
    email: user.email,
  }
}

/**
 * Hook theo dõi phiên đăng nhập Firebase Auth theo thời gian thực và đối chiếu với `VITE_ADMIN_UID`.
 *
 * @returns Trạng thái `AdminState` hiện tại (`loading`, `signed-out`, `not-admin` hoặc `admin`)
 */
export function useAdmin(): AdminState {
  const [state, setState] = useState<AdminState>({ status: 'loading' })

  useEffect(() => {
    const configuredAdminUid = import.meta.env.VITE_ADMIN_UID ?? ''

    // onAuthStateChanged luôn gọi callback bất đồng bộ khi khởi tạo và mỗi khi đổi phiên
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState(
        adminStateFor(
          user
            ? { uid: user.uid, email: user.email, isAnonymous: user.isAnonymous }
            : null,
          configuredAdminUid,
        ),
      )
    })

    return unsubscribe
  }, [])

  return state
}

/**
 * Hook theo dõi phiên Firebase Auth hiện tại (gồm cả phiên ẩn danh đã lưu trên máy).
 * Dùng để khôi phục liên kết danh tính khách khi mở lại link chung mà không tự gọi `signInAnonymously`.
 *
 * @returns Trạng thái `AuthUserState` hiện tại (`loading` hoặc `ready`)
 */
export function useAuthUser(): AuthUserState {
  const [state, setState] = useState<AuthUserState>({ status: 'loading' })

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setState({
        status: 'ready',
        uid: user ? user.uid : null,
        isAnonymous: user ? user.isAnonymous : false,
      })
    })
    return unsubscribe
  }, [])

  return state
}

/**
 * Đảm bảo có sẵn một phiên Firebase Auth UID trước khi khách thực hiện bind mã bí mật.
 * Chờ `authStateReady()` hoàn tất trước để không ghi đè phiên đăng nhập đã có (Admin hoặc phiên ẩn danh cũ).
 *
 * @returns Firebase Auth UID hiện có hoặc UID ẩn danh vừa tạo
 */
export async function ensureAnonymousAuth(): Promise<string> {
  await auth.authStateReady()
  if (auth.currentUser) {
    return auth.currentUser.uid
  }
  const credential = await signInAnonymously(auth)
  return credential.user.uid
}

/**
 * Mở cửa sổ popup đăng nhập Google bằng Firebase Auth.
 * Bắt buộc dùng `signInWithPopup` thay vì `signInWithRedirect` để tránh lỗi trên Safari iOS (DESIGN.md §7.4).
 *
 * @returns Promise hoàn tất sau khi người dùng xác nhận đăng nhập thành công
 * @throws FirebaseError Nếu người dùng đóng popup, trình duyệt chặn popup hoặc lỗi mạng
 */
export async function signInWithGoogle(): Promise<void> {
  const provider = new GoogleAuthProvider()
  await signInWithPopup(auth, provider)
}

/**
 * Đăng xuất tài khoản Google hiện tại khỏi Firebase Auth.
 *
 * @returns Promise hoàn tất sau khi phiên đăng nhập được xóa
 */
export async function signOut(): Promise<void> {
  await firebaseSignOut(auth)
}
