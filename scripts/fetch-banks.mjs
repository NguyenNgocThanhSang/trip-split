/**
 * Script Node chạy tay một lần để chụp danh sách ngân hàng Việt Nam từ VietQR API (`v2/banks`)
 * và ghi thành dữ liệu tĩnh vào `src/lib/banks.ts` nhằm tránh phụ thuộc mạng lúc app chạy.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const API_URL = 'https://api.vietqr.io/v2/banks'
const OUTPUT_PATH = path.resolve(import.meta.dirname, '../src/lib/banks.ts')

const res = await fetch(API_URL)
if (!res.ok) {
  throw new Error(`Không tải được danh sách ngân hàng (${res.status} ${res.statusText})`)
}

const payload = await res.json()
if (!payload || !Array.isArray(payload.data)) {
  throw new Error('Cấu trúc JSON từ VietQR API không hợp lệ (thiếu mảng data)')
}

// Khử trùng theo mã BIN và bỏ các bản ghi thiếu mã BIN 6 số
const seenBins = new Set()
const banks = []
for (const item of payload.data) {
  const bin = typeof item?.bin === 'string' ? item.bin.trim() : ''
  if (!bin || seenBins.has(bin)) continue
  seenBins.add(bin)
  banks.push({
    bin,
    code: typeof item.code === 'string' ? item.code.trim() : '',
    shortName: typeof item.shortName === 'string' ? item.shortName.trim() : '',
    name: typeof item.name === 'string' ? item.name.trim() : '',
  })
}

banks.sort((a, b) => a.shortName.localeCompare(b.shortName, 'vi'))

if (banks.length < 40) {
  throw new Error(`Số lượng ngân hàng quá ít (${banks.length}), kiểm tra lại dữ liệu API`)
}

const content = `/**
 * Danh sách ngân hàng Việt Nam tĩnh (chụp một lần từ https://api.vietqr.io/v2/banks qua scripts/fetch-banks.mjs).
 * Hàm thuần — không import React hay Firebase.
 */

/** Thông tin định danh một ngân hàng hỗ trợ chuyển khoản VietQR/NAPAS. */
export interface Bank {
  /** Mã BIN 6 chữ số do Ngân hàng Nhà nước quy định (vd: \`"970436"\` cho Vietcombank). */
  bin: string
  /** Mã viết tắt liên ngân hàng (vd: \`"VCB"\`). */
  code: string
  /** Tên gọi ngắn gọn dùng hiển thị trên giao diện (vd: \`"Vietcombank"\`). */
  shortName: string
  /** Tên pháp lý đầy đủ của ngân hàng. */
  name: string
}

/** Danh sách toàn bộ ngân hàng Việt Nam hỗ trợ VietQR, sắp xếp theo \`shortName\`. */
export const BANKS: Bank[] = ${JSON.stringify(banks, null, 2)}

// Dùng Map để tra cứu O(1) theo mã BIN và tránh nhầm thuộc tính Object.prototype
const BANK_BY_BIN = new Map<string, Bank>(BANKS.map((bank) => [bank.bin, bank]))

/**
 * Tra cứu thông tin ngân hàng theo mã BIN 6 chữ số.
 *
 * @param bin - Mã BIN ngân hàng cần tìm (vd: \`"970436"\`)
 * @returns Thông tin ngân hàng tương ứng hoặc \`undefined\` nếu không tìm thấy
 * @example
 * findBank('970436')?.shortName // "Vietcombank"
 */
export function findBank(bin: string): Bank | undefined {
  return BANK_BY_BIN.get(bin.trim())
}
`

await fs.writeFile(OUTPUT_PATH, content, 'utf8')
console.log(`Đã ghi ${banks.length} ngân hàng vào ${OUTPUT_PATH}`)
