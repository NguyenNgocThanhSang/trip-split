# System Design: TripSplit — Web App Chia Tiền Đi Chơi Cá Nhân

> **Trạng thái**: Sẵn sàng triển khai (Implementation-Ready)  
> **Phạm vi**: Giai đoạn 1 (MVP) đầy đủ + điểm mở rộng cho Giai đoạn 2  
> **Quy mô mục tiêu**: Tool cá nhân cho 1 Admin + nhóm bạn 4–15 người/chuyến (~10–30 chuyến/năm)  
> **Ràng buộc chi phí**: **0 VNĐ**, không cần thẻ tín dụng, không sleep/pause/cold-start

---

## 1. Quyết định kiến trúc chính

| Hạng mục | Quyết định đã chọn | Lý do (và vì sao không dùng lựa chọn khác) |
| :--- | :--- | :--- |
| **Database & Backend** | **Cloud Firestore (Firebase Spark Plan)** — không có custom backend / không dùng Cloud Functions | Nằm trong hệ sinh thái Google/Firebase; **0đ không cần thẻ**, không bị pause sau 7 ngày không hoạt động như Supabase Free; có sẵn realtime (`onSnapshot`) và cache offline IndexedDB; không cần Cloud Functions (vì Functions yêu cầu gói Blaze có thẻ). Toàn bộ logic tính toán là hàm thuần (pure functions) chạy trên client. |
| **Hosting & CI/CD** | **Firebase Hosting (Spark Plan) + GitHub Actions** (`FirebaseExtended/action-hosting-deploy@v0`) | Đồng bộ 1 hệ sinh thái Google/Firebase duy nhất (quản lý chung 1 Console, 1 file `firebase.json` cho cả Hosting + Firestore Rules + Indexes); CDN toàn cầu của Google không cold-start; cấu hình `rewrites` cho SPA và HTTP security headers (`Referrer-Policy: no-referrer`) trực tiếp trong `firebase.json`; deploy tự động khi push lên `main`. |
| **Xác thực Admin** | **Firebase Authentication — Google Sign-In (1-click)**, khóa cứng 1 `ADMIN_UID` trong `firestore.rules` | **Loại bỏ cơ chế mã PIN phía client trong `IDEA.md`** vì không có backend/Cloud Functions thì Firestore Rules không thể xác thực PIN an toàn (đặc biệt cho thao tác `list` và `delete`). Google Sign-In 1-click trên Spark Plan miễn phí 100%, xác thực bằng JWT ở tầng server của Firebase, và trên điện thoại Admin còn nhanh hơn gõ PIN (chỉ 1 chạm, tự nhớ phiên). Bạn bè (Guest) **không cần đăng nhập**. |
| **Cách tạo link chuyến đi** | **Capability URL**: `/t/<slug-de-doc>-<12-ky-tu-ngau-nhien>` (ví dụ `/t/dalat-2026-7kP9mQx2vN4r`) dùng làm chính `tripId` trong Firestore | Kết hợp 2 ưu điểm: (1) dễ nhận biết chuyến nào khi dán vào nhóm Messenger nhờ prefix `<slug>`, (2) có ~71 bit entropy ($62^{12} \approx 3.2 \times 10^{21}$ tổ hợp) sinh bằng `crypto.getRandomValues` nên bất khả thi để đoán mò. Kết hợp chặn `allow list` trên `/trips`, `<meta name="robots" content="noindex, nofollow">` và `Referrer-Policy: no-referrer` để bảo vệ số tài khoản ngân hàng. |
| **Lưu trạng thái "Đã trả tiền"** | **Sổ cái giao dịch thanh toán (`trips/{tripId}/payments`)** lưu số tiền thực tế đã chuyển (`fromMemberId`, `toMemberId`, `amount`, `paidAt`, `markedBy`) | **Không lưu dạng boolean `paid: true` gắn theo cặp nợ hay theo dòng kế hoạch**, vì khi thêm/sửa chi tiêu sau đó thì kế hoạch thanh toán tối ưu sẽ tính lại và làm sai lệch số tiền đã chuyển. Mô hình sổ cái tự động trừ số tiền đã chuyển vào `remainingNet` của từng người: nếu sau đó phát sinh thêm khoản chi 20.000đ, hệ thống tự báo chính xác phần chênh lệch còn thiếu thay vì mất dấu. |
| **Ảnh QR tĩnh MoMo (fallback)** | **Nén client-side (WebP/JPEG ≤ 70 KB) lưu dạng Data URL** trong subcollection riêng `trips/{tripId}/memberQrs/{memberId}` (lazy-load khi bấm xem) | Từ cuối 2024, **Cloud Storage for Firebase yêu cầu gói Blaze (phải gắn thẻ)** cho project mới. Lưu ảnh QR MoMo đã nén trong subcollection tách biệt giúp giữ **0đ không thẻ**, không làm phình kích thước document `trip` (giới hạn 1 MiB), và tốn **0 lượt đọc** nếu thành viên chỉ dùng VietQR động chuẩn NAPAS. |
| **Xuất ảnh thẻ tổng kết + QR** | **Render trực tiếp trên client bằng `html-to-image`** (chuyển DOM card sang PNG để tải về / chia sẻ qua Web Share API) | Không cần server render ảnh; hoạt động ngay trên trình duyệt điện thoại. Ảnh VietQR từ `img.vietqr.io` tải với `crossOrigin="anonymous"`; nếu bị lỗi CORS khi chụp canvas sẽ tự fallback xuất thẻ tổng kết kèm đầy đủ STK + số tiền + link mà không làm lỗi nút tải. |

---

## 2. Kiểm tra chính sách Free Tier hiện tại (0đ, không cần thẻ)

Toàn bộ các dịch vụ sử dụng trong thiết kế này đã được kiểm tra giới hạn Free Tier hiện hành (không yêu cầu thẻ thanh toán, không có cơ chế tạm dừng/sleep):

| Dịch vụ | Gói sử dụng | Cần thẻ? | Sleep/Pause? | Giới hạn Free Tier cụ thể | Cơ chế khi vượt hạn mức |
| :--- | :--- | :---: | :---: | :--- | :--- |
| **Cloud Firestore** | Firebase Spark | Không | Không | • **50.000** reads/ngày<br>• **20.000** writes/ngày<br>• **20.000** deletes/ngày<br>• **1 GiB** dung lượng lưu trữ<br>• **10 GiB/tháng** băng thông tải ra (egress) | Tạm khóa truy cập tới chu kỳ reset kế tiếp (0đ phát sinh) |
| **Firebase Hosting** | Firebase Spark | Không | Không | • **10 GB** dung lượng lưu trữ<br>• **10 GB/tháng** băng thông (~360 MB/ngày)<br>• Miễn phí SSL & Custom Domain | Tạm ngừng phục vụ hết chu kỳ (0đ phát sinh) |
| **Firebase Authentication** | Firebase Spark | Không | Không | • Google Sign-In / Email-Password miễn phí (không bật SMS/Phone Auth vì SMS cần Blaze) | Giới hạn quota theo ngày/tháng (Admin chỉ 1 user) |
| **GitHub Actions** | GitHub Free | Không | Không | • Repo public: **Không giới hạn**<br>• Repo private: **2.000 phút Linux/tháng**, 500 MB artifacts | Dừng chạy workflow tới tháng sau |
| **VietQR Quick Link** (`img.vietqr.io`) | Miễn phí cộng đồng (VietQR Kit / Casso) | Không | Không | • Không cần API key, dùng trực tiếp qua thẻ `<img>` với lưu lượng sử dụng thông thường | Không cam kết SLA thương mại $\rightarrow$ luôn có UI fallback copy STK + số tiền |

> **Dịch vụ CỐ Ý KHÔNG DÙNG để giữ ràng buộc 0đ không thẻ**: **Cloud Functions for Firebase** và **Cloud Storage for Firebase** (các project Firebase mới yêu cầu nâng cấp gói Blaze gắn thẻ thanh toán).

---

## 3. Kiến trúc tổng thể

### 3.1. Sơ đồ kiến trúc (ASCII)

```text
+-------------------------------------------------------------------------+
|                        CLIENT (Mobile / Desktop Browser)                |
|  React 19 + Vite + TypeScript + Tailwind CSS + shadcn/ui + lucide-react |
|                                                                         |
|  +---------------------------+     +---------------------------------+  |
|  |   Domain Logic (Pure TS)  |     |    UI & Sharing Utilities       |  |
|  | - parseVnd / formatVnd    |     | - Copy tin nhan nhac no         |  |
|  | - calculateExpenseSplit   |     | - Web Share API (Messenger/Zalo)|  |
|  | - calculateMemberBalances |     | - html-to-image (Tai anh the)   |  |
|  | - calculateSettlementPlan |     | - Nen anh QR MoMo (Canvas API)  |  |
|  | - buildVietQrUrl          |     +---------------------------------+  |
|  +-------------+-------------+                                          |
|                |                                                        |
|  +-------------v-----------------------------------------------------+  |
|  |         Firebase Web SDK v11 (Modular)                            |  |
|  |  - Auth (Google Sign-In cho Admin)                                |  |
|  |  - Firestore + IndexedDB Persistent Cache (Offline + Multi-tab)   |  |
|  |  - Realtime Listeners (onSnapshot)                                |  |
|  +-------------+-----------------------------+-----------------------+  |
+----------------|-----------------------------|--------------------------+
                 | HTTPS (Auth JWT + WebChannel)| GET <img referrerpolicy="no-referrer">
                 v                             v
+----------------------------------+   +-------------------------------+
|    Firebase (Spark Plan - 0d)    |   |   img.vietqr.io (Quick Link)  |
|  +----------------------------+  |   |   Sinh anh PNG VietQR dong    |
|  | Firebase Hosting (CDN+SSL) |  |   |   (Bank + STK + So tien + ND) |
|  +----------------------------+  |   +-------------------------------+
|  | Firebase Auth (1 Admin UID)|  |
|  +----------------------------+  |   +-------------------------------+
|  | Cloud Firestore            |  |   | GitHub Repo + GitHub Actions  |
|  |  - firestore.rules (RBAC)  |  |<--| (Push main -> test + build -> |
|  |  - /trips/{tripId}         |  |   |  Deploy Hosting + Rules)      |
|  |    /expenses/{expenseId}   |  |   +-------------------------------+
|  |    /payments/{paymentId}   |  |
|  |    /memberQrs/{memberId}   |  |
|  |  - /contacts/{contactId}   |  |
|  +----------------------------+  |
+----------------------------------+
```

### 3.2. Phân bổ trách nhiệm: Tính toán, Realtime & Offline

- **Nơi chạy logic nghiệp vụ**: 100% logic chia tiền, làm tròn VND, tính số dư từng người, tối ưu hóa số giao dịch thanh toán, tạo URL VietQR và soạn tin nhắn nhắc nợ chạy **trên client (Pure TypeScript functions)** và được memoize bằng `useMemo`. Dữ liệu nguồn duy nhất lưu trong Firestore chỉ gồm `trip`, `expenses` và `payments` (không lưu số dư đã tính sẵn để tránh bất đồng bộ dữ liệu khi nhiều người nhập cùng lúc).
- **Realtime**:
  - Trang chuyến đi (`/t/:tripId`) đăng ký đúng 3 listener `onSnapshot`: `trips/{tripId}`, `trips/{tripId}/expenses` (`orderBy('expenseDate', 'desc')`, `orderBy('createdAt', 'desc')`), và `trips/{tripId}/payments` (`orderBy('paidAt', 'desc')`).
  - Khi bất kỳ ai thêm khoản chi hoặc bấm *"Tôi đã chuyển"*, mọi thiết bị đang mở link đều cập nhật số dư và bảng thanh toán trong < 500ms.
  - Subcollection `memberQrs/{memberId}` **không dùng realtime listener** — chỉ `getDoc` đúng 1 lần khi người dùng bấm mở tab QR tĩnh MoMo, sau đó cache trong bộ nhớ / IndexedDB.
