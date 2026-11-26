/**
 * Trang chủ TripSplit (`/`).
 * Giới thiệu ngắn gọn cách sử dụng cho thành viên được mời qua liên kết và dẫn lối vào trang quản trị.
 */
import { Link } from 'react-router-dom'
import { ArrowRight, Wallet } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

/**
 * Trang chào mừng ở gốc ứng dụng (`/`).
 * Không liệt kê chuyến đi công khai để giữ riêng tư các liên kết chuyến đi của nhóm.
 *
 * @returns Giao diện chào mừng và nút điều hướng tới trang đăng nhập quản trị
 */
export function HomePage() {
  return (
    <div className="flex min-h-dvh flex-col justify-center gap-4 p-4">
      <Card>
        <CardHeader>
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Wallet className="size-5" />
            <span className="text-sm font-semibold">TripSplit</span>
          </div>
          <CardTitle className="text-xl">Chia tiền nhóm đi chơi gọn nhẹ</CardTitle>
          <CardDescription>
            Ghi nhận chi tiêu, chia đều hoặc tùy chỉnh theo từng người, tự động tối ưu số lần chuyển khoản kèm mã VietQR.
          </CardDescription>
        </CardHeader>

        <CardContent className="text-sm text-muted-foreground">
          <p>
            Nếu bạn là thành viên trong chuyến đi, hãy mở trực tiếp liên kết mà trưởng nhóm đã gửi (không cần đăng nhập).
          </p>
        </CardContent>

        <CardFooter>
          <Button asChild className="min-h-11 w-full">
            <Link to="/admin">
              Đăng nhập quản trị
              <ArrowRight />
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
