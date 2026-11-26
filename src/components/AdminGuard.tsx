/**
 * Component bảo vệ toàn bộ các route quản trị (`/admin/*` trừ `/admin`).
 * Chờ kiểm tra phiên đăng nhập bằng Skeleton và chuyển hướng người chưa có quyền về `/admin`.
 */
import type { ReactNode } from 'react'
import { Navigate, Outlet } from 'react-router-dom'
import { Skeleton } from '@/components/ui/skeleton'
import { useAdmin } from '@/data/auth'

/**
 * Props của component `AdminGuard`.
 */
export interface AdminGuardProps {
  /** Nội dung con tùy chọn; nếu không truyền sẽ render `<Outlet />` cho các route lồng nhau. */
  children?: ReactNode
}

/**
 * Bọc các màn hình chỉ dành cho quản trị viên.
 * - `loading`: hiển thị khung xương (Skeleton) để tránh chớp màn hình đăng nhập.
 * - `signed-out` hoặc `not-admin`: chuyển hướng về `/admin`.
 * - `admin`: hiển thị nội dung quản trị.
 *
 * @param props Props chứa `children` tùy chọn
 * @returns Giao diện chờ, thẻ `<Navigate>` hoặc nội dung quản trị được phép truy cập
 */
export function AdminGuard({ children }: AdminGuardProps) {
  const admin = useAdmin()

  if (admin.status === 'loading') {
    return (
      <div
        className="flex flex-col gap-4 p-4"
        aria-busy="true"
        aria-label="Đang kiểm tra quyền quản trị"
      >
        <Skeleton className="h-8 w-44" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-24 w-full rounded-xl" />
      </div>
    )
  }

  if (admin.status !== 'admin') {
    return <Navigate to="/admin" replace />
  }

  return <>{children ?? <Outlet />}</>
}
