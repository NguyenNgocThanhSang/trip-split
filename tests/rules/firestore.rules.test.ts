/**
 * Bộ kiểm thử tích hợp cho `firestore.rules` chạy trực tiếp trên Firestore Emulator.
 * Bao phủ đầy đủ ma trận phân quyền Khách/Admin và các ràng buộc schema trong DESIGN.md §7 và §12.2.
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
} from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import { ADMIN_UID, makeEnv, seedTrip } from '../helpers/env'

const TRIP_ID = 'k3x9p2qm7a'
// Ảnh data URL base64 tối thiểu hợp lệ dùng trong test trường QR tĩnh
const SAMPLE_QR_DATA_URL = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='

let env: RulesTestEnvironment

const guestDb = () => env.unauthenticatedContext().firestore()
const adminDb = () => env.authenticatedContext(ADMIN_UID).firestore()
const otherUserDb = () => env.authenticatedContext('random-google-uid').firestore()

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
    paidAt: serverTimestamp(),
    ...overrides,
  }
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
    it('cho phép khách get đúng một chuyến đi khi biết ID nhưng chặn list toàn bộ trips', async () => {
      await seedTrip(env, TRIP_ID)
      await assertSucceeds(getDoc(doc(guestDb(), 'trips', TRIP_ID)))
      await assertFails(getDocs(collection(guestDb(), 'trips')))
      await assertSucceeds(getDocs(collection(adminDb(), 'trips')))
    })
  })

  describe('2. Bảo vệ dữ liệu chuyến, ảnh QR MoMo và danh bạ bạn bè', () => {
    it('chặn khách sửa thông tin chuyến, ghi memberQrs và đọc/ghi danh bạ friends', async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true })

      // Chống khách tráo STK thành viên hoặc tự bật/tắt khóa sổ
      await assertFails(
        updateDoc(doc(guestDb(), 'trips', TRIP_ID), {
          members: [
            { id: 'sang', name: 'Sang', accountNo: '999999999', hasStaticQr: false },
            { id: 'chung', name: 'Chung', hasStaticQr: false },
          ],
          memberIds: ['sang', 'chung'],
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(guestDb(), 'trips', TRIP_ID), {
          allowGuestExpenses: false,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(
        updateDoc(doc(guestDb(), 'trips', TRIP_ID), {
          locked: true,
          updatedAt: serverTimestamp(),
        }),
      )

      // Chống khách tráo ảnh QR tĩnh
      await assertFails(
        setDoc(doc(guestDb(), 'trips', TRIP_ID, 'memberQrs', 'sang'), {
          dataUrl: SAMPLE_QR_DATA_URL,
          updatedAt: serverTimestamp(),
        }),
      )

      // Chặn hoàn toàn khách (và tài khoản Google lạ) truy cập danh bạ cá nhân của admin
      await assertFails(getDoc(doc(guestDb(), 'friends', 'sang')))
      await assertFails(
        setDoc(doc(guestDb(), 'friends', 'sang'), {
          name: 'Sang',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(getDocs(collection(otherUserDb(), 'friends')))
    })
  })

  describe('3. Thêm khoản chi (expenses)', () => {
    it('chỉ cho khách thêm khoản chi khi allowGuestExpenses=true, chưa khóa và hợp lệ', async () => {
      // Mặc định allowGuestExpenses = false -> chặn khách
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: false, locked: false })
      await assertFails(
        setDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'e1'), validExpensePayload()),
      )

      // Bật allowGuestExpenses = true -> khách thêm được nếu createdBy='guest'
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })
      await assertSucceeds(
        setDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'e1'), validExpensePayload()),
      )

      // Chặn giả mạo createdBy='admin' hoặc tham chiếu thành viên không thuộc chuyến
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'e2'),
          validExpensePayload({ createdBy: 'admin' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'e3'),
          validExpensePayload({ payerId: 'ghost' }),
        ),
      )
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'e4'),
          validExpensePayload({ participantIds: ['sang', 'ghost'], fixedAmounts: {} }),
        ),
      )

      // Chuyến đã khóa -> chặn khách thêm
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: true })
      await assertFails(
        setDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'e5'), validExpensePayload()),
      )
    })
  })

  describe('4. Sửa và xóa khoản chi (expenses)', () => {
    it('chặn khách sửa/xóa khoản của admin và chặn đổi createdBy khi sửa khoản khách', async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })

      // Seed sẵn một khoản do admin tạo và một khoản do khách tạo
      await env.withSecurityRulesDisabled(async (ctx) => {
        const db = ctx.firestore()
        await setDoc(
          doc(db, 'trips', TRIP_ID, 'expenses', 'eAdmin'),
          validExpensePayload({ createdBy: 'admin' }),
        )
        await setDoc(
          doc(db, 'trips', TRIP_ID, 'expenses', 'eGuest'),
          validExpensePayload({ createdBy: 'guest' }),
        )
      })

      // Khách không được sửa/xóa khoản của admin dù allowGuestExpenses = true
      await assertFails(
        updateDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'eAdmin'), {
          amount: 1000,
          updatedAt: serverTimestamp(),
        }),
      )
      await assertFails(deleteDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'eAdmin')))

      // Khách sửa được khoản của khách khi giữ nguyên createdBy='guest' và createdAt
      await assertSucceeds(
        updateDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'eGuest'), {
          amount: 200000,
          updatedAt: serverTimestamp(),
        }),
      )
      // Khách cố đổi createdBy thành 'admin' -> bị chặn
      await assertFails(
        updateDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'eGuest'), {
          createdBy: 'admin',
          updatedAt: serverTimestamp(),
        }),
      )
      // Khách xóa được khoản do khách tạo
      await assertSucceeds(deleteDoc(doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'eGuest')))
    })
  })

  describe('5. Sổ cái thanh toán (payments)', () => {
    it('cho khách tạo/xóa payment của khách khi chưa khóa, nhưng cấm update mọi payment', async () => {
      await seedTrip(env, TRIP_ID, { locked: false })

      // Tạo payment hợp lệ
      await assertSucceeds(
        setDoc(doc(guestDb(), 'trips', TRIP_ID, 'payments', 'p1'), validPaymentPayload()),
      )
      // Không được chuyển cho chính mình
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'payments', 'pSelf'),
          validPaymentPayload({ toId: 'chung' }),
        ),
      )

      // Seed payment do admin đánh dấu
      await env.withSecurityRulesDisabled(async (ctx) => {
        await setDoc(
          doc(ctx.firestore(), 'trips', TRIP_ID, 'payments', 'pAdmin'),
          validPaymentPayload({ markedBy: 'admin' }),
        )
      })

      // Cấm update payment với cả khách và admin (muốn sửa phải xóa rồi tạo lại)
      await assertFails(
        updateDoc(doc(guestDb(), 'trips', TRIP_ID, 'payments', 'p1'), { amount: 100000 }),
      )
      await assertFails(
        updateDoc(doc(adminDb(), 'trips', TRIP_ID, 'payments', 'p1'), { amount: 100000 }),
      )

      // Khách không được xóa payment của admin; xóa được payment của khách
      await assertFails(deleteDoc(doc(guestDb(), 'trips', TRIP_ID, 'payments', 'pAdmin')))
      await assertSucceeds(deleteDoc(doc(guestDb(), 'trips', TRIP_ID, 'payments', 'p1')))

      // Khi chuyến đã khóa -> chặn khách tạo payment mới
      await seedTrip(env, TRIP_ID, { locked: true })
      await assertFails(
        setDoc(doc(guestDb(), 'trips', TRIP_ID, 'payments', 'p2'), validPaymentPayload()),
      )
    })
  })

  describe('6. Kiểm tra schema chặt trên dữ liệu ghi', () => {
    it('chặn chuỗi vượt độ dài, số tiền âm/thập phân, field lạ, key ngoài participantIds và thời gian giả', async () => {
      await seedTrip(env, TRIP_ID, { allowGuestExpenses: true, locked: false })

      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'badLen'),
          validExpensePayload({ name: 'a'.repeat(101) }),
        ),
      )
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'badNeg'),
          validExpensePayload({ amount: -100 }),
        ),
      )
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'badFloat'),
          validExpensePayload({ amount: 100.5 }),
        ),
      )
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'badExtra'),
          validExpensePayload({ hacked: true }),
        ),
      )
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'badFixedKey'),
          validExpensePayload({ fixedAmounts: { ghost: 1 } }),
        ),
      )
      await assertFails(
        setDoc(
          doc(guestDb(), 'trips', TRIP_ID, 'expenses', 'badTime'),
          validExpensePayload({ createdAt: Timestamp.fromDate(new Date(2020, 0, 1)) }),
        ),
      )
    })
  })

  describe('7. Quyền Admin và ràng buộc dữ liệu quản trị', () => {
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

  describe('8. Mặc định chặn mọi collection khác', () => {
    it('chặn ghi vào đường dẫn ngoài danh sách collection được phép kể cả với admin', async () => {
      await assertFails(setDoc(doc(adminDb(), 'other', 'x'), { hello: 'world' }))
    })
  })
})
