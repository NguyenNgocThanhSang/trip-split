/**
 * Màn hình đăng nhập quản trị viên (`/admin`).
 * Xử lý 4 trạng thái từ `useAdmin()`: đang kiểm tra, chưa đăng nhập, sai tài khoản admin và đã đăng nhập hợp lệ.
 */
import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { ArrowLeft, LogIn, LogOut, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { signInWithGoogle, signOut, useAdmin } from '@/data/auth'
import { logError, logWarn } from '@/lib/logger'

/**
 * Chuyển đổi mã lỗi Firebase Auth khi mở popup Google sang thông báo tiếng Việt dễ hiểu.
 *
 * @param error Lỗi ném ra từ `signInWithGoogle`
 * @returns Chuỗi thông báo tiếng Việt phù hợp để hiển thị bằng toast
 */
function getSignInErrorMessage(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : ''

  switch (code) {
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return 'Bạn đã đóng cửa sổ đăng nhập Google.'
    case 'auth/popup-blocked':
      return 'Trình duyệt đang chặn cửa sổ bật lên. Vui lòng cho phép popup rồi thử lại.'
    case 'auth/network-request-failed':
      return 'Không có kết nối mạng. Vui lòng kiểm tra và thử lại.'
    default:
      return 'Đăng nhập Google thất bại. Vui lòng thử lại.'
  }
}

/**
 * Trang đăng nhập quản trị viên TripSplit bằng Google Sign-In.
 * Tự động chuyển tới `/admin/trips` nếu đã xác thực đúng UID quản trị.
 *
 * @returns Giao diện đăng nhập, cảnh báo sai quyền hoặc điều hướng sang danh sách chuyến đi
 */
export function AdminLogin() {
  const admin = useAdmin()
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Đã đúng tài khoản quản trị thì đi thẳng vào danh sách chuyến đi
  if (admin.status === 'admin') {
    return <Navigate to="/admin/trips" replace />
  }

  /**
   * Kích hoạt popup đăng nhập Google và thông báo lỗi bằng toast tiếng Việt nếu thất bại.
   */
  async function handleSignIn() {
    setIsSubmitting(true)
    try {
      await signInWithGoogle()
    } catch (error) {
      const message = getSignInErrorMessage(error)
      if (message.includes('đóng cửa sổ')) {
        logWarn('auth.signIn', message)
      } else {
        logError('auth.signIn', error)
      }
      toast.error(message)
    } finally {
      setIsSubmitting(false)
    }
  }

  /**
   * Đăng xuất tài khoản không có quyền admin để người dùng chọn lại đúng tài khoản Google.
   */
  async function handleSignOut() {
    setIsSubmitting(true)
    try {
      await signOut()
      toast.success('Đã đăng xuất.')
    } catch (error) {
      logError('auth.signOut', error)
      toast.error('Không thể đăng xuất lúc này. Vui lòng thử lại.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-center gap-4 p-4">
      <Card>
        <CardHeader>
          <CardTitle>Quản trị TripSplit</CardTitle>
          <CardDescription>
            Đăng nhập bằng tài khoản Google quản trị để tạo chuyến đi, chỉnh sửa thành viên và quản lý danh bạ.
          </CardDescription>
        </CardHeader>

        <CardContent className="flex flex-col gap-4">
          {admin.status === 'loading' && (
            <div className="flex flex-col gap-3" aria-busy="true">
              <Skeleton className="h-11 w-full rounded-lg" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          )}

          {admin.status === 'signed-out' && (
            <Button
              type="button"
              className="min-h-11 w-full"
              onClick={handleSignIn}
              disabled={isSubmitting}
            >
              <LogIn />
              {isSubmitting ? 'Đang mở đăng nhập Google...' : 'Đăng nhập bằng Google'}
            </Button>
          )}

          {admin.status === 'not-admin' && (
            <>
              <Alert variant="destructive">
                <ShieldAlert />
                <AlertTitle>Tài khoản này không có quyền admin</AlertTitle>
                <AlertDescription>
                  {admin.email
                    ? `Bạn đang đăng nhập bằng ${admin.email}. Vui lòng đăng xuất và chọn đúng tài khoản quản trị.`
                    : 'Vui lòng đăng xuất và chọn đúng tài khoản quản trị.'}
                </AlertDescription>
              </Alert>

              <Button
                type="button"
                variant="outline"
                className="min-h-11 w-full"
                onClick={handleSignOut}
                disabled={isSubmitting}
              >
                <LogOut />
                {isSubmitting ? 'Đang đăng xuất...' : 'Đăng xuất'}
              </Button>
            </>
          )}
        </CardContent>

        <CardFooter>
          <Button asChild variant="ghost" className="min-h-11 w-full">
            <Link to="/">
              <ArrowLeft />
              Về trang chủ
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  )
}
