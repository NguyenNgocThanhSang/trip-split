# TripSplit — System Design (MVP)

> Tài liệu thiết kế đã chốt, đủ chi tiết để bắt tay vào code. Spec gốc: `IDEA.md`.
> Bản này gộp bản thiết kế của Claude với các cải tiến lấy từ `DESIGN.agy.md` (bản Antigravity viết để so sánh).
> Khi đổi một quyết định ở đây, sửa luôn file này.

---

## 1. Bối cảnh & quyết định chính

Thay Google Sheet chia tiền đi chơi bằng web app mobile-first, **miễn phí 100%**, cho nhóm bạn ~10–15 người, 4–15 người/chuyến.

| # | Quyết định | Lý do |
|---|---|---|
| D1 | **Firebase (Firestore + Auth), gói Spark** | Free, không cần thẻ, **không tự pause** (Supabase free pause sau ~7 ngày không hoạt động), có realtime, có security rules. |
| D2 | **SPA tĩnh: React + Vite + TS**, không có backend, không Cloud Functions | App đọc/ghi thẳng Firestore; rules là lớp phân quyền duy nhất. Cloud Functions cần gói Blaze (có thẻ). |
| D3 | **UI: shadcn/ui + lucide-react + Tailwind** | Component sẵn (Drawer, Tabs, Toggle…), code nằm trong repo, nhẹ. |
| D4 | **Thanh toán là sổ cái giao dịch** (`payments`: A→B số X, cho phép trả một phần) | Kế hoạch "ai trả ai" tính lại mỗi khi sổ đổi; tick trên kế hoạch sẽ lệch/mất. Payment trừ vào số dư → kế hoạch luôn tính trên phần còn nợ. |
| D5 | **Trip ID ngẫu nhiên 10 ký tự** làm URL (`/t/k3x9p2qm7a`) + chặn `list` + `noindex` | Link = quyền truy cập; trang hiện STK ngân hàng → không được đoán ra, không bị index. |
| D6 | **Admin = Google Sign-In (1 UID cố định); Khách = Anonymous Auth + link cá nhân `?k=`** | PIN kiểm tra ở frontend thì bypass được. Khách mở link chung chỉ xem; mở link cá nhân `?k=<memberId>.<code>` sẽ tự bind vào `bindings/{uid}` để xác minh danh tính ghi ở `firestore.rules`, vẫn tách riêng với góc nhìn `WhoAmI`. |
| D7 | **Danh bạ bạn bè trong MVP** | QR cần thông tin ngân hàng — nhập lại STK mỗi chuyến rất phiền. |
| D8 | **Hosting: Cloudflare Workers Static Assets** (`wrangler.jsonc`, auto deploy từ GitHub) | Free, băng thông không giới hạn, không sleep, hỗ trợ SPA fallback qua `assets.not_found_handling: "single-page-application"`. **Đã chốt** (chủ dự án muốn tìm hiểu Cloudflare). Firebase chỉ dùng cho Firestore + Auth. |
| D9 | **Tiền là số nguyên VND** (`int`), không bao giờ dùng float | VND không có đơn vị lẻ; chia phải khớp tổng tuyệt đối. |
| D10 | **Không dùng Cloud Storage.** Ảnh QR MoMo tĩnh nén client-side ≤ 70 KB, lưu dạng data URL trong Firestore | Cloud Storage for Firebase bắt buộc gói Blaze (đã kiểm tra: firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). |
| D11 | **Ảnh thẻ tổng kết → giai đoạn 2** | Nút Copy + Web Share đủ cho MVP; chụp DOM có ảnh QR cross-origin dễ lỗi CORS. |

---

## 2. Free tier (0đ, không thẻ, không sleep)

| Dịch vụ | Gói | Giới hạn cần biết | Khi vượt |
|---|---|---|---|
| Cloud Firestore | Firebase Spark | 50.000 đọc · 20.000 ghi · 20.000 xóa / ngày; 1 GiB lưu trữ; 10 GiB/tháng tải ra | Bị chặn tới khi reset quota, không phát sinh phí |
| Firebase Auth | Firebase Spark | Google Sign-In + Anonymous Auth miễn phí (không bật SMS — SMS cần Blaze) | — |
| Cloudflare Workers | Free (Static Assets) | Băng thông & request tĩnh không giới hạn; `wrangler.jsonc` cấu hình SPA fallback | Giới hạn request Worker miễn phí |
| `img.vietqr.io` | Miễn phí, không key | Không có SLA | Luôn có fallback copy STK (mục 8) |

**Ước lượng cao điểm** (15 người đang đi chơi, 40 khoản chi/ngày, mỗi người mở app 5 lần/ngày): ~1.500 lượt đọc/ngày (~3% quota, nhờ cache offline), ~100 lượt ghi/ngày (~0,5%), ~150 KB dữ liệu/chuyến kể cả ảnh QR MoMo. Dư hàng chục lần.

**Cố ý không dùng:** Cloud Functions, Cloud Storage (đều cần Blaze).

---

## 3. Kiến trúc tổng thể

```
  Điện thoại / Desktop (trình duyệt)
  ┌──────────────────────────────────────────┐
  │ SPA React (Cloudflare Workers, file tĩnh)│
  │  ├─ src/lib     logic thuần (test được)  │
  │  ├─ src/data    Firestore & Auth hooks   │
  │  └─ src/pages   UI shadcn                │
  └───────┬──────────────────┬───────────────┘
          │ Firestore SDK    │ <img referrerpolicy="no-referrer">
          │ (realtime,       ▼
          │  offline cache)  img.vietqr.io  (ảnh QR động, free, không key)
          ▼
  Firebase (Spark)
   ├─ Firestore  ← security rules = phân quyền
   └─ Auth       ← Google Sign-In (1 UID admin) + Anonymous Auth (link cá nhân khách)
```

- **Không có server code.** Mọi tính toán (chia tiền, số dư, kế hoạch trả) chạy ở client từ dữ liệu thô, memoize bằng `useMemo` → không lưu kết quả tính sẵn, không bao giờ lệch.
- **Realtime**: trang chuyến đi mở 3 listener chính (`trips/{id}`, `expenses`, `payments`) kèm listener `bindings/{uid}` (nếu máy đang giữ phiên ẩn danh) và `memberSecrets` (nếu là Admin). `memberQrs` chỉ `getDoc` khi bấm xem QR MoMo.
- **Offline**: `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` → mất sóng vẫn xem được chuyến đã mở; ghi được xếp hàng và đồng bộ khi có mạng (theo dõi `snapshot.metadata.hasPendingWrites`).

