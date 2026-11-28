# Deploy TripSplit

Hướng dẫn deploy và các kiểm tra trước/sau khi đưa code lên production.

## 1. App gồm 2 phần, deploy ở 2 nơi

```
Điện thoại  ──(1) tải HTML/JS/CSS──▶  Cloudflare Workers   (chỉ chứa file tĩnh trong dist/)
     │
     └──(2) JS gọi thẳng──────────▶  Firebase             (Firestore + Auth + firestore.rules)
```

Không có backend riêng. Cấu hình Firebase nằm công khai trong JS, nên **`firestore.rules` là lớp phân quyền
duy nhất** — ẩn nút trên UI không chặn được ai.

| Thứ được deploy | Ở đâu | Cách deploy |
|---|---|---|
| Frontend (`dist/`) | Cloudflare Workers | **Tự động** khi merge vào `main` (Workers Builds: `npm ci` → `npm run build` → `npx wrangler deploy`) |
| `firestore.rules` | Firebase | **Tay**: `npm run deploy:rules` |
| Cài đặt Auth (provider, Authorized domains) | Firebase Console | **Tay**: bấm trên web |

Hai phần đầu deploy độc lập, nên phải tự lo thứ tự (mục 4).

## 2. Ba môi trường

| | Local | Preview (PR) | Production |
|---|---|---|---|
| Frontend | `npm run dev` | Cloudflare, link riêng trong comment của PR | `trip-split.nguyensang2032003.workers.dev` |
| Dữ liệu & Auth | **Firebase Emulator** (`npm run emulators`) | **Firebase thật — dùng chung với prod** | Firebase thật |
| Cấu hình | `.env.local` | Biến build trên Cloudflare | Biến build trên Cloudflare |

- ⚠️ **Preview đọc/ghi dữ liệu thật**: thử xóa trên preview là xóa thật. Thử bằng chuyến test riêng.
- Rules chỉ có **một bản** cho cả preview và prod → không thể thử rules mới trên preview mà giữ rules cũ cho prod.

## 3. Biến môi trường

Vite nhúng giá trị `VITE_*` vào JS **lúc build**, nên chúng phải có ở nơi chạy `npm run build`.

| File / nơi khai báo | Dùng khi | Commit? |
|---|---|---|
| `.env.local` | `npm run dev` với emulator — để trống 4 biến Firebase, `VITE_USE_EMULATOR=true` | Không |
| `.env.production.local` | `npm run build` **trên máy bạn** (vd. `wrangler versions upload`) | Không |
| Cloudflare → Worker → **Settings → Build → Variables and secrets** | Build trên Cloudflare (prod + preview) | — |
| `.env.example` | Mẫu | Có |

6 biến: `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`,
`VITE_ADMIN_UID`, `VITE_USE_EMULATOR`. Đây là cấu hình web công khai, không phải secret.

**Chặn build sai cấu hình** (`scripts/build-env-guard.ts`): `vite build` dừng với lỗi tiếng Việt nếu
`VITE_USE_EMULATOR=true`, thiếu biến bắt buộc, hoặc project là `demo-*`. `npm run dev` không bị ảnh hưởng.
Chỉ đặt `SKIP_ENV_GUARD=1` khi cố ý build bằng cấu hình giả (CI làm vậy để kiểm tra code biên dịch được).

## 4. Checklist deploy thủ công

### Trước khi merge
1. **CI xanh** trên PR (GitHub Actions `CI`: typecheck, lint, test, build, rules tests). Hoặc chạy trên máy:
   `npm run typecheck && npm run lint && npm test && npm run test:rules && npm run build`.
2. **PR có sửa `firestore.rules` hoặc thêm trường dữ liệu?** Nghĩ trước 2 trường hợp lệch:
   - frontend mới + rules cũ → thường bị **chặn ghi** dữ liệu mới;
   - frontend cũ + rules mới → thường **ít hại hơn**.

   ⇒ Thường **deploy rules trước** (`npm run deploy:rules` từ nhánh của PR), rồi mới merge.
3. **PR cần cài đặt trên Firebase Console?** (bật provider Auth, thêm Authorized domain…) → làm trước khi merge.
4. Thử bản preview trong comment của PR (tab ẩn danh, chuyến test riêng).

### Merge & sau khi merge
5. Merge PR → Cloudflare → Worker `trip-split` → **Deployments**: chờ bản mới báo thành công (~1–2 phút).
6. Mở production bằng tab ẩn danh, thử luồng chính: mở `/t/<tripId>`, xem tổng kết, thêm khoản chi (nếu bật),
   bấm "Đã chuyển", đăng nhập admin.
7. Firebase Console → Firestore → **Rules**: thời điểm publish khớp lần deploy gần nhất.

### Rollback khi có sự cố
1. **Frontend** (có hiệu lực ngay): Cloudflare → Deployments → version trước → **Rollback**.
2. **Rules** (ngay sau bước 1, nếu PR có đổi rules):
   `git checkout <commit-cũ> -- firestore.rules` → `npm run deploy:rules` → `git checkout -- firestore.rules`.
3. **Git**: revert PR (tạo PR revert và merge), nếu không lần push `main` sau sẽ build lại bản lỗi.
   Chú ý giữ lại các file hạ tầng không liên quan (vd. UID admin trong `firestore.rules`).
4. Dữ liệu đã ghi bằng bản mới có thể không hợp với rules cũ (vd. trường mới bị `exactKeys` từ chối) → chỉ xóa
   rồi nhập lại được.

Ví dụ thực tế: `docs/notes/member-identity-rollback.md`.

## 5. Các file cấu hình deploy

| File | Vai trò |
|---|---|
| `wrangler.jsonc` | Cấu hình Worker: thư mục `dist/`, `not_found_handling: "single-page-application"` (mở thẳng `/t/...` hay F5 trả `index.html` cho React Router — thay cho `_redirects` của Cloudflare Pages, vốn gây vòng lặp trên Workers), `previews: {}` để `wrangler preview` tạo bản preview cho PR |
| `public/_headers` | Header bảo mật Cloudflare gắn vào mọi response (Referrer-Policy, nosniff, noindex) |
| `firebase.json` | Đường dẫn rules/indexes và cổng emulator |
| `.firebaserc` | Alias project: `default` = `demo-tripsplit` (emulator), `prod` = `trip-split-4da89` |
| `firestore.rules` | Luật phân quyền chạy trên server Google; test: `npm run test:rules` |
| `.github/workflows/ci.yml` | Kiểm tra tự động trên mỗi PR/push `main` — **không deploy** |
| `scripts/build-env-guard.ts` | Plugin Vite chặn build prod sai cấu hình |

## 6. Hướng cải thiện (chưa làm)
- **Một pipeline deploy cả hai**: GitHub Actions deploy rules **rồi** frontend khi merge `main`, tắt tự build của
  Cloudflare → không còn phải nhớ thứ tự. Cần secret: Cloudflare API token + Firebase service account.
- **Firebase project riêng cho preview** (vd. `trip-split-staging`) để preview không đụng dữ liệu/rules thật.
- **Bắt buộc CI xanh mới được merge**: GitHub → Settings → Branches → rule cho `main` → Require status checks.
