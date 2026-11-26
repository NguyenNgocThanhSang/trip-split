/**
 * Kiểm thử tiện ích ghi log (`logger.ts`): trích xuất mã/nội dung lỗi, tắt log khi chạy test
 * và chỉ in `logInfo` ở môi trường development.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { extractErrorInfo, logError, logInfo, logWarn } from './logger'

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
})

describe('extractErrorInfo', () => {
  it('trích xuất code và message từ lỗi Firebase hoặc object có code', () => {
    expect(
      extractErrorInfo({ code: 'permission-denied', message: 'Missing or insufficient permissions.' }),
    ).toEqual({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    })
  })

  it('trích xuất message từ Error chuẩn và chuỗi thường', () => {
    expect(extractErrorInfo(new Error('Ảnh quá lớn'))).toEqual({
      message: 'Ảnh quá lớn',
    })
    expect(extractErrorInfo('Lỗi bất ngờ')).toEqual({
      message: 'Lỗi bất ngờ',
    })
  })
})

describe('logger', () => {
  it('tự động im lặng mọi hàm log khi đang chạy Vitest (MODE === "test")', () => {
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    logError('trip.addPayment', new Error('boom'))
    logWarn('qr.copyField', 'Không copy được')
    logInfo('firebase.emulator', 'Đã kết nối')

    expect(errorSpy).not.toHaveBeenCalled()
    expect(warnSpy).not.toHaveBeenCalled()
    expect(infoSpy).not.toHaveBeenCalled()
  })

  it('ghi logError và logWarn kèm tiền tố [TripSplit] và ngữ cảnh khi không ở chế độ test', () => {
    vi.stubEnv('MODE', 'development')
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})

    logError('trip.addPayment', { code: 'permission-denied', message: 'Denied' }, { tripId: 'abc123' })
    logWarn('qr.vietqrImageError', 'Ảnh VietQR lỗi', { memberId: 'sang' })

    expect(errorSpy).toHaveBeenCalledWith(
      '[TripSplit]',
      'trip.addPayment',
      { code: 'permission-denied', message: 'Denied' },
      { tripId: 'abc123' },
    )
    expect(warnSpy).toHaveBeenCalledWith(
      '[TripSplit]',
      'qr.vietqrImageError',
      'Ảnh VietQR lỗi',
      { memberId: 'sang' },
    )
  })

  it('chỉ ghi logInfo ở development và im lặng ở production', () => {
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => {})

    vi.stubEnv('MODE', 'development')
    logInfo('firebase.emulator', 'Đã kết nối Emulator')
    expect(infoSpy).toHaveBeenCalledTimes(1)

    vi.stubEnv('MODE', 'production')
    logInfo('firebase.emulator', 'Không được phép in ở prod')
    expect(infoSpy).toHaveBeenCalledTimes(1)
  })
})