---

## 4. Stack & công cụ

| Lớp | Lựa chọn |
|---|---|
| Ngôn ngữ / build | TypeScript (strict), Vite |
| UI | React, React Router, Tailwind CSS, shadcn/ui, lucide-react, sonner (toast) |
| Dữ liệu | Firebase JS SDK (modular): `firebase/firestore`, `firebase/auth` |
| Test | Vitest (logic), `@firebase/rules-unit-testing` + Firestore Emulator (rules) |
| Local dev | Firebase Emulator Suite (Firestore 8080, Auth 9099, UI 4000) — cần Java 21+ (máy đã có Java 25) |
| CI/CD | Cloudflare Workers Static Assets (`wrangler.jsonc`) build từ GitHub; rules deploy bằng `npm run deploy:rules` |

Phiên bản: dùng bản mới nhất tại thời điểm scaffold, không chốt số cứng trong tài liệu này.

**Component shadcn cần add:** `button input label textarea card tabs drawer dialog alert-dialog toggle-group badge switch select command popover alert sonner skeleton separator dropdown-menu`.
**Icon lucide hay dùng:** `QrCode Copy Share2 Plus Check Lock Unlock Wallet Trash2 Pencil Users ArrowRight Undo2 WifiOff`.

Quy tắc UI:
- Dùng component shadcn có sẵn trước; component nghiệp vụ chỉ ghép từ chúng; không sửa tay `src/components/ui/` trừ khi bắt buộc.
- Mọi sheet ngắn đi qua `ResponsiveModal` dạng **Drawer** (`repositionInputs={false}`, `max-h-[85dvh]`) khi `< 768px` và **Dialog** trên desktop. Riêng các form dài nhiều ô nhập (`ExpenseForm`, form bạn bè ở `AdminFriends`) dùng `mobileVariant="fullscreen"` dựng trên **Radix Dialog** (`h-dvh`, giữ nguyên focus trap/Escape/ARIA) kết hợp `interactive-widget=resizes-content`, đo `window.visualViewport` để bù `paddingBottom` trên iOS Safari và `scrollIntoView({ block: 'center' })` khi focus ô nhập.

---

## 5. Cấu trúc thư mục

```
trip-split/
├─ src/
│  ├─ lib/                   # THUẦN — không import React/Firebase. Có test.
│  │  ├─ money.ts            # formatVND, formatSignedVND, parseVND
│  │  ├─ split.ts            # computeShares
│  │  ├─ balances.ts         # computeBalances
│  │  ├─ settle.ts           # settle
│  │  ├─ vietqr.ts           # buildVietQrUrl, toAscii
│  │  ├─ reminder.ts         # buildGroupReminder, buildPersonalReminder
│  │  ├─ id.ts               # randomId (crypto.getRandomValues)
│  │  ├─ memberLink.ts       # buildPersonalTripUrl, parseMemberKeyParam, isValidMemberCode
│  │  ├─ permissions.ts      # canMarkTransfer, canAddExpense, canEditExpense, canUndoPayment
│  │  ├─ members.ts          # memberInUse (kiểm tra cả createdByMemberId)
│  │  ├─ banks.ts            # danh sách ngân hàng tĩnh (BIN, code, tên ngắn)
│  │  ├─ image.ts            # nén ảnh QR MoMo (Canvas → WebP/JPEG ≤ 70 KB → data URL) — không test unit
│  │  └─ *.test.ts
│  ├─ data/
│  │  ├─ firebase.ts         # initializeApp, Firestore (offline cache), Auth, kết nối emulator
│  │  ├─ types.ts            # kiểu document Firestore (mục 6)
│  │  ├─ trips.ts            # useTrip, useTripList, createTrip, updateTrip, deleteTripCascade
│  │  ├─ expenses.ts         # useExpenses, addExpense, updateExpense, deleteExpense
│  │  ├─ payments.ts         # usePayments, addPayment, deletePayment
│  │  ├─ memberQrs.ts        # getMemberQr, setMemberQr
│  │  ├─ memberAccess.ts     # useMemberSecrets, generateMissingSecrets, rotateMemberSecret, useMemberBinding
│  │  ├─ friends.ts          # useFriends, CRUD
│  │  └─ auth.ts             # useAdmin, useAuthUser, ensureAnonymousAuth, signInWithGoogle, signOut
│  ├─ hooks/
│  │  ├─ useMe.ts            # Góc nhìn "Bạn là ai" (localStorage theo tripId)
│  │  ├─ useOnlineStatus.ts
│  │  └─ useMediaQuery.ts    # cho ResponsiveModal
│  ├─ pages/
│  │  ├─ HomePage.tsx        # /
│  │  ├─ TripPage.tsx        # /t/:tripId
│  │  ├─ AdminLogin.tsx      # /admin
│  │  ├─ AdminTrips.tsx      # /admin/trips
│  │  ├─ AdminTripEdit.tsx   # /admin/trips/new, /admin/trips/:tripId
│  │  ├─ AdminFriends.tsx    # /admin/friends
│  │  └─ NotFound.tsx
│  ├─ components/
│  │  ├─ ui/                 # shadcn (sinh bởi CLI)
│  │  ├─ ResponsiveModal.tsx # Drawer/Fullscreen Dialog trên mobile, Dialog trên desktop
│  │  ├─ MoneyInput.tsx      # ô nhập tiền: gõ "190k" → preview 190.000đ
│  │  ├─ MemberChips.tsx     # chọn 1 (người ứng) / chọn nhiều (người tham gia)
│  │  ├─ MemberLinksSection.tsx # quản lý link cá nhân & xoay mã thành viên cho Admin
│  │  ├─ WriteAccessNoticeSheet.tsx # giải thích khi khách bấm ghi nhưng chưa bind/bị thu hồi/khác cặp
│  │  ├─ TripAccessBanners.tsx # cảnh báo thu hồi/lỗi mã và dòng nhắc chế độ chỉ xem
│  │  ├─ ExpenseForm.tsx
│  │  ├─ SummaryTable.tsx    # Đã ứng | Phải chịu | Chênh lệch
│  │  ├─ SettlementList.tsx
│  │  ├─ QrSheet.tsx         # ảnh VietQR + fallback copy + tab QR MoMo
│  │  ├─ MarkPaidSheet.tsx   # xác nhận đã chuyển, sửa được số tiền (trả một phần)
│  │  ├─ PaymentsHistory.tsx
│  │  ├─ WhoAmI.tsx          # chọn góc nhìn "Bạn là ai?"
│  │  ├─ ReminderActions.tsx # Copy / Share (nhóm & từng người)
│  │  ├─ OfflineBanner.tsx
│  │  └─ AdminGuard.tsx
│  ├─ App.tsx  main.tsx  index.css
├─ tests/rules/firestore.rules.test.ts
├─ wrangler.jsonc            # Cloudflare Workers Static Assets (SPA fallback)
├─ public/
│  ├─ _headers               # header bảo mật & CSP Report-Only (mục 7.3)
│  └─ robots.txt             # "User-agent: *" + "Disallow: /"
├─ index.html                # có <meta name="robots" content="noindex, nofollow">
├─ firestore.rules
├─ firestore.indexes.json
├─ firebase.json             # rules + cấu hình emulator (không có mục hosting)
├─ .firebaserc               # project mặc định
├─ .env.example
└─ components.json           # cấu hình shadcn
```

