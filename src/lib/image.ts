/**
 * Tiện ích thu nhỏ và nén ảnh QR MoMo tĩnh trên trình duyệt bằng Canvas
 * để lưu vừa trong giới hạn 100.000 ký tự của `firestore.rules` mà không cần Cloud Storage.
 * Hàm thuần theo Web API — không import React hay Firebase.
 */

const MAX_QR_DIMENSION_PX = 600
const QR_QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4] as const
const QR_MIME_TYPES = ['image/webp', 'image/jpeg'] as const

/**
 * Tải một tệp ảnh sang đối tượng `HTMLImageElement` bằng Object URL và giải phóng URL sau khi đọc xong.
 *
 * @param file - Tệp ảnh người dùng chọn từ `<input type="file">`
 * @returns Promise chứa đối tượng ảnh đã nạp kích thước gốc
 * @throws Error Nếu tệp không đọc được dưới dạng ảnh hợp lệ
 */
function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file)
    const img = new Image()

    img.onload = () => {
      URL.revokeObjectURL(objectUrl)
      if (img.naturalWidth <= 0 || img.naturalHeight <= 0) {
        reject(new Error('Không đọc được ảnh. Vui lòng chọn tệp ảnh hợp lệ.'))
        return
      }
      resolve(img)
    }

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl)
      reject(new Error('Không đọc được ảnh. Vui lòng chọn tệp ảnh hợp lệ.'))
    }

    img.src = objectUrl
  })
}

/**
 * Thu nhỏ ảnh sao cho cạnh dài nhất tối đa 600px và nén lần lượt từ `webp` sang `jpeg`
 * với chất lượng giảm dần (`0.9` → `0.4`) cho tới khi độ dài chuỗi Data URL không vượt `maxChars`.
 *
 * @param file - Tệp ảnh QR MoMo tĩnh người dùng tải lên
 * @param maxChars - Số ký tự tối đa cho phép của chuỗi Data URL (mặc định `100_000` khớp `firestore.rules`)
 * @returns Chuỗi Data URL base64 (`data:image/webp;base64,...` hoặc `data:image/jpeg;base64,...`)
 * @throws Error Ném `Error('Ảnh quá lớn')` nếu mọi mức nén vẫn vượt `maxChars`, hoặc lỗi khi ảnh hỏng
 * @example
 * const dataUrl = await compressQrImage(file) // "data:image/webp;base64,..."
 */
export async function compressQrImage(file: File, maxChars = 100_000): Promise<string> {
  const img = await loadImageFromFile(file)
  const scale = Math.min(1, MAX_QR_DIMENSION_PX / Math.max(img.naturalWidth, img.naturalHeight))
  const width = Math.max(1, Math.round(img.naturalWidth * scale))
  const height = Math.max(1, Math.round(img.naturalHeight * scale))

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height

  const ctx = canvas.getContext('2d')
  if (!ctx) {
    throw new Error('Trình duyệt không hỗ trợ xử lý ảnh Canvas.')
  }

  // Tô nền trắng trước khi vẽ để ảnh PNG có vùng trong suốt không bị chuyển thành nền đen khi ép sang JPEG
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)

  for (const mime of QR_MIME_TYPES) {
    const prefix = `data:${mime};base64,`
    for (const quality of QR_QUALITIES) {
      const dataUrl = canvas.toDataURL(mime, quality)
      // Một số trình duyệt/jsdom không hỗ trợ encode webp và tự rơi về png — bỏ qua định dạng đó để thử jpeg
      if (!dataUrl.startsWith(prefix)) {
        break
      }
      if (dataUrl.length <= maxChars) {
        return dataUrl
      }
    }
  }

  throw new Error('Ảnh quá lớn')
}
