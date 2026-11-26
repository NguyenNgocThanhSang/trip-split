/**
 * Hàm thuần sinh mã định danh ngẫu nhiên an toàn bằng `crypto.getRandomValues`.
 * Dùng làm Trip ID (capability token trong URL) nên tránh ký tự dễ nhìn nhầm và không lệch phân phối.
 * Hàm thuần — không import React hay Firebase.
 */

/** Bảng 31 ký tự cho phép trong Trip ID (đã bỏ `0`, `o`, `1`, `l`, `i` dễ nhầm khi đọc/gõ). */
export const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789'

/**
 * Sinh chuỗi ngẫu nhiên an toàn về mật mã từ `ID_ALPHABET`.
 * Áp dụng rejection sampling (loại byte `>= 248`, là bội lớn nhất của 31 trong `[0, 255]`)
 * để mọi ký tự có xác suất xuất hiện đồng đều tuyệt đối.
 *
 * @param length - Độ dài chuỗi cần sinh (mặc định `10`, phải là số nguyên `>= 1`)
 * @returns Chuỗi ngẫu nhiên chỉ gồm các ký tự trong `ID_ALPHABET`
 * @throws {RangeError} Khi `length` không phải số nguyên dương
 * @example
 * randomId() // "k3x9p2qm7a"
 */
export function randomId(length = 10): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError('Độ dài mã ngẫu nhiên phải là số nguyên >= 1')
  }

  // Bội lớn nhất của 31 nhỏ hơn 256 là 31 * 8 = 248; loại byte >= 248 để không bị lệch phân phối
  const alphabetSize = ID_ALPHABET.length
  const maxValidByte = Math.floor(256 / alphabetSize) * alphabetSize
  const result: string[] = []
  const buffer = new Uint8Array(Math.max(16, length * 2))

  while (result.length < length) {
    globalThis.crypto.getRandomValues(buffer)
    for (let i = 0; i < buffer.length && result.length < length; i++) {
      const byte = buffer[i]
      if (byte < maxValidByte) {
        result.push(ID_ALPHABET[byte % alphabetSize])
      }
    }
  }

  return result.join('')
}