- **Offline (sóng yếu khi đi du lịch)**:
  - Khởi tạo Firestore với `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })`.
  - Khi mất mạng:
    - Chuyến đi đã mở trước đó vẫn đọc được đầy đủ từ IndexedDB.
    - Thao tác thêm khoản chi hoặc đánh dấu *"Tôi đã chuyển"* vẫn thực thi ngay (optimistic UI), kèm banner cảnh báo màu vàng *"Đang ngoại tuyến — thay đổi sẽ tự đồng bộ khi có mạng"* (theo dõi qua `navigator.onLine` + `snapshot.metadata.hasPendingWrites`).
    - Riêng ảnh VietQR từ `img.vietqr.io` khi tải lỗi / offline sẽ tự chuyển sang chế độ **Fallback Copy nhanh** (hiển thị tên ngân hàng, số tài khoản, tên chủ TK, số tiền, nội dung chuyển khoản kèm nút copy từng dòng).

### 3.3. Ước lượng tiêu thụ Quota so với Spark Free Tier

Giả định tải cao điểm thực tế: nhóm 15 người đang đi chơi cùng lúc, phát sinh 40 khoản chi/ngày, mỗi người mở app 5 lần/ngày, 15 giao dịch xác nhận đã trả.

| Tài nguyên | Ước lượng cao điểm | Hạn mức Spark Free | Tỷ lệ sử dụng |
| :--- | :--- | :--- | :---: |
| **Firestore Reads** | ~1.200 reads/ngày *(51 reads/lần mở lạnh; ~3–5 reads/lần mở lại nhờ IndexedDB cache)* | 50.000 reads/ngày | **~2,4%** |
| **Firestore Writes** | ~80 writes/ngày *(40 chi tiêu + 15 thanh toán + 25 lần sửa)* | 20.000 writes/ngày | **~0,4%** |
| **Firestore Storage** | ~15 MB cho 100 chuyến *(~150 KB/chuyến gồm cả 2 ảnh QR MoMo nén)* | 1.024 MB (1 GiB) | **~1,5%** |
| **Hosting Bandwidth** | ~40 MB/tháng *(bundle SPA ~200 KB gzip, cache mạnh ở trình duyệt)* | 10.240 MB/tháng | **~0,4%** |
| **GitHub Actions** | ~30 phút/tháng *(~1,5 phút/lần deploy × 20 lần)* | 2.000 phút/tháng (private) / ∞ (public) | **~1,5%** |

---

## 4. Stack công nghệ & Công cụ phát triển

### 4.1. Thư viện Frontend & Runtime

| Gói | Phiên bản khuyến nghị | Mục đích |
| :--- | :--- | :--- |
| `react`, `react-dom` | `^19.0.0` | UI framework |
| `vite`, `@vitejs/plugin-react` | `^6.0.0` | Build tool & dev server siêu nhanh |
| `typescript` | `^5.7.0` | Type safety (`strict: true`) |
| `tailwindcss`, `@tailwindcss/vite` | `^4.0.0` | Styling mobile-first |
| `shadcn/ui` (Radix UI + `class-variance-authority` + `clsx` + `tailwind-merge` + `vaul`) | CLI mới nhất | Bộ UI component accessible, gọn nhẹ |
| `lucide-react` | `^0.475.0` | Bộ icon nhất quán |
| `react-router-dom` | `^7.1.0` | Routing SPA (`/`, `/admin`, `/t/:tripId`) |
| `firebase` | `^11.3.0` | Modular SDK (`firebase/app`, `firebase/auth`, `firebase/firestore`) |
| `zod` | `^3.24.0` | Validate form & dữ liệu đầu vào client khớp schema |
| `html-to-image` | `^1.11.11` | Xuất ảnh PNG thẻ tổng kết + QR để gửi Messenger |
| `sonner` | `^2.0.0` | Toast thông báo gọn nhẹ trên mobile (tích hợp chuẩn shadcn/ui) |

*(Không dùng Redux/Zustand hay React Query: state của 1 chuyến đi nằm trọn trong custom hook `useTripRealtime(tripId)` quản lý 3 Firestore listeners; tổng dữ liệu < 100 items).*

### 4.2. Danh sách component `shadcn/ui` cần cài đặt

`button`, `card`, `tabs`, `dialog`, `drawer` *(bottom sheet cho mobile)*, `input`, `label`, `textarea`, `select`, `switch`, `badge`, `separator`, `skeleton`, `alert`, `alert-dialog`, `sonner`, `dropdown-menu`, `avatar`.

> **Tối ưu thao tác một tay trên mobile**: Tất cả form thêm/sửa khoản chi, modal quét VietQR, và xác nhận *"Tôi đã chuyển"* đều dùng **`Drawer` (bottom sheet trượt từ đáy màn hình)** trên màn hình `< 768px` và tự chuyển thành **`Dialog`** trên desktop thông qua component wrapper `ResponsiveModal`.

### 4.3. Công cụ phát triển Local & Testing

- **Firebase CLI (`firebase-tools`)**: chạy **Firebase Emulator Suite** (`auth` port `9099`, `firestore` port `8080`, `hosting` port `5000`, Emulator UI port `4000`) — phát triển & test 100% offline không đụng dữ liệu thật.
- **Vitest** (`^3.0.0`): chạy unit test cho toàn bộ logic nghiệp vụ (`src/domain/__tests__/*.test.ts`) và integration test cho Firestore Security Rules.
- **`@firebase/rules-unit-testing`** (`^4.0.0`): kiểm thử tự động `firestore.rules` trực tiếp trên Firestore Emulator (chạy cả local lẫn CI).

---

## 5. Cấu trúc thư mục

```text
trip-split/
├── .github/
│   └── workflows/
│       └── deploy.yml                   # CI: chạy test + build + deploy Hosting & Firestore Rules
├── public/
│   ├── robots.txt                       # Disallow: / để ngăn bot tìm kiếm index link chuyến đi
│   └── favicon.svg                      # Biểu tượng ứng dụng
├── src/
│   ├── main.tsx                         # Điểm khởi chạy React + BrowserRouter + Toaster
│   ├── App.tsx                          # Khai báo Routes và ErrorBoundary tổng
│   ├── index.css                        # Import Tailwind v4 + CSS variables của shadcn/ui
│   ├── lib/
│   │   ├── firebase.ts                  # Khởi tạo Firebase App, Auth, Firestore (+ offline cache & emulator)
│   │   ├── utils.ts                     # Hàm cn() ghép class Tailwind của shadcn/ui
│   │   ├── id.ts                        # Sinh capability tripId (<slug>-<12 random>) & memberId
│   │   ├── image.ts                     # Nén ảnh QR tĩnh MoMo client-side (Canvas -> WebP/JPEG <= 70 KB)
│   │   └── share.ts                     # Copy clipboard, Web Share API, tải ảnh PNG qua html-to-image
│   ├── data/
│   │   └── banks.ts                     # Danh sách tĩnh ~45 ngân hàng NAPAS VN (bin, code, shortName, name)
│   ├── types/
│   │   └── models.ts                    # Toàn bộ TypeScript interfaces cho Firestore & domain tính toán
│   ├── domain/
│   │   ├── vnd.ts                       # parseVndInput, formatVnd, formatSignedVnd
│   │   ├── split.ts                     # validateExpenseSplit, calculateExpenseSplit (làm tròn khớp 0đ)
│   │   ├── balance.ts                   # calculateMemberBalances (đã ứng, phải chịu, đã trả, còn lại)
│   │   ├── settlement.ts                # calculateSettlementPlan (Exact-Match + Greedy ít giao dịch nhất)
│   │   ├── vietqr.ts                    # removeVietnameseDiacritics, buildVietQrUrl
│   │   ├── reminder.ts                  # buildGroupReminderMessage, buildPersonalReminderMessage
│   │   └── __tests__/
│   │       ├── vnd.test.ts              # Unit test parse/format tiền VND
│   │       ├── split.test.ts            # Unit test chia đều, cố định + phần dư, làm tròn, validation
│   │       ├── balance.test.ts          # Unit test tính số dư có kết hợp payments
│   │       ├── settlement.test.ts       # Unit test tối ưu giao dịch thanh toán
│   │       ├── vietqr.test.ts           # Unit test bỏ dấu tiếng Việt & URL VietQR
│   │       └── reminder.test.ts         # Unit test nội dung tin nhắn nhắc nợ
│   ├── services/
│   │   ├── authService.ts               # Đăng nhập/đăng xuất Google cho Admin & kiểm tra isAdmin
│   │   ├── tripService.ts               # CRUD trips/{tripId} & memberQrs/{memberId}
│   │   ├── expenseService.ts            # CRUD trips/{tripId}/expenses/{expenseId}
│   │   └── paymentService.ts            # Create/Delete trips/{tripId}/payments/{paymentId}
│   ├── hooks/
│   │   ├── useAuth.ts                   # Theo dõi trạng thái đăng nhập Admin (isAdmin, loading)
│   │   ├── useOnlineStatus.ts           # Theo dõi kết nối mạng browser (online/offline)
│   │   ├── useTripRealtime.ts           # Subscribe 3 onSnapshot listeners + memoize toàn bộ kết quả tính
│   │   └── useMediaQuery.ts             # Phát hiện breakpoint mobile/desktop cho ResponsiveModal
│   ├── components/
│   │   ├── ui/                          # Các component shadcn/ui sinh bằng CLI (button, drawer, tabs...)
│   │   ├── common/
│   │   │   ├── ResponsiveModal.tsx      # Tự động dùng Drawer trên mobile, Dialog trên desktop
│   │   │   ├── VndInput.tsx             # Ô nhập tiền hỗ trợ 190k, 1tr2 + hiển thị preview 190.000đ
│   │   │   ├── OfflineBanner.tsx        # Banner trạng thái ngoại tuyến / đang chờ đồng bộ
│   │   │   └── AdminGuard.tsx           # Bảo vệ route /admin (chỉ Admin UID mới vào được)
│   │   ├── trip/
│   │   │   ├── TripHeader.tsx           # Tên chuyến, ngày, badge khóa sổ, nút Copy link & cài đặt Admin
│   │   │   ├── SummaryTab.tsx           # Tab Tổng kết: thẻ tổng chi, bảng từng người, kế hoạch ai trả ai
│   │   │   ├── ExpensesTab.tsx          # Tab Chi tiêu: danh sách khoản chi + nút FAB thêm khoản chi
│   │   │   ├── PaymentsHistory.tsx      # Danh sách các khoản đã xác nhận chuyển + nút Hoàn tác
│   │   │   ├── ExpenseFormSheet.tsx     # Bottom sheet thêm/sửa khoản chi (chip chọn người + chia riêng)
│   │   │   ├── VietQrSheet.tsx          # Bottom sheet quét VietQR động + tab QR MoMo tĩnh + Copy STK
│   │   │   ├── MarkPaidSheet.tsx        # Bottom sheet xác nhận "Tôi đã chuyển tiền" (có thể nhập 1 phần)
│   │   │   ├── ReminderShareSheet.tsx   # Bottom sheet Copy/Share tin nhắn nhắc nợ & Tải ảnh thẻ tổng kết
│   │   │   └── SummaryExportCard.tsx    # Component giao diện gọn đẹp dùng riêng cho html-to-image xuất PNG
│   │   └── admin/
│   │       ├── TripFormSheet.tsx        # Form tạo/sửa chuyến đi & quản lý danh sách thành viên + STK
│   │       └── MemberBankRow.tsx        # Hàng nhập tên, chọn ngân hàng, STK, tên chủ TK, tải QR MoMo
│   └── pages/
│       ├── HomePage.tsx                 # Trang chủ gọn: hướng dẫn mở link chuyến đi + nút Đăng nhập Admin
│       ├── AdminDashboardPage.tsx       # Danh sách chuyến đi của Admin, tạo chuyến mới, copy link, xóa
│       ├── TripPage.tsx                 # Trang chi tiết chuyến đi (/t/:tripId) — giao diện chính
│       └── NotFoundPage.tsx             # Trang 404 thân thiện khi sai link chuyến đi
├── tests/
│   └── rules/
│       └── firestore.rules.test.ts      # Integration test toàn diện cho firestore.rules trên Emulator
├── index.html                           # Có meta robots noindex, nofollow + viewport mobile tối ưu
├── firebase.json                        # Cấu hình Hosting (SPA rewrite + headers), Firestore, Emulators
├── .firebaserc                          # Ánh xạ Firebase Project ID
├── firestore.rules                      # File Security Rules hoàn chỉnh
├── firestore.indexes.json               # Composite index cho query expenses
├── vitest.config.ts                     # Cấu hình Vitest
├── .env.example                         # Mẫu biến môi trường (Firebase config + VITE_ADMIN_UID)
└── package.json                         # Dependencies & npm scripts
```

