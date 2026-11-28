# TripSplit

Web app chia tiền đi chơi cho nhóm bạn thân (4–15 người/chuyến), thiết kế mobile-first để thao tác một tay trên điện thoại, chi phí vận hành **0đ** (Firebase Spark + Cloudflare Workers).

## Tài liệu dự án

- [DESIGN.md](./DESIGN.md) — Thiết kế kỹ thuật đã chốt (nguồn sự thật cho triển khai).
- [AGENTS.md](./AGENTS.md) — Quy tắc code, docstring tiếng Việt và kiến trúc dự án.
- [docs/DEPLOY.md](./docs/DEPLOY.md) — Deploy, môi trường local/preview/production, biến môi trường, CI và checklist rollback.
- [Kế hoạch triển khai MVP](./docs/superpowers/plans/2026-11-25-tripsplit-mvp.md) — Danh sách task tuần tự và checklist nghiệm thu.

## Chạy ở local

```bash
npm ci
npm run emulators   # terminal 1: Firebase Auth + Firestore Emulator (project giả demo-tripsplit)
npm run dev         # terminal 2: dùng .env.local (VITE_USE_EMULATOR=true), không đụng dữ liệu thật
```

Mẫu biến môi trường ở `.env.example` (`.env.local` cho dev, `.env.production.local` khi build trên máy).

## Các lệnh `npm` hiện có

| Lệnh | Công dụng |
| :--- | :--- |
| `npm run dev` | Chạy Vite dev server ở local |
| `npm run emulators` | Chạy Firebase Auth + Firestore Emulator (`demo-tripsplit`) |
| `npm test` | Chạy unit/component test bằng Vitest (`src/**`, `scripts/**`) |
| `npm run test:rules` | Chạy test `firestore.rules` và lớp dữ liệu trên Firestore Emulator (`tests/`, cần Java) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript cho mã nguồn ứng dụng (`tsconfig.app.json`) |
| `npm run lint` | Kiểm tra chuẩn code bằng ESLint |
| `npm run build` | Kiểm tra TypeScript toàn dự án (`tsc -b`) và build production vào `dist/`; dừng nếu cấu hình Firebase trỏ vào emulator |
| `npm run preview` | Xem trước bản build production ở local |
| `npm run deploy:rules` | Deploy `firestore.rules` lên Firebase production |

## Deploy

- **Frontend**: merge vào `main` → Cloudflare Workers Builds tự build và deploy (`wrangler.jsonc`). Mỗi PR có bản preview riêng.
- **Firestore rules**: deploy tay bằng `npm run deploy:rules` (thường **trước** khi merge PR có đổi rules).
- **CI**: GitHub Actions (`.github/workflows/ci.yml`) chạy typecheck, lint, test, build và rules test trên mỗi PR — chỉ kiểm tra, không deploy.

Xem [docs/DEPLOY.md](./docs/DEPLOY.md) trước khi deploy.