---

## 6. Mô hình dữ liệu (Firestore)

```ts
// src/data/types.ts
type VND = number; // luôn là số nguyên

interface Friend {                 // friends/{friendId} — CHỈ admin
  name: string;                    // 1..40
  bankBin?: string;                // 6 số NAPAS, vd "970436" (VCB)
  bankShortName?: string;          // "Vietcombank"
  accountNo?: string;              // 1..25
  accountName?: string;            // IN HOA KHÔNG DẤU, vd "NGUYEN VAN CHUNG"
  momoQrDataUrl?: string;          // data:image/...;base64 đã nén ≤ 100.000 ký tự
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface Member {                 // bản sao lúc thêm vào chuyến (không chứa ảnh)
  id: string;                      // = friendId (ổn định trong chuyến)
  name: string;
  bankBin?: string; bankShortName?: string; accountNo?: string; accountName?: string;
  hasStaticQr: boolean;            // true nếu có memberQrs/{id}
}

interface Trip {                   // trips/{tripId}, tripId = randomId(10)
  name: string;                    // 1..100, "Đà Lạt 2026"
  startDate?: string;              // "2026-12-20"
  endDate?: string;
  members: Member[];               // 2..20
  memberIds: string[];             // = members.map(m => m.id) — để rules kiểm tra `in` / `hasOnly`
  allowGuestExpenses: boolean;     // mặc định false
  locked: boolean;                 // mặc định false
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface Expense {                // trips/{tripId}/expenses/{expenseId}
  name: string;                    // 1..100, "Ăn sáng"
  amount: VND;                     // 1..1.000.000.000
  payerId: string;                 // ∈ trip.memberIds (không bắt buộc là người tham gia)
  participantIds: string[];        // 1..20, ⊆ trip.memberIds
  fixedAmounts: Record<string, VND>; // chỉ người có số cố định; {} nếu chia đều. keys ⊆ participantIds
  note: string;                    // 0..200, '' nếu trống
  date: string;                    // "2026-12-20"
  createdBy: 'admin' | 'guest';    // bất biến
  createdByUid?: string;           // Firebase Auth UID của khách khi tạo (vắng mặt ở admin/dữ liệu cũ)
  createdByMemberId?: string;      // ID thành viên đã xác minh lúc tạo (bất biến, dùng kiểm quyền sửa/xóa)
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface Payment {                // trips/{tripId}/payments/{paymentId}
  fromId: string;                  // người trả, ∈ trip.memberIds
  toId: string;                    // người nhận, ∈ trip.memberIds, ≠ fromId
  amount: VND;                     // số tiền thực tế đã chuyển (có thể là một phần)
  note: string;                    // 0..120
  markedBy: 'admin' | 'guest';     // bất biến
  createdByUid?: string;           // Firebase Auth UID của khách khi ghi (vắng mặt ở admin/dữ liệu cũ)
  createdByMemberId?: string;      // ID thành viên đã xác minh lúc ghi (dùng kiểm quyền hoàn tác & hiển thị)
  paidAt: Timestamp;               // = request.time
}

interface MemberQr {               // trips/{tripId}/memberQrs/{memberId} — ảnh QR MoMo tĩnh
  dataUrl: string;                 // copy từ friend.momoQrDataUrl khi thêm thành viên
  updatedAt: Timestamp;
}

interface MemberSecret {           // trips/{tripId}/memberSecrets/{memberId} — CHỈ admin đọc/ghi
  code: string;                    // mã bí mật 12..32 ký tự [a-z0-9] cho link cá nhân ?k=<memberId>.<code>
  updatedAt: Timestamp;
}

interface MemberBinding {          // trips/{tripId}/bindings/{uid} — liên kết Anonymous UID ↔ memberId
  memberId: string;                // ∈ trip.memberIds
  code: string;                    // phải khớp memberSecrets/{memberId}.code tại thời điểm đọc/ghi
  updatedAt: Timestamp;
}
```

**Ghi chú thiết kế**
- `members` là **snapshot** từ danh bạ: đọc thông tin chuyến + STK cả nhóm chỉ tốn 1 lượt đọc, khách không bao giờ chạm `friends`, chuyến cũ không đổi khi bạn đổi STK. Trang sửa chuyến có nút "Cập nhật từ danh bạ".
- Ảnh QR MoMo tách ra `memberQrs` để document `trip` không phình (giới hạn 1 MiB) và không tốn lượt đọc nếu không ai xem.
- **Không cho xóa thành viên** đã có trong expense/payment nào (`memberInUse` kiểm tra `payerId`, `participantIds`, `fixedAmounts`, `fromId`, `toId` và cả `createdByMemberId` để giữ lịch sử tác giả).
- **Xóa chuyến**: Firestore không tự xóa subcollection → client (`deleteTripCascade`) xóa `expenses`, `payments`, `memberQrs`, `memberSecrets` và `bindings` theo batch rồi mới xóa `trip`.
- Không lưu phần chia, số dư hay kế hoạch trả — luôn tính từ `expenses` + `payments`.
- Mọi `createdAt`/`updatedAt`/`paidAt` ghi bằng `serverTimestamp()` (rules so với `request.time`).
- Index: không cần index tổ hợp; sắp xếp danh sách chi tiêu theo `date` rồi `createdAt` làm ở client (< 100 khoản/chuyến).

