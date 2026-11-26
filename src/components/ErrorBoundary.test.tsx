// @vitest-environment jsdom
/**
 * Kiểm thử `ErrorBoundary` gốc trên jsdom: hiển thị bình thường khi không có lỗi,
 * và hiện màn hình dự phòng kèm nút "Tải lại trang" khi cây component con ném lỗi.
 */
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ErrorBoundary } from './ErrorBoundary'

/** Component giả lập ném lỗi ngay khi render để kích hoạt `ErrorBoundary`. */
function CrashComponent(): never {
  throw new Error('Render crash')
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ErrorBoundary', () => {
  it('hiển thị nguyên vẹn nội dung con khi không phát sinh lỗi', () => {
    render(
      <ErrorBoundary>
        <div>Nội dung an toàn</div>
      </ErrorBoundary>,
    )

    expect(screen.getByText('Nội dung an toàn')).toBeInTheDocument()
  })

  it('bắt lỗi render của component con và hiển thị nút "Tải lại trang"', () => {
    // Tắt in stack trace mặc định của React khi test ErrorBoundary
    vi.spyOn(console, 'error').mockImplementation(() => {})

    render(
      <ErrorBoundary>
        <CrashComponent />
      </ErrorBoundary>,
    )

    expect(screen.getByText('Ứng dụng vừa gặp lỗi không mong muốn')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tải lại trang' })).toBeInTheDocument()
  })
})
