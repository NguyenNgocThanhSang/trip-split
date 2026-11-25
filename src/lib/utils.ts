/**
 * Tiện ích gộp class CSS cho các component UI.
 * File này được giữ lại để `shadcn/ui` tham chiếu qua `aliases.utils` trong `components.json`
 * (các component preset `radix-nova` hiện import trực tiếp từ package `"cn"`).
 * Hàm thuần — không import React hay Firebase.
 */
import { cn as baseCn } from 'cn'

/** Kiểu đầu vào cho hàm gộp class CSS (chuỗi, mảng, object điều kiện hoặc giá trị falsy). */
export type ClassValue = Parameters<typeof baseCn>[number]

/**
 * Gộp danh sách class CSS và giải quyết xung đột class Tailwind theo ưu tiên tham số sau.
 *
 * @param inputs - Các giá trị class cần gộp
 * @returns Chuỗi class CSS đã chuẩn hóa
 * @example
 * cn('px-4 py-2', 'px-6') // 'py-2 px-6'
 */
export function cn(...inputs: ClassValue[]): string {
  return baseCn(...inputs)
}
