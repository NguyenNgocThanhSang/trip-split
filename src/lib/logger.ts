/**
 * Tiện ích ghi log gọn nhẹ ra DevTools Console theo ngữ cảnh nghiệp vụ để hỗ trợ kiểm lỗi trên trình duyệt.
 * Hàm thuần — không import React hay Firebase; không truyền dữ liệu nhạy cảm (STK, QR) vào `meta`.
 */

/** Thông tin lỗi đã rút gọn gồm mã lỗi (nếu có) và thông điệp dễ đọc. */
export interface ErrorInfoSummary {
  /** Mã lỗi chuẩn của Firebase hoặc trình duyệt (vd: `"permission-denied"`). */
  code?: string
  /** Mô tả ngắn gọn nguyên nhân lỗi. */
  message: string
}

/** Dữ liệu bổ sung đính kèm log; chỉ chứa ID hoặc cờ kỹ thuật, tuyệt đối không chứa STK/QR. */
export type LogMeta = Record<string, string | number | boolean | undefined>

/** Kiểm tra có đang chạy trong môi trường test (`vitest`) hay không để giữ terminal kiểm thử sạch sẽ. */
function isTestMode(): boolean {
  return import.meta.env.MODE === 'test'
}

/**
 * Trích xuất mã lỗi và thông điệp an toàn từ một ngoại lệ bất kỳ (`FirebaseError`, `Error`, chuỗi...).
 *
 * @param error - Giá trị lỗi bắt được từ khối `catch`
 * @returns Đối tượng `{ code?, message }` gọn nhẹ, an toàn để in ra console
 * @example
 * extractErrorInfo({ code: 'permission-denied', message: 'Denied' })
 * // { code: 'permission-denied', message: 'Denied' }
 */
export function extractErrorInfo(error: unknown): ErrorInfoSummary {
  if (typeof error === 'object' && error !== null) {
    const record = error as { code?: unknown; message?: unknown }
    const code = typeof record.code === 'string' && record.code ? record.code : undefined
    const message =
      typeof record.message === 'string' && record.message
        ? record.message
        : error instanceof Error
          ? error.name
          : String(error)
    return code ? { code, message } : { message }
  }

  return {
    message: typeof error === 'string' && error ? error : String(error),
  }
}

/**
 * Ghi log lỗi ra `console.error` (hoạt động ở cả dev và production, tự tắt khi `MODE === 'test'`).
 *
 * @param context - Ngữ cảnh phát sinh lỗi (vd: `"trip.addPayment"`, `"friends.save"`)
 * @param error - Ngoại lệ bắt được
 * @param meta - Thông tin định danh hoặc cờ ngữ cảnh không nhạy cảm (tùy chọn)
 * @example
 * logError('trip.addPayment', new Error('Network error'), { tripId: 'abc123' })
 */
export function logError(context: string, error: unknown, meta?: LogMeta): void {
  if (isTestMode()) return
  const info = extractErrorInfo(error)
  if (meta) {
    console.error('[TripSplit]', context, info, meta)
  } else {
    console.error('[TripSplit]', context, info)
  }
}

/**
 * Ghi cảnh báo ra `console.warn` cho các lỗi không nghiêm trọng hoặc có fallback tự động (tắt khi test).
 *
 * @param context - Ngữ cảnh cảnh báo (vd: `"qr.vietqrImageError"`, `"useMe.storage"`)
 * @param message - Thông điệp mô tả tình huống bất thường
 * @param meta - Thông tin ngữ cảnh bổ sung không nhạy cảm (tùy chọn)
 * @example
 * logWarn('qr.vietqrImageError', 'Ảnh VietQR lỗi, chuyển sang chế độ copy chữ', { memberId: 'sang' })
 */
export function logWarn(context: string, message: string, meta?: LogMeta): void {
  if (isTestMode()) return
  if (meta) {
    console.warn('[TripSplit]', context, message, meta)
  } else {
    console.warn('[TripSplit]', context, message)
  }
}

/**
 * Ghi thông tin chẩn đoán ra `console.info`, chỉ bật trong môi trường `development` để giữ sạch console production.
 *
 * @param context - Ngữ cảnh chẩn đoán (vd: `"firebase.emulator"`)
 * @param message - Thông điệp thông tin
 * @param meta - Dữ liệu bổ sung không nhạy cảm (tùy chọn)
 * @example
 * logInfo('firebase.emulator', 'Đã kết nối Auth & Firestore Emulator')
 */
export function logInfo(context: string, message: string, meta?: LogMeta): void {
  if (isTestMode() || import.meta.env.MODE !== 'development') return
  if (meta) {
    console.info('[TripSplit]', context, message, meta)
  } else {
    console.info('[TripSplit]', context, message)
  }
}
