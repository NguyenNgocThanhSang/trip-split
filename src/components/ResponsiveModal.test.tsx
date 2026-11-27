// @vitest-environment jsdom
/**
 * Kiểm thử component `ResponsiveModal` cho chế độ desktop Dialog, mobile Drawer (`max-h-[85dvh]`)
 * và mobile fullscreen Radix Dialog kèm bù `paddingBottom` theo `visualViewport` cho bàn phím iOS Safari.
 */
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ResponsiveModal } from './ResponsiveModal'

function setViewportMatches(isDesktop: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: query === '(min-width: 768px)' ? isDesktop : false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

const originalVisualViewport = Object.getOwnPropertyDescriptor(window, 'visualViewport')
const originalInnerHeight = Object.getOwnPropertyDescriptor(window, 'innerHeight')

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
  if (originalVisualViewport) {
    Object.defineProperty(window, 'visualViewport', originalVisualViewport)
  } else {
    delete (window as { visualViewport?: VisualViewport }).visualViewport
  }
  if (originalInnerHeight) {
    Object.defineProperty(window, 'innerHeight', originalInnerHeight)
  }
})

describe('ResponsiveModal', () => {
  it('hiển thị Radix Dialog tiêu chuẩn trên desktop kể cả khi đặt mobileVariant="fullscreen"', () => {
    setViewportMatches(true)
    render(
      <ResponsiveModal open onOpenChange={vi.fn()} title="Thêm khoản chi" mobileVariant="fullscreen">
        <div>Nội dung</div>
      </ResponsiveModal>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
    expect(dialog.className).toContain('sm:max-w-md')
    expect(dialog.className).not.toContain('h-dvh')
  })

  it('trên mobile với mobileVariant="fullscreen" dùng Radix Dialog toàn màn hình và bù paddingBottom theo visualViewport', () => {
    setViewportMatches(false)
    const listeners: Record<string, Set<() => void>> = {
      resize: new Set(),
      scroll: new Set(),
    }
    const mockVisualViewport = {
      height: 800,
      offsetTop: 0,
      addEventListener: vi.fn((type: string, fn: () => void) => {
        listeners[type]?.add(fn)
      }),
      removeEventListener: vi.fn((type: string, fn: () => void) => {
        listeners[type]?.delete(fn)
      }),
    }
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: mockVisualViewport })

    render(
      <ResponsiveModal
        open
        onOpenChange={vi.fn()}
        title="Thêm khoản chi"
        mobileVariant="fullscreen"
        footer={<button type="button">Lưu</button>}
      >
        <div>Nội dung form</div>
      </ResponsiveModal>,
    )

    const dialog = screen.getByRole('dialog')
    expect(dialog).toHaveAttribute('data-slot', 'dialog-content')
    expect(dialog.className).toContain('inset-0')
    expect(dialog.className).toContain('h-dvh')
    expect(dialog.style.paddingBottom).toBe('')

    // Giả lập bàn phím iOS mở lên làm visualViewport.height co còn 480px trong khi innerHeight vẫn là 800px
    act(() => {
      mockVisualViewport.height = 480
      for (const fn of listeners.resize) {
        fn()
      }
    })

    expect(dialog.style.paddingBottom).toBe('320px')
  })

  it('trên mobile mặc định dùng Drawer với max-h-[85dvh]', () => {
    setViewportMatches(false)
    render(
      <ResponsiveModal open onOpenChange={vi.fn()} title="Xác nhận đã chuyển">
        <div>Nội dung ngắn</div>
      </ResponsiveModal>,
    )

    const drawer = screen.getByRole('dialog')
    expect(drawer).toHaveAttribute('data-slot', 'drawer-content')
    expect(drawer.className).toContain('data-[vaul-drawer-direction=bottom]:max-h-[85dvh]')
  })
})
