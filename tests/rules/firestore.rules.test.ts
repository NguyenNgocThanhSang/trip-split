/**
 * Bộ kiểm thử tích hợp cho `firestore.rules` chạy trực tiếp trên Firestore Emulator.
 * Mỗi `describe` kiểm thử một hành vi phân quyền độc lập (Khách theo binding, Admin, tương thích dữ liệu cũ và schema).
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
    beforeEach(async () => {
      await seedTrip(env, TRIP_ID)
    })

    it('cho phép khách chưa đăng nhập hoặc ẩn danh get đúng 1 chuyến theo tripId', async () => {
      await assertSucceeds(getDoc(doc(unauthDb(), 'trips', TRIP_ID)))
      await assertSucceeds(getDoc(doc(authDb(UID_UNBOUND), 'trips', TRIP_ID)))
    })

    it('chặn khách list toàn bộ trips nhưng cho phép admin list', async () => {
      await assertFails(getDocs(collection(unauthDb(), 'trips')))
      await assertFails(getDocs(collection(authDb(UID_UNBOUND), 'trips')))
      await assertSucceeds(getDocs(collection(adminDb(), 'trips')))
    })
  })

  describe('2. Bảo vệ dữ liệu chuyến, ảnh QR MoMo và danh bạ bạn bè', () => {
    beforeEach(async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true })
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)
    })

    it('chặn khách đã bind sửa thông tin thành viên, STK hoặc cờ allowGuestExpenses/locked', async () => {
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
    })

    it('chặn khách ghi hoặc tráo ảnh QR tĩnh trong memberQrs', async () => {
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'memberQrs', 'sang'), {
          dataUrl: SAMPLE_QR_DATA_URL,
          updatedAt: serverTimestamp(),
        }),
      )
    })

    it('chặn khách chưa đăng nhập, khách đã bind và Google UID lạ đọc hoặc ghi danh bạ friends', async () => {
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
    it('cho phép admin tạo nguyên tử trips, memberQrs và memberSecrets trong cùng writeBatch', async () => {
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
    })

    it('cho phép admin đọc, list, xoay mã và xóa memberSecrets, đồng thời kiểm tra schema mã bí mật', async () => {
      await seedTrip(env, TRIP_ID)
      await assertSucceeds(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(getDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung')))
      await assertSucceeds(getDocs(collection(adminDb(), 'trips', TRIP_ID, 'memberSecrets')))
      await assertSucceeds(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung'), {
          code: CODE_CHUNG_NEW,
          updatedAt: serverTimestamp(),
        }),
      )

      // Chặn mã ngắn < 12 ký tự, chữ hoa, thành viên ngoài trip, field lạ hoặc updatedAt giả
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

      await assertSucceeds(deleteDoc(doc(adminDb(), 'trips', TRIP_ID, 'memberSecrets', 'chung')))
    })

    it('chặn hoàn toàn khách chưa đăng nhập và khách đã bind đọc/list/ghi/xóa memberSecrets', async () => {
      await seedTrip(env, TRIP_ID)
      await seedMemberSecret(env, TRIP_ID, 'sang', CODE_SANG)
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)

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
    })
  })

  describe('4. Liên kết danh tính bindings/{uid}', () => {
    beforeEach(async () => {
      await seedTrip(env, TRIP_ID)
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG)
      await seedMemberSecret(env, TRIP_ID, 'mo', CODE_MO)
    })

    it('cho phép khách get bindings/{ownUid} khi doc chưa tồn tại và chặn unauth get bindings/{uid}', async () => {
      await assertSucceeds(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))
      await assertFails(getDoc(doc(unauthDb(), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))
    })

    it('cho khách bind đúng mã, re-bind cùng UID sau khi đổi mã hoặc chuyển thành viên hợp lệ', async () => {
      await assertSucceeds(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
          code: CODE_CHUNG,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))

      // Xoay mã -> re-bind trên cùng UID bằng mã mới hoặc mã của thành viên khác hợp lệ
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
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
    })

    it('chặn bind khi chưa auth, sai UID, sai mã, thành viên ngoài chuyến, trip không tồn tại, thừa field, fake time hoặc Admin tự bind', async () => {
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
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', 'missing123', 'bindings', UID_CHUNG_1), {
          memberId: 'chung',
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
    })

    it('chặn khách đọc bindings/{uid khác} hoặc list toàn bộ bindings; cho admin đọc và list', async () => {
      await seedBinding(env, TRIP_ID, UID_CHUNG_1, 'chung', CODE_CHUNG)
      await assertFails(getDoc(doc(authDb(UID_MO), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))
      await assertFails(getDocs(collection(authDb(UID_MO), 'trips', TRIP_ID, 'bindings')))
      await assertSucceeds(getDocs(collection(adminDb(), 'trips', TRIP_ID, 'bindings')))
    })

    it('trả permission-denied khi khách get binding đã bị thu hồi mã hoặc đã bị gỡ khỏi trip.memberIds', async () => {
      await seedBinding(env, TRIP_ID, UID_CHUNG_1, 'chung', CODE_CHUNG)

      // Xoay mã -> binding cũ lập tức bị chặn khi get
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
      await assertFails(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))

      // Khôi phục mã nhưng gỡ Chung khỏi trip.memberIds (trong khi memberSecrets và binding vẫn còn) -> vẫn bị chặn
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG)
      await seedTrip(env, TRIP_ID, {
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: false },
          { id: 'mo', name: 'Mơ', hasStaticQr: false },
          { id: 'phung', name: 'Phụng', hasStaticQr: false },
        ],
        memberIds: ['sang', 'mo', 'phung'],
      })
      await assertFails(getDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))
    })

    it('cho chính chủ UID và admin xóa binding', async () => {
      await seedBinding(env, TRIP_ID, UID_CHUNG_1, 'chung', CODE_CHUNG)
      await seedBinding(env, TRIP_ID, UID_MO, 'mo', CODE_MO)

      await assertSucceeds(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'bindings', UID_CHUNG_1)))
      await assertSucceeds(deleteDoc(doc(adminDb(), 'trips', TRIP_ID, 'bindings', UID_MO)))
    })
  })

  describe('5. Thêm, sửa và xóa khoản chi (expenses)', () => {
    beforeEach(async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)
      await seedBoundGuest(UID_MO, 'mo', CODE_MO)
    })

    it('cho khách đã bind tạo khoản chi khi allowGuestExpenses=true và chuyến chưa khóa', async () => {
      await assertSucceeds(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), validExpensePayload()),
      )
    })

    it('chặn khách chưa auth, chưa bind, khi tắt allowGuestExpenses, khi khóa sổ hoặc khi bị thu hồi mã', async () => {
      await assertFails(
        setDoc(doc(unauthDb(), 'trips', TRIP_ID, 'expenses', 'eUnauth'), validExpensePayload()),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_UNBOUND), 'trips', TRIP_ID, 'expenses', 'eUnbound'),
          validExpensePayload({ createdByUid: UID_UNBOUND }),
        ),
      )

      await seedTrip(env, TRIP_ID, { allowGuestExpenses: false, locked: false })
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eDisabled'), validExpensePayload()),
      )

      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: true })
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eLocked'), validExpensePayload()),
      )

      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eRevoked'), validExpensePayload()),
      )
    })

    it('chặn khách giả mạo createdBy=admin, thiếu/sai createdByUid hoặc createdByMemberId, hoặc thành viên ngoài chuyến', async () => {
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
    })

    it('cho khách sửa/xóa khoản chi của chính memberId mình kể cả từ UID khác cùng bind vào thành viên đó', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'expenses', 'eChung'), validExpensePayload())
      })
      await seedBinding(env, TRIP_ID, UID_CHUNG_2, 'chung', CODE_CHUNG)

      await assertSucceeds(
        updateDoc(doc(authDb(UID_CHUNG_2), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          amount: 210000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(deleteDoc(doc(authDb(UID_CHUNG_2), 'trips', TRIP_ID, 'expenses', 'eChung')))
    })

    it('chặn khách sửa/xóa khoản của thành viên khác, của admin, khoản legacy, khi thu hồi mã hoặc đổi trường bất biến', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const rawDb = ctx.firestore()
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eChung'), validExpensePayload())
        await setDoc(
          doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eMo'),
          validExpensePayload({ createdByUid: UID_MO, createdByMemberId: 'mo' }),
        )
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eAdmin'), adminExpensePayload())
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eLegacy'), legacyGuestExpensePayload())
      })

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

      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          amount: 220000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung')))
    })

    it('chặn thành viên đã bị gỡ khỏi trip.memberIds (dù secret và binding vẫn còn) thao tác trên expenses', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'trips', TRIP_ID, 'expenses', 'eChung'),
          validExpensePayload({ payerId: 'sang', participantIds: ['sang', 'mo'], fixedAmounts: {} }),
        )
      })
      // Gỡ 'chung' khỏi trip.memberIds nhưng giữ nguyên memberSecrets/chung và bindings/UID_CHUNG_1
      await seedTrip(env, TRIP_ID, {
        allowGuestExpenses: true,
        locked: false,
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: false },
          { id: 'mo', name: 'Mơ', hasStaticQr: false },
          { id: 'phung', name: 'Phụng', hasStaticQr: false },
        ],
        memberIds: ['sang', 'mo', 'phung'],
      })

      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eNew'),
          validExpensePayload({ payerId: 'sang', participantIds: ['sang', 'mo'], fixedAmounts: {} }),
        ),
      )
      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung'), {
          amount: 250000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eChung')))
    })

    it('cho admin sửa khoản chi ngay cả sau khi thành viên tạo khoản đó (không nằm trong payer/participants) đã bị gỡ khỏi trip', async () => {
      // Chung tạo khoản cho Sang & Mơ (Chung không nằm trong payerId hay participantIds)
      await assertSucceeds(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'expenses', 'eByChung'),
          validExpensePayload({
            payerId: 'sang',
            participantIds: ['sang', 'mo'],
            fixedAmounts: {},
          }),
        ),
      )

      // Admin gỡ Chung khỏi chuyến
      await seedTrip(env, TRIP_ID, {
        allowGuestExpenses: true,
        locked: false,
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: false },
          { id: 'mo', name: 'Mơ', hasStaticQr: false },
          { id: 'phung', name: 'Phụng', hasStaticQr: false },
        ],
        memberIds: ['sang', 'mo', 'phung'],
      })

      // Admin vẫn sửa và xóa được khoản chi giữ nguyên createdByMemberId='chung'
      await assertSucceeds(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID, 'expenses', 'eByChung'), {
          amount: 250000,
          note: 'Đã chỉnh sau khi gỡ Chung',
          updatedAt: serverTimestamp(),
        }),
      )
      await assertSucceeds(deleteDoc(doc(adminDb(), 'trips', TRIP_ID, 'expenses', 'eByChung')))
    })

    it('cho admin tạo khoản admin và sửa/xóa khoản legacy nhưng vẫn khóa bất biến trường tác giả', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const rawDb = ctx.firestore()
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eChung'), validExpensePayload())
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'expenses', 'eLegacy'), legacyGuestExpensePayload())
      })

      await assertSucceeds(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'expenses', 'eByAdmin'), adminExpensePayload()),
      )
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
    })
  })

  describe('6. Sổ cái thanh toán (payments)', () => {
    beforeEach(async () => {
      await seedTrip(env, TRIP_ID, { locked: false })
      await seedBoundGuest(UID_CHUNG_1, 'chung', CODE_CHUNG)
      await seedBoundGuest(UID_MO, 'mo', CODE_MO)
    })

    it('cho khách đã bind ghi payment khi mình là người trả (fromId) hoặc người nhận (toId)', async () => {
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
    })

    it('chặn khách ghi payment cho cặp người thứ ba, chuyển cho chính mình, hoặc chưa đăng nhập / chưa bind', async () => {
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pThirdParty'),
          validPaymentPayload({ fromId: 'mo', toId: 'phung' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pSelf'),
          validPaymentPayload({ fromId: 'chung', toId: 'chung' }),
        ),
      )
      await assertFails(
        setDoc(doc(unauthDb(), 'trips', TRIP_ID, 'payments', 'pUnauth'), validPaymentPayload()),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_UNBOUND), 'trips', TRIP_ID, 'payments', 'pUnbound'),
          validPaymentPayload({ createdByUid: UID_UNBOUND }),
        ),
      )
    })

    it('chặn khách đã bind ghi payment thiếu createdByUid/createdByMemberId, giả mạo tác giả hoặc giả markedBy=admin', async () => {
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pMissingMeta'),
          legacyGuestPaymentPayload(),
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pMissingMember'),
          {
            fromId: 'chung',
            toId: 'sang',
            amount: 50000,
            note: '',
            markedBy: 'guest',
            createdByUid: UID_CHUNG_1,
            paidAt: serverTimestamp(),
          },
        ),
      )
      await assertFails(
        setDoc(
          doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pMissingUid'),
          {
            fromId: 'chung',
            toId: 'sang',
            amount: 50000,
            note: '',
            markedBy: 'guest',
            createdByMemberId: 'chung',
            paidAt: serverTimestamp(),
          },
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
    })

    it('cấm update mọi bản ghi payment kể cả với admin', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'payments', 'p1'), validPaymentPayload())
      })

      await assertFails(
        updateDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'p1'), { amount: 100000 }),
      )
      await assertFails(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID, 'payments', 'p1'), { amount: 100000 }),
      )
    })

    it('chỉ cho chính người ghi (kể cả qua UID thứ 2) hoàn tác payment của mình; chặn xóa payment của người khác, admin hoặc legacy', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        const rawDb = ctx.firestore()
        await setDoc(doc(rawDb, 'trips', TRIP_ID, 'payments', 'pByChung'), validPaymentPayload())
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

      // Chung không được xóa payment do Mơ ghi (dù Chung là toId), payment Admin, hoặc payment legacy
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pByMo')))
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pAdmin')))
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pLegacy')))

      // Chung dùng UID thứ 2 bind vào 'chung' -> vẫn hoàn tác được payment do Chung ghi
      await seedBinding(env, TRIP_ID, UID_CHUNG_2, 'chung', CODE_CHUNG)
      await assertSucceeds(deleteDoc(doc(authDb(UID_CHUNG_2), 'trips', TRIP_ID, 'payments', 'pByChung')))
    })

    it('chặn khách ghi/hoàn tác payment khi bị xoay mã, khi khóa sổ hoặc khi bị gỡ khỏi trip.memberIds', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'payments', 'pByChung'), validPaymentPayload())
      })

      // Xoay mã
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG_NEW)
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pRevoked'), validPaymentPayload()),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pByChung')))

      // Khôi phục mã nhưng khóa sổ -> khách bị chặn, Admin vẫn tạo & xóa được kể cả legacy
      await seedMemberSecret(env, TRIP_ID, 'chung', CODE_CHUNG)
      await seedTrip(env, TRIP_ID, { locked: true })
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pLocked'), validPaymentPayload()),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pByChung')))
      await assertSucceeds(
        setDoc(doc(adminDb(), 'trips', TRIP_ID, 'payments', 'pByAdmin'), adminPaymentPayload()),
      )

      // Mở khóa nhưng gỡ Chung khỏi trip.memberIds (trong khi secret + binding vẫn còn) -> vẫn bị chặn
      await seedTrip(env, TRIP_ID, {
        locked: false,
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: false },
          { id: 'mo', name: 'Mơ', hasStaticQr: false },
          { id: 'phung', name: 'Phụng', hasStaticQr: false },
        ],
        memberIds: ['sang', 'mo', 'phung'],
      })
      await assertFails(
        setDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pRemoved'), validPaymentPayload()),
      )
      await assertFails(deleteDoc(doc(authDb(UID_CHUNG_1), 'trips', TRIP_ID, 'payments', 'pByChung')))
    })

    it('cho admin xóa mọi payment kể cả bản ghi legacy không có metadata', async () => {
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(doc(ctx.firestore(), 'trips', TRIP_ID, 'payments', 'pLegacy'), legacyGuestPaymentPayload())
      })
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