---

## 6. Mô hình dữ liệu (Firestore & TypeScript)

### 6.1. Định nghĩa TypeScript (`src/types/models.ts`)

```ts
import type { Timestamp } from 'firebase/firestore';

/** Thông tin 1 thành viên được snapshot trực tiếp trong document chuyến đi */
export interface TripMember {
  id: string;              // 1..24 ký tự, duy nhất trong chuyến (vd: 'm_sang')
  name: string;            // Tên hiển thị, 1..40 ký tự (vd: 'Sang')
  bankBin?: string;        // Mã BIN 6 số chuẩn NAPAS (vd: '970436' cho VCB)
  bankShortName?: string;  // Tên ngắn ngân hàng (vd: 'Vietcombank')
  accountNo?: string;      // Số tài khoản nhận tiền, 1..25 ký tự
  accountName?: string;    // Tên chủ tài khoản không dấu viết hoa, 1..60 ký tự
  hasStaticQr: boolean;    // true nếu có ảnh QR tĩnh MoMo trong subcollection memberQrs
}

/** Collection: trips/{tripId} */
export interface TripDoc {
  title: string;           // 1..100 ký tự (vd: 'Đà Lạt tháng 11')
  tripDate: string;        // 'YYYY-MM-DD'
  members: TripMember[];   // 2..20 thành viên
  memberIds: string[];     // Danh sách ID đồng bộ từ members.map(m => m.id) để Rules kiểm tra toàn vẹn tham chiếu
  allowGuestEdit: boolean; // Cho phép khách tự thêm/sửa/xóa khoản chi do khách tạo
  isLocked: boolean;       // Chốt sổ: khóa mọi thao tác ghi từ khách
  createdAt: Timestamp;    // Immutable
  updatedAt: Timestamp;
  createdByUid: string;    // Admin UID, immutable
}

/** Collection: trips/{tripId}/expenses/{expenseId} */
export interface ExpenseDoc {
  title: string;                        // 1..100 ký tự (vd: 'Ăn sáng')
  amount: number;                       // Số nguyên dương VND (1..1_000_000_000)
  payerId: string;                      // ID thành viên đã ứng tiền (phải thuộc trip.memberIds)
  participantIds: string[];             // Danh sách ID thành viên tham gia (1..20, thuộc trip.memberIds)
  fixedAmounts: Record<string, number>; // Chỉ lưu thành viên có mức cố định; {} nếu chia đều
  note: string;                         // 0..200 ký tự ('' nếu trống)
  expenseDate: string;                  // 'YYYY-MM-DD'
  createdBy: 'admin' | 'guest';         // Immutable
  createdAt: Timestamp;                 // Immutable
  updatedAt: Timestamp;
}

/** Collection: trips/{tripId}/payments/{paymentId} */
export interface PaymentDoc {
  fromMemberId: string;                 // Người chuyển tiền (thuộc trip.memberIds)
  toMemberId: string;                   // Người nhận tiền (thuộc trip.memberIds, != fromMemberId)
  amount: number;                       // Số nguyên dương VND thực tế đã chuyển
  note: string;                         // 0..120 ký tự
  markedBy: 'admin' | 'guest';          // Ai đánh dấu (immutable)
  paidAt: Timestamp;                    // Immutable
}

/** Collection: trips/{tripId}/memberQrs/{memberId} (lazy-load, chỉ tạo khi dùng QR tĩnh MoMo) */
export interface MemberQrDoc {
  dataUrl: string;                      // data:image/(webp|jpeg|png);base64,... (<= 100.000 ký tự)
  updatedAt: Timestamp;
}

/** Collection: contacts/{contactId} (Admin-only, chuẩn bị sẵn cho Giai đoạn 2) */
export interface ContactDoc {
  name: string;
  bankBin?: string;
  bankShortName?: string;
  accountNo?: string;
  accountName?: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/* ====== Các kiểu dữ liệu TÍNH LẠI (Derived — KHÔNG lưu vào Firestore) ====== */

export interface Trip extends TripDoc { id: string; }
export interface Expense extends ExpenseDoc { id: string; }
export interface Payment extends PaymentDoc { id: string; }

export interface MemberBalance {
  memberId: string;
  memberName: string;
  totalPaid: number;        // Tổng đã ứng tiền chi tiêu
  totalOwed: number;        // Tổng phải chịu từ các khoản chi
  expenseNet: number;       // totalPaid - totalOwed (+Nhận / -Trả trước khi tính payments)
  paymentsSent: number;     // Tổng tiền đã chuyển trả nợ
  paymentsReceived: number; // Tổng tiền đã nhận từ người khác trả
  remainingNet: number;     // expenseNet + paymentsSent - paymentsReceived (còn phải nhận/trả)
}

export interface TransferItem {
  fromMemberId: string;
  toMemberId: string;
  amount: number;           // Số nguyên dương VND
}
```

### 6.2. Giải thích thiết kế dữ liệu

- **Snapshot vs Tham chiếu (`members` nhúng trong `TripDoc`)**:
  - `members` (gồm tên + thông tin ngân hàng) được **snapshot trực tiếp trong document `trips/{tripId}`** thay vì tham chiếu sang `/contacts/{contactId}`.
  - *Lý do*: (1) Đọc toàn bộ thông tin chuyến + danh sách thành viên + STK chỉ tốn **1 document read**; (2) Khách chỉ đọc trong phạm vi chuyến đi mà **không bao giờ chạm được vào `/contacts`** của Admin; (3) Nếu sau này bạn bè đổi số tài khoản, lịch sử các chuyến cũ đã chốt sổ không bị thay đổi.
  - Trường `memberIds: string[]` được đồng bộ kèm `members` khi Admin lưu chuyến, giúp `firestore.rules` kiểm tra toàn vẹn tham chiếu (`payerId in trip.memberIds`, `participantIds.hasOnly(trip.memberIds)`) ngay ở tầng database mà không cần vòng lặp.
  - Khi Admin muốn xóa 1 thành viên khỏi chuyến đi, UI chỉ cho phép xóa nếu `memberId` đó chưa xuất hiện trong bất kỳ `expense` (`payerId`, `participantIds`) hoặc `payment` nào của chuyến.
- **Dữ liệu LƯU vs dữ liệu TÍNH LẠI**:
  - **Lưu (Source of Truth)**: `TripDoc`, `ExpenseDoc` (chỉ lưu `amount`, `participantIds`, `fixedAmounts`), `PaymentDoc` (số tiền đã chuyển thực tế), `MemberQrDoc`.
  - **Tính lại trên client (không lưu)**: phần chia tiền từng người của mỗi khoản chi (`shares`), tổng chi cả chuyến, `MemberBalance`, và danh sách `TransferItem`. Nhờ vậy **không bao giờ xảy ra lệch số tổng (stale aggregate)** khi 2 người nhập chi tiêu đồng thời hoặc khi xóa/sửa 1 khoản chi cũ.

---

## 7. Phân quyền & Security Rules

### 7.1. Ma trận phân quyền

| Tài nguyên / Hành động | Guest (có link chuyến đi, không đăng nhập) | Admin (đăng nhập Google khớp `ADMIN_UID`) |
| :--- | :---: | :---: |
| `trips` — Liệt kê tất cả chuyến (`list`) | ❌ Cấm tuyệt đối | ✅ Toàn quyền |
| `trips/{tripId}` — Xem 1 chuyến biết trước ID (`get`) | ✅ Có | ✅ Có |
| `trips/{tripId}` — Tạo / Sửa thông tin, thành viên, STK, `isLocked`, `allowGuestEdit` / Xóa | ❌ Cấm tuyệt đối *(chống tráo đổi STK ngân hàng)* | ✅ Toàn quyền |
| `trips/{tripId}/expenses` — Xem danh sách (`read`) | ✅ Có *(nếu `trip` tồn tại)* | ✅ Có |
| `trips/{tripId}/expenses` — Thêm mới (`create`) | ✅ Chỉ khi `!isLocked && allowGuestEdit == true` (`createdBy == 'guest'`, `payerId` & `participantIds` thuộc `trip.memberIds`) | ✅ Luôn được (`createdBy == 'admin'`) |
| `trips/{tripId}/expenses` — Sửa / Xóa (`update`, `delete`) | ✅ Chỉ khoản do khách tạo (`createdBy == 'guest'`) và `!isLocked && allowGuestEdit == true` | ✅ Toàn quyền mọi khoản |
| `trips/{tripId}/payments` — Xem (`read`) | ✅ Có *(nếu `trip` tồn tại)* | ✅ Có |
| `trips/{tripId}/payments` — Xác nhận "Tôi đã chuyển" (`create`) | ✅ Chỉ khi `!isLocked` (`markedBy == 'guest'`, 2 thành viên thuộc `trip.memberIds`) | ✅ Luôn được (`markedBy == 'admin'`) |
| `trips/{tripId}/payments` — Hoàn tác (`delete`) | ✅ Chỉ bản ghi do khách đánh dấu (`markedBy == 'guest'`) và `!isLocked` | ✅ Toàn quyền |
| `trips/{tripId}/memberQrs` — Xem ảnh QR MoMo (`read`) | ✅ Có *(nếu `trip` tồn tại)* | ✅ Có |
| `trips/{tripId}/memberQrs` — Tải lên / Xóa ảnh QR MoMo | ❌ Cấm tuyệt đối *(chống tráo ảnh QR giả)* | ✅ Toàn quyền |
| `contacts/{contactId}` — Danh bạ chung | ❌ Cấm tuyệt đối | ✅ Toàn quyền |

### 7.2. Bảo vệ số tài khoản ngân hàng khi dùng Capability URL

