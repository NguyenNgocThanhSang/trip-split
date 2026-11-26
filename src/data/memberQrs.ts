/**
 * Lớp truy cập ảnh QR MoMo tĩnh của thành viên (`trips/{tripId}/memberQrs/{memberId}`).
 * Chỉ đọc một lần theo nhu cầu (`getDoc`) để không tốn lượt đọc khi chỉ dùng VietQR động.
 */
import { deleteDoc, doc, type Firestore, getDoc, serverTimestamp, setDoc } from 'firebase/firestore'
import type { MemberQrDoc } from './types'

/**
 * Đọc chuỗi data URL ảnh QR MoMo tĩnh của một thành viên trong chuyến đi.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param memberId - Mã thành viên
 * @returns Chuỗi `data:image/...;base64,...` hoặc `null` nếu thành viên không có ảnh QR tĩnh
 */
export async function getMemberQr(
  firestore: Firestore,
  tripId: string,
  memberId: string,
): Promise<string | null> {
  const snap = await getDoc(doc(firestore, 'trips', tripId, 'memberQrs', memberId))
  if (!snap.exists()) return null
  const data = snap.data() as MemberQrDoc
  return data.dataUrl || null
}

/**
 * Lưu hoặc xóa ảnh QR MoMo tĩnh của một thành viên trong `trips/{tripId}/memberQrs/{memberId}`.
 *
 * @param firestore - Thực thể Firestore
 * @param tripId - Mã chuyến đi
 * @param memberId - Mã thành viên thuộc `trip.memberIds`
 * @param dataUrl - Chuỗi data URL ảnh đã nén, hoặc `null` để xóa ảnh QR hiện có
 */
export async function setMemberQr(
  firestore: Firestore,
  tripId: string,
  memberId: string,
  dataUrl: string | null,
): Promise<void> {
  const ref = doc(firestore, 'trips', tripId, 'memberQrs', memberId)
  if (dataUrl === null) {
    await deleteDoc(ref)
    return
  }
  await setDoc(ref, {
    dataUrl,
    updatedAt: serverTimestamp(),
  })
}
