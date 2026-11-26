// @vitest-environment jsdom
/**
 * Kiểm thử hàm `compressQrImage` trên môi trường jsdom (giả lập Image và Canvas 2D).
 * Kiểm tra tỉ lệ thu nhỏ tối đa 600px, cơ chế giảm dần chất lượng/chuyển định dạng và ngưỡng `Ảnh quá lớn`.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { compressQrImage } from './image'

/**
 * Giả lập `URL.createObjectURL`, `URL.revokeObjectURL` và `Image` để `loadImageFromFile` hoàn tất đồng bộ trong jsdom.
 */
function mockBrowserImage(naturalWidth: number, naturalHeight: number) {
  const createObjectURL = vi.fn(() => 'blob:mock-qr')
  const revokeObjectURL = vi.fn()
  vi.stubGlobal('URL', { createObjectURL, revokeObjectURL })

  class MockImage {
    naturalWidth = naturalWidth
    naturalHeight = naturalHeight
    onload: (() => void) | null = null
    onerror: (() => void) | null = null

    set src(_value: string) {
      queueMicrotask(() => {
        this.onload?.()
      })
    }
  }

  vi.stubGlobal('Image', MockImage)
  return { revokeObjectURL }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('compressQrImage', () => {
  it('thu nhỏ cạnh dài nhất về tối đa 600px và giải phóng object URL sau khi vẽ', async () => {
    const { revokeObjectURL } = mockBrowserImage(1200, 800)
    const drawImage = vi.fn()
    const fillRect = vi.fn()

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect,
      drawImage,
    } as unknown as CanvasRenderingContext2D)

    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockReturnValue('data:image/webp;base64,AAA')

    const file = new File(['mock'], 'qr.png', { type: 'image/png' })
    const result = await compressQrImage(file, 100_000)

    expect(result).toBe('data:image/webp;base64,AAA')
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:mock-qr')
    // Tỉ lệ 600 / 1200 = 0.5 → kích thước canvas còn 600x400
    expect(fillRect).toHaveBeenCalledWith(0, 0, 600, 400)
    expect(drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 600, 400)
    expect(toDataURL).toHaveBeenCalledWith('image/webp', 0.9)
  })

  it('giảm dần quality và fallback sang jpeg nếu webp vẫn vượt ngưỡng maxChars', async () => {
    mockBrowserImage(400, 400)

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    const longWebp = `data:image/webp;base64,${'A'.repeat(200)}`
    const compactJpeg = 'data:image/jpeg;base64,OK'

    const toDataURL = vi
      .spyOn(HTMLCanvasElement.prototype, 'toDataURL')
      .mockImplementation((mime?: string, quality?: number) => {
        if (mime === 'image/webp') {
          return longWebp
        }
        if (mime === 'image/jpeg' && quality === 0.7) {
          return compactJpeg
        }
        return `data:image/jpeg;base64,${'B'.repeat(200)}`
      })

    const file = new File(['mock'], 'qr.jpg', { type: 'image/jpeg' })
    const result = await compressQrImage(file, 50)

    expect(result).toBe(compactJpeg)
    expect(toDataURL).toHaveBeenCalledWith('image/jpeg', 0.7)
  })

  it('ném lỗi "Ảnh quá lớn" khi mọi mức nén đều vượt maxChars', async () => {
    mockBrowserImage(600, 600)

    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      fillStyle: '',
      fillRect: vi.fn(),
      drawImage: vi.fn(),
    } as unknown as CanvasRenderingContext2D)

    vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(
      (mime?: string) => `data:${mime ?? 'image/png'};base64,${'X'.repeat(500)}`,
    )

    const file = new File(['mock'], 'huge.png', { type: 'image/png' })
    await expect(compressQrImage(file, 100)).rejects.toThrow('Ảnh quá lớn')
  })
})
