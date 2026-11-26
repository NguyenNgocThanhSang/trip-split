/**
 * Trang báo lỗi 404 (`*`) khi người dùng truy cập đường dẫn không tồn tại.
 */
import { Link } from 'react-router-dom'
import { Home } from 'lucide-react'
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
 * Màn hình 404 hiển thị khi đường dẫn không khớp route nào.
 *
 * @returns Thông báo không tìm thấy trang kèm nút quay về trang chủ
 */
export function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col justify-center gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-xl">Không tìm thấy trang</CardTitle>
          <CardDescription>
            Đường dẫn bạn mở không tồn tại hoặc đã bị thay đổi.
          </CardDescription>
        </CardHeader>

        <CardContent className="text-sm text-muted-foreground">
          <p>
            Nếu bạn đang mở liên kết chuyến đi của nhóm, hãy kiểm tra lại tin nhắn từ trưởng nhóm để chắc chắn không thiếu ký tự ở cuối đường dẫn.
          </p>
        </CardContent>

        <CardFooter>
          <Button asChild className="min-h-11 w-full">
            <Link to="/">
              <Home />
              Về trang chủ
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
