# Ghi chú: tính năng "danh tính ghi theo link cá nhân" (đã rollback)

Ngày: 2026-11-28. PR #1 (`feat/member-identity`, merge commit `4e8eb2d`) đã được revert toàn bộ phần ứng dụng.
Code vẫn còn nguyên trong lịch sử git để tham khảo hoặc lấy lại từng phần:

```bash
git log --oneline 4e05f52..4e8eb2d^2      # các commit của nhánh
git show 4e8eb2d^2:src/lib/permissions.ts  # xem một file cụ thể
git checkout 4e8eb2d^2 -- <path>           # lấy lại một file
```

## Vì sao rollback

Sau khi deploy, admin thấy luồng dùng quá nặng: phải tạo mã và gửi link riêng cho từng thành viên của từng
chuyến. Bản sửa đã gộp quá nhiều tính năng con vào một lần mà chưa thiết kế kỹ trải nghiệm. Quyết định: quay về
bản đầu tiên, phỏng vấn lại hành vi UI mong muốn rồi mới làm lại.

## Vấn đề ban đầu (từ người dùng thử) — VẪN CÒN sau khi rollback

1. **Không có phân quyền ghi**: ai có link nhóm cũng bấm "Đã chuyển" cho giao dịch của người khác; rules cho
   khách tạo payment với `fromId/toId/amount` bất kỳ và sửa/xóa mọi expense/payment `createdBy == 'guest'`.
2. **"Chỉ xem chung (không chọn)"** chỉ đóng modal, không gọi `clear()` (`src/components/WhoAmI.tsx`);
   `ExpenseForm` tự chọn người ứng là `memberOrder[0]` khi chưa chọn ai.
3. **Bàn phím điện thoại che ô nhập** trong `ResponsiveModal` (vaul Drawer, `max-h-[80vh]`, `repositionInputs` mặc định bật).

## Những gì đã triển khai trong PR #1

### Mô hình quyền: tách "góc nhìn" khỏi "danh tính ghi"
- **Góc nhìn (view lens)**: picker WhoAmI + `useMe` (localStorage) giữ cho mọi người, đổi tự do. Mọi số tiền công khai.
- **Danh tính ghi**: Firebase **Anonymous Auth** + link cá nhân `/t/<tripId>?k=<memberId>.<code>`.
  - `trips/{id}/memberSecrets/{memberId}` `{code, updatedAt}` — chỉ admin đọc/ghi; mã `randomId(12)`.
  - `trips/{id}/bindings/{uid}` `{memberId, code, updatedAt}` — khách tự ghi khi `code` khớp secret; chỉ chính
    chủ `get`, chỉ admin `list`. Đổi mã = thu hồi ngay (rules so mã ở mỗi lần ghi).
  - Chỉ `signInAnonymously` khi URL có `?k=`; phiên ẩn danh được coi là `signed-out` ở trang admin;
    admin mở link `?k=` thì không bind.
- **Quyền ghi của khách** (rules + `src/lib/permissions.ts`):
  - "Đã chuyển": chỉ khi thành viên đã bind ∈ {fromId, toId}, chuyến chưa khóa.
  - Thêm khoản chi: đã bind + `allowGuestExpenses` + chưa khóa; sửa/xóa/hoàn tác chỉ bản ghi có
    `createdByMemberId == thành viên đã bind` (không theo uid, để đổi Zalo ↔ Safari vẫn sửa được).
  - Dữ liệu cũ không có `createdByMemberId`: chỉ admin sửa/xóa.
  - Thêm trường tùy chọn `createdByUid`, `createdByMemberId` vào expenses/payments (`hasOnly + hasAll` thay `exactKeys`).
- Trạng thái binding phía client: `loading | unbound | bound | revoked | invalid`.

### UI
- Picker đánh dấu "✓ đã xác minh"; banner "Đang xem góc nhìn của X — chỉ xem"; banner link thu hồi/không hợp lệ.
- Nút "Đã chuyển" và nút thêm chi tiêu vẫn hiện; không đủ quyền thì mở sheet giải thích (`WriteAccessNoticeSheet`).
- Admin: `MemberLinksSection` (copy link cá nhân, "Tạo lại mã", "Tạo mã cho thành viên chưa có mã") ở trang sửa
  chuyến và menu ⋮; nhắc nợ riêng do admin copy kèm `?k=` của người nợ.
- Hiện "ai đã ghi/nhập" trên `PaymentsHistory` và từng dòng `ExpenseList`.
- Sửa lỗi 2: "Chỉ xem chung" gọi `clear()`; `ExpenseForm` bắt chọn người ứng.
- Sửa lỗi 3: `ResponsiveModal` thêm `mobileVariant="fullscreen"` (Radix Dialog toàn màn hình, bù bàn phím
  iOS bằng `visualViewport`, `scrollIntoView` khi focus, nút Lưu dính đáy) cho ExpenseForm và form bạn bè;
  Drawer còn lại dùng `repositionInputs={false}`, `max-h-[85dvh]`; meta viewport `interactive-widget=resizes-content`.

### Hạ tầng
- `wrangler.jsonc` (Workers Static Assets, SPA fallback) — **giữ lại** sau rollback.
- `.firebaserc` alias `prod`, script `npm run deploy:rules`, UID admin trong `firestore.rules`, `.env.example`
  tách dev/prod — **giữ lại** sau rollback.
- `public/_headers`: CSP Report-Only + `Permissions-Policy` + `X-Frame-Options` — đã revert, có thể lấy lại riêng.

## Bài học cho lần làm lại

- Đúng hướng, nên giữ: rules là lớp phân quyền duy nhất; quyền xét theo thành viên chứ không theo máy;
  hiện rõ ai ghi gì; các bản sửa lỗi 2 và 3 độc lập, có thể làm lại riêng trước.
- Sai lầm: gộp phân quyền + quản lý link + sửa UI vào một PR; chưa thử luồng của **admin** (người phải phát
  link) trước khi code; mỗi chuyến cũ cần thao tác tay "tạo mã".
- Lỗi vận hành gặp phải: build bằng `.env.local` cấu hình emulator làm bản preview không tải được dữ liệu
  → nên có kiểm tra chặn build prod khi `VITE_USE_EMULATOR=true` hoặc projectId `demo-*`.
- Rủi ro khi rollback: khoản chi/thanh toán khách đã ghi bằng bản mới có thêm `createdByUid`/`createdByMemberId`;
  rules cũ dùng `exactKeys` nên các bản ghi đó không sửa được (chỉ xóa rồi nhập lại).