1. **ID không đoán được**: 12 ký tự ngẫu nhiên cuối `tripId` sinh bằng `crypto.getRandomValues` (71 bit entropy), kết hợp chặn hoàn toàn `allow list` trên `/trips`.
2. **Chống rò rỉ link qua trình duyệt & công cụ tìm kiếm**:
   - `<meta name="robots" content="noindex, nofollow" />` trong `index.html` + `Disallow: /` trong `public/robots.txt`.
   - HTTP Header `Referrer-Policy: no-referrer` trong `firebase.json` + thuộc tính `referrerPolicy="no-referrer"` trên thẻ `<img src="https://img.vietqr.io/...">` để **không gửi URL bí mật của chuyến đi** sang server `vietqr.io`.
3. **Chống tráo đổi thông tin nhận tiền**: Khách không có bất kỳ quyền ghi nào lên `trips/{tripId}` (chứa `members[].accountNo`) và `trips/{tripId}/memberQrs/{memberId}`.

### 7.3. File `firestore.rules` hoàn chỉnh (triển khai trực tiếp)

> *Lưu ý*: Thay `REPLACE_WITH_ADMIN_UID` bằng Firebase Auth UID của tài khoản Google Admin trước khi deploy. Đây là bản Security Rules nguyên mẫu đã kiểm tra theo mô hình mối đe dọa của ứng dụng; bắt buộc chạy bộ test Emulator tại Mục 12 trước khi chia sẻ rộng rãi.  
> *Giới hạn ngôn ngữ CEL của Firestore Rules*: CEL không hỗ trợ vòng lặp trên giá trị bên trong `map` (`fixedAmounts`), nên Rules xác thực chặt schema, kích thước map (`<= 20`) và mọi key thuộc `participantIds`, còn `calculateExpenseSplit` trên client kiểm tra phòng thủ giá trị từng phần tử (và `allowGuestEdit` mặc định là `false`).

```javascript
rules_version = '2';

// ===============================================================
// Assumed Data Model
// ===============================================================
// Collection: trips/{tripId}
//   Document ID: ^[a-z0-9][a-z0-9-]{1,40}-[a-zA-Z0-9]{12}$
//   Fields:
//     - title: string (1..100, required)
//     - tripDate: string YYYY-MM-DD (required)
//     - members: list of TripMember maps (size 2..20, required)
//     - memberIds: list<string> (size 2..20, matches members.size(), required)
//     - allowGuestEdit: bool (required)
//     - isLocked: bool (required)
//     - createdAt: timestamp (required, immutable)
//     - updatedAt: timestamp (required)
//     - createdByUid: string (required, immutable, matches Admin UID)
//
// Subcollection: trips/{tripId}/expenses/{expenseId}
//   Fields:
//     - title: string (1..100, required)
//     - amount: int (1..1000000000, required)
//     - payerId: string (1..24, in parent trip.memberIds, required)
//     - participantIds: list<string> (size 1..20, subset of trip.memberIds, required)
//     - fixedAmounts: map<string, int> (size 0..20, keys subset of participantIds, required)
//     - note: string (0..200, required)
//     - expenseDate: string YYYY-MM-DD (required)
//     - createdBy: 'admin' | 'guest' (required, immutable)
//     - createdAt: timestamp (required, immutable)
//     - updatedAt: timestamp (required)
//
// Subcollection: trips/{tripId}/payments/{paymentId}
//   Fields:
//     - fromMemberId: string (1..24, in parent trip.memberIds, required)
//     - toMemberId: string (1..24, in parent trip.memberIds, != fromMemberId, required)
//     - amount: int (1..1000000000, required)
//     - note: string (0..120, required)
//     - markedBy: 'admin' | 'guest' (required, immutable)
//     - paidAt: timestamp (required, immutable)
//
// Subcollection: trips/{tripId}/memberQrs/{memberId}
//   Fields:
//     - dataUrl: string (base64 webp/jpeg/png, 30..100000 chars, required)
//     - updatedAt: timestamp (required)
//
// Collection: contacts/{contactId} (Admin-only)
//   Fields:
//     - name: string (1..40, required)
//     - bankBin: string (optional, 6 digits)
//     - bankShortName: string (optional, 1..20)
//     - accountNo: string (optional, 1..25)
//     - accountName: string (optional, 1..60)
//     - createdAt: timestamp (required, immutable)
//     - updatedAt: timestamp (required)
// ===============================================================

service cloud.firestore {
  match /databases/{database}/documents {

    // ---- Helper Functions ----

    function isAuthenticated() {
      return request.auth != null;
    }

    function isAdmin() {
      return isAuthenticated()
        && request.auth.uid == 'REPLACE_WITH_ADMIN_UID';
    }

    function tripPath(tripId) {
      return /databases/$(database)/documents/trips/$(tripId);
    }

    function tripExists(tripId) {
      return exists(tripPath(tripId));
    }

    function getTrip(tripId) {
      return get(tripPath(tripId)).data;
    }

    function isValidTripId(tripId) {
      return tripId is string
        && tripId.matches('^[a-z0-9][a-z0-9-]{1,40}-[a-zA-Z0-9]{12}$');
    }

    function isIsoDate(val) {
      return val is string && val.matches('^\\d{4}-\\d{2}-\\d{2}$');
    }

    function isNonEmptyStr(val, maxLen) {
      return val is string && val.size() >= 1 && val.size() <= maxLen;
    }

    function isOptStr(val, maxLen) {
      return val is string && val.size() <= maxLen;
    }

    function isValidAmount(val) {
      return val is int && val >= 1 && val <= 1000000000;
    }

    // ---- Domain Validators ----

    function isValidTrip(data) {
      return data.keys().hasOnly([
          'title', 'tripDate', 'members', 'memberIds', 'allowGuestEdit',
          'isLocked', 'createdAt', 'updatedAt', 'createdByUid'
        ])
        && data.keys().hasAll([
          'title', 'tripDate', 'members', 'memberIds', 'allowGuestEdit',
          'isLocked', 'createdAt', 'updatedAt', 'createdByUid'
        ])
        && isNonEmptyStr(data.title, 100)
        && isIsoDate(data.tripDate)
        && data.members is list
        && data.members.size() >= 2
        && data.members.size() <= 20
        && data.memberIds is list
        && data.memberIds.size() == data.members.size()
        && data.allowGuestEdit is bool
        && data.isLocked is bool
        && data.createdAt is timestamp
        && data.updatedAt is timestamp
        && isNonEmptyStr(data.createdByUid, 128);
    }

    function isValidExpense(data, trip) {
      return data.keys().hasOnly([
          'title', 'amount', 'payerId', 'participantIds',
          'fixedAmounts', 'note', 'expenseDate',
          'createdBy', 'createdAt', 'updatedAt'
        ])
        && data.keys().hasAll([
          'title', 'amount', 'payerId', 'participantIds',
          'fixedAmounts', 'note', 'expenseDate',
          'createdBy', 'createdAt', 'updatedAt'
        ])
        && isNonEmptyStr(data.title, 100)
        && isValidAmount(data.amount)
        && isNonEmptyStr(data.payerId, 24)
        && data.payerId in trip.memberIds
        && data.participantIds is list
        && data.participantIds.size() >= 1
        && data.participantIds.size() <= 20
        && data.participantIds.hasOnly(trip.memberIds)
        && data.fixedAmounts is map
        && data.fixedAmounts.size() <= 20
        && data.fixedAmounts.keys().hasOnly(data.participantIds)
        && isOptStr(data.note, 200)
        && isIsoDate(data.expenseDate)
        && data.createdBy in ['admin', 'guest']
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    function isValidPayment(data, trip) {
      return data.keys().hasOnly([
          'fromMemberId', 'toMemberId', 'amount', 'note', 'markedBy', 'paidAt'
        ])
        && data.keys().hasAll([
          'fromMemberId', 'toMemberId', 'amount', 'note', 'markedBy', 'paidAt'
        ])
        && isNonEmptyStr(data.fromMemberId, 24)
        && isNonEmptyStr(data.toMemberId, 24)
        && data.fromMemberId in trip.memberIds
        && data.toMemberId in trip.memberIds
        && data.fromMemberId != data.toMemberId
        && isValidAmount(data.amount)
        && isOptStr(data.note, 120)
        && data.markedBy in ['admin', 'guest']
        && data.paidAt is timestamp;
    }

    function isValidMemberQr(data) {
      return data.keys().hasOnly(['dataUrl', 'updatedAt'])
        && data.keys().hasAll(['dataUrl', 'updatedAt'])
        && data.dataUrl is string
        && data.dataUrl.size() >= 30
        && data.dataUrl.size() <= 100000
        && data.dataUrl.matches('^data:image/(webp|jpeg|png);base64,[A-Za-z0-9+/=]+$')
        && data.updatedAt is timestamp;
    }

    function isValidContact(data) {
      return data.keys().hasOnly([
          'name', 'bankBin', 'bankShortName', 'accountNo', 'accountName',
          'createdAt', 'updatedAt'
        ])
        && data.keys().hasAll(['name', 'createdAt', 'updatedAt'])
        && isNonEmptyStr(data.name, 40)
        && (!('bankBin' in data) || (data.bankBin is string && data.bankBin.matches('^\\d{6}$')))
        && (!('bankShortName' in data) || isNonEmptyStr(data.bankShortName, 20))
        && (!('accountNo' in data) || isNonEmptyStr(data.accountNo, 25))
        && (!('accountName' in data) || isNonEmptyStr(data.accountName, 60))
        && data.createdAt is timestamp
        && data.updatedAt is timestamp;
    }

    // ---- Collection Rules ----

    match /trips/{tripId} {
      // Guest chi duoc GET khi biet chinh xac capability tripId; CAM LIST
      allow get: if true;
      allow list: if isAdmin();

      allow create: if isAdmin()
        && isValidTripId(tripId)
        && isValidTrip(request.resource.data)
        && request.resource.data.createdByUid == request.auth.uid
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time;

      allow update: if isAdmin()
        && isValidTrip(request.resource.data)
        && request.resource.data.createdByUid == resource.data.createdByUid
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.updatedAt == request.time;

      allow delete: if isAdmin();

      match /expenses/{expenseId} {
        allow read: if isAdmin() || tripExists(tripId);

        allow create: if tripExists(tripId)
          && isValidExpense(request.resource.data, getTrip(tripId))
          && request.resource.data.createdAt == request.time
          && request.resource.data.updatedAt == request.time
          && (
            (isAdmin() && request.resource.data.createdBy == 'admin')
            || (
              !getTrip(tripId).isLocked
              && getTrip(tripId).allowGuestEdit == true
              && request.resource.data.createdBy == 'guest'
            )
          );

        allow update: if tripExists(tripId)
          && isValidExpense(request.resource.data, getTrip(tripId))
          && request.resource.data.createdAt == resource.data.createdAt
          && request.resource.data.createdBy == resource.data.createdBy
          && request.resource.data.updatedAt == request.time
          && (
            isAdmin()
            || (
              !getTrip(tripId).isLocked
              && getTrip(tripId).allowGuestEdit == true
              && resource.data.createdBy == 'guest'
            )
          );

        allow delete: if isAdmin()
          || (
            tripExists(tripId)
            && !getTrip(tripId).isLocked
            && getTrip(tripId).allowGuestEdit == true
            && resource.data.createdBy == 'guest'
          );
      }

      match /payments/{paymentId} {
        allow read: if isAdmin() || tripExists(tripId);

        allow create: if tripExists(tripId)
          && isValidPayment(request.resource.data, getTrip(tripId))
          && request.resource.data.paidAt == request.time
          && (
            (isAdmin() && request.resource.data.markedBy == 'admin')
            || (!getTrip(tripId).isLocked && request.resource.data.markedBy == 'guest')
          );

        allow update: if isAdmin()
          && tripExists(tripId)
          && isValidPayment(request.resource.data, getTrip(tripId))
          && request.resource.data.markedBy == resource.data.markedBy
          && request.resource.data.paidAt == resource.data.paidAt;

        allow delete: if isAdmin()
          || (
            tripExists(tripId)
            && !getTrip(tripId).isLocked
            && resource.data.markedBy == 'guest'
          );
      }

      match /memberQrs/{memberId} {
        allow read: if isAdmin() || tripExists(tripId);
        allow create, update: if isAdmin()
          && tripExists(tripId)
          && memberId in getTrip(tripId).memberIds
          && isValidMemberQr(request.resource.data)
          && request.resource.data.updatedAt == request.time;
        allow delete: if isAdmin();
      }
    }

    match /contacts/{contactId} {
      allow read: if isAdmin();
      allow create: if isAdmin()
        && isValidContact(request.resource.data)
        && request.resource.data.createdAt == request.time
        && request.resource.data.updatedAt == request.time;
      allow update: if isAdmin()
        && isValidContact(request.resource.data)
        && request.resource.data.createdAt == resource.data.createdAt
        && request.resource.data.updatedAt == request.time;
      allow delete: if isAdmin();
    }

    // Default Deny
    match /{document=**} {
      allow read, write: if false;
    }
  }
}
```