---

## 7. Phân quyền & bảo mật

### 7.1 Tách "Góc nhìn (View Lens)" & "Danh tính ghi (Write Identity)"

Ứng dụng tách rạch ròi hai lớp để vừa giữ tính minh bạch (mọi người xem được bảng tổng kết của cả nhóm) vừa chặn giả mạo thao tác ghi ở `firestore.rules`:

1. **Góc nhìn (`WhoAmI` + `useMe` `localStorage`)**: giữ cho **tất cả** (khách và Admin), đổi tự do bất kỳ lúc nào (nút *"Chỉ xem chung (không chọn)"* gọi `clear()`). Chỉ dùng để hiển thị thẻ số dư cá nhân, sắp giao dịch liên quan lên đầu và điền sẵn `defaultPayerId` trong `ExpenseForm`.
2. **Danh tính ghi (`bindings/{uid}` qua Anonymous Auth + `?k=<memberId>.<code>`)**: Admin cấp cho mỗi thành viên một mã bí mật (`memberSecrets/{memberId}`, 12 ký tự `[a-z0-9]`). Khi mở link cá nhân `/t/<tripId>?k=<memberId>.<code>`, client tự gọi `signInAnonymously()`, ghi `bindings/{uid}` (rules đối chiếu `code == memberSecrets/{memberId}.code`), rồi xóa `?k=` khỏi URL mà không đụng `?pay=`.
   - Người mở **link chung** `/t/<tripId>` giữ chế độ chỉ xem nếu chưa bind trên thiết bị đó (nếu máy đã từng bind trước đó, `useMemberBinding` tự khôi phục phiên ẩn danh để nhận diện lại).
   - **Khả năng đa thiết bị / Zalo WebView**: quyền sửa/xóa bản ghi của khách kiểm theo `resource.data.createdByMemberId == myMemberId(tripId)` (thay vì khóa cứng `createdByUid`) để chính chủ mở lại link cá nhân ở trình duyệt khác vẫn sửa/xóa được khoản của mình; `createdByUid` vẫn lưu khi tạo để đối soát.
   - **Thu hồi mã & giới hạn hiện hành**: Admin bấm *"Tạo lại mã"* sẽ ghi đè `memberSecrets/{memberId}` khiến `hasValidBinding` ở rules fail ngay lập tức. *Giới hạn:* sau khi xoay mã, máy đang mở trang có thể vẫn hiện "đã xác minh" tới khi tải lại; mọi thao tác ghi vẫn bị rules chặn và hiện toast lỗi.
   - Logic kiểm quyền ở UI tập trung toàn bộ trong `src/lib/permissions.ts` (`canMarkTransfer`, `canAddExpense`, `canEditExpense`, `canUndoPayment`).

| Hành động | Khách (link chung / chưa bind) | Khách đã bind là thành viên `M` | Admin |
|---|---|---|---|
| Xem 1 chuyến, chi tiêu, thanh toán, QR MoMo, đổi góc nhìn `WhoAmI` | ✅ | ✅ | ✅ |
| Liệt kê tất cả chuyến, xem/sửa danh bạ `friends` | ❌ | ❌ | ✅ |
| Sửa chuyến, tải ảnh QR MoMo, đọc/xoay `memberSecrets`, list `bindings` | ❌ *(chống tráo STK/QR & lộ mã)* | ❌ | ✅ |
| Thêm chi tiêu | ❌ *(mở sheet hướng dẫn)* | khi `allowGuestExpenses && !locked`, gắn `createdByMemberId == M` | ✅ |
| Sửa/xóa chi tiêu | ❌ | chỉ khoản `createdBy == 'guest'` có `createdByMemberId == M` (khi `allowGuestExpenses && !locked`) | ✅ mọi khoản (kể cả legacy) |
| Ghi "Đã chuyển" | ❌ *(mở sheet hướng dẫn)* | khi `!locked` và `M ∈ {fromId, toId}` | ✅ mọi giao dịch |
| Hoàn tác thanh toán | ❌ | chỉ bản ghi `markedBy == 'guest'` có `createdByMemberId == M` (khi `!locked`) | ✅ mọi khoản (kể cả legacy) |

### 7.2 `firestore.rules`

Rules thực tế nằm ở `firestore.rules` (có comment tiếng Việt trên từng helper và `allow`), đã vượt qua 32 test trên Firestore Emulator (`tests/rules/firestore.rules.test.ts`):
- **Helpers xác minh**: `secretMatches(tripId, memberId, code)` kiểm tra `memberSecrets/{memberId}.code == code`; `hasValidBinding(tripId)` kiểm tra `bindings/{request.auth.uid}` tồn tại, `memberId in trip(tripId).memberIds` và khớp `memberSecrets`; `myMemberId(tripId)` đọc `memberId` từ binding; `sameOptField` giữ bất biến `createdByUid` / `createdByMemberId`.
- **`memberSecrets/{memberId}`**: `read, delete: if isAdmin()`; `create, update: if isAdmin()` với `existsAfter`/`getAfter` hỗ trợ `writeBatch` tạo chuyến mới và mã `[a-z0-9]{12,32}`.
- **`bindings/{uid}`**: `get` chỉ cho Admin hoặc chính chủ `uid` (khi doc chưa tồn tại hoặc vẫn khớp `memberSecrets` + `memberIds`); `list` chỉ Admin; `create, update` chỉ `!isAdmin() && request.auth.uid == uid` với `code` khớp `memberSecrets`; `delete` cho Admin hoặc chính chủ `uid`.
- **`expenses` & `payments`**: dùng `hasOnly` + `hasAll` (thay `exactKeys`) để tương thích dữ liệu cũ chưa có `createdByUid`/`createdByMemberId` và bản ghi của Admin; trong validator chỉ kiểm `isText(d.createdByMemberId, 64)` để Admin vẫn sửa được khoản chi sau khi gỡ người tạo; khách tạo mới bắt buộc gắn đúng `createdByUid == request.auth.uid` và `createdByMemberId == myMemberId(tripId)`, riêng `payments` yêu cầu `myMemberId(tripId) ∈ {fromId, toId}`. Dữ liệu cũ `guest` thiếu `createdByMemberId` chỉ Admin sửa/xóa được.

