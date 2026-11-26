/**
 * Khởi tạo Firebase App, Auth và Cloud Firestore kèm bộ nhớ đệm offline (IndexedDB)
 * và kết nối Emulator khi bật `VITE_USE_EMULATOR=true`.
 */
import { type FirebaseApp, getApps, initializeApp } from 'firebase/app'
import { type Auth, connectAuthEmulator, getAuth } from 'firebase/auth'
import {
  connectFirestoreEmulator,
  type Firestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
} from 'firebase/firestore'
import { logInfo } from '@/lib/logger'

// Firebase web config không phải bí mật; fallback demo giúp test/emulator chạy không cần .env.local
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'demo-api-key',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'demo-tripsplit.firebaseapp.com',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'demo-tripsplit',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:000000000000:web:demo',
}

/** Thực thể Firebase App dùng chung toàn ứng dụng. */
export const app: FirebaseApp = getApps()[0] ?? initializeApp(firebaseConfig)

/**
 * Thực thể Firestore dùng chung.
 * Bật `persistentLocalCache` + `persistentMultipleTabManager` trên trình duyệt để hỗ trợ xem/ghi khi mất sóng;
 * trong môi trường Node (không có `indexedDB`) khởi tạo mặc định để không lỗi import.
 */
export const db: Firestore =
  typeof indexedDB !== 'undefined'
    ? initializeFirestore(app, {
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      })
    : initializeFirestore(app, {})

/** Thực thể Firebase Auth dùng cho đăng nhập Google của Admin. */
export const auth: Auth = getAuth(app)

if (import.meta.env.VITE_USE_EMULATOR === 'true') {
  connectFirestoreEmulator(db, '127.0.0.1', 8080)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  logInfo('firebase.emulator', 'Đã kết nối Auth & Firestore Emulator (127.0.0.1)')
}

// Theo dõi trạng thái ghi chờ đồng bộ từ các listener đang mở của trang chuyến đi
const pendingWriteSources = new Map<string, boolean>()

/**
 * Cập nhật trạng thái có thay đổi chưa đồng bộ từ một listener (`trip`, `expenses`, `payments`).
 *
 * @param source - Tên nguồn listener
 * @param pending - `true` nếu snapshot gần nhất có `metadata.hasPendingWrites`
 */
export function setPendingWritesSource(source: string, pending: boolean): void {
  if (pending) {
    pendingWriteSources.set(source, true)
  } else {
    pendingWriteSources.delete(source)
  }
}

/**
 * Kiểm tra xem hiện có thao tác ghi offline nào đang chờ đồng bộ lên Firestore hay không.
 *
 * @returns `true` nếu ít nhất một listener đang có `hasPendingWrites`
 */
export function getHasPendingWrites(): boolean {
  return pendingWriteSources.size > 0
}
