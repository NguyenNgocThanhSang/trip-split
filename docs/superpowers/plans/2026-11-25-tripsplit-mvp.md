# TripSplit MVP Implementation Plan

> **For agentic workers (Antigravity `agy` or any coding agent):** Làm **từng task theo thứ tự, mỗi lần một task**. Bước có checkbox `- [ ]` — đánh `- [x]` trong file này ngay khi xong bước đó. Bước đánh dấu 👤 là việc của người dùng: dừng lại, nói rõ cần họ làm gì, chờ họ xác nhận. Quy tắc làm việc chi tiết ở mục **Execution Rules** ngay dưới.

## Execution Rules

1. **Đọc trước khi làm**: `AGENTS.md`, `DESIGN.md` và toàn bộ file này. `DESIGN.md` là nguồn sự thật; plan này chỉ chốt thêm tên file, chữ ký hàm và test.
2. **TDD bắt buộc** ở mọi task có test: viết test → chạy thấy FAIL đúng lý do → cài đặt → chạy thấy PASS. Không viết code trước test.
3. **Không sửa test cho khớp code.** Test sai so với `DESIGN.md` thì dừng, báo người dùng chỗ mâu thuẫn, chờ quyết định.
4. **Không tự đổi quyết định thiết kế** (stack, dịch vụ, schema, rules, thuật toán). Thấy plan/design có lỗi hoặc không làm được: dừng, giải thích, đề xuất cách sửa, chờ người dùng đồng ý; đồng ý rồi thì sửa cả `DESIGN.md` lẫn file này.
5. **Không cài thêm package** ngoài danh sách trong Tech Stack và các task, trừ khi người dùng đồng ý.
6. **Hết mỗi task**: kiểm lại comment/docstring (rule #9), chạy `npm test` (và `npm run test:rules` từ Task 8 trở đi), `npm run typecheck`, `npm run lint` — tất cả phải sạch — rồi mới commit. Báo cáo ngắn: đã làm gì, kết quả lệnh, có gì lệch so với plan. **Dừng chờ người dùng xác nhận** trước khi sang task kế.
7. **Không bao giờ**: nâng Firebase lên Blaze, bật Cloud Functions/Storage, deploy production, `git push`, hay chạy lệnh xóa dữ liệu ngoài emulator — trừ khi task ghi rõ và người dùng đồng ý tại thời điểm đó.
8. Lệnh chạy trên Windows (PowerShell hoặc Git Bash). Lệnh cần trình duyệt (`firebase login`) do người dùng tự chạy.
9. **Comment & docstring đầy đủ** theo mục "Code comments & docstrings" trong `AGENTS.md` (tiếng Việt, TSDoc cho mọi export, `@example` cho mọi hàm `src/lib`, comment giải thích *vì sao* cho logic nghiệp vụ và từng dòng `allow` trong rules). Thiếu comment/docstring thì task **chưa xong**.

**Goal:** Xây TripSplit MVP — web app chia tiền đi chơi mobile-first, 0đ — từ thư mục trống tới bản chạy production trên Cloudflare Pages + Firebase Spark.

**Architecture:** SPA tĩnh React; toàn bộ tính toán (chia tiền, số dư, kế hoạch trả) là hàm thuần trong `src/lib` chạy ở client trên dữ liệu thô từ Firestore. Không có backend: `firestore.rules` là lớp phân quyền duy nhất. Admin đăng nhập Google, khách vào bằng link chuyến đi.

**Tech Stack:** React + Vite + TypeScript (strict), Tailwind CSS, shadcn/ui, lucide-react, sonner, React Router, Firebase JS SDK (Firestore + Auth), Vitest, @testing-library/react + jsdom, @firebase/rules-unit-testing, Firebase Emulator Suite, Cloudflare Pages.

**Spec:** `DESIGN.md` (đọc kèm; mọi số mục `§x` bên dưới trỏ vào file này). `IDEA.md` là spec gốc, `DESIGN.md` thắng khi mâu thuẫn.

## Global Constraints

- 0đ: chỉ Firebase **Spark**; **không** Cloud Functions, **không** Cloud Storage; không thêm dịch vụ cần thẻ hoặc API key.
- Tiền luôn là **số nguyên VND**; không bao giờ lưu/tính bằng float. Biên hợp lệ `1..1.000.000.000` (ô số cố định cho phép `0`).
- Hiển thị tiền `190.000đ` (dấu `.` hàng nghìn, hậu tố `đ`), ngày `dd/MM/yyyy`, toàn bộ chữ trên UI bằng tiếng Việt.
- Mobile-first: vùng chạm ≥ 44px, khung nội dung tối đa ~480px canh giữa trên desktop, form/sheet qua `ResponsiveModal` (Drawer < 768px, Dialog ≥ 768px).
- `src/lib/*` không được import React hay Firebase.
- Không lưu số dư, phần chia hay kế hoạch trả vào Firestore — luôn tính lại.
- Mọi `createdAt`/`updatedAt`/`paidAt` ghi bằng `serverTimestamp()`.
- Trip ID: 10 ký tự từ bảng `abcdefghjkmnpqrstuvwxyz23456789` (rules: `^[a-z0-9]{10}$`).
- Mỗi đường đọc/ghi Firestore mới phải có rule và test rule.
- Dùng phiên bản thư viện mới nhất lúc scaffold; không chốt số phiên bản.
- Lệnh chạy trên Windows/PowerShell (Git Bash cũng được); Node 24, Java 25 đã có sẵn.

## Review Focus

1. **Trả dư / bấm "Đã chuyển" hai lần** → số dư đổi dấu và kế hoạch hiện giao dịch chiều ngược lại (không giấu, không NaN); nút xác nhận khóa trong lúc đang gửi nên chỉ tạo 1 payment; sheet cảnh báo khi số tiền > số gợi ý. *Test: Task 4 (`overpayment flips balance`), Task 5 (`settles overpayment in reverse`), Task 14 (`MarkPaidSheet submits once`).*
2. **Khoản chi tham chiếu người không còn trong chuyến** (dữ liệu cũ, sửa đồng thời) → cả khoản bị coi là lỗi, bỏ khỏi tính toán, báo trong `invalidExpenseIds`, `Σ balance` vẫn bằng 0. *Test: Task 4 (`expense with unknown member is invalid`).*
3. **Tiền dán từ chỗ khác có khoảng trắng lạ** (NBSP của iOS, `" 190.000 đ "`, `+190k`) → parse đúng; số mơ hồ không hậu tố như `1.5` → `null`. *Test: Task 2 (`odd whitespace and signs`).*
4. **Mở chuyến lần đầu khi đang offline** (cache trống) → snapshot `exists=false, fromCache=true` **không** được hiện "Link không đúng"; phải hiện "Không tải được — kiểm tra mạng". *Test: Task 9 (`classifyTripSnapshot`).*
5. **"Bạn là ai" đã lưu trỏ tới người bị xóa khỏi chuyến, `?pay=` trỏ tới giao dịch không còn** → hỏi lại "Bạn là ai"; bỏ qua `?pay=` không mở sheet rỗng. *Test: Task 12 (`resolveMe`), Task 7 (`parsePayParam`), Task 14 (`ignores stale pay link`).*

---

## File Structure

Như `DESIGN.md` §5, cộng thêm (quyết định của plan này):
- `src/lib/types.ts` — kiểu miền thuần (`VND`, `ExpenseInput`, `PaymentInput`, `Transfer`, `BalanceRow`) để `src/lib` không phụ thuộc kiểu Firestore. `src/data/types.ts` mở rộng từ đây.
- `src/lib/date.ts` — `formatDateVN`, `todayISO`.
- `src/lib/members.ts` — `memberInUse`.
- `src/data/*` nhận `db: Firestore` làm tham số đầu cho mọi hàm ghi/đọc một lần (để test trên emulator); hook dùng singleton `db` từ `src/data/firebase.ts`.
- `tests/rules/` và `tests/data/` chạy trên emulator; `src/**/*.test.ts(x)` chạy bằng `npm test`.

---

### Task 1: Scaffold dự án

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig*.json`, `vitest.config.ts`, `eslint.config.js`, `components.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src/index.css`, `src/lib/utils.ts` (shadcn), `src/components/ui/*` (shadcn), `public/_redirects`, `public/_headers`, `public/robots.txt`, `.gitignore`, `.env.example`
- Test: `src/smoke.test.ts`

**Interfaces:**
- Produces: alias `@/` → `src/`; scripts `dev`, `test`, `typecheck`, `build`, `lint` (bảng §10, `test:rules`/`emulators` thêm ở Task 8); router với các route rỗng của §9.

- [x] **Step 1:** `git init`; `npm create vite@latest . -- --template react-ts`; cài `react-router-dom`, `firebase`, `sonner`, `lucide-react`; dev: `vitest`, `jsdom`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`.
- [x] **Step 2:** Cài Tailwind theo hướng dẫn Vite của Tailwind hiện hành; thêm alias `@` vào `tsconfig.json`, `tsconfig.app.json`, `vite.config.ts` (shadcn yêu cầu); `npx shadcn@latest init`; `npx shadcn@latest add` toàn bộ danh sách component ở §4.
- [x] **Step 3:** Viết `src/smoke.test.ts`: `expect(1 + 1).toBe(2)`. `vitest.config.ts`: môi trường mặc định `node`, `include: ['src/**/*.test.{ts,tsx}']`, `setupFiles` nạp `@testing-library/jest-dom/vitest`. Test component đặt `// @vitest-environment jsdom` ở dòng đầu.
- [x] **Step 4:** `package.json` scripts: `"test": "vitest run"`, `"typecheck": "tsc --noEmit -p tsconfig.app.json"`, `"build": "tsc -b && vite build"`, `"lint": "eslint ."`.
- [x] **Step 5:** `public/_redirects` = `/*  /index.html  200`; `public/_headers` và `robots.txt` đúng nội dung §7.3; `index.html` có `lang="vi"`, `<meta name="robots" content="noindex, nofollow">`, viewport mobile, `<title>TripSplit</title>`.
- [x] **Step 6:** `src/App.tsx`: `BrowserRouter` + các route ở §9 trỏ tới placeholder `<div>` (thay dần ở các task sau) + `<Toaster />` của sonner. Bọc nội dung trong `<main className="mx-auto max-w-[480px] min-h-dvh">`.
- [x] **Step 7:** `.gitignore` thêm `.env.local`, `firebase-debug.log`, `*-debug.log`; `.env.example` đúng §10.
- [x] **Step 8:** Chạy `npm test` → PASS 1 test; `npm run build` → thành công; `npm run lint` → 0 lỗi.
- [x] **Step 9:** Commit `chore: scaffold vite react-ts with tailwind, shadcn, router, vitest`.

---

### Task 2: Tiền & ngày (`money.ts`, `date.ts`, `types.ts`)

**Files:**
- Create: `src/lib/types.ts`, `src/lib/money.ts`, `src/lib/date.ts`
- Test: `src/lib/money.test.ts`, `src/lib/date.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // types.ts
  export type VND = number;
  export interface ExpenseInput { id: string; amount: VND; payerId: string; participantIds: string[]; fixedAmounts: Record<string, VND>; }
  export interface PaymentInput { id: string; fromId: string; toId: string; amount: VND; }
  export interface Transfer { fromId: string; toId: string; amount: VND; }
  export interface BalanceRow { memberId: string; paid: VND; owed: VND; expenseNet: VND; sent: VND; received: VND; balance: VND; }
  // money.ts
  export const MAX_VND = 1_000_000_000;
  export function formatVND(n: VND): string;
  export function formatSignedVND(n: VND): string;
  export function parseVND(input: string, opts?: { allowZero?: boolean }): VND | null;
  // date.ts
  export function formatDateVN(iso: string): string;   // "2026-12-20" → "20/12/2026"
  export function todayISO(): string;                   // theo giờ máy, "YYYY-MM-DD"
  ```

- [x] **Step 1: Viết test thất bại**
  ```ts
  describe('formatVND', () => {
    it('formats', () => {
      expect(formatVND(190000)).toBe('190.000đ');
      expect(formatVND(0)).toBe('0đ');
      expect(formatVND(-50000)).toBe('-50.000đ');
      expect(formatVND(1105000)).toBe('1.105.000đ');
    });
    it('signed', () => {
      expect(formatSignedVND(826250)).toBe('+826.250đ');
      expect(formatSignedVND(-273750)).toBe('-273.750đ');
      expect(formatSignedVND(0)).toBe('0đ');
    });
  });
  describe('parseVND', () => {
    it.each([
      ['190000', 190000], ['190.000', 190000], ['190,000', 190000], ['190 000', 190000],
      ['190.000đ', 190000], ['190000 vnd', 190000], ['190k', 190000], ['190K', 190000],
      ['45k5', 45500], ['45.5k', 45500], ['45,5k', 45500],
      ['1tr', 1000000], ['1m', 1000000], ['1 triệu', 1000000],
      ['1tr2', 1200000], ['1.2tr', 1200000], ['1,2tr', 1200000], ['1m2', 1200000],
      ['1tr25', 1250000], ['1tr250', 1250000],
      ['1tr05', 1050000], ['1tr050', 1050000], ['1tr50k', 1050000],
    ])('%s → %i', (input, out) => expect(parseVND(input)).toBe(out));
    it.each(['0', '', 'abc', '-5k', '12.34.56', '1000000001', '2tr'.repeat(2)])('rejects %s', (s) =>
      expect(parseVND(s)).toBeNull());
    it('allowZero', () => expect(parseVND('0', { allowZero: true })).toBe(0));
    it('odd whitespace and signs', () => {           // Review Focus #3
      expect(parseVND(' 190.000 đ ')).toBe(190000);
      expect(parseVND(' 190k ')).toBe(190000);
      expect(parseVND('+190k')).toBe(190000);
      expect(parseVND('1.5')).toBeNull();
    });
  });
  ```
  `date.test.ts`: `formatDateVN('2026-12-20') === '20/12/2026'`; `todayISO()` khớp `/^\d{4}-\d{2}-\d{2}$/`.
- [x] **Step 2:** `npm test -- src/lib/money src/lib/date` → FAIL (module không tồn tại).
- [x] **Step 3:** Cài `formatVND`/`formatSignedVND` bằng regex `\B(?=(\d{3})+(?!\d))` (không dùng `Intl` để không phụ thuộc locale máy). Cài `parseVND` đúng quy tắc §8.1: chuẩn hóa (`trim`, `toLowerCase`, thay mọi khoảng trắng Unicode `\s` kể cả NBSP thành space, bỏ dấu `+` đầu, bỏ hậu tố `đ|d|vnd|vnđ`), có `-` → null; rồi thử lần lượt các regex: `XtrYk`, `XtrY`, `X[.,]Ytr`, `XkY`, `X[.,]Yk`, số nguyên thuần `^\d+$`, số có phân nhóm `^\d{1,3}([., ]\d{3})+$`. Hậu tố triệu chấp nhận `tr|triệu|trieu|m`. Phần sau hậu tố đọc như chữ số thập phân (`'0.' + frac`). `Math.round`, kiểm biên.
- [x] **Step 4:** `npm test -- src/lib` → PASS.
- [x] **Step 5:** Commit `feat(lib): VND format/parse and date helpers`.

---

### Task 3: Chia tiền (`split.ts`)

**Files:**
- Create: `src/lib/split.ts`
- Test: `src/lib/split.test.ts`

**Interfaces:**
- Consumes: `VND`, `MAX_VND` (Task 2).
- Produces:
  ```ts
  export type SplitError = 'INVALID_AMOUNT' | 'NO_PARTICIPANTS' | 'FIXED_NOT_PARTICIPANT'
    | 'INVALID_FIXED' | 'FIXED_EXCEEDS_TOTAL' | 'ALL_FIXED_MISMATCH';
  export type SplitResult =
    | { ok: true; shares: Record<string, VND> }
    | { ok: false; error: SplitError; message: string };
  export function computeShares(input: {
    amount: VND; participantIds: string[]; fixedAmounts: Record<string, VND>; memberOrder: string[];
  }): SplitResult;
  ```

- [x] **Step 1: Viết test thất bại**
  ```ts
  const order = ['sang', 'chung', 'mo', 'phung'];
  const sum = (r: SplitResult) => r.ok ? Object.values(r.shares).reduce((a, b) => a + b, 0) : NaN;

  it('fixed + remainder (spec example)', () => {
    const r = computeShares({ amount: 190000, participantIds: order, fixedAmounts: { chung: 45000, mo: 45000 }, memberOrder: order });
    expect(r).toEqual({ ok: true, shares: { sang: 50000, chung: 45000, mo: 45000, phung: 50000 } });
  });
  it('100.000 / 3 gives leftover to first in member order', () => {
    const r = computeShares({ amount: 100000, participantIds: ['mo', 'sang', 'chung'], fixedAmounts: {}, memberOrder: order });
    expect(r).toEqual({ ok: true, shares: { sang: 33334, chung: 33333, mo: 33333 } });
  });
  it('10 / 3', () => {
    const r = computeShares({ amount: 10, participantIds: ['sang', 'chung', 'mo'], fixedAmounts: {}, memberOrder: order });
    expect(r.ok && r.shares).toEqual({ sang: 4, chung: 3, mo: 3 });
  });
  it('subset only', () => {
    const r = computeShares({ amount: 100000, participantIds: ['sang', 'mo'], fixedAmounts: {}, memberOrder: order });
    expect(r.ok && r.shares).toEqual({ sang: 50000, mo: 50000 });
  });
  it('fixed 0 is valid', () => {
    const r = computeShares({ amount: 90000, participantIds: ['sang', 'chung', 'mo'], fixedAmounts: { mo: 0 }, memberOrder: order });
    expect(r.ok && r.shares).toEqual({ sang: 45000, chung: 45000, mo: 0 });
  });
  it('all fixed matching total is ok', () => {
    const r = computeShares({ amount: 190000, participantIds: order, fixedAmounts: { sang: 50000, chung: 45000, mo: 45000, phung: 50000 }, memberOrder: order });
    expect(r.ok).toBe(true);
  });
  it('duplicate participant ids are de-duplicated', () => {
    expect(sum(computeShares({ amount: 100000, participantIds: ['sang', 'sang', 'mo'], fixedAmounts: {}, memberOrder: order }))).toBe(100000);
  });
  it.each([
    [{ amount: 0, participantIds: ['sang'], fixedAmounts: {} }, 'INVALID_AMOUNT'],
    [{ amount: 100.5, participantIds: ['sang'], fixedAmounts: {} }, 'INVALID_AMOUNT'],
    [{ amount: 100000, participantIds: [], fixedAmounts: {} }, 'NO_PARTICIPANTS'],
    [{ amount: 100000, participantIds: ['sang'], fixedAmounts: { mo: 1000 } }, 'FIXED_NOT_PARTICIPANT'],
    [{ amount: 100000, participantIds: ['sang', 'mo'], fixedAmounts: { mo: -1 } }, 'INVALID_FIXED'],
    [{ amount: 190000, participantIds: ['sang', 'mo', 'chung'], fixedAmounts: { sang: 100000, mo: 100000 } }, 'FIXED_EXCEEDS_TOTAL'],
    [{ amount: 190000, participantIds: order, fixedAmounts: { sang: 50000, chung: 45000, mo: 45000, phung: 40000 } }, 'ALL_FIXED_MISMATCH'],
  ])('error %#', (input, error) => {
    const r = computeShares({ ...input, memberOrder: order });
    expect(r.ok).toBe(false);
    if (!r.ok) { expect(r.error).toBe(error); expect(r.message.length).toBeGreaterThan(0); }
  });
  ```
- [x] **Step 2:** `npm test -- src/lib/split` → FAIL.
- [x] **Step 3:** Cài `computeShares` theo §8.2: kiểm lỗi theo thứ tự trong bảng test; `flex` sắp theo `memberOrder` (id không có trong `memberOrder` nối cuối theo thứ tự xuất hiện); `base`/`extra` chia nguyên. `message` tiếng Việt, vd `FIXED_EXCEEDS_TOTAL` → `"Tổng số tiền riêng (200.000đ) vượt quá thành tiền (190.000đ)"` (dùng `formatVND`).
- [x] **Step 4:** `npm test -- src/lib/split` → PASS.
- [x] **Step 5:** Commit `feat(lib): expense split with fixed shares and exact rounding`.

---

### Task 4: Số dư (`balances.ts`)

**Files:**
- Create: `src/lib/balances.ts`
- Test: `src/lib/balances.test.ts`

**Interfaces:**
- Consumes: `computeShares` (Task 3), `ExpenseInput`, `PaymentInput`, `BalanceRow` (Task 2).
- Produces:
  ```ts
  export function computeBalances(memberIds: string[], expenses: ExpenseInput[], payments: PaymentInput[])
    : { rows: BalanceRow[]; invalidExpenseIds: string[]; totalSpent: VND };
  ```
  `rows` theo đúng thứ tự `memberIds`. `totalSpent` = tổng `amount` của các khoản hợp lệ. Một khoản là **không hợp lệ** nếu `computeShares` lỗi **hoặc** `payerId`/bất kỳ participant nào không thuộc `memberIds`. Payment có `fromId`/`toId` ngoài `memberIds` bị bỏ qua.

- [x] **Step 1: Viết test thất bại**
  Fixture `sheet` — dữ liệu Google Sheet mẫu, thành viên `['sang','chung','mo','phung']`, Sang ứng tất cả:
  Nhà nghỉ 575.000 chia đều 4; Cháo mực 260.000 chia đều 4; Tàu hủ 80.000 chia đều 4; Ăn sáng 190.000 với `{ chung: 45000, mo: 45000 }`.
  ```ts
  const bal = (r: ReturnType<typeof computeBalances>, id: string) => r.rows.find(x => x.memberId === id)!.balance;
  it('sheet example', () => {
    const r = computeBalances(ids, sheet, []);
    expect(r.rows.map(x => x.balance)).toEqual([826250, -273750, -273750, -278750]);
    expect(r.totalSpent).toBe(1105000);
  });
  it('balances always sum to zero', () => {
    const r = computeBalances(ids, sheet, [{ id: 'p1', fromId: 'mo', toId: 'sang', amount: 100000 }]);
    expect(r.rows.reduce((a, x) => a + x.balance, 0)).toBe(0);
    expect(r.rows.reduce((a, x) => a + x.expenseNet, 0)).toBe(0);
  });
  it('full then partial payment', () => {
    const r = computeBalances(ids, sheet, [
      { id: 'p1', fromId: 'chung', toId: 'sang', amount: 273750 },
      { id: 'p2', fromId: 'mo', toId: 'sang', amount: 200000 },
    ]);
    expect(bal(r, 'chung')).toBe(0);
    expect(bal(r, 'mo')).toBe(-73750);
    expect(bal(r, 'sang')).toBe(352500);
  });
  it('new expense after paying shows the new shortfall', () => {
    const parking = { id: 'e5', amount: 20000, payerId: 'sang', participantIds: ids, fixedAmounts: {} };
    const r = computeBalances(ids, [...sheet, parking], [{ id: 'p1', fromId: 'chung', toId: 'sang', amount: 273750 }]);
    expect(bal(r, 'chung')).toBe(-5000);
  });
  it('overpayment flips balance', () => {                 // Review Focus #1
    const r = computeBalances(ids, sheet, [{ id: 'p1', fromId: 'chung', toId: 'sang', amount: 300000 }]);
    expect(bal(r, 'chung')).toBe(26250);
  });
  it('expense with unknown member is invalid', () => {    // Review Focus #2
    const ghost = { id: 'eX', amount: 50000, payerId: 'sang', participantIds: ['sang', 'ghost'], fixedAmounts: {} };
    const bad = { id: 'eY', amount: 50000, payerId: 'sang', participantIds: ['sang'], fixedAmounts: { sang: 60000 } };
    const r = computeBalances(ids, [...sheet, ghost, bad], [{ id: 'p9', fromId: 'ghost', toId: 'sang', amount: 1000 }]);
    expect(r.invalidExpenseIds).toEqual(['eX', 'eY']);
    expect(r.rows.map(x => x.balance)).toEqual([826250, -273750, -273750, -278750]);
  });
  ```
- [x] **Step 2:** `npm test -- src/lib/balances` → FAIL.
- [x] **Step 3:** Cài `computeBalances` theo §8.3 và quy tắc hợp lệ ở Interfaces.
- [x] **Step 4:** `npm test -- src/lib/balances` → PASS.
- [x] **Step 5:** Commit `feat(lib): per-member balances with payment ledger`.

---

### Task 5: Kế hoạch trả tiền (`settle.ts`)

**Files:**
- Create: `src/lib/settle.ts`
- Test: `src/lib/settle.test.ts`

**Interfaces:**
- Consumes: `BalanceRow`, `Transfer` (Task 2).
- Produces: `export function settle(rows: Pick<BalanceRow, 'memberId' | 'balance'>[], memberOrder: string[]): Transfer[];`

- [x] **Step 1: Viết test thất bại**
  ```ts
  const rows = (o: Record<string, number>) => Object.entries(o).map(([memberId, balance]) => ({ memberId, balance }));
  it('sheet example → 3 transfers to Sang', () => {
    expect(settle(rows({ sang: 826250, chung: -273750, mo: -273750, phung: -278750 }), ['sang', 'chung', 'mo', 'phung']))
      .toEqual([
        { fromId: 'phung', toId: 'sang', amount: 278750 },
        { fromId: 'chung', toId: 'sang', amount: 273750 },
        { fromId: 'mo', toId: 'sang', amount: 273750 },
      ]);
  });
  it('exact match first', () => {
    const t = settle(rows({ a: -100000, b: -50000, c: 100000, d: 50000 }), ['a', 'b', 'c', 'd']);
    expect(t).toEqual([{ fromId: 'a', toId: 'c', amount: 100000 }, { fromId: 'b', toId: 'd', amount: 50000 }]);
  });
  it('at most n-1 transfers and clears every balance', () => {
    const input = rows({ a: 70000, b: 30000, c: -45000, d: -35000, e: -20000 });
    const t = settle(input, ['a', 'b', 'c', 'd', 'e']);
    expect(t.length).toBeLessThanOrEqual(4);
    const net: Record<string, number> = { a: 70000, b: 30000, c: -45000, d: -35000, e: -20000 };
    t.forEach(x => { net[x.fromId] += x.amount; net[x.toId] -= x.amount; });
    expect(Object.values(net).every(v => v === 0)).toBe(true);
  });
  it('settles overpayment in reverse', () => {            // Review Focus #1
    expect(settle(rows({ sang: -26250, chung: 26250 }), ['sang', 'chung']))
      .toEqual([{ fromId: 'sang', toId: 'chung', amount: 26250 }]);
  });
  it('all zero → no transfers', () => expect(settle(rows({ a: 0, b: 0 }), ['a', 'b'])).toEqual([]));
  it('deterministic regardless of input order', () => {
    const order = ['a', 'b', 'c', 'd'];
    const x = rows({ a: 50000, b: 50000, c: -50000, d: -50000 });
    expect(settle([...x].reverse(), order)).toEqual(settle(x, order));
  });
  ```
- [x] **Step 2:** `npm test -- src/lib/settle` → FAIL.
- [x] **Step 3:** Cài `settle` theo §8.4: (1) tách nợ/có, bỏ 0; (2) khớp chính xác: duyệt nợ theo thứ tự [số tiền giảm dần, hòa theo `memberOrder`], với mỗi nợ tìm có đầu tiên (cùng cách sắp) bằng đúng số tiền → ghép, loại cả hai; (3) tham lam: lặp, sắp lại hai danh sách theo cùng khóa, ghép đầu ↔ đầu với `min`, trừ, bỏ phần tử về 0.
- [x] **Step 4:** `npm test -- src/lib/settle` → PASS.
- [x] **Step 5:** Commit `feat(lib): settlement plan with exact-match and greedy`.

---

### Task 6: VietQR & ngân hàng (`vietqr.ts`, `banks.ts`)

**Files:**
- Create: `src/lib/vietqr.ts`, `src/lib/banks.ts`, `scripts/fetch-banks.mjs`
- Test: `src/lib/vietqr.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // vietqr.ts
  export interface BankAccount { bankBin: string; accountNo: string; accountName?: string; }
  export function toAscii(s: string): string;
  export function defaultTransferNote(payerName: string, tripName: string): string; // toAscii(`${payer} tra tien ${trip}`).slice(0, 50)
  export function buildVietQrUrl(acc: BankAccount, amount: VND, note: string): string;
  // banks.ts
  export interface Bank { bin: string; code: string; shortName: string; name: string; }
  export const BANKS: Bank[];
  export function findBank(bin: string): Bank | undefined;
  ```

- [x] **Step 1: Viết test thất bại**
  ```ts
  it('toAscii', () => {
    expect(toAscii('Chung trả tiền Đà Lạt (đợt 1)!')).toBe('Chung tra tien Da Lat dot 1');
    expect(toAscii('  Phụng   Mơ ')).toBe('Phung Mo');
  });
  it('default note ≤ 50 chars, no diacritics', () => {
    expect(defaultTransferNote('Chung', 'Đà Lạt 2026')).toBe('Chung tra tien Da Lat 2026');
    expect(defaultTransferNote('Nguyễn Văn Chung', 'Chuyến đi Phú Quốc cùng cả lớp năm 2026 vui vẻ').length).toBeLessThanOrEqual(50);
  });
  it('builds URL', () => {
    const url = new URL(buildVietQrUrl({ bankBin: '970436', accountNo: ' 0123456789 ', accountName: 'Nguyễn Ngọc Sang' }, 273750, 'Chung trả tiền Đà Lạt'));
    expect(url.origin + url.pathname).toBe('https://img.vietqr.io/image/970436-0123456789-compact2.png');
    expect(url.searchParams.get('amount')).toBe('273750');
    expect(url.searchParams.get('addInfo')).toBe('Chung tra tien Da Lat');
    expect(url.searchParams.get('accountName')).toBe('NGUYEN NGOC SANG');
  });
  it('omits empty accountName', () => {
    expect(new URL(buildVietQrUrl({ bankBin: '970436', accountNo: '1' }, 1000, 'x')).searchParams.has('accountName')).toBe(false);
  });
  it('banks include Vietcombank', () => expect(findBank('970436')?.shortName).toBe('Vietcombank'));
  ```
- [x] **Step 2:** `npm test -- src/lib/vietqr` → FAIL.
- [x] **Step 3:** Viết `scripts/fetch-banks.mjs` (Node, chạy tay một lần): `GET https://api.vietqr.io/v2/banks`, map mỗi phần tử `{ bin, code, shortName, name }` (bỏ phần tử thiếu `bin`), sắp theo `shortName`, ghi `src/lib/banks.ts` dạng `export const BANKS: Bank[] = [...]` + `findBank`. Chạy `node scripts/fetch-banks.mjs`, kiểm file sinh ra có ≥ 40 ngân hàng.
- [x] **Step 4:** Cài `toAscii` (NFD, bỏ `̀-ͯ`, `đ→d`, `Đ→D`, bỏ ký tự ngoài `[A-Za-z0-9 ]`, gộp khoảng trắng, `trim`), `defaultTransferNote`, `buildVietQrUrl` (query bằng `URLSearchParams`, `accountName` = `toAscii(...).toUpperCase()`, bỏ nếu rỗng).
- [x] **Step 5:** `npm test -- src/lib/vietqr` → PASS.
- [x] **Step 6:** Commit `feat(lib): VietQR url builder and static bank list`.

---

### Task 7: Nhắc nợ, ID, thành viên (`reminder.ts`, `id.ts`, `members.ts`)

**Files:**
- Create: `src/lib/reminder.ts`, `src/lib/id.ts`, `src/lib/members.ts`
- Test: `src/lib/reminder.test.ts`, `src/lib/id.test.ts`, `src/lib/members.test.ts`

**Interfaces:**
- Consumes: `formatVND` (Task 2), `defaultTransferNote`, `findBank` (Task 6), `Transfer`, `ExpenseInput`, `PaymentInput`.
- Produces:
  ```ts
  // reminder.ts
  export interface ReminderMember { id: string; name: string; bankBin?: string; accountNo?: string; accountName?: string; }
  export function buildPayLink(tripUrl: string, fromId: string, toId: string): string;  // `${tripUrl}?pay=${fromId}.${toId}`
  export function parsePayParam(v: string | null): { fromId: string; toId: string } | null;
  export function buildGroupReminder(p: { tripName: string; tripUrl: string; totalSpent: VND; transfers: Transfer[];
    paid: Transfer[]; nameOf: (id: string) => string }): string;
  export function buildPersonalReminder(p: { tripName: string; tripUrl: string; transfer: Transfer;
    from: ReminderMember; to: ReminderMember }): string;
  // id.ts
  export const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
  export function randomId(length?: number): string;  // mặc định 10, dùng crypto.getRandomValues
  // members.ts
  export function memberInUse(memberId: string, expenses: ExpenseInput[], payments: PaymentInput[]): boolean;
  ```

- [x] **Step 1: Viết test thất bại**
  ```ts
  const nameOf = (id: string) => ({ sang: 'Sang', chung: 'Chung', mo: 'Mơ', phung: 'Phụng' }[id]!);
  it('group reminder', () => {
    expect(buildGroupReminder({ tripName: 'Đà Lạt 2026', tripUrl: 'https://x.pages.dev/t/k3x9p2qm7a', totalSpent: 1105000,
      transfers: [{ fromId: 'chung', toId: 'sang', amount: 273750 }, { fromId: 'mo', toId: 'sang', amount: 273750 }],
      paid: [{ fromId: 'phung', toId: 'sang', amount: 278750 }], nameOf }))
    .toBe([
      '💸 Chia tiền Đà Lạt 2026', '💰 Tổng chi: 1.105.000đ',
      '• Chung → Sang: 273.750đ', '• Mơ → Sang: 273.750đ',
      '✅ Đã trả: Phụng → Sang 278.750đ',
      'Xem chi tiết & quét QR: https://x.pages.dev/t/k3x9p2qm7a',
    ].join('\n'));
  });
  it('group reminder when all settled', () => {
    expect(buildGroupReminder({ tripName: 'T', tripUrl: 'u', totalSpent: 0, transfers: [], paid: [], nameOf }))
      .toContain('✅ Cả nhóm đã thanh toán xong!');
  });
  it('personal reminder', () => {
    const text = buildPersonalReminder({ tripName: 'Đà Lạt 2026', tripUrl: 'https://x.pages.dev/t/k3x9p2qm7a',
      transfer: { fromId: 'chung', toId: 'sang', amount: 273750 },
      from: { id: 'chung', name: 'Chung' },
      to: { id: 'sang', name: 'Sang', bankBin: '970436', accountNo: '0123456789', accountName: 'NGUYEN NGOC SANG' } });
    expect(text.split('\n')).toEqual([
      '👋 Chung ơi, phần của bạn chuyến Đà Lạt 2026 là 273.750đ (chuyển cho Sang).',
      '🏦 Vietcombank - 0123456789 (NGUYEN NGOC SANG)',
      '📝 Nội dung: Chung tra tien Da Lat 2026',
      '🔗 Quét QR điền sẵn tiền: https://x.pages.dev/t/k3x9p2qm7a?pay=chung.sang',
    ]);
  });
  it('personal reminder without bank omits bank line', () => {
    const text = buildPersonalReminder({ tripName: 'T', tripUrl: 'u', transfer: { fromId: 'a', toId: 'b', amount: 1000 },
      from: { id: 'a', name: 'A' }, to: { id: 'b', name: 'B' } });
    expect(text).not.toContain('🏦');
  });
  it('parsePayParam', () => {                              // Review Focus #5
    expect(parsePayParam('chung.sang')).toEqual({ fromId: 'chung', toId: 'sang' });
    expect(parsePayParam(null)).toBeNull();
    expect(parsePayParam('chung')).toBeNull();
    expect(parsePayParam('a.a')).toBeNull();
    expect(parsePayParam('.sang')).toBeNull();
  });
  ```
  `id.test.ts`: 1.000 lần `randomId()` → mỗi lần dài 10, mọi ký tự thuộc `ID_ALPHABET`, khớp `/^[a-z0-9]{10}$/`, không trùng nhau.
  `members.test.ts`: `true` khi là payer, là participant, là `fromId` hoặc `toId` của payment; `false` khi không xuất hiện.
- [x] **Step 2:** `npm test -- src/lib` → FAIL ở 3 file mới.
- [x] **Step 3:** Cài ba module. `randomId` lấy byte ngẫu nhiên và loại byte ≥ `248` (bội của 31 gần 256 nhất) để không lệch phân phối.
- [x] **Step 4:** `npm test` → toàn bộ PASS.
- [x] **Step 5:** Commit `feat(lib): reminders, pay deep links, random ids, member usage`.

---

### Task 8: Firebase local + security rules

**Files:**
- Create: `firebase.json`, `.firebaserc`, `firestore.rules`, `firestore.indexes.json`, `tests/rules/firestore.rules.test.ts`, `tests/helpers/env.ts`
- Modify: `package.json` (scripts `emulators`, `test:rules`; dev dep `@firebase/rules-unit-testing`, `firebase-tools`), `vitest.config.ts`

**Interfaces:**
- Produces: `tests/helpers/env.ts`:
  ```ts
  export const ADMIN_UID: string;                 // đọc bằng regex `request.auth.uid == '([^']+)'` từ firestore.rules
  export async function makeEnv(): Promise<RulesTestEnvironment>;   // projectId 'demo-tripsplit', rules từ file
  export async function seedTrip(env: RulesTestEnvironment, id = 'k3x9p2qm7a', overrides?: Record<string, unknown>): Promise<void>;
  // ghi bằng withSecurityRulesDisabled một trip hợp lệ theo §6: 4 thành viên sang/chung/mo/phung (sang có STK 970436-0123456789),
  // allowGuestExpenses:false, locked:false; overrides ghi đè từng field
  ```
  Script: `"emulators": "firebase emulators:start --project demo-tripsplit"`, `"test:rules": "firebase emulators:exec --only firestore --project demo-tripsplit \"vitest run --dir tests\""`. `vitest.config.ts`: `npm test` chỉ chạy `src/**`; khi chạy với `--dir tests` thì include `tests/**/*.test.ts`, `fileParallelism: false`.

- [x] **Step 1:** `firebase.json` (rules, indexes, emulators auth 9099, firestore 8080, ui 4000 — **không** có mục `hosting`), `.firebaserc` `{ "projects": { "default": "demo-tripsplit" } }`, `firestore.indexes.json` `{ "indexes": [], "fieldOverrides": [] }`, `firestore.rules` chép **nguyên văn** §7.2.
- [x] **Step 2: Viết test rules** — một `it` cho mỗi dòng ở §12.2, dùng `assertSucceeds`/`assertFails`, ghi thời gian bằng `serverTimestamp()`. Các case tối thiểu:
  - khách `getDoc(trip)` ✅; khách `getDocs(collection('trips'))` ❌; admin `getDocs` ✅.
  - khách `updateDoc(trip, { 'members': [...] })`, `{ allowGuestExpenses: true }`, `{ locked: false }` ❌; khách `setDoc(memberQrs/sang)` ❌; khách đọc/ghi `friends/x` ❌.
  - khách thêm expense hợp lệ khi `allowGuestExpenses=false` ❌; `true` + `createdBy:'guest'` ✅; `createdBy:'admin'` ❌; `payerId:'ghost'` ❌; `participantIds:['sang','ghost']` ❌; khi `locked:true` ❌.
  - seed một expense `createdBy:'admin'`; khách update/delete nó ❌ (kể cả khi bật cho phép); khách update expense guest và đổi `createdBy` thành `'admin'` ❌.
  - payment: khách tạo khi chưa khóa ✅, khi khóa ❌; `fromId == toId` ❌; khách xóa payment `markedBy:'admin'` ❌; `updateDoc` payment ❌ (cả admin).
  - schema: `name` 101 ký tự, `amount:-100`, `amount:100.5`, field lạ `hacked:true`, `fixedAmounts:{ ghost: 1 }`, `createdAt` là `Timestamp.fromDate(new Date(2020,0,1))` → đều ❌.
  - admin tạo trip id `'k3x9p2qm7a'` ✅, id `'Dalat-2026'` ❌, trip 1 thành viên ❌; admin CRUD friend hợp lệ ✅, `bankBin:'97043'` ❌, `momoQrDataUrl:'http://x'` ❌.
  - `setDoc(doc(db,'other/x'))` bởi admin ❌.
- [x] **Step 3:** `npm run test:rules` → kỳ vọng phần lớn PASS ngay (rules đã viết). Mọi case FAIL: đọc thông báo lỗi, sửa `firestore.rules` (không sửa test trừ khi test sai so với §7.1), chạy lại tới khi **toàn bộ PASS**. Ghi mọi thay đổi rules ngược vào `DESIGN.md` §7.2.
- [x] **Step 4:** Commit `feat(firebase): firestore rules with emulator test suite`.

---

### Task 9: Lớp dữ liệu (`src/data`)

**Files:**
- Create: `src/data/firebase.ts`, `src/data/types.ts`, `src/data/trips.ts`, `src/data/expenses.ts`, `src/data/payments.ts`, `src/data/memberQrs.ts`, `src/data/friends.ts`
- Test: `src/data/trips.test.ts` (thuần), `tests/data/data.test.ts` (emulator)

**Interfaces:**
- Consumes: `randomId` (Task 7), kiểu ở `src/lib/types.ts`.
- Produces:
  ```ts
  // firebase.ts
  export const app: FirebaseApp; export const db: Firestore; export const auth: Auth;
  // initializeFirestore với persistentLocalCache + persistentMultipleTabManager;
  // nếu import.meta.env.VITE_USE_EMULATOR === 'true' → connectFirestoreEmulator(db,'127.0.0.1',8080), connectAuthEmulator(auth,'http://127.0.0.1:9099')
  // types.ts — đúng §6: Friend, Member, Trip, Expense, Payment, MemberQr (mỗi loại có `id`), và *Doc tương ứng không có id.
  // trips.ts
  export type TripState = { status: 'loading' } | { status: 'ok'; trip: Trip } | { status: 'not-found' } | { status: 'offline-empty' } | { status: 'error'; message: string };
  export function classifyTripSnapshot(s: { exists: boolean; fromCache: boolean }): 'ok' | 'not-found' | 'offline-empty';
  export function useTrip(tripId: string): TripState;
  export function useTripList(): { status: 'loading' | 'ok' | 'error'; trips: Trip[] };
  export function createTrip(db: Firestore, input: TripInput, qrs: Record<string, string>): Promise<string>;
  export function updateTrip(db: Firestore, tripId: string, input: TripInput, qrs: Record<string, string | null>): Promise<void>;
  export function deleteTripCascade(db: Firestore, tripId: string): Promise<void>;
  export function memberFromFriend(f: Friend): Member;   // hasStaticQr = !!f.momoQrDataUrl
  export interface TripInput { name: string; startDate?: string; endDate?: string; members: Member[]; allowGuestExpenses: boolean; locked: boolean; }
  // expenses.ts
  export interface ExpenseFormValues { name: string; amount: VND; payerId: string; participantIds: string[]; fixedAmounts: Record<string, VND>; note: string; date: string; }
  export function useExpenses(tripId: string): { status: 'loading' | 'ok' | 'error'; expenses: Expense[] };  // sắp date desc, createdAt desc ở client
  export function addExpense(db: Firestore, tripId: string, v: ExpenseFormValues, by: 'admin' | 'guest'): Promise<void>;
  export function updateExpense(db: Firestore, tripId: string, id: string, v: ExpenseFormValues): Promise<void>;
  export function deleteExpense(db: Firestore, tripId: string, id: string): Promise<void>;
  // payments.ts
  export function usePayments(tripId: string): { status: 'loading' | 'ok' | 'error'; payments: Payment[] };  // paidAt desc
  export function addPayment(db: Firestore, tripId: string, p: { fromId: string; toId: string; amount: VND; note: string }, by: 'admin' | 'guest'): Promise<void>;
  export function deletePayment(db: Firestore, tripId: string, id: string): Promise<void>;
  export function hasPendingWrites(): boolean; // từ metadata snapshot gần nhất, dùng cho OfflineBanner
  // memberQrs.ts
  export function getMemberQr(db: Firestore, tripId: string, memberId: string): Promise<string | null>;
  // friends.ts
  export function useFriends(): { status: 'loading' | 'ok' | 'error'; friends: Friend[] };   // sắp theo name, 'vi'
  export function saveFriend(db: Firestore, f: Omit<Friend, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }): Promise<string>;
  export function deleteFriend(db: Firestore, id: string): Promise<void>;
  ```
  `createTrip`/`updateTrip` ghi trip + `memberQrs/{memberId}` trong **một `writeBatch`**; `memberIds` luôn tính từ `members`; trường optional rỗng thì **không ghi** (rules dùng `hasOnly`). `qrs` value `null` = xóa doc QR. `deleteTripCascade` xóa `expenses`, `payments`, `memberQrs` theo batch ≤ 450 thao tác rồi xóa trip.

- [x] **Step 1: Viết test thất bại**
  `src/data/trips.test.ts` (Review Focus #4):
  ```ts
  it('classifyTripSnapshot', () => {
    expect(classifyTripSnapshot({ exists: true, fromCache: true })).toBe('ok');
    expect(classifyTripSnapshot({ exists: false, fromCache: false })).toBe('not-found');
    expect(classifyTripSnapshot({ exists: false, fromCache: true })).toBe('offline-empty');
  });
  ```
  `tests/data/data.test.ts` (emulator, dùng `env.authenticatedContext(ADMIN_UID).firestore()` và `env.unauthenticatedContext().firestore()`):
  - `createTrip` → trả id khớp `/^[a-z0-9]{10}$/`, `memberIds` == `members.map(m=>m.id)`, doc QR tồn tại cho thành viên có ảnh.
  - `updateTrip` bỏ một thành viên → `memberIds` cập nhật; `qrs[id] = null` → doc QR bị xóa.
  - `addExpense(..., 'guest')` bằng context khách trên trip `allowGuestExpenses:true` → thành công, doc có `createdBy:'guest'`, không có field `undefined`.
  - `addPayment(..., 'guest')` → doc có `markedBy:'guest'`.
  - `deleteTripCascade` → trip, mọi expense, payment, memberQr đều không còn.
- [x] **Step 2:** `npm test -- src/data` và `npm run test:rules` → FAIL (module không tồn tại).
- [x] **Step 3:** Cài các module. Hook dùng `onSnapshot` với `{ includeMetadataChanges: true }` cho trip để nhận `fromCache`; hủy listener khi unmount hoặc đổi `tripId`.
- [x] **Step 4:** Hai lệnh test ở Step 2 → PASS; `npm run typecheck` → sạch.
- [x] **Step 5:** Commit `feat(data): firestore data layer with offline cache`.

---

### Task 10: Đăng nhập admin + guard

**Files:**
- Create: `src/data/auth.ts`, `src/components/AdminGuard.tsx`, `src/pages/AdminLogin.tsx`, `src/pages/HomePage.tsx`, `src/pages/NotFound.tsx`
- Modify: `src/App.tsx`
- Test: `src/data/auth.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export type AdminState = { status: 'loading' } | { status: 'signed-out' } | { status: 'not-admin'; email: string | null } | { status: 'admin'; uid: string };
  export function adminStateFor(user: { uid: string; email: string | null } | null, adminUid: string): AdminState; // thuần
  export function useAdmin(): AdminState;              // onAuthStateChanged + adminStateFor(..., import.meta.env.VITE_ADMIN_UID)
  export function signInWithGoogle(): Promise<void>;   // signInWithPopup(auth, new GoogleAuthProvider())
  export function signOut(): Promise<void>;
  ```
  `<AdminGuard>` bọc mọi route `/admin/*` trừ `/admin`: `loading` → Skeleton; `signed-out`/`not-admin` → `<Navigate to="/admin" />`.

- [x] **Step 1:** Test `adminStateFor`: `null` → `signed-out`; uid khớp → `admin`; uid khác → `not-admin` kèm email.
- [x] **Step 2:** `npm test -- src/data/auth` → FAIL.
- [x] **Step 3:** Cài `auth.ts`, `AdminGuard`, `AdminLogin` (nút "Đăng nhập bằng Google"; `admin` → `Navigate` tới `/admin/trips`; `not-admin` → "Tài khoản này không có quyền admin" + nút đăng xuất; lỗi popup → toast tiếng Việt), `HomePage` (lời chào + link `/admin`), `NotFound`. Gắn vào `App.tsx`.
- [x] **Step 4:** `npm test` PASS. Thủ công: `npm run emulators` + `npm run dev` (`VITE_USE_EMULATOR=true`, `VITE_ADMIN_UID` để trống) → đăng nhập bằng tài khoản giả của Auth emulator → thấy "không có quyền"; copy UID tài khoản giả từ Emulator UI (localhost:4000) vào `.env.local` và vào `firestore.rules` **bản local** → đăng nhập lại → vào `/admin/trips`.
- [x] **Step 5:** Commit `feat(admin): google sign-in and admin guard`.

---

### Task 11: Danh bạ bạn bè + nén ảnh QR

**Files:**
- Create: `src/lib/image.ts`, `src/components/ResponsiveModal.tsx`, `src/hooks/useMediaQuery.ts`, `src/pages/AdminFriends.tsx`, `src/components/BankPicker.tsx`
- Test: `src/pages/AdminFriends.test.tsx`

**Interfaces:**
- Consumes: `useFriends`, `saveFriend`, `deleteFriend` (Task 9), `BANKS`, `findBank` (Task 6), `toAscii` (Task 6).
- Produces:
  ```ts
  export function compressQrImage(file: File, maxChars = 100_000): Promise<string>; // canvas, cạnh dài ≤ 600px, thử webp rồi jpeg với quality giảm dần 0.9→0.4; vượt maxChars → throw Error('Ảnh quá lớn')
  export function ResponsiveModal(p: { open: boolean; onOpenChange(o: boolean): void; title: string; children: ReactNode; footer?: ReactNode }): JSX.Element;
  export function useMediaQuery(query: string): boolean;
  export function BankPicker(p: { value?: string; onChange(bin: string): void }): JSX.Element; // shadcn Command trong Popover, tìm theo shortName/code/name
  ```

- [x] **Step 1:** Test (jsdom) cho `AdminFriends` với `useFriends`/`saveFriend` được mock bằng `vi.mock('@/data/friends')`: điền tên "Sang", chọn ngân hàng, STK `0123456789`, chủ TK `"Nguyễn Ngọc Sang"` → `saveFriend` được gọi với `accountName: 'NGUYEN NGOC SANG'`, `bankBin: '970436'`, `bankShortName: 'Vietcombank'`; tên rỗng → nút Lưu bị disable; STK có ký tự ngoài `[0-9A-Za-z]` → báo lỗi, không gọi `saveFriend`.
- [x] **Step 2:** `npm test -- src/pages/AdminFriends` → FAIL.
- [x] **Step 3:** Cài `image.ts`, `useMediaQuery`, `ResponsiveModal` (`(min-width: 768px)` → Dialog, ngược lại Drawer), `BankPicker`, `AdminFriends` (danh sách + nút thêm/sửa/xóa có `AlertDialog` xác nhận; form trong `ResponsiveModal`; tải ảnh QR MoMo qua `<input type="file" accept="image/*">` → `compressQrImage` → preview; lỗi → toast). Route `/admin/friends` trong `AdminGuard`.
- [x] **Step 4:** `npm test` PASS. Thủ công trên emulator: thêm 4 bạn (Sang, Chung, Mơ, Phụng), một người có ảnh QR; kiểm Emulator UI doc `friends` có `momoQrDataUrl` < 100.000 ký tự.
- [x] **Step 5:** Commit `feat(admin): friend directory with bank picker and QR compression`.

---

### Task 12: Quản lý chuyến (admin) + "Bạn là ai"

**Files:**
- Create: `src/pages/AdminTrips.tsx`, `src/pages/AdminTripEdit.tsx`, `src/hooks/useMe.ts`
- Test: `src/hooks/useMe.test.ts`, `src/pages/AdminTripEdit.test.tsx`

**Interfaces:**
- Consumes: `useTripList`, `createTrip`, `updateTrip`, `deleteTripCascade`, `memberFromFriend`, `useExpenses`, `usePayments` (Task 9), `useFriends` (Task 9), `memberInUse` (Task 7).
- Produces:
  ```ts
  export function resolveMe(stored: string | null, memberIds: string[]): string | null;  // thuần
  export function useMe(tripId: string, memberIds: string[]): { me: string | null; setMe(id: string): void; clear(): void };
  // localStorage key: `tripsplit:me:${tripId}`
  ```

- [x] **Step 1:** Test `resolveMe` (Review Focus #5): `('sang', ['sang','mo'])` → `'sang'`; `('ghost', ['sang'])` → `null`; `(null, [...])` → `null`.
  Test `AdminTripEdit` (mock data hooks): chọn < 2 bạn → nút Lưu disable kèm "Cần ít nhất 2 thành viên"; bỏ tick thành viên mà `memberInUse` = true → checkbox bị khóa kèm "Đã có trong khoản chi/thanh toán"; Lưu → `createTrip` nhận `members` đúng thứ tự tick và `qrs` chỉ gồm người có ảnh.
- [x] **Step 2:** `npm test -- src/hooks src/pages/AdminTripEdit` → FAIL.
- [x] **Step 3:** Cài `useMe`. `AdminTrips`: danh sách (mới nhất trước), mỗi dòng tên + ngày + badge khóa, nút copy link (`${location.origin}/t/${id}`, toast "Đã copy link"), switch khóa nhanh (`updateTrip`). `AdminTripEdit` cho `/admin/trips/new` và `/admin/trips/:tripId`: tên, ngày đi/về, tick thành viên từ danh bạ, nút "Cập nhật từ danh bạ" (thay snapshot thông tin ngân hàng + QR của các thành viên hiện có), switch "Cho phép nhóm nhập", switch "Khóa sổ", copy link, xóa chuyến (`AlertDialog` → `deleteTripCascade` → về `/admin/trips`). Lưu xong mới → chuyển tới `/admin/trips/:id`.
- [x] **Step 4:** `npm test` PASS. Thủ công: tạo chuyến "Đà Lạt 2026" với 4 người; mở link trong tab ẩn danh thấy trang (placeholder) không lỗi permission.
- [x] **Step 5:** Commit `feat(admin): trip list and editor; who-am-i hook`.

---

### Task 13: Trang chuyến đi — khung, Tổng kết, Chi tiêu

**Files:**
- Create: `src/pages/TripPage.tsx`, `src/components/WhoAmI.tsx`, `src/components/OfflineBanner.tsx`, `src/hooks/useOnlineStatus.ts`, `src/components/SummaryTable.tsx`, `src/components/MoneyInput.tsx`, `src/components/MemberChips.tsx`, `src/components/ExpenseForm.tsx`, `src/components/ExpenseList.tsx`
- Test: `src/components/MoneyInput.test.tsx`, `src/components/ExpenseForm.test.tsx`

**Interfaces:**
- Consumes: `useTrip`, `useExpenses`, `usePayments`, `addExpense`, `updateExpense`, `deleteExpense`, `hasPendingWrites`, `ExpenseFormValues` (Task 9), `useAdmin` (Task 10), `useMe` (Task 12), `computeShares`, `computeBalances`, `parseVND`, `formatVND`, `formatSignedVND`, `formatDateVN`, `todayISO`.
- Produces:
  ```ts
  export function MoneyInput(p: { value: VND | null; onChange(v: VND | null): void; allowZero?: boolean; placeholder?: string; 'aria-label'?: string }): JSX.Element;
  export function MemberChips(p: { members: { id: string; name: string }[]; mode: 'single' | 'multi'; value: string[]; onChange(ids: string[]): void }): JSX.Element;
  export function ExpenseForm(p: { members: Member[]; defaultPayerId: string | null; initial?: ExpenseFormValues; onSubmit(v: ExpenseFormValues): Promise<void>; onCancel(): void }): JSX.Element;
  ```
  `TripPage` tính `{ rows, invalidExpenseIds, totalSpent } = useMemo(computeBalances(...))` và `transfers = useMemo(settle(rows, memberIds))` một lần, truyền xuống tab. Quyền ghi phía UI: `canAddExpense = admin || (trip.allowGuestExpenses && !trip.locked)`; `canEditExpense(e) = admin || (canAddExpense && e.createdBy === 'guest')`.

- [x] **Step 1: Viết test thất bại**
  `MoneyInput`: gõ `190k` → `onChange(190000)` và hiện `= 190.000đ`; gõ `abc` → `onChange(null)` và hiện "Số tiền không hợp lệ"; `allowZero` + `0` → `onChange(0)`; input có `inputMode="text"`.
  `ExpenseForm` (members Sang, Chung, Mơ, Phụng; `defaultPayerId: 'sang'`):
  ```ts
  it('defaults: all participants selected, payer = me, date today');
  it('spec example preview and submit', async () => {
    // tên "Ăn sáng", tiền "190k", bật "Chia không đều", Chung "45k", Mơ "45k"
    expect(screen.getAllByText('Tự tính: 50.000đ')).toHaveLength(2);
    expect(screen.getByText('✔ Khớp 190.000đ')).toBeInTheDocument();
    // bấm Lưu
    expect(onSubmit).toHaveBeenCalledWith({ name: 'Ăn sáng', amount: 190000, payerId: 'sang',
      participantIds: ['sang', 'chung', 'mo', 'phung'], fixedAmounts: { chung: 45000, mo: 45000 },
      note: '', date: todayISO() });
  });
  it('blocks save on FIXED_EXCEEDS_TOTAL and shows the message');
  it('blocks save when no participant selected ("Bỏ hết")');
  it('unselecting a participant drops their fixed amount from the payload');
  it('save button disabled while onSubmit is pending (single call on double click)');
  ```
- [x] **Step 2:** `npm test -- src/components` → FAIL.
- [x] **Step 3:** Cài `MoneyInput`, `MemberChips` (shadcn `ToggleGroup`), `ExpenseForm` theo §9 (preview gọi `computeShares` mỗi lần đổi; mục "Chia không đều" và "Thêm chi tiết" thu gọn mặc định).
- [x] **Step 4:** `npm test -- src/components` → PASS.
- [x] **Step 5:** Cài `TripPage` theo §9 (phần không phụ thuộc Task 14): xử lý `TripState` — `loading` Skeleton; `not-found` "Link không đúng hoặc chuyến đã bị xóa"; `offline-empty` "Không tải được chuyến đi — kiểm tra mạng rồi thử lại"; `error` Alert + nút "Thử lại". Header (tên, ngày, tổng chi, badge khóa/nhóm nhập, nút copy link, nút đổi "Bạn là ai"), `WhoAmI` (mở khi `me === null`), `OfflineBanner` (`useOnlineStatus` + `hasPendingWrites`), Tabs "Tổng kết & Thanh toán" (tạm: thẻ số dư của tôi + `SummaryTable`; cảnh báo nếu `invalidExpenseIds.length > 0`) và "Chi tiêu" (`ExpenseList` + nút **+** nổi góc dưới phải khi `canAddExpense`; chạm khoản → xem phần chia + Sửa/Xóa khi `canEditExpense`; Xóa qua `AlertDialog`). Lỗi `permission-denied` khi ghi → toast "Chuyến đã khóa hoặc chưa cho phép nhập".
- [x] **Step 6:** Thủ công trên emulator: nhập đủ 4 khoản của Google Sheet mẫu → bảng hiện Sang `+826.250đ`, Chung `-273.750đ`, Mơ `-273.750đ`, Phụng `-278.750đ`; tab ẩn danh với `allowGuestExpenses=false` không thấy nút **+**.
- [x] **Step 7:** Commit `feat(trip): trip page shell, summary and expense entry`.

---

### Task 14: Thanh toán — kế hoạch, QR, đã chuyển, lịch sử, `?pay=`

**Files:**
- Create: `src/components/SettlementList.tsx`, `src/components/QrSheet.tsx`, `src/components/MarkPaidSheet.tsx`, `src/components/PaymentsHistory.tsx`
- Modify: `src/pages/TripPage.tsx`
- Test: `src/components/QrSheet.test.tsx`, `src/components/MarkPaidSheet.test.tsx`, `src/components/SettlementList.test.tsx`, `src/pages/TripPage.test.tsx`

**Interfaces:**
- Consumes: `buildVietQrUrl`, `defaultTransferNote`, `findBank` (Task 6), `parsePayParam` (Task 7), `addPayment`, `deletePayment`, `getMemberQr` (Task 9), `formatVND`, `parseVND`.
- Produces:
  ```ts
  export function SettlementList(p: { transfers: Transfer[]; me: string | null; nameOf(id: string): string; onQr(t: Transfer): void; onPaid(t: Transfer): void; onCopyReminder(t: Transfer): void; canMarkPaid: boolean }): JSX.Element;
  export function QrSheet(p: { open: boolean; onOpenChange(o: boolean): void; transfer: Transfer; from: Member; to: Member; tripName: string; tripId: string; onPaid(): void }): JSX.Element;
  export function MarkPaidSheet(p: { open: boolean; onOpenChange(o: boolean): void; transfer: Transfer; nameOf(id: string): string; onConfirm(amount: VND, note: string): Promise<void> }): JSX.Element;
  export function PaymentsHistory(p: { payments: Payment[]; nameOf(id: string): string; canUndo(p: Payment): boolean; onUndo(p: Payment): void }): JSX.Element;
  ```
  `canMarkPaid = admin || !trip.locked`; `canUndo(p) = admin || (!trip.locked && p.markedBy === 'guest')`.

- [ ] **Step 1: Viết test thất bại**
  - `SettlementList`: giao dịch có `me` (là `fromId` hoặc `toId`) đứng đầu, còn lại giữ thứ tự; danh sách rỗng → "🎉 Cả nhóm đã thanh toán xong!"; `canMarkPaid=false` → không có nút "Đã chuyển".
  - `QrSheet`: người nhận có STK → `<img>` có `src` bằng `buildVietQrUrl(...)` và `referrerpolicy="no-referrer"`; bắn sự kiện `error` trên ảnh → ảnh biến mất, hiện các dòng Ngân hàng/STK/Chủ TK/Số tiền/Nội dung, mỗi dòng một nút Copy (mock `navigator.clipboard.writeText`, bấm Copy STK → gọi với `'0123456789'`); người nhận không có STK → "Người nhận chưa có thông tin ngân hàng"; `hasStaticQr` → có tab "QR MoMo" và chỉ gọi `getMemberQr` khi bấm tab.
  - `MarkPaidSheet`: mặc định số tiền = `transfer.amount`; sửa thành `200k` → `onConfirm(200000, '')`; nhập `300k` (> gợi ý) → hiện cảnh báo "Số tiền lớn hơn số cần trả" nhưng vẫn cho xác nhận; **`MarkPaidSheet submits once`** — click 2 lần liên tiếp khi `onConfirm` còn pending → gọi đúng 1 lần (Review Focus #1).
- [ ] **Step 2:** `npm test -- src/components` → FAIL ở 3 file mới.
- [ ] **Step 3:** Cài 4 component theo §9. Nội dung chuyển khoản = `defaultTransferNote(from.name, tripName)`.
- [ ] **Step 4:** Nối vào `TripPage`: tab Tổng kết = thẻ của tôi → `SettlementList` → `SummaryTable` → `PaymentsHistory`. Đọc `?pay=` một lần khi dữ liệu sẵn sàng: `parsePayParam` → tìm trong `transfers` → có thì mở `QrSheet`, không có thì bỏ qua và xóa tham số khỏi URL (`setSearchParams`, `replace: true`). Thêm test `ignores stale pay link` (Review Focus #5) vào `src/pages/TripPage.test.tsx` với data hooks mock: URL `?pay=chung.sang` khi `transfers` rỗng → không có dialog nào mở.
- [ ] **Step 5:** `npm test` → PASS.
- [ ] **Step 6:** Thủ công: với dữ liệu sheet mẫu, Chung bấm "Đã chuyển" đủ → Chung biến khỏi kế hoạch; Mơ trả `200k` → kế hoạch còn Mơ → Sang `73.750đ`; Hoàn tác → trở lại; mở `/t/<id>?pay=mo.sang` → QR sheet mở đúng người.
- [ ] **Step 7:** Commit `feat(trip): settlement plan, VietQR sheet, payment ledger UI`.

---

### Task 15: Nhắc nợ (Copy / Chia sẻ)

**Files:**
- Create: `src/components/ReminderActions.tsx`
- Modify: `src/pages/TripPage.tsx`, `src/components/SettlementList.tsx` (nút copy nhắc riêng gọi `buildPersonalReminder`)
- Test: `src/components/ReminderActions.test.tsx`

**Interfaces:**
- Consumes: `buildGroupReminder`, `buildPersonalReminder` (Task 7).
- Produces: `export function ReminderActions(p: { text: string }): JSX.Element;` — xem trước `text`, nút **Copy** (`navigator.clipboard.writeText` → toast "Đã copy tin nhắn"), nút **Chia sẻ** chỉ hiện khi `typeof navigator.share === 'function'` (`navigator.share({ text })`; người dùng hủy — lỗi `AbortError` — thì im lặng; lỗi khác → fallback copy).

- [ ] **Step 1:** Test: Copy gọi `writeText(text)`; không có `navigator.share` → không có nút Chia sẻ; `share` reject `AbortError` → không toast lỗi, không gọi `writeText`; `share` reject lỗi khác → gọi `writeText`.
- [ ] **Step 2:** `npm test -- src/components/ReminderActions` → FAIL.
- [ ] **Step 3:** Cài `ReminderActions`; header `TripPage` có nút "Nhắc nợ" mở `ResponsiveModal` chứa `ReminderActions` với `buildGroupReminder` (`paid` = payments map sang `Transfer`, `tripUrl = ${location.origin}/t/${tripId}`).
- [ ] **Step 4:** `npm test` PASS; `npm run build` sạch; `npm run lint` 0 lỗi.
- [ ] **Step 5:** Thủ công trên điện thoại thật (`npx vite --host`, cùng Wi-Fi, emulator chạy với `--host`/IP máy): Chia sẻ mở menu sang Messenger/Zalo; Copy dán ra đúng định dạng.
- [ ] **Step 6:** Commit `feat(trip): group and personal debt reminders`.

---

### Task 16: Kiểm thử nghiệm thu toàn bộ trên emulator

**Files:** không tạo file mới (sửa lỗi phát sinh vào file liên quan, mỗi lỗi một commit kèm test tái hiện).

- [ ] **Step 1:** `npm test`, `npm run test:rules`, `npm run typecheck`, `npm run lint`, `npm run build` → tất cả PASS.
- [ ] **Step 2:** Chạy đủ checklist §12.3 trên emulator: 2 thiết bị realtime; chế độ máy bay vẫn xem được và QR chuyển sang khối copy; ghi khi offline xếp hàng và đồng bộ khi có mạng (banner biến mất); viewport 375px không tràn ngang, ≥ 768px dùng Dialog; `locked` → khách không thấy nút ghi nào.
- [ ] **Step 3:** Với mỗi lỗi tìm thấy: viết test tái hiện → sửa → test PASS → commit `fix: ...`.

---

### Task 17: Lên production

**Files:**
- Modify: `firestore.rules` (UID thật), `.firebaserc` (thêm alias `prod`), `AGENTS.md`, `DESIGN.md` (nếu có thay đổi), `package.json` (script `deploy:rules`)

Các bước **chủ dự án tự làm** được đánh dấu 👤.

- [ ] **Step 1 👤:** Firebase Console → tạo project (gói **Spark**, không nâng Blaze) → Firestore Database, chế độ production, vùng `asia-southeast1` → Authentication → bật **Google** → Project settings → thêm Web app, copy config.
- [ ] **Step 2 👤:** `npx firebase-tools login`. Rồi: `npx firebase-tools use --add` chọn project thật, alias `prod`. Thêm script `"deploy:rules": "firebase deploy --only firestore:rules --project prod"`.
- [ ] **Step 3 👤:** Tạo repo GitHub (private được), `git remote add origin ...`, `git push -u origin main`.
- [ ] **Step 4 👤:** Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git → chọn repo; Framework preset **None/Vite**, build command `npm run build`, output `dist`; Environment variables (Production): `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `VITE_ADMIN_UID` (tạm để trống), `NODE_VERSION` = major của `node -v` máy dev. Deploy → ghi lại domain `<project>.pages.dev`.
- [ ] **Step 5 👤:** Firebase Console → Authentication → Settings → Authorized domains → thêm `<project>.pages.dev`.
- [ ] **Step 6:** Mở `https://<project>.pages.dev/admin` → đăng nhập Google → thấy "không có quyền" (đúng). 👤 Lấy UID ở Authentication → Users.
- [ ] **Step 7:** Dán UID vào `firestore.rules`; `npm run test:rules` → PASS (test tự đọc UID từ file); `npm run deploy:rules` → "Deploy complete". 👤 Cập nhật `VITE_ADMIN_UID` trên Cloudflare → Retry deployment.
- [ ] **Step 8:** Smoke test production: đăng nhập admin → vào `/admin/trips`; tạo danh bạ + một chuyến thử; mở link trong tab ẩn danh trên điện thoại (4G) → xem được; `https://<project>.pages.dev/t/<id>` tải lại trực tiếp không 404 (`_redirects`); DevTools → response header có `Referrer-Policy: no-referrer` (`_headers`); **quét QR bằng app ngân hàng thật** → đúng STK, số tiền, nội dung không dấu (không cần chuyển); thử `getDocs(collection(db,'trips'))` từ console tab ẩn danh → `permission-denied`.
- [ ] **Step 9:** Cập nhật `AGENTS.md`: thay "Pre-implementation" bằng trạng thái thật; thêm mục **Commands** (bảng scripts §10 + `deploy:rules`), cách chạy emulator, lưu ý UID admin nằm trong `firestore.rules`. Xóa chuyến thử.
- [ ] **Step 10:** Commit `chore: production config and docs` và push → Cloudflare tự deploy bản cuối.