### 7.3 Chống lộ link, thông tin ngân hàng & CSP
- Chặn `list` trên `trips`, `memberSecrets` và `bindings`; Trip ID 10 ký tự ngẫu nhiên (~31^10 ≈ 8×10^14 tổ hợp); mã bí mật thành viên 12 ký tự (~31^12 ≈ 7,8×10^17 tổ hợp).
- `<meta name="robots" content="noindex, nofollow">` trong `index.html` + `public/robots.txt` chặn toàn bộ.
- `public/_headers` (Cloudflare Workers Static Assets):
  ```
  /*
    Referrer-Policy: no-referrer
    X-Content-Type-Options: nosniff
    X-Robots-Tag: noindex, nofollow
    X-Frame-Options: DENY
    Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=()
    Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://apis.google.com https://accounts.google.com; frame-src 'self' https://trip-split-4da89.firebaseapp.com https://accounts.google.com; connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com; img-src 'self' https://img.vietqr.io data: blob:; style-src 'self' 'unsafe-inline'; font-src 'self' data:; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'
  ```
  - **Không đặt** `Cross-Origin-Opener-Policy: same-origin` vì sẽ làm hỏng popup Google Sign-In (`signInWithPopup`).
  - **Chuyển CSP sang enforce**: sau khi deploy với `Content-Security-Policy-Report-Only`, mở DevTools kiểm tra console hoàn toàn sạch trên cả trang khách `/t/:tripId` (VietQR, MoMo QR, Anonymous Auth) lẫn luồng Admin Google Sign-In, rồi đổi tên header sang `Content-Security-Policy`.
- Thẻ `<img>` VietQR đặt `referrerPolicy="no-referrer"` để không gửi URL (kể cả trước khi strip `?k=`) sang bên thứ ba.
- Khách không có quyền ghi nào lên `trips/{id}` (chứa STK) và `memberQrs` → không tráo được thông tin nhận tiền.

### 7.4 Thiết lập Auth
1. Authentication → Sign-in method → bật **Google** (cho Admin) và **Anonymous** (cho liên kết danh tính khách).
2. Authentication → Settings → **Authorized domains**: thêm domain Cloudflare Workers (`*.workers.dev`, và domain riêng nếu có). Thiếu bước này đăng nhập Google Admin sẽ lỗi `auth/unauthorized-domain`.
3. Dùng **`signInWithPopup`**, không dùng `signInWithRedirect`: app không host trên Firebase Hosting nên redirect dễ hỏng trên trình duyệt chặn cookie bên thứ ba (Safari, Chrome mới). `adminStateFor` coi phiên `isAnonymous === true` là `signed-out` để màn hình `/admin` luôn hiện nút đăng nhập Google bình thường.
4. `signInAnonymously()` chỉ được gọi khi URL có `?k=` và chưa có `auth.currentUser` (luôn chờ `authStateReady()` trước để không ghi đè phiên Google của Admin).
5. UID Admin (`BdmGrQUlwkdSxvcPNpNG1qIdKCk1`) được cấu hình trong `firestore.rules` và `.env` (`VITE_ADMIN_UID`).

---

## 8. Logic nghiệp vụ (`src/lib`)

### 8.1 `money.ts`
```ts
formatVND(190000)          // "190.000đ"  (chèn "." bằng regex, không phụ thuộc locale máy)
formatSignedVND(826250)    // "+826.250đ";  -273750 → "-273.750đ";  0 → "0đ"
parseVND(input, { allowZero = false } = {}): VND | null
```
| Input | Kết quả |
|---|---|
| `190000`, `190.000`, `190,000`, `190 000`, `190.000đ`, `190000 vnd` | 190000 |
| `190k`, `190K` | 190000 |
| `45k5`, `45.5k`, `45,5k` | 45500 |
| `1tr`, `1m`, `1 triệu` | 1000000 |
| `1tr2`, `1.2tr`, `1,2tr`, `1m2` | 1200000 |
| `1tr25`, `1tr250` | 1250000 |
| `1tr05`, `1tr050`, `1tr50k` | 1050000 |
| `0` với `allowZero: true` (ô số cố định) | 0 |
| `0` mặc định, `""`, `abc`, `-5k`, `12.34.56`, `> 1 tỷ` | null |

Quy tắc: `trim` + `toLowerCase`, bỏ hậu tố `đ`/`d`/`vnd`/`vnđ`; có dấu `-` → null.
- Có hậu tố `k`/`tr`/`triệu`/`trieu`/`m`: `.`/`,` trước hậu tố là dấu thập phân; số sau hậu tố là phần lẻ đọc như chữ số thập phân (`1tr2` = 1,2tr; `1tr05` = 1,05tr; `45k5` = 45,5k); dạng ghép `XtrYk` = X triệu + Y nghìn.
- Không có hậu tố: `.`/`,`/khoảng trắng là dấu hàng nghìn, chỉ hợp lệ khi đúng nhóm 3 chữ số.
- Kết quả làm tròn về số nguyên, kiểm biên `[allowZero ? 0 : 1, 1.000.000.000]`.

### 8.2 `split.ts`
```ts
computeShares(input: {
  amount: VND;
  participantIds: string[];
  fixedAmounts: Record<string, VND>;
  memberOrder: string[];          // trip.memberIds — quyết định thứ tự nhận 1đ lẻ
}): { ok: true; shares: Record<string, VND> }
  | { ok: false; error: SplitError; message: string }

type SplitError =
  | 'INVALID_AMOUNT'              // không nguyên / ≤ 0 / > 1 tỷ
  | 'NO_PARTICIPANTS'
  | 'FIXED_NOT_PARTICIPANT'       // có số cố định cho người không tham gia
  | 'INVALID_FIXED'               // fixed âm / không nguyên
  | 'FIXED_EXCEEDS_TOTAL'         // tổng fixed > amount
  | 'ALL_FIXED_MISMATCH';         // ai cũng fixed mà tổng ≠ amount
```
Thuật toán:
1. Khử trùng `participantIds`; kiểm lỗi theo bảng trên (message tiếng Việt để hiện thẳng lên form).
2. `fixedSum = Σ fixed`; `flex` = người tham gia không có fixed, **sắp theo `memberOrder`**.
3. `remainder = amount − fixedSum`; nếu `flex` rỗng (và remainder = 0) → xong.
4. `base = floor(remainder / flex.length)`, `extra = remainder − base × flex.length`.
5. Người flex thứ `i` nhận `base + (i < extra ? 1 : 0)`.

