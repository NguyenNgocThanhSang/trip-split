/**
 * Bộ kiểm thử tích hợp cho lớp dữ liệu `src/data/*` chạy trực tiếp trên Firestore Emulator.
 * Kiểm tra ghi batch nguyên tử trip + memberQrs, xóa dây chuyền cascade và tương thích với firestore.rules.
 */
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { collection, doc, type Firestore, getDoc, getDocs, setLogLevel } from 'firebase/firestore'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { addExpense, deleteExpense, updateExpense } from '@/data/expenses'
import { deleteFriend, saveFriend } from '@/data/friends'
import {
  bindMemberWithCode,
  generateMissingSecrets,
  rotateMemberSecret,
} from '@/data/memberAccess'
import { getMemberQr } from '@/data/memberQrs'
import { addPayment, deletePayment } from '@/data/payments'
import { createTrip, deleteTripCascade, updateTrip } from '@/data/trips'
import type { MemberSecret } from '@/data/types'
import { ADMIN_UID, makeEnv, seedBinding, seedMemberSecret } from '../helpers/env'

const SAMPLE_QR = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='

let env: RulesTestEnvironment

function adminDb(): Firestore {
  return env.authenticatedContext(ADMIN_UID).firestore() as unknown as Firestore
}

function guestDb(): Firestore {
  return env.unauthenticatedContext().firestore() as unknown as Firestore
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

describe('Lớp dữ liệu Firestore (Emulator)', () => {
  it('createTrip tạo ID 10 ký tự, đồng bộ memberIds và ghi memberQrs trong cùng writeBatch', async () => {
    const db = adminDb()
    const tripId = await createTrip(
      db,
      {
        name: 'Đà Lạt 2026',
        startDate: '2026-12-20',
        endDate: '',
        members: [
          {
            id: 'sang',
            name: 'Sang',
            bankBin: '970436',
            bankShortName: 'Vietcombank',
            accountNo: '0123456789',
            accountName: 'NGUYEN NGOC SANG',
            hasStaticQr: true,
          },
          { id: 'chung', name: 'Chung', hasStaticQr: false },
        ],
        allowGuestExpenses: true,
        locked: false,
      },
      { sang: SAMPLE_QR },
    )

    expect(tripId).toMatch(/^[a-z0-9]{10}$/)

    const tripSnap = await getDoc(doc(db, 'trips', tripId))
    expect(tripSnap.exists()).toBe(true)
    const tripData = tripSnap.data()!
    expect(tripData.memberIds).toEqual(['sang', 'chung'])
    expect(tripData.startDate).toBe('2026-12-20')
    // Trường optional rỗng không được ghi vào document
    expect('endDate' in tripData).toBe(false)

    expect(await getMemberQr(guestDb(), tripId, 'sang')).toBe(SAMPLE_QR)
    expect(await getMemberQr(guestDb(), tripId, 'chung')).toBeNull()

    // createTrip tự sinh mã bí mật 12 ký tự cho từng thành viên trong cùng batch
    const sangSecret = await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'sang'))
    const chungSecret = await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'chung'))
    expect(sangSecret.data()?.code).toMatch(/^[a-z0-9]{12}$/)
    expect(chungSecret.data()?.code).toMatch(/^[a-z0-9]{12}$/)
  })

  it('updateTrip cập nhật memberIds, xóa startDate rỗng, đồng bộ QR và memberSecrets theo thành viên thêm/gỡ', async () => {
    const db = adminDb()
    const tripId = await createTrip(
      db,
      {
        name: 'Đà Lạt 2026',
        startDate: '2026-12-20',
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: true },
          { id: 'chung', name: 'Chung', hasStaticQr: false },
          { id: 'mo', name: 'Mơ', hasStaticQr: false },
        ],
        allowGuestExpenses: false,
        locked: false,
      },
      { sang: SAMPLE_QR },
    )
    const sangCodeBefore = (await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'sang'))).data()?.code
    const moCodeBefore = (await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'mo'))).data()?.code

    // Bỏ Chung, giữ Sang (xóa QR), thêm Phụng (có QR mới) trong 1 writeBatch
    await updateTrip(
      db,
      tripId,
      {
        name: 'Đà Lạt cuối năm',
        startDate: '',
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: false },
          { id: 'mo', name: 'Mơ', hasStaticQr: false },
          { id: 'phung', name: 'Phụng', hasStaticQr: true },
        ],
        allowGuestExpenses: true,
        locked: false,
      },
      { sang: null, phung: SAMPLE_QR },
      ['sang', 'chung', 'mo'],
    )

    const tripSnap = await getDoc(doc(db, 'trips', tripId))
    const data = tripSnap.data()!
    expect(data.name).toBe('Đà Lạt cuối năm')
    expect(data.memberIds).toEqual(['sang', 'mo', 'phung'])
    expect('startDate' in data).toBe(false)
    expect(await getMemberQr(db, tripId, 'sang')).toBeNull()
    expect(await getMemberQr(db, tripId, 'phung')).toBe(SAMPLE_QR)

    // Thành viên cũ giữ nguyên mã, thành viên bị gỡ bị xóa mã, thành viên mới có mã 12 ký tự
    expect((await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'sang'))).data()?.code).toBe(
      sangCodeBefore,
    )
    expect((await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'mo'))).data()?.code).toBe(
      moCodeBefore,
    )
    expect((await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'chung'))).exists()).toBe(false)
    expect((await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'phung'))).data()?.code).toMatch(
      /^[a-z0-9]{12}$/,
    )
  })

  it('addExpense và addPayment với quyền khách đã bind tuân thủ schema rules và ghi đúng tác giả', async () => {
    const db = adminDb()
    const tripId = await createTrip(
      db,
      {
        name: 'Vũng Tàu',
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: false },
          { id: 'chung', name: 'Chung', hasStaticQr: false },
        ],
        allowGuestExpenses: true,
        locked: false,
      },
      {},
    )

    const guestUid = 'guest-uid-chung'
    const guestIdentity = { uid: guestUid, memberId: 'chung' }
    await seedMemberSecret(env, tripId, 'chung', 'chungcode1234')
    await seedBinding(env, tripId, guestUid, 'chung', 'chungcode1234')

    const guest = env.authenticatedContext(guestUid).firestore() as unknown as Firestore
    await addExpense(
      guest,
      tripId,
      {
        name: 'Ăn sáng',
        amount: 100000,
        payerId: 'sang',
        participantIds: ['sang', 'chung'],
        fixedAmounts: {},
        note: '',
        date: '2026-12-20',
      },
      'guest',
      guestIdentity,
    )

    const expSnap = await getDocs(collection(guest, 'trips', tripId, 'expenses'))
    expect(expSnap.size).toBe(1)
    const expDoc = expSnap.docs[0]
    expect(expDoc.data().createdBy).toBe('guest')
    expect(expDoc.data().createdByUid).toBe(guestUid)
    expect(expDoc.data().createdByMemberId).toBe('chung')
    expect(Object.values(expDoc.data()).every((v) => v !== undefined)).toBe(true)

    await updateExpense(guest, tripId, expDoc.id, {
      name: 'Ăn sáng (đã sửa)',
      amount: 120000,
      payerId: 'sang',
      participantIds: ['sang', 'chung'],
      fixedAmounts: { chung: 50000 },
      note: 'thêm cà phê',
      date: '2026-12-20',
    })
    const updatedExp = await getDoc(doc(guest, 'trips', tripId, 'expenses', expDoc.id))
    expect(updatedExp.data()?.amount).toBe(120000)

    await addPayment(
      guest,
      tripId,
      { fromId: 'chung', toId: 'sang', amount: 50000, note: '' },
      'guest',
      guestIdentity,
    )
    const paySnap = await getDocs(collection(guest, 'trips', tripId, 'payments'))
    expect(paySnap.size).toBe(1)
    expect(paySnap.docs[0].data().markedBy).toBe('guest')
    expect(paySnap.docs[0].data().createdByUid).toBe(guestUid)
    expect(paySnap.docs[0].data().createdByMemberId).toBe('chung')

    await deletePayment(guest, tripId, paySnap.docs[0].id)
    expect((await getDocs(collection(guest, 'trips', tripId, 'payments'))).empty).toBe(true)

    await deleteExpense(guest, tripId, expDoc.id)
    expect((await getDocs(collection(guest, 'trips', tripId, 'expenses'))).empty).toBe(true)
  })

  it('generateMissingSecrets chỉ tạo mã cho thành viên thiếu và rotateMemberSecret thu hồi binding cũ', async () => {
    const db = adminDb()
    const tripId = await createTrip(
      db,
      {
        name: 'Nha Trang',
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: false },
          { id: 'chung', name: 'Chung', hasStaticQr: false },
        ],
        allowGuestExpenses: false,
        locked: false,
      },
      {},
    )
    const sangDoc = await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'sang'))
    const chungCode = (await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'chung'))).data()!.code as string

    // Khách bind bằng mã của Chung thành công
    const guestUid = 'anon-chung-rotate'
    const guest = env.authenticatedContext(guestUid).firestore() as unknown as Firestore
    await bindMemberWithCode(guest, tripId, guestUid, 'chung', chungCode)
    expect((await getDoc(doc(guest, 'trips', tripId, 'bindings', guestUid))).data()?.memberId).toBe('chung')

    // Chỉ có Sang trong existingSecrets -> generateMissingSecrets giữ nguyên Sang và tạo mã cho thành viên thiếu
    const existing: Record<string, MemberSecret> = {
      sang: { id: 'sang', ...(sangDoc.data() as { code: string; updatedAt: MemberSecret['updatedAt'] }) },
    }
    const createdCount = await generateMissingSecrets(db, tripId, ['sang', 'chung'], existing)
    expect(createdCount).toBe(1)
    expect((await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'sang'))).data()?.code).toBe(
      existing.sang.code,
    )

    // Xoay mã Chung -> mã mới khác mã cũ và binding cũ của Chung bị rules từ chối khi get
    const currentChungCode = (await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'chung'))).data()!.code as string
    const rotatedCode = await rotateMemberSecret(db, tripId, 'chung', currentChungCode)
    expect(rotatedCode).toMatch(/^[a-z0-9]{12}$/)
    expect(rotatedCode).not.toBe(currentChungCode)
    await expect(getDoc(doc(guest, 'trips', tripId, 'bindings', guestUid))).rejects.toThrow()
  })

  it('saveFriend và deleteFriend xử lý đúng các trường optional khi tạo và cập nhật', async () => {
    const db = adminDb()
    const friendId = await saveFriend(db, {
      name: 'Sang',
      bankBin: '970436',
      bankShortName: 'Vietcombank',
      accountNo: '0123456789',
      accountName: 'NGUYEN NGOC SANG',
      momoQrDataUrl: SAMPLE_QR,
    })

    await saveFriend(db, {
      id: friendId,
      name: 'Sang (mới)',
      bankBin: '',
      bankShortName: '',
      accountNo: '',
      accountName: '',
      momoQrDataUrl: '',
    })

    const updated = await getDoc(doc(db, 'friends', friendId))
    expect(updated.data()?.name).toBe('Sang (mới)')
    expect('bankBin' in updated.data()!).toBe(false)
    expect('momoQrDataUrl' in updated.data()!).toBe(false)

    await deleteFriend(db, friendId)
    expect((await getDoc(doc(db, 'friends', friendId))).exists()).toBe(false)
  })

  it('deleteTripCascade xóa sạch trip cùng toàn bộ expenses, payments và memberQrs', async () => {
    const db = adminDb()
    const tripId = await createTrip(
      db,
      {
        name: 'Phú Quốc',
        members: [
          { id: 'sang', name: 'Sang', hasStaticQr: true },
          { id: 'chung', name: 'Chung', hasStaticQr: false },
        ],
        allowGuestExpenses: false,
        locked: false,
      },
      { sang: SAMPLE_QR },
    )

    await addExpense(
      db,
      tripId,
      {
        name: 'Vé máy bay',
        amount: 2000000,
        payerId: 'sang',
        participantIds: ['sang', 'chung'],
        fixedAmounts: {},
        note: '',
        date: '2026-12-20',
      },
      'admin',
    )
    await addPayment(
      db,
      tripId,
      { fromId: 'chung', toId: 'sang', amount: 1000000, note: '' },
      'admin',
    )

    const chungCode = (await getDoc(doc(db, 'trips', tripId, 'memberSecrets', 'chung'))).data()!.code as string
    const guestUid = 'anon-chung-cascade'
    await bindMemberWithCode(
      env.authenticatedContext(guestUid).firestore() as unknown as Firestore,
      tripId,
      guestUid,
      'chung',
      chungCode,
    )

    await deleteTripCascade(db, tripId)

    expect((await getDoc(doc(db, 'trips', tripId))).exists()).toBe(false)
    // Sau khi trip cha bị xóa, tripExists(tripId) = false nên dùng withSecurityRulesDisabled để xác minh subcollection đã sạch
    await env.withSecurityRulesDisabled(async (ctx) => {
      const rawDb = ctx.firestore() as unknown as Firestore
      expect((await getDocs(collection(rawDb, 'trips', tripId, 'expenses'))).empty).toBe(true)
      expect((await getDocs(collection(rawDb, 'trips', tripId, 'payments'))).empty).toBe(true)
      expect((await getDocs(collection(rawDb, 'trips', tripId, 'memberQrs'))).empty).toBe(true)
      expect((await getDocs(collection(rawDb, 'trips', tripId, 'memberSecrets'))).empty).toBe(true)
      expect((await getDocs(collection(rawDb, 'trips', tripId, 'bindings'))).empty).toBe(true)
    })
  })
})
