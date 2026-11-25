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
| D6 | **Admin = Firebase Auth Google Sign-In, 1 UID cố định trong rules** | PIN kiểm tra ở frontend thì bypass được. Google Sign-In một chạm, không phải nhớ mật khẩu, tự nhớ phiên. Khách không đăng nhập. |
| D7 | **Danh bạ bạn bè trong MVP** | QR cần thông tin ngân hàng — nhập lại STK mỗi chuyến rất phiền. |
| D8 | **Hosting: Cloudflare Pages** (auto deploy từ GitHub) | Free, băng thông không giới hạn, không sleep. **Đã chốt** (chủ dự án muốn tìm hiểu Cloudflare). Firebase chỉ dùng cho Firestore + Auth. |
| D9 | **Tiền là số nguyên VND** (`int`), không bao giờ dùng float | VND không có đơn vị lẻ; chia phải khớp tổng tuyệt đối. |
| D10 | **Không dùng Cloud Storage.** Ảnh QR MoMo tĩnh nén client-side ≤ 70 KB, lưu dạng data URL trong Firestore | Cloud Storage for Firebase bắt buộc gói Blaze (đã kiểm tra: firebase.google.com/docs/storage/faqs-storage-changes-announced-sept-2024). |
| D11 | **Ảnh thẻ tổng kết → giai đoạn 2** | Nút Copy + Web Share đủ cho MVP; chụp DOM có ảnh QR cross-origin dễ lỗi CORS. |

---

## 2. Free tier (0đ, không thẻ, không sleep)

| Dịch vụ | Gói | Giới hạn cần biết | Khi vượt |
|---|---|---|---|
| Cloud Firestore | Firebase Spark | 50.000 đọc · 20.000 ghi · 20.000 xóa / ngày; 1 GiB lưu trữ; 10 GiB/tháng tải ra | Bị chặn tới khi reset quota, không phát sinh phí |
| Firebase Auth | Firebase Spark | Google Sign-In miễn phí (không bật SMS — SMS cần Blaze) | — |
| Cloudflare Pages | Free | Băng thông & request tĩnh không giới hạn; 500 lượt build/tháng | Build bị chặn tới tháng sau |
| `img.vietqr.io` | Miễn phí, không key | Không có SLA | Luôn có fallback copy STK (mục 8) |

**Ước lượng cao điểm** (15 người đang đi chơi, 40 khoản chi/ngày, mỗi người mở app 5 lần/ngày): ~1.500 lượt đọc/ngày (~3% quota, nhờ cache offline), ~100 lượt ghi/ngày (~0,5%), ~150 KB dữ liệu/chuyến kể cả ảnh QR MoMo. Dư hàng chục lần.

**Cố ý không dùng:** Cloud Functions, Cloud Storage (đều cần Blaze).

---

## 3. Kiến trúc tổng thể

```
  Điện thoại / Desktop (trình duyệt)
  ┌──────────────────────────────────────────┐
  │ SPA React (Cloudflare Pages, file tĩnh)  │
  │  ├─ src/lib     logic thuần (test được)  │
  │  ├─ src/data    Firestore hooks          │
  │  └─ src/pages   UI shadcn                │
  └───────┬──────────────────┬───────────────┘
          │ Firestore SDK    │ <img referrerpolicy="no-referrer">
          │ (realtime,       ▼
          │  offline cache)  img.vietqr.io  (ảnh QR động, free, không key)
          ▼
  Firebase (Spark)
   ├─ Firestore  ← security rules = phân quyền
   └─ Auth       ← Google Sign-In, chỉ 1 UID admin
```

- **Không có server code.** Mọi tính toán (chia tiền, số dư, kế hoạch trả) chạy ở client từ dữ liệu thô, memoize bằng `useMemo` → không lưu kết quả tính sẵn, không bao giờ lệch.
- **Realtime**: trang chuyến đi mở đúng 3 listener `onSnapshot`: `trips/{id}`, `expenses`, `payments`. `memberQrs` chỉ `getDoc` khi bấm xem QR MoMo.
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
| CI/CD | Cloudflare Pages build từ GitHub; rules deploy bằng `firebase deploy --only firestore:rules` |

