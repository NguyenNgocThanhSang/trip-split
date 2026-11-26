/**
 * Khai báo router khung và layout mobile-first tối đa 480px cho ứng dụng TripSplit.
 * Gắn trang chủ, đăng nhập quản trị, guard bảo vệ route `/admin/*` và trang 404; các màn chuyến đi dùng placeholder cho các task tiếp theo.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { AdminGuard } from '@/components/AdminGuard'
import { Toaster } from '@/components/ui/sonner'
import { AdminFriends } from '@/pages/AdminFriends'
import { AdminLogin } from '@/pages/AdminLogin'
import { HomePage } from '@/pages/HomePage'
import { NotFound } from '@/pages/NotFound'

/**
 * Component gốc chứa bộ định tuyến (router) và vùng hiển thị thông báo toast toàn cục.
 *
 * @returns Cây giao diện chính của ứng dụng TripSplit
 */
export function App() {
  return (
    <BrowserRouter>
      {/* Giới hạn chiều rộng 480px và canh giữa theo chuẩn mobile-first (DESIGN.md §9) */}
      <main className="mx-auto max-w-[480px] min-h-dvh">
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/t/:tripId" element={<div>Trang chuyến đi</div>} />
          <Route path="/admin" element={<AdminLogin />} />

          {/* Bảo vệ mọi route quản trị sau /admin bằng AdminGuard */}
          <Route element={<AdminGuard />}>
            <Route path="/admin/trips" element={<div>Danh sách chuyến đi</div>} />
            <Route path="/admin/trips/new" element={<div>Tạo chuyến đi mới</div>} />
            <Route path="/admin/trips/:tripId" element={<div>Chỉnh sửa chuyến đi</div>} />
            <Route path="/admin/friends" element={<AdminFriends />} />
          </Route>

          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
