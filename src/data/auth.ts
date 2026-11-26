/**
 * Lớp xác thực quản trị viên dùng Firebase Auth (Google Sign-In bằng popup).
 * Chứa hàm thuần `adminStateFor`, hook `useAdmin` và các thao tác đăng nhập/đăng xuất.
 */
import { useEffect, useState } from 'react'
import {
  GoogleAuthProvider,
  onAuthStateChanged,
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
      /** Chưa có người dùng nào đăng nhập. */
      status: 'signed-out'
    }
  | {
      /** Đã đăng nhập nhưng UID không khớp với `VITE_ADMIN_UID`. */
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

/**
 * Suy luận trạng thái phân quyền quản trị từ thông tin người dùng hiện tại và UID admin cấu hình.
 * Tách thành hàm thuần để unit test độc lập mà không cần khởi tạo Firebase SDK.
 *
 * @param user Thông tin tối thiểu của người dùng Firebase Auth, hoặc `null` nếu chưa đăng nhập
 * @param adminUid UID quản trị viên kỳ vọng (thường lấy từ `import.meta.env.VITE_ADMIN_UID`)
 * @returns Trạng thái `AdminState` tương ứng
 */
export function adminStateFor(
  user: { uid: string; email: string | null } | null,
  adminUid: string,
): AdminState {
  if (user === null) {
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
          user ? { uid: user.uid, email: user.email } : null,
          configuredAdminUid,
        ),
      )
    })

    return unsubscribe
  }, [])

  return state
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