Phiên bản: dùng bản mới nhất tại thời điểm scaffold, không chốt số cứng trong tài liệu này.

**Component shadcn cần add:** `button input label textarea card tabs drawer dialog alert-dialog toggle-group badge switch select command popover alert sonner skeleton separator dropdown-menu`.
**Icon lucide hay dùng:** `QrCode Copy Share2 Plus Check Lock Unlock Wallet Trash2 Pencil Users ArrowRight Undo2 WifiOff`.

Quy tắc UI:
- Dùng component shadcn có sẵn trước; component nghiệp vụ chỉ ghép từ chúng; không sửa tay `src/components/ui/` trừ khi bắt buộc.
- Mọi form/sheet đi qua `ResponsiveModal`: **Drawer** (bottom sheet) khi màn hình < 768px, **Dialog** trên desktop.

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
│  │  ├─ banks.ts            # danh sách ngân hàng tĩnh (BIN, code, tên ngắn)
│  │  ├─ image.ts            # nén ảnh QR MoMo (Canvas → WebP/JPEG ≤ 70 KB → data URL) — không test unit
│  │  └─ *.test.ts
│  ├─ data/
│  │  ├─ firebase.ts         # initializeApp, Firestore (offline cache), Auth, kết nối emulator
│  │  ├─ types.ts            # kiểu document Firestore (mục 6)
│  │  ├─ trips.ts            # useTrip, useTripList, createTrip, updateTrip, deleteTrip
│  │  ├─ expenses.ts         # useExpenses, addExpense, updateExpense, deleteExpense
│  │  ├─ payments.ts         # usePayments, addPayment, deletePayment
│  │  ├─ memberQrs.ts        # getMemberQr, setMemberQr
│  │  ├─ friends.ts          # useFriends, CRUD
│  │  └─ auth.ts             # useAdmin, signInWithGoogle, signOut
│  ├─ hooks/
│  │  ├─ useMe.ts            # "Bạn là ai" (localStorage theo tripId)
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
│  │  ├─ ResponsiveModal.tsx # Drawer trên mobile, Dialog trên desktop
│  │  ├─ MoneyInput.tsx      # ô nhập tiền: gõ "190k" → preview 190.000đ
│  │  ├─ MemberChips.tsx     # chọn 1 (người ứng) / chọn nhiều (người tham gia)
│  │  ├─ ExpenseForm.tsx
│  │  ├─ SummaryTable.tsx    # Đã ứng | Phải chịu | Chênh lệch
│  │  ├─ SettlementList.tsx
│  │  ├─ QrSheet.tsx         # ảnh VietQR + fallback copy + tab QR MoMo
│  │  ├─ MarkPaidSheet.tsx   # xác nhận đã chuyển, sửa được số tiền (trả một phần)
│  │  ├─ PaymentsHistory.tsx
│  │  ├─ WhoAmI.tsx          # "Bạn là ai?"
│  │  ├─ ReminderActions.tsx # Copy / Share (nhóm & từng người)
│  │  ├─ OfflineBanner.tsx
│  │  └─ AdminGuard.tsx
│  ├─ App.tsx  main.tsx  index.css
├─ tests/rules/firestore.rules.test.ts
├─ public/
│  ├─ _redirects             # "/*  /index.html  200" (SPA fallback cho Cloudflare)
│  ├─ _headers               # header bảo mật (mục 7.3)
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
  createdAt: Timestamp; updatedAt: Timestamp;
}

interface Payment {                // trips/{tripId}/payments/{paymentId}
  fromId: string;                  // người trả, ∈ trip.memberIds
  toId: string;                    // người nhận, ∈ trip.memberIds, ≠ fromId
  amount: VND;                     // số tiền thực tế đã chuyển (có thể là một phần)
  note: string;                    // 0..120
  markedBy: 'admin' | 'guest';     // bất biến
  paidAt: Timestamp;               // = request.time
}

