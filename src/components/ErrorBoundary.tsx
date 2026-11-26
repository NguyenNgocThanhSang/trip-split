/**
 * Component `ErrorBoundary` gốc bọc toàn bộ tuyến đường ứng dụng.
 * Ngăn màn hình trắng khi phát sinh lỗi render bất ngờ, ghi log qua `logError` và cung cấp nút tải lại trang.
 */
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { logError } from '@/lib/logger'

/** Props của component `ErrorBoundary`. */
export interface ErrorBoundaryProps {
  /** Cây giao diện con cần được bảo vệ khỏi lỗi render. */
  children: ReactNode
}

/** Trạng thái nội bộ của `ErrorBoundary`. */
interface ErrorBoundaryState {
  /** `true` nếu cây component con vừa ném ngoại lệ trong lúc render. */
  hasError: boolean
}

/**
 * Bắt lỗi JavaScript không mong muốn trong cây component React con và hiển thị giao diện khôi phục.
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { hasError: false }

  /** Cập nhật state sang giao diện dự phòng ngay khi phát sinh lỗi render. */
  static getDerivedStateFromError(): ErrorBoundaryState {
    return { hasError: true }
  }

  /** Ghi lại ngữ cảnh component lỗi ra DevTools Console để dễ truy vết. */
  componentDidCatch(error: Error, info: ErrorInfo): void {
    logError('ui.errorBoundary', error, {
      componentStack: info.componentStack?.slice(0, 300),
    })
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-dvh flex-col justify-center gap-4 p-4">
          <Card>
            <CardHeader>
              <div className="mb-1 flex items-center gap-2 text-destructive">
                <AlertTriangle className="size-5" />
                <span className="text-sm font-semibold">Đã xảy ra sự cố</span>
              </div>
              <CardTitle className="text-xl">Ứng dụng vừa gặp lỗi không mong muốn</CardTitle>
              <CardDescription>
                Dữ liệu đã lưu trên máy chủ không bị ảnh hưởng. Bạn hãy tải lại trang để tiếp tục.
              </CardDescription>
            </CardHeader>
            <CardContent className="text-xs text-muted-foreground">
              Nếu lỗi vẫn lặp lại, hãy mở DevTools Console để xem chi tiết mã lỗi `[TripSplit]`.
            </CardContent>
            <CardFooter>
              <Button
                type="button"
                className="min-h-11 w-full"
                onClick={() => window.location.reload()}
              >
                <RefreshCw />
                Tải lại trang
              </Button>
            </CardFooter>
          </Card>
        </div>
      )
    }

    return this.props.children
  }
}