---

## 8. Logic nghiệp vụ chi tiết (Pure TypeScript)

### 8.1. Parse & Format tiền VND (`src/domain/vnd.ts`)

```ts
export const MAX_VND_AMOUNT = 1_000_000_000; // 1 tỷ VND

export function parseVndInput(
  raw: string,
  options?: { allowZero?: boolean }
): number | null;

export function formatVnd(amount: number): string;       // 190000 -> "190.000đ"
export function formatSignedVnd(amount: number): string; // 826250 -> "+826.250đ", -273750 -> "-273.750đ", 0 -> "0đ"
```

**Thuật toán `parseVndInput(raw, { allowZero = false })`**:
1. Chuẩn hóa: `s = raw.trim().toLowerCase()`, bỏ các hậu tố đơn vị tiền (`đ`, `d`, `vnd`, `vnđ`) ở cuối và khoảng trắng thừa. Nếu rỗng hoặc chứa dấu `-` $\rightarrow$ trả về `null`.
2. Khớp lần lượt các mẫu viết tắt tiếng Việt:
   - **Dạng ghép `tr` + `k`** (vd `1tr50k`, `1tr250k`): `^(\d+)\s*(?:tr|triệu|trieu|m)\s*(\d+)\s*k$` $\rightarrow$ `whole * 1_000_000 + sub * 1_000`.
   - **Dạng `tr` có phần thập phân phía sau chữ** (vd `1tr2`, `1tr25`, `1tr050`, `1m5`): `^(\d+)\s*(?:tr|triệu|trieu|m)\s*(\d+)$` $\rightarrow$ `Math.round(whole * 1_000_000 + Number('0.' + frac) * 1_000_000)`.
   - **Dạng `tr` có dấu chấm/phẩy trước chữ** (vd `1.2tr`, `1,25 triệu`, `2tr`): `^(\d+(?:[.,]\d+)?)\s*(?:tr|triệu|trieu|m)$` $\rightarrow$ thay `,` thành `.`, nhân `1_000_000`, `Math.round`.
   - **Dạng `k` có phần lẻ phía sau chữ** (vd `45k5`, `45k500`): `^(\d+)\s*k\s*(\d+)$` $\rightarrow$ `Math.round(whole * 1_000 + Number('0.' + frac) * 1_000)`.
   - **Dạng `k` chuẩn hoặc có dấu chấm/phẩy** (vd `190k`, `45.5k`, `45,5k`): `^(\d+(?:[.,]\d+)?)\s*k$` $\rightarrow$ thay `,` thành `.`, nhân `1_000`, `Math.round`.
   - **Dạng số đầy đủ có/không dấu phân cách hàng nghìn** (vd `190000`, `190.000`, `190,000`, `1 105 000`): khớp `^\d+$` hoặc `^\d{1,3}([.,\s]\d{3})+$` $\rightarrow$ bỏ dấu phân cách, parse số nguyên.
3. Kiểm tra biên: nếu không phải số nguyên hữu hạn, hoặc `val < (allowZero ? 0 : 1)`, hoặc `val > MAX_VND_AMOUNT` $\rightarrow$ trả về `null`.

**Bảng ví dụ Input $\rightarrow$ Output**:

| Input (`raw`) | `parseVndInput(raw)` | `formatVnd(result)` | Ghi chú |
| :--- | :---: | :---: | :--- |
| `"190000"` | `190000` | `"190.000đ"` | Số nguyên thuần |
| `"190.000đ"` | `190000` | `"190.000đ"` | Copy-paste từ bill/sheet |
| `"190k"` / `"190 K"` | `190000` | `"190.000đ"` | Viết tắt nghìn |
| `"45k5"` / `"45.5k"` / `"45,5k"` | `45500` | `"45.500đ"` | Nghìn lẻ trăm |
| `"1tr2"` / `"1.2tr"` / `"1m2"` | `1200000` | `"1.200.000đ"` | Triệu lẻ trăm nghìn |
| `"1tr25"` / `"1tr250"` | `1250000` | `"1.250.000đ"` | `0.25` và `0.250` triệu |
| `"1tr050"` / `"1tr50k"` | `1050000` | `"1.050.000đ"` | Triệu lẻ năm mươi nghìn |
| `"0"` *(allowZero: true)* | `0` | `"0đ"` | Dùng cho ô cố định `0đ` |
| `"0"` *(mặc định)* | `null` | — | Thành tiền khoản chi phải > 0 |
| `"-50k"` / `"abc"` / `"12.34.56"` | `null` | — | Không hợp lệ |

**Thuật toán `formatVnd(amount)`**: Dùng `Math.round(amount)` rồi format phần trị tuyệt đối bằng regex `\B(?=(\d{3})+(?!\d))` chèn dấu `.` + hậu tố `đ` (không phụ thuộc locale hệ điều hành trên iOS/Android Safari cũ, đảm bảo luôn xuất đúng `190.000đ`).

---

### 8.2. Chia tiền & Làm tròn chính xác 0đ (`src/domain/split.ts`)

```ts
export interface SplitInput {
  amount: number;
  participantIds: string[];
  fixedAmounts: Record<string, number>;
  memberOrder: string[]; // Thứ tự thành viên trong TripDoc.members để luôn nhất quán
  seedKey?: string;      // expenseId (hoặc '' khi đang tạo mới) để xoay vòng 1đ lẻ công bằng
}

export type SplitResult =
  | { ok: true; shares: Record<string, number> }
  | {
      ok: false;
      code:
        | 'INVALID_AMOUNT'
        | 'NO_PARTICIPANTS'
        | 'INVALID_FIXED_MEMBER'
        | 'NEGATIVE_FIXED'
        | 'FIXED_EXCEEDS_TOTAL'
        | 'FIXED_MISMATCH_TOTAL';
      message: string;
    };

export function calculateExpenseSplit(input: SplitInput): SplitResult;
```

**Thuật toán từng bước**:
1. **Validation**:
   - Kiểm tra `Number.isInteger(amount) && amount >= 1 && amount <= MAX_VND_AMOUNT` $\rightarrow$ sai trả `INVALID_AMOUNT`.
   - Khử trùng `participantIds`, kiểm tra `participantIds.length >= 1` $\rightarrow$ sai trả `NO_PARTICIPANTS` (*"Phải chọn ít nhất 1 người tham gia"*).
   - Duyệt từng `[id, val]` trong `fixedAmounts`:
     - Nếu `id` không nằm trong `participantIds` $\rightarrow$ `INVALID_FIXED_MEMBER`.
     - Nếu `!Number.isInteger(val) || val < 0` $\rightarrow$ `NEGATIVE_FIXED`.
   - Tính `sumFixed = Σ fixedAmounts[id]` và lọc `autoIds = memberOrder.filter(id => participantSet.has(id) && fixedAmounts[id] === undefined)` (nếu có id trong `participantSet` không nằm trong `memberOrder` thì nối thêm vào cuối theo thứ tự xuất hiện).
   - Nếu `sumFixed > amount` $\rightarrow$ trả `FIXED_EXCEEDS_TOTAL` (*"Tổng phần cố định vượt quá thành tiền..."*).
   - Nếu `autoIds.length === 0 && sumFixed !== amount` $\rightarrow$ trả `FIXED_MISMATCH_TOTAL` (*"Tổng các phần đã nhập lệch thành tiền..."*).
2. **Tính phần chia & Làm tròn khớp tuyệt đối (Largest Remainder xoay vòng xác định)**:
   - Gán trước `shares[id] = fixedAmounts[id]` cho mọi người có số cố định.
   - Nếu `autoIds.length > 0`:
     - `remaining = amount - sumFixed` (luôn là số nguyên $\ge 0$).
     - `base = Math.floor(remaining / autoIds.length)`.
     - `rem = remaining - base * autoIds.length` ($0 \le \text{rem} < \text{autoIds.length}$).
     - Tính chỉ số bắt đầu xoay vòng xác định `startIdx = seedKey ? djb2Hash(seedKey) % autoIds.length : 0`.
     - Với `i = 0 .. autoIds.length - 1`:
       `targetId = autoIds[(startIdx + i) % autoIds.length]`
       `shares[targetId] = base + (i < rem ? 1 : 0)`.
3. **Bất biến toán học (Guaranteed Invariant)**:
   - $\sum_{id} \text{shares}[id] = \text{sumFixed} + \text{base} \times k + \text{rem} = \text{sumFixed} + (\text{amount} - \text{sumFixed}) = \text{amount}$.
   - Mọi phần chia đều là **số nguyên VND $\ge 0$**; độ chênh giữa 2 người chia đều cùng khoản tối đa đúng `1đ`, và được xoay vòng theo `expenseId` nên không bao giờ dồn lẻ mãi vào 1 người.

**Kiểm chứng ví dụ bắt buộc**:
- Đầu vào: `amount = 190000`, `participantIds = ['sang', 'chung', 'mo', 'phung']`, `fixedAmounts = { chung: 45000, mo: 45000 }`.
- `sumFixed = 90000 <= 190000` (hợp lệ); `autoIds = ['sang', 'phung']` ($k = 2$).
- `remaining = 190000 - 90000 = 100000`; `base = 50000`; `rem = 0`.
- Kết quả: `{ sang: 50000, chung: 45000, mo: 45000, phung: 50000 }` $\rightarrow$ Tổng = `190.000đ` ✅.
- Ví dụ chia không hết: `amount = 100000`, 3 người chia đều $\rightarrow$ `base = 33333`, `rem = 1` $\rightarrow$ `[33334, 33333, 33333]`, Tổng = `100.000đ` ✅.

---

### 8.3. Số dư từng người (`src/domain/balance.ts`)

```ts
export function calculateMemberBalances(
  members: TripMember[],
  expenses: Expense[],
  payments: Payment[]
): MemberBalance[];
```

