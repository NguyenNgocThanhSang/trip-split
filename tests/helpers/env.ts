/**
 * Tiện ích khởi tạo môi trường kiểm thử Firestore Security Rules trên Emulator.
 * Chỉ dùng cho test tích hợp trong thư mục `tests/`; không import vào mã nguồn ứng dụng `src/`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { doc, serverTimestamp, setDoc } from 'firebase/firestore'

const RULES_PATH = path.resolve(import.meta.dirname, '../../firestore.rules')

/**
 * Đọc UID quản trị viên trực tiếp từ `firestore.rules` để bộ test luôn đồng bộ
 * cả khi dùng giá trị giữ chỗ lẫn khi đã điền UID thật.
 */
function readAdminUidFromRules(): string {
  const rulesText = fs.readFileSync(RULES_PATH, 'utf8')
  const match = rulesText.match(/request\.auth\.uid == '([^']+)'/)
  if (!match) {
    throw new Error('Không tìm thấy biểu thức so sánh request.auth.uid trong firestore.rules')
  }
  return match[1]
}

/** UID quản trị viên đọc tự động từ `firestore.rules` (dùng cho context đăng nhập Admin trong test). */
export const ADMIN_UID: string = readAdminUidFromRules()

/**
 * Khởi tạo môi trường `RulesTestEnvironment` kết nối tới Firestore Emulator và nạp file `firestore.rules`.
 *
 * @returns Đối tượng môi trường test để tạo context khách/admin và dọn dữ liệu giữa các test
 */
export async function makeEnv(): Promise<RulesTestEnvironment> {
  const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST ?? '127.0.0.1:8080'
  const [host, portText] = emulatorHost.split(':')
  const port = Number(portText) || 8080
  const rules = fs.readFileSync(RULES_PATH, 'utf8')

  return initializeTestEnvironment({
    projectId: 'demo-tripsplit',
    firestore: { host, port, rules },
  })
}

/**
 * Tạo nhanh một chuyến đi mẫu hợp lệ bằng quyền bỏ qua security rules để phục vụ test.
 * Chuyến mặc định gồm 4 thành viên (`sang`, `chung`, `mo`, `phung`), `allowGuestExpenses: false`, `locked: false`.
 *
 * @param env - Môi trường test đang chạy trên Firestore Emulator
 * @param id - Mã chuyến đi (mặc định `'k3x9p2qm7a'`)
 * @param overrides - Các trường cần ghi đè so với chuyến mẫu mặc định
 */
export async function seedTrip(
  env: RulesTestEnvironment,
  id = 'k3x9p2qm7a',
  overrides: Record<string, unknown> = {},
): Promise<void> {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore()
    await setDoc(doc(db, 'trips', id), {
      name: 'Đà Lạt 2026',
      startDate: '2026-12-20',
      endDate: '2026-12-22',
      members: [
        {
          id: 'sang',
          name: 'Sang',
          bankBin: '970436',
          bankShortName: 'Vietcombank',
          accountNo: '0123456789',
          accountName: 'NGUYEN NGOC SANG',
          hasStaticQr: false,
        },
        { id: 'chung', name: 'Chung', hasStaticQr: false },
        { id: 'mo', name: 'Mơ', hasStaticQr: false },
        { id: 'phung', name: 'Phụng', hasStaticQr: false },
      ],
      memberIds: ['sang', 'chung', 'mo', 'phung'],
      allowGuestExpenses: false,
      locked: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      ...overrides,
    })
  })
}
