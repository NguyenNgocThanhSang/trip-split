# AGENTS.md

Project rules for coding agents (Antigravity reads this file; Claude Code imports it from CLAUDE.md).

## Project status

MVP implemented and deployed. **TripSplit** is a mobile-first web app for splitting group trip expenses among a small circle of friends (~10–15 users, 4–15 people per trip).

Commands (`package.json`):
- `npm run dev` — Vite dev server (uses `.env.local`, Firebase Emulator)
- `npm run emulators` — Firebase Auth + Firestore Emulators (`demo-tripsplit`)
- `npm test` — Vitest unit & component tests (`src/**`, `scripts/**`)
- `npm run test:rules` — Firestore rules & data tests on the Firestore Emulator (`tests/`)
- `npm run typecheck` — `tsc --noEmit -p tsconfig.app.json`
- `npm run lint` — ESLint
- `npm run build` — `tsc -b && vite build` → `dist/`; fails fast if the Firebase config points at the emulator / `demo-*` (`scripts/build-env-guard.ts`)
- `npm run deploy:rules` — deploy `firestore.rules` to production (`-P prod`)

Deploy & CI/CD: see **`docs/DEPLOY.md`** (environments, env vars, manual deploy checklist, rollback).

Documents:
- **`DESIGN.md` — the agreed design and the source of truth for implementation** (decisions, data model, security rules, split/settlement logic, screens, build order, tests). Follow it unless the user changes a decision; when a decision changes, update `DESIGN.md` too.
- `IDEA.md` — the original product spec (Vietnamese). Where it conflicts with `DESIGN.md`, `DESIGN.md` wins.
- `DESIGN.agy.md` — an alternative design written by Antigravity for comparison. Its improvements are already merged into `DESIGN.md`; reference only, do not implement from it.

## Stack (decided)

- React + Vite + TypeScript + Tailwind CSS + shadcn/ui (lucide-react icons), React Router. Pure static SPA, no backend.
- Firebase **Spark (free) plan only**: Firestore + Auth. **No Cloud Functions, no Cloud Storage** — both require the paid Blaze plan. (Supabase was rejected: its free tier pauses after ~7 days idle.)
- Hosting: **Cloudflare Workers Static Assets**, auto-deployed from GitHub via Workers Builds (`wrangler.jsonc`: `assets.directory = "./dist"`, `not_found_handling = "single-page-application"` for SPA fallback — do not add `public/_redirects`, it loops on Workers; `public/_headers` for security headers). CI: `.github/workflows/ci.yml` runs checks on every PR (no deploy).
- Tests: Vitest for `src/lib`; `@firebase/rules-unit-testing` on the Firestore Emulator for `firestore.rules`.

## Hard constraints

- **Zero cost**: free tiers only, no credit card, nothing that sleeps / cold-starts. Prefer free keyless options over anything needing API keys.
- **Don't over-engineer**: personal tool, not a multi-tenant SaaS.
- **Mobile-first**, one-handed use; must still look fine on desktop.
- **Vietnamese UI and money formatting**: display `190.000đ` (dot thousands separator, no decimals); input accepts shorthand like `190k`, `1tr2`.
- **Money is always an integer VND** — never floats.

## Code comments & docstrings (required)

Every file you write or change must be fully documented. Write comments and docstrings **in Vietnamese** (identifiers stay English).

- **File header**: every source file starts with a short `/** ... */` block saying what the file is for and what it must not do (e.g. "Hàm thuần — không import React/Firebase").
- **TSDoc on every exported symbol** (functions, components, hooks, types, interfaces, constants):
  - one-line summary, then details when needed;
  - `@param` for each parameter, `@returns` describing the return value, `@throws` when it can throw;
  - `@example` for every `src/lib` function, using real values from `DESIGN.md` (e.g. `parseVND('1tr2') // 1200000`);
  - document every field of exported interfaces/types (units — VND integer, ISO date — and allowed ranges).