interface MemberQr {               // trips/{tripId}/memberQrs/{memberId} — ảnh QR MoMo tĩnh
  dataUrl: string;                 // copy từ friend.momoQrDataUrl khi thêm thành viên
  updatedAt: Timestamp;
}
```

**Ghi chú thiết kế**
- `members` là **snapshot** từ danh bạ: đọc thông tin chuyến + STK cả nhóm chỉ tốn 1 lượt đọc, khách không bao giờ chạm `friends`, chuyến cũ không đổi khi bạn đổi STK. Trang sửa chuyến có nút "Cập nhật từ danh bạ".
- Ảnh QR MoMo tách ra `memberQrs` để document `trip` không phình (giới hạn 1 MiB) và không tốn lượt đọc nếu không ai xem.
- **Không cho xóa thành viên** đã có trong expense/payment nào (UI chặn, kèm lý do).
- **Xóa chuyến**: Firestore không tự xóa subcollection → client xóa `expenses`, `payments`, `memberQrs` theo batch rồi mới xóa `trip`.
- Không lưu phần chia, số dư hay kế hoạch trả — luôn tính từ `expenses` + `payments`.
- Mọi `createdAt`/`updatedAt`/`paidAt` ghi bằng `serverTimestamp()` (rules so với `request.time`).
- Index: không cần index tổ hợp; sắp xếp danh sách chi tiêu theo `date` rồi `createdAt` làm ở client (< 100 khoản/chuyến).

---

## 7. Phân quyền & bảo mật

### 7.1 Ma trận quyền

| Hành động | Khách (có link) | Admin |
|---|---|---|
| Xem 1 chuyến, chi tiêu, thanh toán, QR MoMo | ✅ | ✅ |
| Liệt kê tất cả chuyến | ❌ | ✅ |
| Sửa chuyến (thành viên, STK, cài đặt), tải ảnh QR MoMo | ❌ *(chống tráo STK/QR)* | ✅ |
| Thêm chi tiêu | khi `allowGuestExpenses && !locked`, `createdBy == 'guest'` | ✅ |
| Sửa/xóa chi tiêu | chỉ khoản `createdBy == 'guest'`, khi `allowGuestExpenses && !locked` | ✅ mọi khoản |
| Ghi "Tôi đã chuyển" | khi `!locked`, `markedBy == 'guest'` | ✅ |
| Hoàn tác thanh toán | chỉ bản ghi `markedBy == 'guest'`, khi `!locked` | ✅ |
| Danh bạ bạn bè | ❌ | ✅ |

Mô hình tin cậy: khách không đăng nhập nên **ai có link đều có thể ghi thay người khác** — chấp nhận được với nhóm bạn thân. Rules chặn: ghi khi đã khóa, sai schema, tráo STK/QR, sửa khoản của admin, liệt kê chuyến, đọc danh bạ.

### 7.2 `firestore.rules`

```
rules_version = '2';
service cloud.firestore {
  match /databases/{db}/documents {

    // ---------- helpers ----------
    function isAdmin() {
      return request.auth != null && request.auth.uid == 'REPLACE_WITH_ADMIN_UID';
    }
    function tripPath(tripId) { return /databases/$(db)/documents/trips/$(tripId); }
    function tripExists(tripId) { return exists(tripPath(tripId)); }
    function trip(tripId) { return get(tripPath(tripId)).data; }

    function isMoney(v)        { return v is int && v >= 1 && v <= 1000000000; }
    function isText(v, max)    { return v is string && v.size() >= 1 && v.size() <= max; }
    function isOptText(v, max) { return v is string && v.size() <= max; }
    function isDate(v)         { return v is string && v.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$'); }
    function isQrDataUrl(v) {
      return v is string && v.size() <= 100000
        && v.matches('^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$');
    }
    function exactKeys(d, keys) { return d.keys().hasOnly(keys) && d.keys().hasAll(keys); }

    // ---------- validators ----------
    function validTrip(d) {
      return d.keys().hasOnly(['name','startDate','endDate','members','memberIds',
                               'allowGuestExpenses','locked','createdAt','updatedAt'])
        && d.keys().hasAll(['name','members','memberIds','allowGuestExpenses','locked',
                            'createdAt','updatedAt'])
        && isText(d.name, 100)
        && (!('startDate' in d) || isDate(d.startDate))
        && (!('endDate' in d) || isDate(d.endDate))
        && d.members is list && d.members.size() >= 2 && d.members.size() <= 20
        && d.memberIds is list && d.memberIds.size() == d.members.size()
        && d.allowGuestExpenses is bool && d.locked is bool
        && d.updatedAt == request.time;
    }

    function validExpense(d, t) {
      return exactKeys(d, ['name','amount','payerId','participantIds','fixedAmounts',
                           'note','date','createdBy','createdAt','updatedAt'])
        && isText(d.name, 100)
        && isMoney(d.amount)
        && d.payerId in t.memberIds
        && d.participantIds is list
        && d.participantIds.size() >= 1 && d.participantIds.size() <= 20
        && d.participantIds.hasOnly(t.memberIds)
        && d.fixedAmounts is map
        && d.fixedAmounts.keys().hasOnly(d.participantIds)
        && isOptText(d.note, 200)
        && isDate(d.date)
        && d.updatedAt == request.time;
      // Rules không lặp được giá trị trong map → kiểm từng fixed & tổng fixed ≤ amount ở client (computeShares).
    }

    function validPayment(d, t) {
      return exactKeys(d, ['fromId','toId','amount','note','markedBy','paidAt'])
        && d.fromId in t.memberIds && d.toId in t.memberIds && d.fromId != d.toId
        && isMoney(d.amount)
        && isOptText(d.note, 120)
        && d.paidAt == request.time;
    }

    function validFriend(d) {
      return d.keys().hasOnly(['name','bankBin','bankShortName','accountNo','accountName',
                               'momoQrDataUrl','createdAt','updatedAt'])
        && d.keys().hasAll(['name','createdAt','updatedAt'])
        && isText(d.name, 40)
        && (!('bankBin' in d) || (d.bankBin is string && d.bankBin.matches('^[0-9]{6}$')))
        && (!('bankShortName' in d) || isText(d.bankShortName, 30))
        && (!('accountNo' in d) || isText(d.accountNo, 25))
        && (!('accountName' in d) || isText(d.accountName, 60))
        && (!('momoQrDataUrl' in d) || isQrDataUrl(d.momoQrDataUrl))
        && d.updatedAt == request.time;
    }

    // ---------- collections ----------
    match /friends/{friendId} {
      allow read, delete: if isAdmin();
      allow create: if isAdmin() && validFriend(request.resource.data)
        && request.resource.data.createdAt == request.time;
      allow update: if isAdmin() && validFriend(request.resource.data)
        && request.resource.data.createdAt == resource.data.createdAt;
    }

    match /trips/{tripId} {
      allow get: if true;
      allow list: if isAdmin();
      allow create: if isAdmin()
        && tripId.matches('^[a-z0-9]{10}$')
        && validTrip(request.resource.data)
        && request.resource.data.createdAt == request.time;
      allow update: if isAdmin()
        && validTrip(request.resource.data)
        && request.resource.data.createdAt == resource.data.createdAt;
      allow delete: if isAdmin();

      match /expenses/{expenseId} {
        allow read: if tripExists(tripId);

        allow create: if tripExists(tripId)
          && validExpense(request.resource.data, trip(tripId))
          && request.resource.data.createdAt == request.time
          && ( (isAdmin() && request.resource.data.createdBy == 'admin')
            || (trip(tripId).allowGuestExpenses && !trip(tripId).locked
                && request.resource.data.createdBy == 'guest') );

        allow update: if tripExists(tripId)
          && validExpense(request.resource.data, trip(tripId))
          && request.resource.data.createdAt == resource.data.createdAt
          && request.resource.data.createdBy == resource.data.createdBy
          && ( isAdmin()
            || (trip(tripId).allowGuestExpenses && !trip(tripId).locked
                && resource.data.createdBy == 'guest') );

        allow delete: if isAdmin()
          || (tripExists(tripId) && trip(tripId).allowGuestExpenses && !trip(tripId).locked
              && resource.data.createdBy == 'guest');
      }

      match /payments/{paymentId} {
        allow read: if tripExists(tripId);

        allow create: if tripExists(tripId)
          && validPayment(request.resource.data, trip(tripId))
          && ( (isAdmin() && request.resource.data.markedBy == 'admin')
            || (!trip(tripId).locked && request.resource.data.markedBy == 'guest') );

        allow update: if false;   // muốn sửa thì xóa rồi tạo lại

        allow delete: if isAdmin()
          || (tripExists(tripId) && !trip(tripId).locked && resource.data.markedBy == 'guest');
      }

      match /memberQrs/{memberId} {
        allow read: if tripExists(tripId);
        allow create, update: if isAdmin() && tripExists(tripId)
          && memberId in trip(tripId).memberIds
          && exactKeys(request.resource.data, ['dataUrl','updatedAt'])
          && isQrDataUrl(request.resource.data.dataUrl)
          && request.resource.data.updatedAt == request.time;
        allow delete: if isAdmin();
      }
    }

    match /{document=**} {
      allow read, write: if false;   // mặc định chặn mọi thứ khác
    }
  }
}
```

Rules này **chưa được chạy thử** — phải qua bộ test ở mục 12 trước khi deploy.

### 7.3 Chống lộ link & thông tin ngân hàng
- Chặn `list` trên `trips`; ID 10 ký tự ngẫu nhiên (~31^10 ≈ 8×10^14 tổ hợp).
- `<meta name="robots" content="noindex, nofollow">` trong `index.html` + `public/robots.txt` chặn toàn bộ.
- `public/_headers` (Cloudflare Pages):
  ```
  /*
    Referrer-Policy: no-referrer
    X-Content-Type-Options: nosniff
    X-Robots-Tag: noindex, nofollow
  ```
- Thẻ `<img>` VietQR đặt `referrerPolicy="no-referrer"` (trình duyệt hiện nay mặc định chỉ gửi domain, nhưng đặt rõ cho chắc).
- Khách không có quyền ghi nào lên `trips/{id}` (chứa STK) và `memberQrs` → không tráo được thông tin nhận tiền.

### 7.4 Thiết lập Auth
1. Authentication → Sign-in method → bật **Google**.
2. Authentication → Settings → **Authorized domains**: thêm domain Cloudflare Pages (`<project>.pages.dev`, và domain riêng nếu có). Thiếu bước này đăng nhập sẽ lỗi `auth/unauthorized-domain`.
3. Dùng **`signInWithPopup`**, không dùng `signInWithRedirect`: app không host trên Firebase Hosting nên redirect dễ hỏng trên trình duyệt chặn cookie bên thứ ba (Safari, Chrome mới).
4. Đăng nhập lần đầu bằng tài khoản Google của chủ dự án → lấy UID trong Authentication → Users → dán vào `REPLACE_WITH_ADMIN_UID` → deploy rules. Người khác có đăng nhập Google được cũng không có quyền gì, vì rules so UID.

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

### 8.6 `reminder.ts`
Nhắc cả nhóm:
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
```
👋 Chung ơi, phần của bạn chuyến Đà Lạt 2026 là 273.750đ (chuyển cho Sang).
🏦 Vietcombank - 0123456789 (NGUYEN NGOC SANG)
📝 Nội dung: Chung tra tien Da Lat 2026
🔗 Quét QR điền sẵn tiền: https://<domain>/t/k3x9p2qm7a?pay=chung.sang
```
`?pay=<fromId>.<toId>` mở thẳng QR sheet của giao dịch đó (dấu `.` làm phân cách vì ID có thể chứa `-`; giao dịch không còn tồn tại thì bỏ qua).

### 8.7 `id.ts`
`randomId(10)` dùng `crypto.getRandomValues`, bảng ký tự `[a-z0-9]` bỏ ký tự dễ nhầm (`0 o 1 l i`). Rules chấp nhận `^[a-z0-9]{10}$`.

---

## 9. Route & màn hình

| Route | Ai | Nội dung |
|---|---|---|
| `/` | mọi người | Lời chào ngắn + nút "Đăng nhập admin" (đã đăng nhập → `/admin/trips`) |
| `/t/:tripId` | mọi người | Trang chuyến đi; `?pay=` mở thẳng QR |
| `/admin` | — | Nút "Đăng nhập bằng Google"; sai tài khoản → báo "Tài khoản này không có quyền admin" |
| `/admin/trips` | admin | Danh sách chuyến (mới nhất trước), nút "Tạo chuyến", copy link, khóa/mở khóa nhanh |
| `/admin/trips/new`, `/admin/trips/:tripId` | admin | Tên, ngày, tick thành viên từ danh bạ, "Cập nhật từ danh bạ", switch "Cho phép nhóm nhập", switch "Khóa sổ", copy link, xóa chuyến (confirm) |
| `/admin/friends` | admin | CRUD danh bạ: tên, chọn ngân hàng (Command search), STK, chủ TK, tải ảnh QR MoMo (nén bằng `image.ts`) |
| `*` | — | 404 |

Admin đã đăng nhập khi mở `/t/:tripId` thấy thêm menu `⋮`: sửa chuyến, bật/tắt khách nhập, khóa sổ, sửa/xóa mọi khoản.

### Trang chuyến đi `/t/:tripId` (mobile-first, thao tác một tay)
- **Header**: tên chuyến, ngày, tổng chi; badge `🔒 Đã khóa sổ` / `✏️ Cả nhóm cùng nhập`; nút Copy link, Nhắc nợ, đổi "Bạn là ai".
- **WhoAmI**: lần đầu mở → chọn tên mình (lưu `localStorage['tripsplit:me:<tripId>']`). Dùng để: hiện thẻ số dư của mình, đưa giao dịch liên quan lên đầu, điền sẵn người ứng và người trả.
- **`OfflineBanner`** dính dưới header khi mất mạng hoặc còn thay đổi chờ đồng bộ.
- **Tabs**:
  1. **Tổng kết & Thanh toán** *(mặc định)*
     - Thẻ to của tôi: "Bạn cần trả 165.000đ" / "Bạn được nhận lại 200.000đ" / "Bạn đã xong 🎉".
     - **Ai trả cho ai** (`SettlementList`): mỗi card "Chung → Sang **273.750đ**" + nút to **Quét QR** và **Đã chuyển** (≥ 44px), kèm nút nhỏ copy nhắc riêng. Hết nợ → "🎉 Cả nhóm đã thanh toán xong!".
     - **Bảng từng người** (`SummaryTable`): Đã ứng | Phải chịu | Chênh lệch (xanh `+Nhận lại`, đỏ `−Cần trả`, xám `Đã xong`).
     - **Lịch sử đã trả** (`PaymentsHistory`): kèm giờ, nút Hoàn tác (khi có quyền và chưa khóa).
  2. **Chi tiêu** — danh sách (tên, số tiền, người ứng, badge `Cả nhóm (4)` / `Sang, Mơ` / `Chia riêng`); chạm để xem phần chia từng người (+ Sửa/Xóa nếu có quyền); nút tròn **+** góc dưới phải khi là admin hoặc `allowGuestExpenses && !locked`.
- **ExpenseForm**: Tên → `MoneyInput` (`inputMode="text"` để gõ được `k`/`tr`, preview `= 190.000đ` ngay dưới) → Người ứng (chip chọn 1, mặc định là "tôi") → Người tham gia (chip chọn nhiều, mặc định tất cả, nút "Chọn tất cả/Bỏ hết") → mục thu gọn **"Chia không đều"**: ô `MoneyInput` cạnh từng người; ô trống hiện mờ `Tự tính: 50.000đ` → thanh trạng thái `✔ Khớp 190.000đ` hoặc `Alert` đỏ; nút Lưu khóa khi có lỗi. Ghi chú & ngày trong "Thêm chi tiết".
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
- Firebase web config **không phải bí mật** (bảo mật nằm ở rules); vẫn để qua env cho gọn. Trên Cloudflare Pages khai báo cùng các biến (không có `VITE_USE_EMULATOR`).
- Dev không cần project thật: `.firebaserc` dùng project `demo-tripsplit` → emulator không gọi lên cloud.
- `firebase.json`: `firestore.rules`, `firestore.indexes.json`, emulators `auth:9099`, `firestore:8080`, `ui:4000`.

**Scripts** (`package.json`)
| Lệnh | Việc |
|---|---|
| `npm run dev` | Vite dev server |
| `npm run emulators` | `firebase emulators:start --project demo-tripsplit` |
| `npm test` | Vitest cho `src/lib` |
| `npm run test:rules` | `firebase emulators:exec --only firestore "vitest run tests/rules"` |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run build` | `tsc -b && vite build` |
| `npm run lint` | ESLint |

---

## 11. Thứ tự triển khai

1. **Scaffold**: `git init`; Vite React-TS; Tailwind; `npx shadcn@latest init` + add component ở mục 4; React Router; Vitest; ESLint; `public/_redirects`, `_headers`, `robots.txt`; meta noindex.
2. **`src/lib` theo TDD**: money → split → balances → settle → vietqr → reminder → id. Xong phần này là lõi đúng.
3. **Firebase local**: `firebase.json`, `.firebaserc` (demo), `firestore.rules`, test rules với emulator cho tới khi pass hết mục 12.2; `src/data/*`.
4. **Admin**: đăng nhập Google + guard, danh bạ (kèm nén ảnh QR MoMo), tạo/sửa/xóa chuyến.
5. **Trang chuyến đi**: WhoAmI, Tổng kết & Thanh toán, Chi tiêu + ExpenseForm, QrSheet + MarkPaidSheet + PaymentsHistory, ReminderActions, `?pay=`, OfflineBanner.
6. **Lên cloud**: tạo Firebase project thật (Spark), bật Firestore (`asia-southeast1`) + Auth Google; đẩy repo GitHub, nối Cloudflare Pages (`npm run build`, output `dist`, env vars); thêm domain `.pages.dev` vào Authorized domains; đăng nhập lấy UID, dán vào rules, `firebase deploy --only firestore:rules`.
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
1. Khách `get` trip ✅; `list` trips ❌.
2. Khách sửa trip (đổi STK, bật `allowGuestExpenses`, mở `locked`) ❌; khách ghi `memberQrs` ❌; khách đọc/ghi `friends` ❌.
3. Khách thêm chi khi `allowGuestExpenses=false` ❌; `true` + `createdBy='guest'` ✅; giả `createdBy='admin'` ❌; `payerId` hoặc `participantIds` ngoài `memberIds` ❌; khi `locked` ❌.
4. Khách sửa/xóa khoản `createdBy='admin'` ❌ (kể cả khi bật cho phép nhập); khách đổi `createdBy` khi sửa ❌.
5. Payment: khách tạo khi chưa khóa ✅, khi khóa ❌; `fromId == toId` ❌; khách xóa payment `markedBy='admin'` ❌; update ❌.
6. Schema: `name` > 100 ký tự, `amount` âm / float, field lạ, `fixedAmounts` có key ngoài `participantIds`, `createdAt` giả ❌.
7. Admin làm được hết với dữ liệu hợp lệ; vẫn bị chặn khi sai schema hoặc đổi `createdAt`.
8. Đường dẫn ngoài các collection trên ❌.

### 12.3 Thủ công
- Chạy dev + emulator; tạo chuyến bằng admin; mở `/t/<id>` trong tab ẩn danh trên điện thoại (cùng Wi-Fi, `vite --host`).
- 2 thiết bị cùng mở thấy cập nhật realtime; bật chế độ máy bay vẫn xem được, QR chuyển sang khối copy.
- **Quét QR thật bằng app ngân hàng** kiểm tra STK, số tiền, nội dung không dấu (không cần chuyển thật).
- Nút Chia sẻ trên iOS Safari / Android Chrome mở được menu share sang Messenger/Zalo.
- Viewport 375px và desktop (Drawer ↔ Dialog); thao tác một tay.
- `npm run build` sạch lỗi TS.

---

## 13. Giai đoạn 2 (chưa làm)
- **Ảnh thẻ tổng kết + QR** (`html-to-image`): tải ảnh QR với `crossOrigin="anonymous"`; lỗi CORS thì xuất thẻ không kèm ảnh QR, chỉ có STK + số tiền + link.
- **Đính kèm ảnh bill**: không dùng được Cloud Storage nếu giữ 0đ không thẻ → Cloudflare R2 (cần kiểm tra điều kiện free tier) hoặc lưu ảnh nén mạnh ≤ 80 KB trong subcollection, giới hạn số lượng mỗi chuyến.
- **Thống kê cuối chuyến**: tính thuần trên client từ `expenses` (tổng, trung bình/người, top khoản, người ứng nhiều nhất).
- **Webhook Telegram/Discord**: cần giấu bot token → một Cloudflare Worker (free) làm proxy.
- Bộ lọc "Đang đi / Đã khóa sổ" và "Nhân bản chuyến" trên trang admin.
