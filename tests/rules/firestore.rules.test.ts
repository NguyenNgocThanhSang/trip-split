/**
 * Bộ kiểm thử tích hợp cho `firestore.rules` chạy trực tiếp trên Firestore Emulator.
 * Bao phủ đầy đủ ma trận phân quyền Khách (xác minh theo `memberSecrets`/`bindings`)/Admin,
 * tương thích dữ liệu cũ và các ràng buộc schema.
 */
import { assertFails, assertSucceeds, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  serverTimestamp,
  setDoc,
  setLogLevel,
  Timestamp,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  ADMIN_UID,
  makeEnv,
  seedBinding,
  seedMemberSecret,
  seedTrip,
} from '../helpers/env'

const TRIP_ID = 'k3x9p2qm7a'
// Mã bí mật >= 12 ký tự [a-z0-9] cho từng thành viên mẫu
const CODE_CHUNG = 'chungcode1234'
const CODE_CHUNG_NEW = 'chungnew56789'
const CODE_MO = 'mosecret12345'
const CODE_SANG = 'sangcode12345'
const UID_CHUNG_1 = 'anon-chung-1'
const UID_CHUNG_2 = 'anon-chung-2'
const UID_MO = 'anon-mo-1'
const UID_UNBOUND = 'anon-unbound'

// Ảnh data URL base64 tối thiểu hợp lệ dùng trong test trường QR tĩnh
const SAMPLE_QR_DATA_URL = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='

let env: RulesTestEnvironment

const unauthDb = () => env.unauthenticatedContext().firestore()
const authDb = (uid: string) => env.authenticatedContext(uid).firestore()
const adminDb = () => env.authenticatedContext(ADMIN_UID).firestore()
const otherGoogleDb = () => env.authenticatedContext('random-google-uid').firestore()

function validExpensePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ăn sáng',
    amount: 190000,
    payerId: 'sang',
    participantIds: ['sang', 'chung', 'mo', 'phung'],
    fixedAmounts: { chung: 45000, mo: 45000 },
    note: '',
    date: '2026-12-20',
    createdBy: 'guest',
    createdByUid: UID_CHUNG_1,
    createdByMemberId: 'chung',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

function legacyGuestExpensePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Ăn tối đợt cũ',
    amount: 120000,
    payerId: 'sang',
    participantIds: ['sang', 'chung'],
    fixedAmounts: {},
    note: '',
    date: '2026-12-20',
    createdBy: 'guest',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

function adminExpensePayload(overrides: Record<string, unknown> = {}) {
  return {
    name: 'Nhà nghỉ',
    amount: 575000,
    payerId: 'sang',
    participantIds: ['sang', 'chung', 'mo', 'phung'],
    fixedAmounts: {},
    note: '',
    date: '2026-12-20',
    createdBy: 'admin',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    ...overrides,
  }
}

function validPaymentPayload(overrides: Record<string, unknown> = {}) {
  return {
    fromId: 'chung',
    toId: 'sang',
    amount: 273750,
    note: 'Chuyển khoản Vietcombank',
    markedBy: 'guest',
    createdByUid: UID_CHUNG_1,
    createdByMemberId: 'chung',
    paidAt: serverTimestamp(),
    ...overrides,
  }
}

function legacyGuestPaymentPayload(overrides: Record<string, unknown> = {}) {
  return {
    fromId: 'chung',
    toId: 'sang',
    amount: 100000,
    note: 'Ghi nhận bản cũ',
    markedBy: 'guest',
    paidAt: serverTimestamp(),
    ...overrides,
  }
}

function adminPaymentPayload(overrides: Record<string, unknown> = {}) {
  return {
    fromId: 'mo',
    toId: 'sang',
    amount: 150000,
    note: 'Admin xác nhận',
    markedBy: 'admin',
    paidAt: serverTimestamp(),
    ...overrides,
  }
}

async function seedBoundGuest(uid: string, memberId: string, code: string) {
  await seedMemberSecret(env, TRIP_ID, memberId, code)
  await seedBinding(env, TRIP_ID, uid, memberId, code)
}

beforeAll(async () => {
  setLogLevel('error')
  env = await makeEnv()
})

beforeEach(async () => {
  await env.clearFirestore()
})

afterAll(async () => {
  await env.cleanup()
})