- **React components**: TSDoc on the component describing what it shows and when, plus a comment on each prop.
- **Inline comments explain *why*, not *what***: business rules, rounding decisions, edge cases, offline behaviour, Firestore/rules constraints, workarounds. Link the spec section when relevant (`// DESIGN.md §8.2: 1đ lẻ cho người đầu theo memberOrder`). No comments that just restate the code.
- **Algorithms** (`split`, `balances`, `settle`, `parseVND`): a numbered step comment matching the steps in `DESIGN.md` §8.
- **`firestore.rules`**: a comment above every helper and every `allow` line saying who it lets in and why.
- **Tests**: a `describe` per behaviour; test names in Vietnamese describing the expected behaviour; a comment on non-obvious fixtures explaining where the numbers come from.
- Keep comments true: when code changes, update its comments in the same commit.

## Access model

- **Admin (single owner)**: Firebase Auth **Google Sign-In**; `firestore.rules` grants admin rights only to one hard-coded UID. No PIN (a client-side PIN can be bypassed). Creates/edits/deletes trips, manages the friend directory and bank accounts, locks trips, toggles per-trip "group can add expenses".
- **Guests (no login)**: open a trip via its link `/t/<10-char random id>` (unguessable, because the page shows bank account numbers). Can view expenses, their own summary, the settlement plan, scan QR, and mark "I've paid". Can add expenses only when the admin enabled it, and may only edit/delete expenses and payments created by guests. Guests can never edit trip data (members, bank info) or list trips.
- The trip ID is effectively the access token, so **security rules are the only authorization layer** — every new read/write path needs a rule and a rules test.

## Core domain logic

The app replicates a Google Sheet prototype (tabs "Tổng kết & Thanh toán" and "Chi tiêu"). Exact algorithms are in `DESIGN.md` §8.

1. **Expense split**: name, amount, payer, participants (default: all members, toggled via chips), optional note/date.
   - Default: split equally among participants.
   - **Fixed overrides + auto-remainder**: some participants get a fixed share; the remainder is split equally among the others. Example: 190.000, Chung = 45.000, Mơ = 45.000 → Sang and Phụng 50.000 each.
   - **Validation**: no participants, fixed sum > total, or all fixed but sum ≠ total → error and block saving.
   - **Rounding**: integer division; leftover đồng go one each to the first flexible participants in trip member order, so shares always sum exactly to the total.
2. **Per-person summary**: paid (đã ứng) | owed (phải chịu) | balance (`+` receives back / `−` must pay).
3. **Settlement**: exact-match pairs first, then greedy largest debtor ↔ largest creditor; at most n−1 transfers, deterministic order.
4. **Payment tracking**: payments are a **ledger of real transfers** (from, to, amount, time; partial payments allowed), not checkmarks on the plan. They feed into balances, so the plan is always recomputed from what is still owed. Never store computed balances or plans.

## Integrations

- **Dynamic VietQR** (free, no API key): `https://img.vietqr.io/image/<BANK_BIN>-<ACCOUNT_NO>-compact2.png?amount=<X>&addInfo=<message>&accountName=<NAME>` — note without diacritics, ≤ 50 chars (e.g. `"Chung tra tien Da Lat"`). If the image fails or the device is offline, show bank / account / amount / note as text with copy buttons.
- **Static MoMo QR** (optional fallback): compressed client-side to ≤ 70 KB and stored as a data URL in Firestore (`memberQrs`), since Cloud Storage needs Blaze.
- **Messenger/Zalo reminders**: no bot API. Copy-formatted reminder text (group and per person, with a `?pay=` deep link) and a Web Share API button.

## In MVP vs. Phase 2

- **MVP also includes** (moved up from IDEA.md Phase 2): friend directory and trip locking.
- **Phase 2**: summary-card image download (`html-to-image`), receipt photos (needs a free non-Firebase store, e.g. Cloudflare R2), end-of-trip stats, Telegram/Discord webhook reminders via a Cloudflare Worker.