**Thuật toán**:
1. Khởi tạo bản đồ `balances[m.id] = { totalPaid: 0, totalOwed: 0, paymentsSent: 0, paymentsReceived: 0 }` cho mọi thành viên trong `members`.
2. Duyệt từng `expense` trong `expenses`:
   - Nếu `balances[expense.payerId]` tồn tại: `balances[expense.payerId].totalPaid += expense.amount`.
   - Gọi `calculateExpenseSplit({ amount, participantIds, fixedAmounts, memberOrder, seedKey: expense.id })`. Nếu `ok`: với mỗi `[id, share]` trong `shares`, cộng `balances[id].totalOwed += share`.
3. Duyệt từng `payment` trong `payments`:
   - `balances[payment.fromMemberId].paymentsSent += payment.amount`.
   - `balances[payment.toMemberId].paymentsReceived += payment.amount`.
4. Tính kết quả cho từng thành viên:
   - `expenseNet = totalPaid - totalOwed`
   - `remainingNet = expenseNet + paymentsSent - paymentsReceived`
5. Bất biến: $\sum \text{expenseNet} = 0$ và $\sum \text{remainingNet} = 0$ luôn chính xác tuyệt đối đến từng đồng.

---

### 8.4. Kế hoạch trả tiền ít giao dịch nhất (`src/domain/settlement.ts`)

```ts
export function calculateSettlementPlan(balances: MemberBalance[]): TransferItem[];
```

**Thuật toán (Exact-Match Priority + Greedy Largest-to-Largest, độ phức tạp $O(N^2)$)**:
1. Tách danh sách người còn nợ (`debtors`: `remainingNet < 0`, lưu `amount = -remainingNet`) và người còn phải nhận (`creditors`: `remainingNet > 0`, lưu `amount = remainingNet`). Bỏ qua người có `remainingNet === 0`.
2. **Bước 1 — Khớp đối xứng tuyệt đối (Exact Match)**:
   - Sắp xếp cả 2 mảng giảm dần theo `amount` (tie-break theo `memberId` tăng dần để kết quả luôn xác định 100%).
   - Nếu tồn tại `debtor.amount === creditor.amount`, ghép ngay 1 giao dịch `{ fromMemberId: debtor.id, toMemberId: creditor.id, amount }` và loại cả 2 người khỏi danh sách (1 giao dịch xóa sạch 2 đỉnh thay vì 1).
3. **Bước 2 — Tham lam lớn nhất ↔ lớn nhất (Greedy)**:
   - Trong khi cả `debtors` và `creditors` còn phần tử:
     - Sắp xếp lại 2 danh sách giảm dần theo `amount` (tie-break `memberId`).
     - Lấy `d = debtors[0]` và `c = creditors[0]`.
     - `transfer = Math.min(d.amount, c.amount)`.
     - Đẩy `{ fromMemberId: d.id, toMemberId: c.id, amount: transfer }` vào kết quả.
     - Trừ `transfer` khỏi `d.amount` và `c.amount`; loại phần tử nào về `0`.
4. **Tính chất**: Luôn sinh tối đa $N - 1$ giao dịch (thực tế thường đạt số tối thiểu lý thuyết nhờ bước Exact-Match), chạy < 0,1ms trên điện thoại cho $N \le 20$, không bị bùng nổ bộ nhớ như DP bitmask $O(3^N)$.

---

### 8.5. URL VietQR Động (`src/domain/vietqr.ts`)

```ts
export function removeVietnameseDiacritics(input: string): string;

export interface VietQrParams {
  bankBin: string;      // Mã BIN 6 số (vd: '970436')
  accountNo: string;    // Số tài khoản
  accountName?: string; // Tên chủ TK (tự bỏ dấu & viết hoa)
  amount: number;       // Số nguyên dương VND
  addInfo: string;      // Nội dung chuyển khoản (tự bỏ dấu & cắt <= 50 ký tự)
}

export function buildVietQrUrl(params: VietQrParams): string;
```

**Thuật toán**:
1. `removeVietnameseDiacritics(input)`:
   - `input.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')`
   - Loại bỏ ký tự đặc biệt ngoài `[a-zA-Z0-9 ]`, gộp nhiều khoảng trắng liên tiếp thành 1 khoảng trắng, `.trim()`.
2. `memo = removeVietnameseDiacritics(params.addInfo).slice(0, 50).trim()` (giới hạn 50 ký tự chuẩn tương thích mọi app ngân hàng NAPAS).
3. `accName = params.accountName ? removeVietnameseDiacritics(params.accountName).toUpperCase().slice(0, 50).trim() : ''`.
4. Ghép URL chuẩn Quick Link:
   ```ts
   const base = `https://img.vietqr.io/image/${encodeURIComponent(params.bankBin)}-${encodeURIComponent(params.accountNo.trim())}-compact2.png`;
   const qs = new URLSearchParams({ amount: String(Math.round(params.amount)) });
   if (memo) qs.set('addInfo', memo);
   if (accName) qs.set('accountName', accName);
   return `${base}?${qs.toString()}`;
   ```
5. *Ví dụ*: `addInfo = "Chung trả tiền Đà Lạt"` $\rightarrow$ `memo = "Chung tra tien Da Lat"` $\rightarrow$ `https://img.vietqr.io/image/970436-0123456789-compact2.png?amount=273750&addInfo=Chung+tra+tien+Da+Lat&accountName=NGUYEN+NGOC+THANH+SANG`.

---

### 8.6. Nội dung tin nhắn nhắc nợ (`src/domain/reminder.ts`)

```ts
export function buildGroupReminderMessage(params: {
  tripTitle: string;
  tripDate: string;
  tripUrl: string;
  totalExpense: number;
  transfers: TransferItem[];
  memberMap: Record<string, TripMember>;
}): string;

export function buildPersonalReminderMessage(params: {
  tripTitle: string;
  tripUrl: string;
  transfer: TransferItem;
  fromMember: TripMember;
  toMember: TripMember;
}): string;
```

**Mẫu xuất ra (tối ưu khi dán vào Messenger / Zalo)**:
- **Nhắc nợ cả nhóm (`buildGroupReminderMessage`)**:
  ```text
  📣 Tổng kết chia tiền: Đà Lạt tháng 11 (25/11/2026)
  💰 Tổng chi cả chuyến: 1.105.000đ

  📌 Cần chuyển khoản:
  • Chung → Sang: 273.750đ
  • Mơ → Sang: 273.750đ
  • Phụng → Sang: 278.750đ

  🔗 Xem chi tiết & quét mã QR (đã điền sẵn tiền):
  https://tripsplit-app.web.app/t/dalat-2026-7kP9mQx2vN4r
  ```
  *(Nếu `transfers.length === 0`: thay mục Cần chuyển khoản bằng `✅ Cả nhóm đã thanh toán xong 100%!`)*
- **Nhắc nợ riêng từng người (`buildPersonalReminderMessage`)**:
  ```text
  👋 Chung ơi, phần của bạn chuyến Đà Lạt tháng 11 là 273.750đ (chuyển cho Sang).
  🏦 Vietcombank - 0123456789 (NGUYEN NGOC THANH SANG)
  📝 Nội dung: Chung tra tien Da Lat thang 11
  🔗 Mở link quét QR điền sẵn tiền: https://tripsplit-app.web.app/t/dalat-2026-7kP9mQx2vN4r?pay=chung-sang
  ```

---

## 9. Route & Màn hình (Mobile-First)

### 9.1. Bảng Route

| Route | Component | Ai truy cập | Mục đích |
| :--- | :--- | :--- | :--- |
| `/` | `HomePage` | Mọi người | Trang chào tối giản: giải thích mở bằng link chuyến đi + nút *"Đăng nhập Admin"* (nếu đã đăng nhập Admin $\rightarrow$ tự chuyển sang `/admin`). |
| `/admin` | `AdminDashboardPage` | Chỉ Admin (`AdminGuard`) | Danh sách mọi chuyến đi, tạo chuyến mới, copy link chia sẻ, chốt sổ / mở khóa, xóa chuyến. |
| `/t/:tripId` | `TripPage` | Guest có link + Admin | **Màn hình trung tâm**: xem tổng kết, danh sách chi tiêu, quét QR, xác nhận đã chuyển, chia sẻ nhắc nợ. Hỗ trợ query `?pay=<fromId>-<toId>` tự mở thẳng sheet QR tương ứng. |
| `*` | `NotFoundPage` | Mọi người | Báo link không tồn tại hoặc đã bị xóa. |

### 9.2. Chi tiết trang Chuyến đi (`/t/:tripId`) — Thiết kế 1 tay (Thumb-Zone)

- **Header cố định nhẹ trên cùng (`TripHeader`)**:
  - Tên chuyến, ngày đi, tổng chi cả chuyến (chữ lớn nổi bật).
  - Badge trạng thái: `🔒 Đã chốt sổ` (khi `isLocked`) hoặc `✏️ Cả nhóm cùng nhập` (khi `allowGuestEdit`).
  - Nút hành động nhanh: **Copy link**, **Nhắc nợ** (mở `ReminderShareSheet`), và nếu là Admin có thêm menu `⋮` (*Sửa chuyến / thành viên*, *Bật/tắt khách nhập*, *Chốt sổ*, *Về quản lý*).
- **2 Tab chính ngay dưới Header (`Tabs` full-width)**:
  1. **Tab 1 — Tổng kết & Thanh toán *(mặc định khi mở link)***:
     - **Khối 1: Ai trả cho ai (Thanh toán tối ưu)** — đặt lên ĐẦU vì đây là thứ bạn bè mở link muốn xem nhất!
       - Mỗi khoản là 1 Card rõ ràng: `Chung → Sang` + **`273.750đ`**.
       - 2 nút bấm to dễ chạm (min-height `44px`): **`Quét QR`** (mở `VietQrSheet`) và **`Đã chuyển`** (mở `MarkPaidSheet`), kèm nút nhỏ copy nhắc riêng.
       - Nếu đã hết nợ: hiện trạng thái xanh `🎉 Cả nhóm đã thanh toán xong!`.
     - **Khối 2: Bảng tổng hợp theo từng người**: danh sách card gọn gồm *Tên*, *Đã ứng*, *Phải chịu*, và badge màu cho *Chênh lệch còn lại* (xanh lá `+Nhận lại`, đỏ `-Cần trả thêm`, xám `Đã xong`).
     - **Khối 3: Lịch sử đã thanh toán (`PaymentsHistory`)**: liệt kê các lần đã xác nhận chuyển kèm giờ và nút **Hoàn tác** (chỉ hiện nếu có quyền xóa và chuyến chưa khóa).
  2. **Tab 2 — Chi tiêu**:
     - Danh sách các khoản chi xếp mới nhất lên trên: *Tên khoản chi*, *Thành tiền*, *Ai đã ứng*, badge tóm tắt người tham gia (`Cả nhóm (4)` hoặc `Sang, Mơ` hoặc `Chia riêng`).
     - Chạm vào 1 khoản để bung chi tiết số tiền từng người phải chịu (và nút Sửa/Xóa nếu có quyền).
     - **Nút nổi FAB ở góc dưới phải (`+ Thêm khoản chi`)** — nằm gọn trong tầm ngón cái; chỉ hiện khi là Admin hoặc (`allowGuestEdit && !isLocked`).