→ Bảo đảm `Σ shares == amount` chính xác. 1đ lẻ luôn rơi vào người đứng đầu theo thứ tự thành viên: đơn giản, ổn định giữa preview và sau khi lưu (không phụ thuộc expenseId).

Test bắt buộc:
- 190.000, Chung 45k, Mơ 45k, Sang + Phụng chia đều → 50k / 50k.
- 100.000 / 3 → 33.334, 33.333, 33.333; 10đ / 3 → 4, 3, 3.
- Chia nhóm nhỏ: xăng 100k chỉ Sang & Mơ → 50k mỗi người, người khác không có trong `shares`.
- Cố định toàn bộ khớp tổng → ok; lệch → `ALL_FIXED_MISMATCH`; vượt → `FIXED_EXCEEDS_TOTAL`; fixed = 0 hợp lệ.

### 8.3 `balances.ts`
```ts
computeBalances(members, expenses, payments)
  : { memberId; paid; owed; expenseNet; sent; received; balance }[]
```
- `paid` = Σ amount các khoản người đó ứng; `owed` = Σ share (qua `computeShares`; khoản lỗi bị bỏ qua và gắn cờ cảnh báo trên UI).
- `expenseNet = paid − owed`; `balance = expenseNet + sent − received`. Dương = được nhận lại; âm = còn phải trả.
- Bất biến: `Σ expenseNet == 0`, `Σ balance == 0` (test).

### 8.4 `settle.ts`
```ts
settle(balances, memberOrder): { fromId; toId; amount: VND }[]
```
1. Tách nợ (balance < 0, lấy trị tuyệt đối) và có (balance > 0); bỏ người bằng 0.
2. **Khớp chính xác trước**: cặp nợ/có bằng nhau đúng số tiền → ghép ngay một giao dịch, loại cả hai.
3. **Tham lam**: lặp — sắp giảm dần theo số tiền, hòa thì theo `memberOrder`; ghép nợ lớn nhất ↔ có lớn nhất, chuyển `min`, trừ hai bên, bỏ ai về 0.
4. Tối đa `n − 1` giao dịch; kết quả xác định (không nhảy giữa các lần render).

### 8.5 `vietqr.ts`
```ts
toAscii("Chung trả tiền Đà Lạt (đợt 1)!")  // "Chung tra tien Da Lat dot 1"
// NFD bỏ dấu, đ→d, Đ→D, bỏ ký tự ngoài [A-Za-z0-9 ], gộp khoảng trắng, trim
buildVietQrUrl({ bankBin, accountNo, accountName }, amount, note)
// https://img.vietqr.io/image/{bankBin}-{accountNo}-compact2.png
//   ?amount={amount}&addInfo={toAscii(note).slice(0,50)}&accountName={toAscii(accountName).toUpperCase()}
// (ghép query bằng URLSearchParams)
```
Nội dung mặc định: `"{Tên người trả} tra tien {Tên chuyến}"`, tối đa 50 ký tự.
`banks.ts`: snapshot tĩnh danh sách ngân hàng (BIN, code, tên ngắn) lấy một lần từ `https://api.vietqr.io/v2/banks`, commit vào repo — không gọi API lúc chạy.

### 8.6 `reminder.ts` & `memberLink.ts`
Nhắc cả nhóm (luôn dùng link chung `/t/<tripId>`, **không bao giờ** chứa `?k=`):
```
💸 Chia tiền Đà Lạt 2026
💰 Tổng chi: 1.105.000đ
• Chung → Sang: 273.750đ
• Mơ → Sang: 273.750đ
✅ Đã trả: Phụng → Sang 278.750đ
Xem chi tiết & quét QR: https://<domain>/t/k3x9p2qm7a
```
(Hết nợ → `✅ Cả nhóm đã thanh toán xong!`)

Nhắc riêng từng người:
- Khi **khách** bấm copy nhắc riêng: dùng link chung kèm `?pay=<fromId>.<toId>` (không chứa `?k=`).
- Khi **Admin** bấm copy nhắc riêng (đã tải `memberSecrets` của người nợ): tự nhúng link cá nhân `?k=<fromId>.<code>&pay=<fromId>.<toId>` kèm toast cảnh báo chỉ gửi riêng cho người đó:
```
👋 Chung ơi, phần của bạn chuyến Đà Lạt 2026 là 273.750đ (chuyển cho Sang).
🏦 Vietcombank - 0123456789 (NGUYEN NGOC SANG)
📝 Nội dung: Chung tra tien Da Lat 2026
🔗 Quét QR điền sẵn tiền: https://<domain>/t/k3x9p2qm7a?k=chung.chungcode1234&pay=chung.sang
```
`?pay=<fromId>.<toId>` mở thẳng QR sheet của giao dịch đó (dấu `.` làm phân cách vì ID có thể chứa `-`; giao dịch không còn tồn tại thì bỏ qua). `parseMemberKeyParam` tách `?k=<memberId>.<code>` bằng `lastIndexOf('.')` và kiểm `^[a-z0-9]{12,32}$`.

### 8.7 `id.ts`
`randomId(10)` cho Trip ID và `randomId(12)` cho `memberSecrets.code`, dùng `crypto.getRandomValues`, bảng ký tự `[a-z0-9]` bỏ ký tự dễ nhầm (`0 o 1 l i`). Rules chấp nhận `^[a-z0-9]{10}$` cho Trip ID và `^[a-z0-9]{12,32}$` cho mã thành viên.

---

## 9. Route & màn hình

| Route | Ai | Nội dung |
|---|---|---|
| `/` | mọi người | Lời chào ngắn + nút "Đăng nhập admin" (đã đăng nhập → `/admin/trips`) |
| `/t/:tripId` | mọi người | Trang chuyến đi; `?pay=` mở thẳng QR |
| `/admin` | — | Nút "Đăng nhập bằng Google"; sai tài khoản → báo "Tài khoản này không có quyền admin" |
| `/admin/trips` | admin | Danh sách chuyến (mới nhất trước), nút "Tạo chuyến", copy link, khóa/mở khóa nhanh |
| `/admin/trips/new`, `/admin/trips/:tripId` | admin | Tên, ngày, tick thành viên từ danh bạ, "Cập nhật từ danh bạ", switch "Cho phép nhóm nhập", switch "Khóa sổ", copy link, **Link cá nhân từng thành viên** (copy `?k=`, tạo lại mã, tạo mã cho thành viên thiếu), xóa chuyến (confirm) |
| `/admin/friends` | admin | CRUD danh bạ: tên, chọn ngân hàng (Command search), STK, chủ TK, tải ảnh QR MoMo (nén bằng `image.ts`); trên mobile dùng `mobileVariant="fullscreen"` |
| `*` | — | 404 |

