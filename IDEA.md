# Ý Tưởng Ứng Dụng: TripSplit — Web App Chia Tiền Đi Chơi Cá Nhân

## 1. Bối cảnh & Mục tiêu
- **Prototype tham khảo (Google Sheet hiện tại)**: [Template Chia Tiền Đi Chơi](https://docs.google.com/spreadsheets/d/1pRTSeiybgxS4l6NbWaIMbFpLub1rHt37lqmKYBVRqTg/edit?usp=sharing)
  - Gồm 2 tab chính: **`Tổng kết & Thanh toán`** (bảng tổng hợp từng người, bảng thanh toán tối ưu *ai trả cho ai*, khung QR thanh toán) và **`Chi tiêu`** (nhập mục chi, thành tiền, người đã chi, cột kiểm tra khớp, nhóm checkbox chọn người tham gia mặc định tick sẵn, nhóm điều chỉnh số tiền riêng tự chia phần dư, và nhóm thành tiền phải chịu tự động tính).
- **Vấn đề**: Khi đi chơi nhóm (tầm 4–15 người), việc theo dõi chi tiêu trên Google Sheets khá bất tiện trên điện thoại (phải zoom, cuộn ngang nhiều cột, dễ bấm nhầm công thức, khó gửi mã QR thanh toán riêng theo đúng số tiền từng người).
- **Mục tiêu**: Xây dựng một **web app gọn nhẹ, responsive (mobile-first)** dành cho **nhu cầu cá nhân và nhóm bạn thân** (~10–15 người dùng, vài chục chuyến đi/năm).
- **Triết lý thiết kế**:
  - **Miễn phí 100%** (hosting free, database free, không phát sinh chi phí duy trì).
  - **Đơn giản, thực dụng, không over-engineer** (không cần kiến trúc cho hàng triệu user, không cần hệ thống đăng ký tài khoản rườm rà cho bạn bè).
  - **Tiện lợi tối đa trên điện thoại**: Bạn bè mở link là xem được ngay tổng kết, ai trả cho ai, và quét mã QR thanh toán luôn.

---

## 2. Đối tượng sử dụng & Phân quyền đơn giản
1. **Chủ tool (Admin — 1 người)**:
   - Xác thực nhẹ bằng **mã PIN / mật khẩu cá nhân** (không cần hệ thống Auth phức tạp).
   - Quyền: Tạo/sửa/xóa chuyến đi, quản lý danh bạ bạn bè & tài khoản ngân hàng, khóa sổ chuyến đi, bật/tắt chế độ cho phép cả nhóm cùng nhập chi tiêu.
2. **Bạn bè trong chuyến đi (Guest — không cần đăng nhập)**:
   - Truy cập qua **link riêng của từng chuyến đi** (vd: `/t/dalat-2026` hoặc `/t/<slug-ngau-nhien>`).
   - Quyền mặc định: Xem danh sách chi tiêu, xem tổng kết cá nhân, xem ai trả cho ai, quét mã VietQR động, đánh dấu *"Tôi đã chuyển tiền"*.
   - Quyền mở rộng (tùy chọn theo từng chuyến): Nếu Admin bật chế độ *"Cho phép cả nhóm cùng nhập"*, bạn bè có thể tự thêm khoản chi của mình trực tiếp trên điện thoại.

---

## 3. Danh sách tính năng

### 3.1. Giai đoạn 1 — Cốt lõi (MVP)
1. **Quản lý nhiều chuyến đi & Link riêng**:
   - Tạo chuyến đi mới (Tên chuyến, ngày đi, danh sách thành viên tham gia).
   - Mỗi chuyến có **1 URL riêng** dễ chia sẻ vào nhóm chat.
   - Trang danh sách các chuyến đi (chỉ Admin xem được khi nhập PIN).
2. **Nhập & Chia tiền linh hoạt (Logic chia thông minh)**:
   - Mỗi khoản chi gồm: *Tên mục chi*, *Thành tiền*, *Người đã ứng tiền*, *Ghi chú/Ngày (tùy chọn)*.
   - **Chọn người tham gia bằng nút bấm (chip/toggle)**: Mặc định chọn tất cả thành viên; chạm để bỏ chọn người không tham gia (vd: tiền xăng chỉ có 2 người đi chung xe).
   - **Điều chỉnh số tiền riêng + Tự động chia phần dư**:
     - Bình thường: chia đều cho các thành viên được chọn.
     - Chia riêng: chỉ cần nhập số tiền cố định cho những người có mức khác (vd: *Ăn sáng* `190.000đ`, nhập Chung `45.000`, Mơ `45.000` $\rightarrow$ hệ thống tự lấy phần dư `100.000` chia đều cho những người còn lại được chọn là Sang `50.000`, Phụng `50.000`).
   - **Kiểm tra khớp tự động**: Cảnh báo ngay nếu tổng số tiền tùy chỉnh không khớp với *Thành tiền* hoặc chưa chọn ai tham gia.
3. **Tổng kết & Thuật toán thanh toán tối ưu (Ai trả cho ai)**:
   - **Bảng tổng hợp từng người**: Đã ứng trước | Phải chịu | Chênh lệch (`+Nhận lại` / `-Cần trả thêm`).
   - **Thanh toán tối ưu**: Tự tính số giao dịch chuyển khoản ít nhất để cân bằng sổ sách.
4. **Mã VietQR Động tự điền sẵn số tiền**:
   - Mỗi thành viên có thể lưu thông tin nhận tiền: *Ngân hàng*, *Số tài khoản*, *Tên chủ tài khoản* (và tùy chọn ảnh QR tĩnh MoMo làm phương án phụ).
   - Tại mỗi dòng *"Người A trả Người B số tiền X"*, có nút **"Quét QR trả ngay"** tự sinh ảnh VietQR động (qua chuẩn `img.vietqr.io` miễn phí, không cần API key) đã điền sẵn **đúng số tiền `X`** và **nội dung chuyển khoản** (vd: `"Chung tra tien Da Lat"`).
5. **Theo dõi trạng thái thanh toán ("Đã chuyển / Chưa chuyển")**:
   - Mỗi khoản cần thanh toán có nút tick xác nhận **"Đã trả"** (kèm thời gian) để theo dõi tiến độ thu hồi tiền.
6. **Gửi thông báo nợ nhanh qua Messenger / Zalo**:
   - Vì Facebook Messenger API không hỗ trợ bot nhắn tin vào nhóm/nick cá nhân mà không qua Fanpage & App Review, app hỗ trợ luồng thực dụng 1-chạm:
     - **Nút "Copy tin nhắn nhắc nợ"** (format sẵn danh sách ai trả ai + số tiền + link web để dán thẳng vào Messenger).
     - **Nút "Chia sẻ (Web Share API)"** trên điện thoại để mở thẳng menu share sang Messenger cho cả nhóm hoặc từng cá nhân.
     - **Nút "Tải ảnh thẻ tổng kết + QR"** để gửi trực tiếp dạng hình ảnh vào nhóm chat.

### 3.2. Giai đoạn 2 — Mở rộng (Nice-to-have)
- **Danh bạ bạn bè thường đi chơi chung**: Lưu sẵn tên + STK ngân hàng; tạo chuyến mới chỉ cần tick chọn từ danh bạ.
- **Chế độ "Chốt sổ" (Lock Trip)**: Khóa chỉnh sửa khi cả nhóm đã thanh toán xong, lưu lại làm lịch sử.
- **Đính kèm ảnh hóa đơn (bill)** cho từng khoản chi (tùy chọn nén ảnh nhẹ để tiết kiệm dung lượng free tier).
- **Thống kê vui cuối chuyến**: Tổng chi cả chuyến, trung bình/người, top khoản chi lớn nhất, người ứng tiền nhiều nhất.
- **Webhook nhắc nợ tự động (Tùy chọn)**: Hỗ trợ bắn thông báo vào nhóm **Telegram / Discord** nếu sau này cần tự động hóa hoàn toàn.

---

## 4. Yêu cầu phi chức năng & Ràng buộc
- **Chi phí**: **0 VNĐ** (tận dụng hoàn toàn các gói Free Tier bền vững, không bị sleep/cold-start khó chịu).
- **Giao diện**: Responsive **Mobile-first** (ưu tiên thao tác 1 tay trên điện thoại), hiển thị đẹp trên cả Desktop; hỗ trợ định dạng tiền Việt Nam (`190.000đ`, nhập nhanh `190k` nếu có thể).
- **Hiệu năng & Đồng bộ**: Dữ liệu lưu trên cloud để gửi link là mở được từ mọi thiết bị, cập nhật nhanh (hoặc realtime).
- **Độ đơn giản khi bảo trì**: Codebase gọn, dễ hiểu, dễ deploy tự động qua GitHub (Vercel / Cloudflare Pages).

---

## 5. Gợi ý định hướng công nghệ (để tham khảo khi thiết kế hệ thống)
- **Frontend**: React (Vite) hoặc Next.js + Tailwind CSS.
- **Database / Backend**: Supabase (Postgres + Realtime + RLS) hoặc Firebase Firestore (Free tier).
- **QR Động**: VietQR Quick Link (`https://img.vietqr.io/image/<BANK_ID>-<ACCOUNT_NO>-compact2.png?amount=...&addInfo=...`).
- **Hosting**: Vercel hoặc Cloudflare Pages.
