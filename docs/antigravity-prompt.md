# Prompt cho Antigravity CLI (agy) — tạo system design để so sánh

## Cách chạy
Mở terminal tại thư mục dự án, gõ `agy`, rồi dán phần **PROMPT** bên dưới vào (chỉ từ dòng "Bạn là kiến trúc sư…" trở xuống):

```powershell
cd D:\Workspace\Projects\trip-split
agy
```

Không dùng `--mode plan`: chế độ đó có thể chặn agy ghi file `DESIGN.agy.md`. Ở chế độ mặc định agy sẽ hỏi bạn trước khi ghi.
Kết quả sẽ nằm ở `DESIGN.agy.md`. Bản của Claude là `DESIGN.md`.

> Muốn so sánh công bằng thì đừng sửa dòng "KHÔNG đọc DESIGN.md / CLAUDE.md" trong prompt.

---

## PROMPT

Bạn là kiến trúc sư phần mềm. Hãy viết **system design sẵn sàng để code** cho ứng dụng **TripSplit**, một web app chia tiền đi chơi cho nhóm bạn.

**Nguồn duy nhất**: đọc `IDEA.md` trong thư mục hiện tại (tiếng Việt). **KHÔNG đọc `DESIGN.md` và `CLAUDE.md`**, vì đó là bản thiết kế khác đang được dùng để so sánh với bản của bạn.

**Ràng buộc cứng**
- Chi phí 0đ: chỉ dùng free tier, không cần thẻ, **không bị sleep/pause/cold-start**. Hãy kiểm tra chính sách free tier hiện tại của mọi dịch vụ bạn chọn (dùng công cụ tra tài liệu nếu có) và ghi rõ giới hạn.
- Ưu tiên hệ sinh thái **Google/Firebase**. Nếu chọn dịch vụ khác, giải thích lý do.
- Không over-engineer: đây là tool cá nhân cho khoảng 10–15 người, mỗi chuyến 4–15 người.
- Mobile-first, thao tác một tay; giao diện tiếng Việt; tiền hiển thị dạng `190.000đ`, ô nhập chấp nhận `190k`, `1tr2`…
- Frontend: **React + Vite + TypeScript + Tailwind + shadcn/ui + lucide-react**.
- Deploy tự động từ GitHub.

**Tài liệu phải trả lời được các câu hỏi sau** (tự đưa ra quyết định và nêu lý do; không liệt kê phương án mà không chọn):
1. **Quyết định chính**: bảng gồm quyết định và lý do. Phải có: chọn database/backend, hosting, cách xác thực admin, cách tạo link chuyến đi, cách lưu trạng thái "đã trả tiền".
2. **Kiến trúc tổng thể**: sơ đồ ASCII; nói rõ logic tính toán chạy ở đâu, realtime và offline xử lý thế nào, ước lượng quota so với free tier.
3. **Stack & công cụ**: thư viện cụ thể; danh sách component shadcn cần dùng; công cụ dev local (emulator…).
4. **Cấu trúc thư mục**: tới mức từng file, mỗi file một dòng mô tả.
5. **Mô hình dữ liệu**: định nghĩa TypeScript cho mọi collection/bảng, và giải thích các lựa chọn (snapshot hay tham chiếu, dữ liệu nào lưu và dữ liệu nào tính lại).
6. **Phân quyền**: bảng quyền khách và admin, kèm **file security rules hoàn chỉnh** viết được ngay (không dùng pseudo-code). Lưu ý khách không đăng nhập, link chính là quyền truy cập, và trang có hiện số tài khoản ngân hàng.
7. **Logic nghiệp vụ**: chữ ký hàm và thuật toán cho:
   - parse/format tiền VND, kèm bảng ví dụ input → output;
   - chia tiền: mặc định chia đều; có thể "cố định số tiền cho vài người, phần dư chia đều cho số còn lại", kèm validation và **cách làm tròn sao cho tổng khớp chính xác** (VND không có số lẻ);
   - số dư từng người (đã ứng / phải chịu / chênh lệch);
   - kế hoạch trả tiền với ít giao dịch nhất;
   - URL VietQR động (`img.vietqr.io`): bỏ dấu tiếng Việt trong nội dung chuyển khoản;
   - nội dung tin nhắn nhắc nợ.
   Ví dụ phải chạy đúng: khoản 190.000đ, Chung cố định 45.000, Mơ cố định 45.000 → Sang 50.000, Phụng 50.000.
8. **Route & màn hình**: bảng route; mô tả chi tiết trang chuyến đi (tab, form thêm chi, QR, "tôi đã chuyển", copy/share nhắc nợ) và các trạng thái loading / lỗi / offline.
9. **Cấu hình & môi trường**: biến môi trường, file cấu hình, các script `npm`.
10. **Thứ tự triển khai**: các bước có thể làm tuần tự.
11. **Kiểm thử & nghiệm thu**: test case cụ thể cho logic và cho security rules, cùng kịch bản kiểm thử thủ công.
12. **Giai đoạn 2**: những gì để sau.

Cuối tài liệu, thêm mục **"Rủi ro & điểm yếu trong IDEA.md"**: những chỗ spec gốc có vấn đề hoặc mâu thuẫn mà bạn đã phát hiện, và cách bạn xử lý.

**Đầu ra**: ghi toàn bộ vào **`DESIGN.agy.md`** bằng tiếng Việt, chỉ tạo đúng file đó. **Không tạo code, không cài package, không chạy lệnh deploy.** Nếu có điểm thật sự cần tôi quyết, hỏi tôi trước khi viết.