Admin đã đăng nhập khi mở `/t/:tripId` thấy thêm menu `⋮`: sửa chuyến, **Link cá nhân thành viên**, bật/tắt khách nhập, khóa sổ, sửa/xóa mọi khoản.

### Trang chuyến đi `/t/:tripId` (mobile-first, thao tác một tay)
- **Header**: tên chuyến, ngày, tổng chi; badge `🔒 Đã khóa sổ` / `✏️ Cả nhóm cùng nhập`; nút Copy link, Nhắc nợ, đổi góc nhìn `WhoAmI`.
- **WhoAmI & `TripAccessBanners`**: giữ picker cho mọi người (`localStorage['tripsplit:me:<tripId>']`), đánh dấu `✓ đã xác minh` cạnh thành viên đã bind, nút *"Chỉ xem chung (không chọn)"* gọi `clear()`. Khi góc nhìn khác danh tính ghi → hiện dòng phụ *"Đang xem góc nhìn của X — chỉ xem"*; khi binding bị thu hồi/sai mã → hiện Alert đỏ.
- **`OfflineBanner`** dính dưới header khi mất mạng hoặc còn thay đổi chờ đồng bộ.
- **Tabs**:
  1. **Tổng kết & Thanh toán** *(mặc định)*
     - Thẻ to của tôi (hoặc thẻ "Chọn tên" kèm gợi ý link cá nhân khi chưa bind).
     - **Ai trả cho ai** (`SettlementList`): mỗi card "Chung → Sang **273.750đ**" + nút **Quét QR** và **Đã chuyển** (vẫn hiện khi chưa khóa; bấm khi chưa đủ quyền → mở `WriteAccessNoticeSheet` giải thích), kèm nút copy nhắc riêng. Hết nợ → "🎉 Cả nhóm đã thanh toán xong!".
     - **Bảng từng người** (`SummaryTable`): Đã ứng | Phải chịu | Chênh lệch (xanh `+Nhận lại`, đỏ `−Cần trả`, xám `Đã xong`).
     - **Lịch sử đã trả** (`PaymentsHistory`): kèm giờ, **người ghi** (`Trưởng nhóm ghi`, `{Tên} tự ghi` khi người trả tự ghi, `{Tên} ghi`, hoặc fallback `Thành viên ghi`), nút Hoàn tác (khi đủ quyền qua `canUndoPayment`).
  2. **Chi tiêu** — danh sách hiển thị ngay **người nhập** trên từng dòng (`{Người ứng} ứng · {Ngày} · {Người nhập}`) và trong chi tiết; chạm để xem phần chia (+ Sửa/Xóa khi đủ `canEditExpense`); nút tròn **+** góc dưới phải khi `isAdmin || (allowGuestExpenses && !locked)` (bấm khi chưa bind/bị thu hồi → mở `WriteAccessNoticeSheet`).
- **ExpenseForm** (trên mobile dùng `mobileVariant="fullscreen"` + thanh nút Hủy/Lưu sticky): Tên → `MoneyInput` (`inputMode="text"`) → Người ứng (gợi ý theo góc nhìn `me`, **không fallback** `memberOrder[0]`, bắt chọn + báo `"Chọn người đã ứng tiền"`) → Người tham gia → **"Chia không đều"** → **"Thêm chi tiết"**.
- **QrSheet**:
  - Có STK: ảnh VietQR + 3 nút copy (**STK**, **Số tiền**, **Nội dung**) + nút **Tôi đã chuyển** ở dưới.
  - **Ảnh QR lỗi / offline**: tự chuyển sang khối chữ ngân hàng, STK, chủ TK, số tiền, nội dung — mỗi dòng một nút copy.
  - `hasStaticQr`: thêm tab **QR MoMo** (`getDoc` `memberQrs` khi bấm).
  - Chưa có STK: báo nhẹ + nút xác nhận đã trả tiền mặt.
- **MarkPaidSheet**: điền sẵn số tiền gợi ý, **sửa được nếu trả một phần**, ghi chú tùy chọn → tạo `Payment`.
- **ReminderActions**: xem trước tin nhắn nhóm + **Copy** + **Chia sẻ** (Web Share API, không hỗ trợ thì copy).
- **Trạng thái**: Skeleton khi tải; chuyến mới chưa có khoản → "Thêm khoản chi đầu tiên"; trip không tồn tại → "Link không đúng hoặc chuyến đã bị xóa"; lỗi permission → toast "Chuyến đã khóa / chưa cho phép nhập"; khi `locked`, ẩn mọi nút ghi với khách.

**Chuẩn UI**: tiếng Việt; ngày `dd/MM/yyyy`; vùng chạm ≥ 44px; khung nội dung tối đa ~480px canh giữa trên desktop; tôn trọng `prefers-color-scheme`.

---

## 10. Cấu hình & môi trường

`.env.example`
```
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_APP_ID=
VITE_ADMIN_UID=            # chỉ để UI ẩn/hiện nút admin; quyền thật nằm ở rules
VITE_USE_EMULATOR=true
```
- Firebase web config **không phải bí mật** (bảo mật nằm ở rules); vẫn để qua env cho gọn. Trên Cloudflare Workers khai báo cùng các biến (không có `VITE_USE_EMULATOR`).
- Dev không cần project thật: `.firebaserc` có alias `default: "demo-tripsplit"` (emulator) và `prod: "trip-split-4da89"`.
- `firebase.json`: `firestore.rules`, `firestore.indexes.json`, emulators `auth:9099`, `firestore:8080`, `ui:4000`.