describe('Firestore Security Rules', () => {
  describe('1. Quyền đọc và liệt kê trips', () => {
    it('cho phép khách ẩn danh/chưa đăng nhập get đúng 1 chuyến nhưng chặn list toàn bộ trips; admin list được', async () => {
      await seedTrip(env, TRIP_ID)
      await assertSucceeds(getDoc(doc(unauthDb(), 'trips', TRIP_ID)))
      await assertSucceeds(getDoc(doc(authDb(UID_UNBOUND), 'trips', TRIP_ID)))
      await assertFails(getDocs(collection(unauthDb(), 'trips')))
      await assertFails(getDocs(collection(authDb(UID_UNBOUND), 'trips')))
      await assertSucceeds(getDocs(collection(adminDb(), 'trips')))
    })
  })

  describe('2. Bảo vệ dữ liệu chuyến, ảnh QR MoMo và danh bạ bạn bè', () => {
    it('chặn khách sửa thông tin chuyến, ghi memberQrs và đọc/ghi danh bạ friends', async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true })
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)

      // Chống khách (kể cả đã bind) tráo STK thành viên hoặc tự bật/tắt khóa sổ
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID), {
          members: [
            { id: 'sang', name: 'Sang', accountNo: '999999999', hasStaticQr: false },
            { id: 'chung', name: 'Chung', hasStaticQr: false },
          ],
          memberIds: ['sang', 'chung'],
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID), {
          allowGuestExpenses: false,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID), {
          locked: true,
          updatedAt: serverTimestamp(),
        }),
      )

      // Chống khách tráo ảnh QR tĩnh
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'memberQrs', 'sang'), {
          dataUrl: SAMPLE_QR_DATA_URL,
          updatedAt: serverTimestamp(),
        }),
      )

      // Chặn hoàn toàn khách và tài khoản Google lạ truy cập danh bạ cá nhân của admin
      await assertFails(getDoc(doc(unauthDb(), 'friends', 'sang')))
      await assertFails(getDoc(doc(authDb(UID_CHUNG_1), 'friends', 'sang')))
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'friends', 'sang'), {
          name: 'Sang',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(getDocs(collection(otherGoogleDb(), 'friends')))
    })
  })

  describe('3. Bảo vệ mã bí mật memberSecrets', () => {
    it('chỉ admin được CRUD memberSecrets (kể cả trong writeBatch tạo chuyến) và chặn toàn bộ khách', async () => {
      const admin = adminDb()
      const batch = writeBatch(admin)
      batch.set(doc(admin, 'trips', TRIP_ID), {
        name: 'Đà Lạt 2026',
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: true },
          { id: 'chung', name: 'Chung', hasStaticQr: false },
        ],
        memberIds: ['sang', 'chung'],
        allowGuestExpenses: false,
        locked: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      })
      batch.set(doc(admin, 'trips', TRIP_ID, 'memberQrs', 'sang'), {
        dataUrl: SAMPLE_QR_DATA_URL,
        updatedAt: serverTimestamp(),
      })
      batch.set(doc(admin, 'trips', TRIP_ID, 'memberSecrets', 'sang'), {
        code: CODE_SANG,
        updatedAt: serverTimestamp(),
      })
      batch.set(doc(admin, 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
        code: CODE_CHUNG,
        updatedAt: serverTimestamp(),
      })
      await assertSucceeds(batch.commit())

      // Admin đọc, liệt kê, xoay mã và xóa được
      await assertSucceeds(getDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung')))
      await assertSucceeds(getDocs(collection(adminDb(), 'trips', TRIP_ID, 'memberSecrets')))
      await assertSucceeds(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: CODE_CHUNG_NEW,
          updatedAt: serverTimestamp(),
        }),
      )

      // Kiểm tra schema chặt của memberSecrets
      await assertFails(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: 'short123',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: 'CHUNGCODE1234',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'ghost'), {
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: CODE_CHUNG,
          extra: true,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: CODE_CHUNG,
          updatedAt: Timestamp.fromDate(new Date(2020, 0, 1)),
        }),
      )

      // Seed binding hợp lệ cho Chung để chứng minh khách đã bind vẫn không chạm được memberSecrets
      await seedBinding(env, TRIP_ID, UID_CHUNG_1, 'chung', CODE_CHUNG_NEW)

      await assertFails(getDoc(doc(unauthDb(), 'trips', TRIP_ID, 'memberSecrets', 'sang')))
      await assertFails(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'memberSecrets', 'sang')))
      await assertFails(getDocs(collection(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'memberSecrets')))
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: 'hackedcode1234',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'memberSecrets', 'chung')))

      await assertSucceeds(deleteDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'sang')))
    })
  })

  describe('4. Liên kết danh tính bindings/{uid}', () => {
    it('cho khách bind đúng mã, re-bind cùng UID khi đổi mã, phát hiện revoked khi get và chặn đọc/ghi trộm', async () => {
      await seedTrip(env, TRIP_ID)
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG)
      await seedMemberSecret(env, TRIP_ID, 'mo', CODE_MO)

      // Trước khi bind, khách được phép get bindings/{ownUid} (resource == null) để lắng nghe trạng thái
      await assertSucceeds(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))

      // Chặn chưa đăng nhập, sai UID, sai mã, thành viên ngoài chuyến, thiếu/thừa field, fake updatedAt và Admin tự bind
      await assertFails(
        setDoc(doc(unauthDb(), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_MO), {
          memberId: 'chung',
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
          code: 'wrongcode1234',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'ghost',
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
          code: CODE_CHUNG,
          extra: 1,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
          code: CODE_CHUNG,
          updatedAt: Timestamp.fromDate(new Date(2020, 0, 1)),
        }),
      )
      await assertFails(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'bindings', ADMIN_UID), {
          memberId: 'chung',
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )

      // Bind hợp lệ lần đầu
      await assertSucceeds(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))

      // Khách khác không được get bindings/{uid khác} hoặc list toàn bộ bindings (tránh lộ code)
      await assertFails(getDoc(doc(authDb(UID_MO), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))
      await assertFails(getDocs(collection(authDb(UID_MO), 'trips', TRIP_ID, 'bindings')))
      await assertSucceeds(getDocs(collection(adminDb(), 'trips', TRIP_ID, 'bindings')))

      // Admin tạo lại mã cho Chung -> binding cũ lập tức mất hiệu lực ngay cả khi get
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
      await assertFails(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))

      // Chung mở link mới trên cùng UID -> update (re-bind) thành công với mã mới hoặc đổi sang Mơ với mã Mơ
      await assertSucceeds(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
          code: CODE_CHUNG_NEW,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'mo',
          code: CODE_MO,
          updatedAt: serverTimestamp(),
        }),
      )

      // Khách tự xóa binding của mình được, Admin xóa binding bất kỳ được
      await assertSucceeds(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))
      await seedBinding(env, TRIP_ID, UID_MO, 'mo', CODE_MO)
      await assertSucceeds(deleteDoc(doc(adminDb(), 'trips', TRIP_ID, 'bindings', UID_MO)))
    })
  })

  describe('5. Thêm, sửa và xóa khoản chi (expenses)', () => {
    it('chỉ cho khách đã bind thêm/sửa/xóa khoản chi của chính thành viên mình khi allowGuestExpenses=true và chưa khóa', async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: false, locked: false })
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)
      await seedBoundGuest(UID_MO, 'mo', CODE_MO)

      // allowGuestExpenses = false -> chặn khách đã bind
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'e1'), validExpensePayload()),
      )

      // Bật allowGuestExpenses = true -> chặn chưa bind / chưa đăng nhập
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })
      await assertFails(
        setDoc(doc(unauthDb(), 'trips', TRIP_ID, 'expenses', 'eUnauth'), validExpensePayload()),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_UNBOUND), 'trips', TRIP_ID, 'expenses', 'eUnbound'),
          validExpensePayload({ createdByUid: UID_UNBOUND }),
        ),
      )

      // Khách đã bind là Chung tạo khoản chi hợp lệ
      await assertSucceeds(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), validExpensePayload()),
      )

      // Chặn giả mạo createdBy='admin', sai/thiếu createdByUid hoặc createdByMemberId, hoặc thành viên ngoài chuyến
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eFakeAdmin'),
          validExpensePayload({ createdBy: 'admin' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eMissingMeta'),
          legacyGuestExpensePayload(),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eSpoofUid'),
          validExpensePayload({ createdByUid: UID_MO }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eSpoofMember'),
          validExpensePayload({ createdByMemberId: 'mo' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eBadPayer'),
          validExpensePayload({ payerId: 'ghost' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eBadPart'),
          validExpensePayload({ participantIds: ['sang', 'ghost'], fixedAmounts: {} }),
        ),
      )

      // Seed thêm khoản do Mơ, Admin và khoản legacy không có metadata
      await env.withSecurityRulesDisabled(async (ctx) => {
        const rawDb = ctx.firestore()
        await setDoc(
          doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eMo'),
          validExpensePayload({ createdByUid: UID_MO, createdByMemberId: 'mo' }),
        )
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eAdmin'), adminExpensePayload())
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eLegacy'), legacyGuestExpensePayload())
      })

      // Chung đổi sang thiết bị/WebView khác (UID_CHUNG_2 cũng bind vào 'chung') -> vẫn sửa được khoản của Chung
      await seedBinding(env, TRIP_ID, UID_CHUNG_2, 'chung', CODE_CHUNG)
      await assertSucceeds(
        updateDoc(doc(authDb(UID_CHUNG_2), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          amount: 210000,
          updatedAt: serverTimestamp(),
        }),
      )

      // Chung không được sửa/xóa khoản của Mơ, của Admin, hoặc khoản legacy không có createdByMemberId
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eMo'), {
          amount: 1000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eMo')))
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eAdmin'), {
          amount: 1000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eAdmin')))
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eLegacy'), {
          amount: 1000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eLegacy')))

      // Không được đổi createdBy, createdByUid, createdByMemberId hoặc createdAt
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          createdBy: 'admin',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          createdByMemberId: 'mo',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          createdByUid: UID_MO,
          updatedAt: serverTimestamp(),
        }),
      )

      // Admin sửa và xóa được cả khoản legacy lẫn khoản khách mới; nhưng không được đổi trường nguồn tạo
      await assertSucceeds(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID, 'expenses', 'eLegacy'), {
          amount: 150000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          note: 'Admin sửa giúp',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          createdByMemberId: 'mo',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(deleteDoc(doc(adminDb(), 'trips', TRIP_ID, 'expenses', 'eLegacy')))

      // Sau khi Admin xoay mã Chung -> Chung mất quyền thêm/sửa/xóa ngay
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eRevoked'), validExpensePayload()),
      )
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          amount: 220000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung')))

      // Khôi phục mã cho Chung, chuyển sang khóa sổ -> khách vẫn bị chặn; mở lại -> Chung xóa được khoản của mình
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG)
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: true })
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eLocked'), validExpensePayload()),
      )
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })
      await assertSucceeds(deleteDoc(doc(authDb(UID_CHUNG_2), 'trips', TRIP_ID, 'expenses', 'eChung')))
    })
  })

  describe('6. Sổ cái thanh toán (payments)', () => {
    it('chỉ cho người trả hoặc người nhận đã bind ghi payment, chỉ người ghi hoàn tác được và chặn update hoàn toàn', async () => {
      await seedTrip(env, TRIP_ID, { locked: false })
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)
      await seedBoundGuest(UID_MO, 'mo', CODE_MO)

      // Khách chưa đăng nhập hoặc chưa bind bị chặn
      await assertFails(
        setDoc(doc(unauthDb(), 'trips', TRIP_ID, 'payments', 'pUnauth'), validPaymentPayload()),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_UNBOUND), 'trips', TRIP_ID, 'payments', 'pUnbound'),
          validPaymentPayload({ createdByUid: UID_UNBOUND }),
        ),
      )

      // Khách đã bind là Chung: ghi được Chung -> Sang (fromId == Chung) và Sang -> Chung (toId == Chung)
      await assertSucceeds(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pFromMe'),
          validPaymentPayload({ fromId: 'chung', toId: 'sang' }),
        ),
      )
      await assertSucceeds(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pToMe'),
          validPaymentPayload({ fromId: 'sang', toId: 'chung' }),
        ),
      )

      // Chặn Chung ghi payment cho cặp người thứ ba (Mơ -> Phụng)
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pThirdParty'),
          validPaymentPayload({ fromId: 'mo', toId: 'phung' }),
        ),
      )

      // Chặn chuyển cho chính mình, giả markedBy='admin', hoặc giả mạo createdByUid/createdByMemberId
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pSelf'),
          validPaymentPayload({ fromId: 'chung', toId: 'chung' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pFakeAdmin'),
          validPaymentPayload({ markedBy: 'admin' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pSpoofMember'),
          validPaymentPayload({ fromId: 'mo', toId: 'sang', createdByMemberId: 'mo' }),
        ),
      )

      // Seed payment do Mơ tạo (Mơ -> Chung), do Admin tạo và bản ghi legacy
      await env.withSecurityRulesDisabled(async (ctx) => {
        const rawDb = ctx.firestore()
        await setDoc(
          doc(rawDb, 'trips', TRIP_ID, 'payments', 'pByMo'),
          validPaymentPayload({
            fromId: 'mo',
            toId: 'chung',
            createdByUid: UID_MO,
            createdByMemberId: 'mo',
          }),
        )
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'payments', 'pAdmin'), adminPaymentPayload())
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'payments', 'pLegacy'), legacyGuestPaymentPayload())
      })

      // Cấm update payment với cả khách và admin
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pFromMe'), { amount: 100000 }),
      )
      await assertFails(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID, 'payments', 'pFromMe'), { amount: 100000 }),
      )

      // Chung không được xóa payment do Mơ ghi (dù Chung là toId), payment Admin, hoặc payment legacy
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pByMo')))
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pAdmin')))
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pLegacy')))

      // Chung đổi sang UID thứ hai cũng bind vào 'chung' -> vẫn hoàn tác được payment do Chung ghi
      await seedBinding(env, TRIP_ID, UID_CHUNG_2, 'chung', CODE_CHUNG)
      await assertSucceeds(deleteDoc(doc(authDb(UID_CHUNG_2), 'trips', TRIP_ID, 'payments', 'pFromMe')))

      // Xoay mã Chung -> mất quyền ghi và hoàn tác ngay
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pRevoked'), validPaymentPayload()),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pToMe')))

      // Khóa sổ -> chặn khách ghi & hoàn tác; Admin vẫn tạo và xóa được mọi payment (kể cả legacy)
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG)
      await seedTrip(env, TRIP_ID, { locked: true })
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pLocked'), validPaymentPayload()),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pToMe')))
      await assertSucceeds(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'payments', 'pByAdmin'), adminPaymentPayload()),
      )
      await assertSucceeds(deleteDoc(doc(adminDb(), 'trips', TRIP_ID, 'payments', 'pLegacy')))
    })
  })

  describe('7. Kiểm tra schema chặt trên dữ liệu ghi', () => {
    it('chặn chuỗi vượt độ dài, số tiền âm/thập phân, field lạ, key ngoài participantIds và thời gian giả', async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)

      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'badLen'),
          validExpensePayload({ name: 'a'.repeat(101) }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'badNeg'),
          validExpensePayload({ amount: -100 }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'badFloat'),
          validExpensePayload({ amount: 100.5 }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'badExtra'),
          validExpensePayload({ hacked: true }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'badFixedKey'),
          validExpensePayload({ fixedAmounts: { ghost: 1 } }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'badTime'),
          validExpensePayload({ createdAt: Timestamp.fromDate(new Date(2020, 0, 1)) }),
        ),
      )
    })
  })

  describe('8. Quyền Admin và ràng buộc dữ liệu quản trị', () => {
    it('cho phép admin CRUD chuyến, memberQrs và danh bạ bạn bè hợp lệ, đồng thời chặn dữ liệu sai chuẩn', async () => {
      const validTrip = {
        name: 'Đà Lạt 2026',
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: true },
          { id: 'chung', name: 'Chung', hasStaticQr: false },
        ],
        memberIds: ['sang', 'chung'],
        allowGuestExpenses: false,
        locked: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      // Tạo trip hợp lệ với ID 10 ký tự thường/số
      await assertSucceeds(setDoc(doc(adminDb(), 'trips', TRIP_ID), validTrip))
      // Chặn ID không đúng chuẩn 10 ký tự thường/số hoặc ít hơn 2 thành viên
      await assertFails(setDoc(doc(adminDb(), 'trips', 'Dalat-2026'), validTrip))
      await assertFails(
        setDoc(doc(adminDb(), 'trips', 'a2b3c4d5e6'), {
          ...validTrip,
          members: [{ id: 'sang', name: 'Sang', hasStaticQr: false }],
          memberIds: ['sang'],
        }),
      )

      // Sửa trip hợp lệ được phép; sửa đổi createdAt bị chặn
      await assertSucceeds(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID), {
          locked: true,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID), {
          createdAt: Timestamp.fromDate(new Date(2020, 0, 1)),
          updatedAt: serverTimestamp(),
        }),
      )

      // Ghi ảnh QR tĩnh vào memberQrs cho thành viên thuộc chuyến
      await assertSucceeds(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberQrs', 'sang'), {
          dataUrl: SAMPLE_QR_DATA_URL,
          updatedAt: serverTimestamp(),
        }),
      )

      // Admin CRUD danh bạ friends
      await assertSucceeds(
        setDoc(doc(adminDb(), 'friends', 'sang'), {
          name: 'Sang',
          bankBin: '970436',
          bankShortName: 'Vietcombank',
          accountNo: '0123456789',
          accountName: 'NGUYEN NGOC SANG',
          momoQrDataUrl: SAMPLE_QR_DATA_URL,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(adminDb(), 'friends', 'badBin'), {
          name: 'Chung',
          bankBin: '97043',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        setDoc(doc(adminDb(), 'friends', 'badQr'), {
          name: 'Mơ',
          momoQrDataUrl: 'http://x',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(deleteDoc(doc(adminDb(), 'friends', 'sang')))
    })
  })

  describe('9. Mặc định chặn mọi collection khác', () => {
    it('chặn ghi vào đường dẫn ngoài danh sách collection được phép kể cả với admin', async () => {
      await assertFails(setDoc(doc(adminDb(), 'other', 'x'), { hello: 'world' }))
    })
  })
})