- **Form thêm/sửa khoản chi (`ExpenseFormSheet` — Bottom Sheet)**:
  1. *Tên khoản chi* + *Thành tiền* (`VndInput` gõ `190k` hiện ngay preview `= 190.000đ` bên dưới, bật `inputMode="text"` để gõ được chữ `k`/`tr` linh hoạt trên mobile).
  2. *Người đã ứng tiền*: hàng chip cuộn ngang chạm 1 phát chọn người chi.
  3. *Người tham gia*: danh sách **chip bấm (mặc định chọn tất cả)**; chạm để bỏ/chọn lại.
  4. *Mở rộng "Chia tiền riêng (tùy chọn)"*: accordion thu gọn mặc định cho thoáng; mở ra hiện ô `VndInput` cạnh từng người đang tham gia. Khi gõ `45k` cho Chung và `45k` cho Mơ, 2 ô trống của Sang & Phụng tự hiện chữ mờ **`Tự tính: 50.000đ`** ngay lập tức; thanh trạng thái dưới cùng hiện `✔ Đã khớp 190.000đ` hoặc báo lỗi đỏ nếu vượt quá/lệch tổng.
- **Sheet Quét QR (`VietQrSheet`)**:
  - Nếu người nhận có thông tin ngân hàng: hiển thị ảnh VietQR động (`referrerPolicy="no-referrer"`, `compact2.png`), kèm 3 nút copy 1-chạm (**Copy STK**, **Copy số tiền**, **Copy nội dung**), nút **Tải ảnh QR**, và nút **Xác nhận tôi đã chuyển** ngay dưới cùng.
  - Nếu người nhận có `hasStaticQr === true`: hiện thêm tab chuyển sang **QR MoMo (tĩnh)** (chỉ `getDoc` từ `memberQrs` khi bấm vào tab này).
  - Nếu người nhận chưa cập nhật STK: hiện thông báo nhẹ + nút chuyển thẳng sang xác nhận đã trả tiền mặt.
- **Sheet Xác nhận đã chuyển (`MarkPaidSheet`)**:
  - Điền sẵn số tiền gợi ý (vd `273.750đ`), cho phép sửa nếu trả 1 phần (vd trả trước `200k`), ghi chú tùy chọn, bấm **"Xác nhận đã chuyển"** $\rightarrow$ tạo `PaymentDoc`.
- **Sheet Nhắc nợ & Chia sẻ (`ReminderShareSheet`)**:
  - Xem trước tin nhắn tổng kết + 3 nút: **Copy tin nhắn** (dán vào Messenger/Zalo), **Chia sẻ ngay** (Web Share API mở thẳng sheet share sang Messenger trên điện thoại), và **Tải ảnh tổng kết PNG** (`html-to-image` render từ `SummaryExportCard`).

### 9.3. Các trạng thái hệ thống (States)

- **Loading**: Dùng `Skeleton` mô phỏng layout Card tổng kết & danh sách chi tiêu (tránh giật bố cục).
- **Empty State**: Chuyến mới chưa có khoản chi $\rightarrow$ minh họa gọn + nút *"Thêm khoản chi đầu tiên"*.
- **Error / Permission Denied**: Hiển thị `Alert` tiếng Việt rõ ràng + nút *"Thử lại"*; nếu `trip` không tồn tại $\rightarrow$ màn hình *"Không tìm thấy chuyến đi — kiểm tra lại đường link"*.
- **Offline / Pending Sync**: `OfflineBanner` dính dưới Header báo *"Bạn đang ngoại tuyến — dữ liệu hiển thị từ bộ nhớ máy"* hoặc *"Đang đồng bộ X thay đổi..."*.
- **Locked State**: Khi `isLocked === true`, ẩn nút thêm/sửa/xóa/xác nhận trả đối với Guest và hiển thị badge `🔒 Chuyến đi đã chốt sổ`.

---

## 10. Cấu hình & Môi trường

### 10.1. Biến môi trường (`.env.example`)

*(Các biến `VITE_*` là cấu hình client công khai của Firebase Web SDK — bảo mật thực sự nằm ở `firestore.rules`, không nằm ở việc giấu Firebase API key).*

```env
VITE_FIREBASE_API_KEY=your_api_key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_APP_ID=your_app_id
VITE_ADMIN_UID=your_firebase_admin_uid
VITE_USE_EMULATORS=false
```

### 10.2. File cấu hình cốt lõi

- **`firebase.json`**:
  ```json
  {
    "firestore": {
      "rules": "firestore.rules",
      "indexes": "firestore.indexes.json"
    },
    "hosting": {
      "public": "dist",
      "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
      "headers": [
        {
          "source": "**",
          "headers": [
            { "key": "Referrer-Policy", "value": "no-referrer" },
            { "key": "X-Content-Type-Options", "value": "nosniff" },
            { "key": "X-Robots-Tag", "value": "noindex, nofollow" }
          ]
        }
      ],
      "rewrites": [{ "source": "**", "destination": "/index.html" }]
    },
    "emulators": {
      "auth": { "port": 9099 },
      "firestore": { "port": 8080 },
      "hosting": { "port": 5000 },
      "ui": { "enabled": true, "port": 4000 }
    }
  }
  ```
- **`firestore.indexes.json`**: Khai báo composite index trên subcollection `expenses` cho cặp trường `expenseDate (DESC)` + `createdAt (DESC)`.
- **`.github/workflows/deploy.yml`**: Trigger khi push lên `main`:
  1. `npm ci` $\rightarrow$ `npm run typecheck` $\rightarrow$ `npm run test` (unit tests).
  2. `npm run build` (inject `VITE_*` từ GitHub Repository Variables/Secrets).
  3. Deploy Firebase Hosting qua `FirebaseExtended/action-hosting-deploy@v0` (`channelId: live`, dùng `FIREBASE_SERVICE_ACCOUNT` tạo bằng `firebase init hosting:github`).
  4. Deploy Firestore Rules & Indexes qua `npx firebase-tools deploy --only firestore:rules,firestore:indexes --non-interactive` bằng cùng Service Account.

### 10.3. Scripts trong `package.json`

| Script | Lệnh | Công dụng |
| :--- | :--- | :--- |
| `dev` | `vite` | Chạy dev server kết nối Firebase (hoặc Emulator nếu `VITE_USE_EMULATORS=true`) |
| `dev:emu` | `firebase emulators:exec --only auth,firestore "vite"` | Chạy full stack local không cần mạng |
| `build` | `tsc -b && vite build` | Kiểm tra kiểu TypeScript và build production vào `dist/` |
| `typecheck` | `tsc --noEmit` | Kiểm tra lỗi kiểu nhanh trong CI |
| `test` | `vitest run src/domain` | Chạy toàn bộ unit tests logic nghiệp vụ |
| `test:rules` | `firebase emulators:exec --only firestore "vitest run tests/rules"` | Chạy bộ test Security Rules trên Firestore Emulator |
| `lint` | `eslint .` | Kiểm tra chuẩn code |

---

## 11. Thứ tự triển khai tuần tự

1. **Bước 1 — Khởi tạo dự án & công cụ**: Tạo dự án Vite + React + TypeScript, cài Tailwind v4, `shadcn/ui`, `lucide-react`, `firebase`, `react-router-dom`, `zod`, `vitest`, `sonner`, `html-to-image`; cấu hình `firebase.json`, `robots.txt`, `index.html`.
2. **Bước 2 — Domain Logic & Unit Tests (TDD)**: Viết toàn bộ `src/types/models.ts`, `src/data/banks.ts`, và 6 module trong `src/domain/*` (`vnd`, `split`, `balance`, `settlement`, `vietqr`, `reminder`) kèm 100% unit tests pass.
3. **Bước 3 — Security Rules & Rules Tests**: Viết `firestore.rules`, `firestore.indexes.json` và chạy bộ test `@firebase/rules-unit-testing` trên Firebase Emulator cho đến khi pass hết mọi kịch bản tấn công.
4. **Bước 4 — Tầng Firebase Services & Hooks**: Viết `src/lib/firebase.ts` (kèm offline IndexedDB cache), `services/*`, `hooks/useAuth.ts`, `hooks/useTripRealtime.ts`, `hooks/useOnlineStatus.ts`.
5. **Bước 5 — Luồng Admin**: Xây `HomePage`, `AdminGuard`, `AdminDashboardPage`, `TripFormSheet`, `MemberBankRow` (kèm nén ảnh QR tĩnh MoMo).
6. **Bước 6 — Luồng Trang Chuyến đi (Mobile-first)**: Xây `TripPage`, `TripHeader`, `SummaryTab`, `ExpensesTab`, `ExpenseFormSheet` (có `VndInput`), `VietQrSheet`, `MarkPaidSheet`, `PaymentsHistory`, `ReminderShareSheet`, `SummaryExportCard`.
7. **Bước 7 — Thiết lập Firebase Project thật & CI/CD**: Tạo Firebase Project (Spark Plan — không nhập thẻ), bật Authentication (Google) & Firestore (`asia-southeast1` Singapore cho tốc độ nhanh nhất ở VN), đăng nhập lần đầu lấy `ADMIN_UID` điền vào `.env` & `firestore.rules`, cấu hình GitHub Secrets và push `main` để kiểm tra auto-deploy.

---

## 12. Kiểm thử & Nghiệm thu

### 12.1. Test Case cho Logic Nghiệp Vụ (`src/domain/__tests__/`)

1. **`vnd.test.ts`**:
   - Parse chuẩn toàn bộ bảng ví dụ (`190000`, `190.000đ`, `190k`, `45k5`, `45,5k`, `1tr2`, `1tr25`, `1tr050`, `1tr50k`, `0` với `allowZero`).
   - Từ chối các chuỗi sai (`""`, `"-10k"`, `"abc"`, `"2000000000"`, `"12.34.56"`).
   - Format `190000` $\rightarrow$ `"190.000đ"`, `-273750` $\rightarrow$ `"-273.750đ"`, `826250` (`formatSignedVnd`) $\rightarrow$ `"+826.250đ"`.
2. **`split.test.ts`**:
   - Chia đều 4 người (`575.000đ`) $\rightarrow$ `143.750đ` × 4, tổng `575.000đ`.
   - Chia nhóm nhỏ 2/4 người (`100.000đ` xăng chỉ Sang & Mơ) $\rightarrow$ Sang `50.000`, Mơ `50.000`, Chung/Phụng không có trong `shares`.
   - **Test bắt buộc**: `190.000đ`, `participantIds = [sang, chung, mo, phung]`, `fixedAmounts = { chung: 45000, mo: 45000 }` $\rightarrow$ `{ sang: 50000, chung: 45000, mo: 45000, phung: 50000 }`.
   - Làm tròn không lẻ VND: `100.000đ` chia 3 $\rightarrow$ `[33334, 33333, 33333]`, tổng đúng `100.000đ`; `10đ` chia 3 $\rightarrow$ `[4, 3, 3]`.
   - Cố định toàn bộ khớp tổng (`50k, 45k, 45k, 50k` cho `190k`) $\rightarrow$ `ok: true`; lệch tổng (`50k, 45k, 45k, 40k`) $\rightarrow$ `FIXED_MISMATCH_TOTAL`; vượt tổng (`100k, 100k` cho `190k`) $\rightarrow$ `FIXED_EXCEEDS_TOTAL`; rỗng người tham gia $\rightarrow$ `NO_PARTICIPANTS`; cố định người không tham gia $\rightarrow$ `INVALID_FIXED_MEMBER`.
