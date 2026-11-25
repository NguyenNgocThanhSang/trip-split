/**
 * Khai báo router khung và layout mobile-first tối đa 480px cho ứng dụng TripSplit.
 * Các màn hình hiện đang dùng placeholder và sẽ được thay thế dần ở các task tiếp theo.
 */
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import { Toaster } from '@/components/ui/sonner'

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
          <Route path="/" element={<div>Trang chủ TripSplit</div>} />
          <Route path="/t/:tripId" element={<div>Trang chuyến đi</div>} />
          <Route path="/admin" element={<div>Đăng nhập quản trị</div>} />
          <Route path="/admin/trips" element={<div>Danh sách chuyến đi</div>} />
          <Route path="/admin/trips/new" element={<div>Tạo chuyến đi mới</div>} />
          <Route path="/admin/trips/:tripId" element={<div>Chỉnh sửa chuyến đi</div>} />
          <Route path="/admin/friends" element={<div>Danh bạ bạn bè</div>} />
          <Route path="*" element={<div>Không tìm thấy trang (404)</div>} />
        </Routes>
      </main>
      <Toaster />
    </BrowserRouter>
  )
}

export default App
