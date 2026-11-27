# TripSplit

Web app chia tiền đi chơi cho nhóm bạn thân (4–15 người/chuyến), thiết kế mobile-first để thao tác một tay trên điện thoại, chi phí vận hành **0đ** (Firebase Spark + Cloudflare Workers Static Assets).

## Tài liệu dự án

- [DESIGN.md](./DESIGN.md) — Thiết kế kỹ thuật đã chốt (nguồn sự thật cho triển khai).
- [AGENTS.md](./AGENTS.md) — Quy tắc code, docstring tiếng Việt và kiến trúc dự án.
- [Kế hoạch triển khai MVP](./docs/superpowers/plans/2026-11-25-tripsplit-mvp.md) — Danh sách task tuần tự và checklist nghiệm thu.

## Các lệnh `npm` hiện có

| Lệnh | Công dụng |
| :--- | :--- |
| `npm run dev` | Chạy Vite dev server ở local |
| `npm run emulators` | Khởi động Firebase Emulator Suite (`auth:9099`, `firestore:8080`, `ui:4000`) |
| `npm test` | Chạy toàn bộ unit & component test bằng Vitest (`src/**/*.test.{ts,tsx}`) |
| `npm run test:rules` | Chạy kiểm thử `firestore.rules` và lớp dữ liệu trên Firestore Emulator (`tests/`) |
| `npm run deploy:rules` | Deploy `firestore.rules` lên project production (`-P prod`) |
| `npm run typecheck` | Kiểm tra kiểu TypeScript cho mã nguồn ứng dụng (`tsconfig.app.json`) |
| `npm run lint` | Kiểm tra chuẩn code bằng ESLint |
| `npm run build` | Kiểm tra TypeScript toàn dự án (`tsc -b`) và build production vào `dist/` |
| `npm run preview` | Xem trước bản build production ở local |