3. **`balance.test.ts` & `settlement.test.ts`**:
   - Bộ 4 khoản từ Google Sheet mẫu (*Nhà nghỉ 575k, Cháo mực 260k, Tàu hủ 80k, Ăn sáng 190k chia riêng*) $\rightarrow$ Sang `+826.250`, Chung `-273.750`, Mơ `-273.750`, Phụng `-278.750` $\rightarrow$ đúng 3 giao dịch trả Sang.
   - Sau khi Chung trả `273.750đ` (thêm `Payment`) $\rightarrow$ Chung còn `0đ`, chỉ còn 2 giao dịch (Mơ & Phụng).
   - Sau khi Chung đã trả xong, thêm khoản `Gửi xe 20.000đ` (Sang chi, chia 4) $\rightarrow$ Chung tự động hiện còn thiếu đúng `5.000đ` cho Sang.
   - Exact-Match test: A nợ 100k, B nợ 50k, C nhận 100k, D nhận 50k $\rightarrow$ chỉ đúng 2 giao dịch (`A→C 100k`, `B→D 50k`).
4. **`vietqr.test.ts` & `reminder.test.ts`**:
   - Bỏ dấu `"Chung trả tiền Đà Lạt (đợt 1)!"` $\rightarrow$ `"Chung tra tien Da Lat dot 1"`.
   - Chuỗi dài > 50 ký tự được cắt gọn $\le 50$ ký tự.
   - Tin nhắn nhắc nợ chứa đủ tên chuyến, danh sách chuyển khoản và URL chuyến đi.

### 12.2. Test Case cho Security Rules (`tests/rules/firestore.rules.test.ts`)

Chạy bằng `@firebase/rules-unit-testing`:
1. **Guest `list` `/trips`**: Bị từ chối (`PERMISSION_DENIED`).
2. **Guest `get` `/trips/{validId}`**: Thành công.
3. **Guest sửa `trips/{id}` (cố đổi `members[0].accountNo`, đổi `isLocked`, hoặc bật `allowGuestEdit`)**: Bị từ chối.
4. **Guest ghi `memberQrs/{memberId}` (cố tráo ảnh QR MoMo)**: Bị từ chối.
5. **Guest đọc/ghi `/contacts`**: Bị từ chối.
6. **Guest thêm `expense` khi `allowGuestEdit == false`**: Bị từ chối; khi `allowGuestEdit == true && isLocked == false` và `createdBy == 'guest'`: Thành công; nếu giả mạo `createdBy == 'admin'` hoặc `payerId` không nằm trong `trip.memberIds`: Bị từ chối.
7. **Guest sửa/xóa `expense` do Admin tạo (`createdBy == 'admin'`)**: Bị từ chối ngay cả khi `allowGuestEdit == true`.
8. **Guest thêm/xóa `payment` khi `isLocked == false`**: Thành công với `markedBy == 'guest'`; khi `isLocked == true`: Bị từ chối; Guest cố xóa `payment` do Admin đánh dấu (`markedBy == 'admin'`): Bị từ chối.
9. **Chống phá schema / DoS**: Tạo `expense` với `title` > 100 ký tự, `amount = -100`, `amount = 100.5` (float), thêm field lạ `hacked: true`, hoặc `fixedAmounts` chứa key không nằm trong `participantIds` $\rightarrow$ đều bị từ chối.
10. **Admin**: Toàn quyền CRUD hợp lệ trên `trips`, `expenses`, `payments`, `memberQrs`, `contacts`; nhưng vẫn bị chặn nếu gửi sai schema hoặc đổi `createdAt`/`createdByUid`.

### 12.3. Kịch bản kiểm thử thủ công (Nghiệm thu)

1. Mở link `/t/<tripId>` trên trình duyệt ẩn danh (điện thoại thật, màn hình 375px–430px): kiểm tra thao tác 1 tay, không bị tràn ngang, bấm `Quét QR` rồi mở app ngân hàng quét thử mã VietQR xem có tự điền đúng **số tiền** và **nội dung không dấu** không.
2. Mở cùng link trên 2 thiết bị (máy tính Admin + điện thoại bạn bè): Admin thêm khoản chi $\rightarrow$ điện thoại tự cập nhật < 1 giây; điện thoại bấm *"Tôi đã chuyển"* $\rightarrow$ máy tính tự gạch nợ.
3. Bật chế độ máy bay trên điện thoại khi đang ở trang chuyến đi: kiểm tra vẫn xem được danh sách & tổng kết từ cache, thử mở sheet QR để xác nhận giao diện fallback Copy STK hoạt động tốt.
4. Kiểm tra nút *"Chia sẻ"* trên iOS Safari / Android Chrome để xác nhận mở được menu share sang Messenger, và nút *"Tải ảnh tổng kết"* xuất đúng file PNG sắc nét.

---

## 13. Giai đoạn 2 (Để sau MVP — đã chừa sẵn đường nâng cấp)

- **Danh bạ bạn bè (`/contacts`)**: Schema TypeScript và Security Rules cho `/contacts` đã được thiết kế sẵn ở Mục 6 & 7; Giai đoạn 2 chỉ cần thêm màn hình quản lý danh bạ cho Admin và nút *"Chọn từ danh bạ"* trong `TripFormSheet`.
- **Thống kê vui cuối chuyến**: Tính thuần trên client từ `expenses` hiện có (người chi nhiều nhất, trung bình/người, top 3 khoản lớn nhất, biểu đồ cột/tròn đơn giản) — không cần đổi database.
- **Chế độ "Chốt sổ" nâng cao & lưu trữ lịch sử**: Đã có sẵn cờ `isLocked` trong `TripDoc` từ MVP; Giai đoạn 2 có thể thêm bộ lọc *"Đang đi / Đã chốt sổ"* trên Admin Dashboard và nút *"Nhân bản chuyến đi"* để tái sử dụng nhóm bạn cũ.
- **Đính kèm ảnh hóa đơn (bill)**: Vì Cloud Storage for Firebase yêu cầu thẻ (Blaze), nếu triển khai ở Giai đoạn 2 mà vẫn muốn 0đ không thẻ thì tích hợp **Cloudflare R2** (hoặc Cloudinary free tier) hoặc chỉ lưu ảnh bill đã nén mạnh ≤ 80 KB trong subcollection riêng với giới hạn số lượng/chuyến.
- **Webhook nhắc nợ tự động (Telegram / Discord)**: Cần proxy nhẹ không lộ Bot Token trên client $\rightarrow$ ở Giai đoạn 2 có thể dùng **Cloudflare Workers (Free 100.000 req/ngày, không cần thẻ)** làm 1 endpoint webhook duy nhất thay vì Cloud Functions.

---

## 14. Rủi ro & Điểm yếu phát hiện trong `IDEA.md` (và cách xử lý)

| # | Điểm yếu / Mâu thuẫn trong `IDEA.md` | Rủi ro thực tế nếu làm theo nguyên bản | Cách bản thiết kế này xử lý dứt điểm |
| :-: | :--- | :--- | :--- |
| 1 | **Xác thực Admin bằng mã PIN cá nhân + không backend** | Không có server/Cloud Functions thì Firestore Rules không thể kiểm tra PIN cho thao tác `list` và `delete`, còn kiểm tra PIN ở phía client thì bất kỳ ai mở DevTools cũng gọi thẳng API Firestore xóa sạch chuyến đi hoặc sửa STK ngân hàng. | Thay bằng **Firebase Auth (Google Sign-In 1-click)** khóa cứng 1 `ADMIN_UID` trong `firestore.rules`. Vẫn 0đ, vẫn không cần Auth cho bạn bè, thao tác nhanh hơn gõ PIN và bảo mật thực sự ở tầng server. |
| 2 | **Ví dụ link dễ đoán `/t/dalat-2026` trong khi trang hiện STK ngân hàng** | Kẻ xấu có thể đoán/quét các slug phổ biến (`dalat-2026`, `vungtau-2026`...) để thu thập họ tên + số tài khoản ngân hàng của cả nhóm; ngoài ra thẻ `<img src="https://img.vietqr.io/...">` mặc định sẽ gửi URL chuyến đi qua header `Referer`. | Bắt buộc định dạng `<slug>-<12-ký-tự-ngẫu-nhiên>` (~71 bit entropy), cấm `allow list` cho Guest, gắn `noindex, nofollow` và `Referrer-Policy: no-referrer`. |
| 3 | **Gợi ý đính kèm ảnh QR tĩnh MoMo & ảnh hóa đơn (bill) cùng ràng buộc 0đ không thẻ** | Từ cuối 2024, **Cloud Storage for Firebase yêu cầu nâng cấp gói Blaze (có thẻ)** cho dự án mới $\rightarrow$ vi phạm ràng buộc không cần thẻ. | Bỏ Cloud Storage; ảnh QR MoMo tùy chọn được nén client-side ≤ 70 KB và lưu trong subcollection lazy-load `memberQrs` trên Firestore (0đ không thẻ); đẩy ảnh bill sang Giai đoạn 2 với lưu ý rõ ràng. |
| 4 | **Trạng thái "Đã trả / Chưa trả" mô tả như 1 nút tick trên từng dòng nợ** | Nếu lưu boolean `paid: true` theo dòng kế hoạch thanh toán, chỉ cần thêm 1 khoản chi mới sau khi có người đã chuyển tiền thì toàn bộ đồ thị nợ tính lại $\rightarrow$ mất dấu hoặc báo sai số tiền đã chuyển. | Thiết kế thành **sổ cái `payments`** lưu đúng số tiền thực tế đã chuyển và cộng trừ trực tiếp vào `remainingNet`. Phát sinh chi tiêu mới tự động tính đúng phần chênh lệch còn thiếu. |
| 5 | **Chế độ `allowGuestEdit` không phân ranh giới sửa/xóa** | Nếu cho Guest sửa/xóa tự do mọi thứ khi bật `allowGuestEdit`, bạn bè có thể vô tình xóa nhầm khoản chi của Admin hoặc sửa nhầm thông tin thành viên. | Chỉ cho Guest tạo/sửa/xóa khoản chi mang `createdBy == 'guest'`; **tuyệt đối không cho Guest sửa `trips/{tripId}`** (thành viên, STK, cấu hình) hay khoản do Admin nhập. |
| 6 | **Thiếu quy tắc làm tròn VND khi chia không hết** | Chia `100.000đ` cho 3 người ra `33.333,33đ` — nếu làm tròn từng người độc lập sẽ bị hụt `1đ` (`99.999đ` ≠ `100.000đ`), làm tổng chênh lệch không bao giờ về `0đ`. | Áp dụng thuật toán **chia nguyên + phân bổ phần dư `rem` (1đ)** xoay vòng xác định theo hash của `expenseId`, đảm bảo tổng chia luôn bằng chính xác 100% `amount` và không dồn lẻ vào 1 người. |
| 7 | **Xuất ảnh thẻ tổng kết có chứa ảnh QR tải từ domain ngoài (`img.vietqr.io`)** | Khi dùng `html-to-image` chụp DOM chứa ảnh cross-origin, trình duyệt có thể báo lỗi tainted canvas nếu server ảnh không trả đầy đủ header CORS trong một số thời điểm. | Gắn `crossOrigin="anonymous"` khi tải ảnh QR cho thẻ export và có **fallback an toàn**: nếu lỗi CORS khi chụp QR thì vẫn xuất được ảnh thẻ tổng kết đầy đủ danh sách nợ + thông tin STK + link, không làm treo nút tải ảnh. |
| 8 | **Đính kèm ghi chú không ràng buộc độ dài/dấu cho VietQR** | Nhiều app ngân hàng Việt Nam lỗi quét QR nếu `addInfo` có dấu tiếng Việt, ký tự đặc biệt hoặc dài quá 50 ký tự. | Chuẩn hóa bắt buộc qua `removeVietnameseDiacritics()` + lọc ký tự `[a-zA-Z0-9 ]` + cắt tối đa 50 ký tự trong `buildVietQrUrl`. |