**Scripts** (`package.json`)
| Lệnh | Việc |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run emulators` | `firebase emulators:start --project demo-tripsplit` |
| `npm test` | Vitest cho `src/**/*.test.{ts,tsx}` |
| `npm run test:rules` | `firebase emulators:exec --only firestore --project demo-tripsplit "vitest run --dir tests"` |
| `npm run deploy:rules` | `firebase deploy --only firestore:rules -P prod` |
| `npm run typecheck` | `tsc --noEmit -p tsconfig.app.json` |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | `eslint .` |
| `npm run preview` | `vite preview` |

---

## 11. Thứ tự triển khai

1. **Scaffold**: `git init`; Vite React-TS; Tailwind; `npx shadcn@latest init` + add component ở mục 4; React Router; Vitest; ESLint; `wrangler.jsonc`, `public/_headers`, `robots.txt`; meta noindex.
2. **`src/lib` theo TDD**: money → split → balances → settle → vietqr → reminder → id → members → memberLink → permissions.
3. **Firebase local**: `firebase.json`, `.firebaserc`, `firestore.rules`, test rules + data với emulator; `src/data/*`.
4. **Admin**: đăng nhập Google + guard, danh bạ (kèm nén ảnh QR MoMo), tạo/sửa/xóa chuyến, quản lý `memberSecrets` & link cá nhân.
5. **Trang chuyến đi**: `WhoAmI` (view lens), `useMemberBinding` (write identity qua `?k=`), `WriteAccessNoticeSheet`, `TripAccessBanners`, Tổng kết & Thanh toán, Chi tiêu + `ExpenseForm` fullscreen mobile, `QrSheet` + `MarkPaidSheet` + `PaymentsHistory`, `ReminderActions`, `?pay=`, `OfflineBanner`.
6. **Lên cloud**: bật Firestore + Auth (Google + Anonymous) trên project Firebase Spark; đẩy repo GitHub, nối Cloudflare Workers Static Assets (`wrangler.jsonc`); thêm domain `*.workers.dev` vào Authorized domains; deploy rules (`npm run deploy:rules`); kiểm tra console sạch dưới `CSP-Report-Only` rồi bật enforce `Content-Security-Policy`.
7. **Cập nhật `AGENTS.md`** với lệnh build/test thật.

---

## 12. Kiểm thử & nghiệm thu

### 12.1 Unit (`npm test`)
- Mọi bảng ví dụ ở mục 8; bất biến `Σ shares == amount`, `Σ balance == 0`.
- Bộ dữ liệu Google Sheet mẫu (Nhà nghỉ 575k, Cháo mực 260k, Tàu hủ 80k, Ăn sáng 190k chia riêng) → số dư từng người khớp sheet.
- Kịch bản thanh toán: Chung trả đủ → còn 0, kế hoạch bớt 1 giao dịch; Mơ **trả một phần** → còn đúng phần thiếu; sau đó thêm khoản "Gửi xe 20k" chia 4 → Chung hiện còn thiếu đúng 5.000đ.
- Khớp chính xác: A nợ 100k, B nợ 50k, C nhận 100k, D nhận 50k → đúng 2 giao dịch A→C, B→D.
- `toAscii`, cắt nội dung ≤ 50 ký tự, tin nhắc nợ chứa tên chuyến, danh sách và link.

### 12.2 Rules (`npm run test:rules`)
1. Khách chưa auth/ẩn danh `get` trip ✅; `list` trips ❌; Admin `list` ✅.
2. Khách sửa trip, ghi `memberQrs`, đọc/ghi `friends` ❌.
3. `memberSecrets`: chỉ Admin CRUD (kể cả trong `writeBatch` tạo chuyến) và validate `[a-z0-9]{12,32}`; khách đọc/list/ghi/xóa ❌.
4. `bindings/{uid}`: tạo/cập nhật đúng mã ✅ (kể cả re-bind cùng UID sau khi xoay mã); sai mã/sai UID/chưa auth/trip không tồn tại/Admin tự bind ❌; `get` binding khác UID ❌; `list` cho khách ❌; `get` sau khi xoay mã hoặc bị gỡ khỏi `trip.memberIds` → `permission-denied` ❌.
5. `expenses`: khách bind là `chung` tạo/sửa/xóa khoản của `chung` (kể cả từ UID thứ 2 bind vào `chung`) ✅; chặn khi `allowGuestExpenses=false`, `locked=true`, bị thu hồi mã hoặc gỡ khỏi chuyến, hoặc sửa/xóa khoản người khác/admin/legacy ❌; Admin sửa được khoản chi sau khi gỡ người tạo ✅.
6. `payments`: khách bind là `chung` tạo `chung→sang` và `sang→chung` ✅, chặn `mo→phung` ❌; chỉ người ghi hoàn tác được ✅; cấm `update` mọi vai trò ❌; chặn khi khóa/thu hồi/gỡ khỏi chuyến ❌; Admin xóa được mọi payment kể cả legacy ✅.
7. Schema & đường dẫn ngoài (`other/x`) ❌.

### 12.3 Thủ công
- Chạy dev + emulator hoặc preview; kiểm tra trên **iOS Safari**, **Android Chrome** và **Zalo/Messenger in-app browser**:
  - Mở `ExpenseForm` (bật *"Chia không đều"* và *"Thêm chi tiết"*) + form bạn bè `AdminFriends` + `MarkPaidSheet` → kiểm tra bàn phím ảo không đẩy lệch trang hay che ô nhập, nút Lưu sticky bấm được.
  - Mở link cá nhân `?k=` → xác minh xong biến mất khỏi URL, chuyển sang trình duyệt khác mở lại link cá nhân vẫn sửa được khoản của mình; mở link chung xem chế độ chỉ xem; test Admin xoay mã thu hồi quyền ghi tức thì.
  - Kiểm tra console sạch trên cả trang khách và Google Sign-In Admin dưới `Content-Security-Policy-Report-Only` trước khi đổi sang enforce.
  - Quét QR thật bằng app ngân hàng; chế độ máy bay fallback sang copy chữ; Web Share sang Messenger/Zalo; `npm run build` sạch lỗi.

---

## 13. Giai đoạn 2 (chưa làm)
- **Ảnh thẻ tổng kết + QR** (`html-to-image`): tải ảnh QR với `crossOrigin="anonymous"`; lỗi CORS thì xuất thẻ không kèm ảnh QR, chỉ có STK + số tiền + link.
- **Đính kèm ảnh bill**: không dùng được Cloud Storage nếu giữ 0đ không thẻ → Cloudflare R2 (cần kiểm tra điều kiện free tier) hoặc lưu ảnh nén mạnh ≤ 80 KB trong subcollection, giới hạn số lượng mỗi chuyến.
- **Thống kê cuối chuyến**: tính thuần trên client từ `expenses` (tổng, trung bình/người, top khoản, người ứng nhiều nhất).
- **Webhook Telegram/Discord**: cần giấu bot token → một Cloudflare Worker (free) làm proxy.
- Bộ lọc "Đang đi / Đã khóa sổ" và "Nhân bản chuyến" trên trang admin.
