# Prompt giao kế hoạch triển khai cho Antigravity CLI (agy)

## Trước khi chạy
- Thư mục dự án đã có `AGENTS.md`. agy tự đọc file này lúc khởi động, nên quy tắc dự án luôn có sẵn.
- Mở terminal tại `D:\Workspace\Projects\trip-split`, gõ `agy`. Dùng chế độ mặc định để agy hỏi trước khi chạy lệnh hoặc ghi file. Không dùng `--dangerously-skip-permissions`.
- Mỗi lần mở phiên mới, dán **PROMPT** bên dưới. agy sẽ tự tìm task chưa xong nhờ các dấu `[x]` trong file kế hoạch.
- Sau mỗi 2–3 task, gõ `/compact` cho phiên gọn lại.

---

## PROMPT

Bạn sẽ triển khai code cho TripSplit theo kế hoạch có sẵn.

1. Đọc `AGENTS.md`, `DESIGN.md` và toàn bộ `docs/superpowers/plans/2026-11-25-tripsplit-mvp.md`. Đặc biệt chú ý mục **Execution Rules**, **Global Constraints** và **Review Focus**.
2. Tìm task đầu tiên còn bước chưa đánh `[x]`, rồi làm đúng task đó theo từng bước. Đánh `[x]` ngay khi xong mỗi bước.
3. Tuân thủ Execution Rules:
   - TDD: test trước, phải thấy FAIL rồi mới cài đặt.
   - Comment và docstring đầy đủ bằng tiếng Việt theo `AGENTS.md`. Thiếu thì task chưa xong.
   - Không sửa test cho khớp code. Không tự đổi quyết định thiết kế. Không cài package ngoài kế hoạch.
   - Gặp bước 👤 thì dừng và nói rõ tôi cần làm gì.
4. Hết task: chạy các lệnh kiểm tra trong Execution Rules #6, commit, rồi báo cáo ngắn gồm việc đã làm, kết quả lệnh và chỗ nào lệch so với plan. **Dừng, chờ tôi xác nhận** trước khi sang task tiếp theo.
5. Plan hoặc design sai, mơ hồ, hay không làm được thì dừng, giải thích và đề xuất cách sửa. Không tự đoán.

Bắt đầu bằng cách tóm tắt trong 3–5 dòng task bạn sắp làm và các file sẽ tạo, rồi làm luôn.
