/**
 * Màn hình danh sách chuyến đi của Admin (`/admin/trips`).
 * Hiển thị toàn bộ chuyến mới nhất trước, cho phép copy link chia sẻ, khóa sổ nhanh, vào danh bạ bạn bè và đăng xuất.
 */
import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  Calendar,
  Copy,
  ExternalLink,
  LogOut,
  Plus,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { signOut } from '@/data/auth'
import { db } from '@/data/firebase'
import { updateTrip, useTripList } from '@/data/trips'
import type { Trip } from '@/data/types'
import { formatDateVN } from '@/lib/date'

/**
 * Định dạng khoảng ngày đi/về tiếng Việt cho thẻ chuyến đi, hoặc trả `null` nếu chưa đặt ngày.
 *
 * @param startDate - Ngày bắt đầu ISO `"YYYY-MM-DD"` (tùy chọn)
 * @param endDate - Ngày kết thúc ISO `"YYYY-MM-DD"` (tùy chọn)
 * @returns Chuỗi hiển thị ngày gọn gàng hoặc `null`
 */
function formatTripDates(startDate?: string, endDate?: string): string | null {
  if (startDate && endDate) {
    if (startDate === endDate) {
      return formatDateVN(startDate)
    }
    return `${formatDateVN(startDate)} – ${formatDateVN(endDate)}`
  }
  if (startDate) {
    return `Từ ${formatDateVN(startDate)}`
  }
  if (endDate) {
    return `Đến ${formatDateVN(endDate)}`
  }
  return null
}

/**
 * Trang quản lý danh sách các chuyến đi dành riêng cho Admin.
 *
 * @returns Giao diện danh sách chuyến đi kèm nút tạo chuyến mới, danh bạ và thao tác nhanh
 */
export function AdminTrips() {
  const { status, trips } = useTripList()
  const [togglingTripId, setTogglingTripId] = useState<string | null>(null)
  const [isSigningOut, setIsSigningOut] = useState(false)

  /**
   * Sao chép đường dẫn công khai `/t/<tripId>` vào clipboard để gửi vào nhóm chat.
   *
   * @param tripId - Mã chuyến đi 10 ký tự
   */
  async function handleCopyLink(tripId: string) {
    const url = `${window.location.origin}/t/${tripId}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Đã copy link')
    } catch {
      toast.error('Không thể copy tự động. Hãy mở trang chuyến rồi sao chép URL.')
    }
  }

  /**
   * Bật/tắt nhanh trạng thái khóa sổ của một chuyến ngay trên danh sách.
   *
   * @param trip - Document chuyến đi hiện tại
   * @param nextLocked - Trạng thái khóa mới (`true` nếu khóa sổ)
   */
  async function handleToggleLock(trip: Trip, nextLocked: boolean) {
    setTogglingTripId(trip.id)
    try {
      await updateTrip(
        db,
        trip.id,
        {
          name: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          members: trip.members,
          allowGuestExpenses: trip.allowGuestExpenses,
          locked: nextLocked,
        },
        {},
      )
      toast.success(nextLocked ? `Đã khóa sổ "${trip.name}".` : `Đã mở lại "${trip.name}".`)
    } catch {
      toast.error('Không thể cập nhật trạng thái khóa. Vui lòng thử lại.')
    } finally {
      setTogglingTripId(null)
    }
  }

  /**
   * Đăng xuất tài khoản quản trị Google khỏi trình duyệt.
   */
  async function handleSignOut() {
    setIsSigningOut(true)
    try {
      await signOut()
      toast.success('Đã đăng xuất.')
    } catch {
      toast.error('Không thể đăng xuất lúc này. Vui lòng thử lại.')
    } finally {
      setIsSigningOut(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <header className="flex items-center justify-between gap-2">
        <h1 className="truncate text-lg font-semibold">Chuyến đi của tôi</h1>
        <div className="flex shrink-0 items-center gap-1">
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/admin/friends">
              <Users />
              Danh bạ
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="min-h-11 min-w-11"
            aria-label="Đăng xuất"
            disabled={isSigningOut}
            onClick={() => void handleSignOut()}
          >
            <LogOut />
          </Button>
        </div>
      </header>

      <Button asChild className="min-h-11 w-full">
        <Link to="/admin/trips/new">
          <Plus />
          Tạo chuyến đi mới
        </Link>
      </Button>

      {status === 'loading' && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
          <Skeleton className="h-28 w-full rounded-xl" />
        </div>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Không tải được danh sách chuyến đi</AlertTitle>
          <AlertDescription>
            Kiểm tra lại kết nối mạng hoặc quyền tài khoản admin rồi tải lại trang.
          </AlertDescription>
        </Alert>
      )}

      {status === 'ok' && trips.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Chưa có chuyến đi nào. Nhấn &ldquo;Tạo chuyến đi mới&rdquo; hoặc thêm bạn bè vào danh bạ trước để chọn nhanh thành viên.
            </p>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/admin/friends">
                <Users />
                Mở danh bạ bạn bè
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'ok' && trips.length > 0 && (
        <ul className="flex flex-col gap-3">
          {trips.map((trip) => {
            const dateLabel = formatTripDates(trip.startDate, trip.endDate)
            const isToggling = togglingTripId === trip.id

            return (
              <li key={trip.id}>
                <Card size="sm">
                  <CardContent className="flex flex-col gap-3">
                    <div className="flex items-start justify-between gap-2">
                      <Link
                        to={`/admin/trips/${trip.id}`}
                        className="min-w-0 flex-1 hover:underline"
                      >
                        <h2 className="truncate text-base font-semibold">{trip.name}</h2>
                      </Link>
                      <Badge variant={trip.locked ? 'secondary' : 'outline'}>
                        {trip.locked ? 'Đã khóa' : 'Đang mở'}
                      </Badge>
                    </div>

                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      {dateLabel && (
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="size-3.5" />
                          {dateLabel}
                        </span>
                      )}
                      <span>{trip.members.length} thành viên</span>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-2">
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="min-h-11"
                          onClick={() => void handleCopyLink(trip.id)}
                        >
                          <Copy />
                          Copy link
                        </Button>
                        <Button asChild variant="ghost" size="sm" className="min-h-11">
                          <Link to={`/t/${trip.id}`}>
                            <ExternalLink />
                            Mở link
                          </Link>
                        </Button>
                      </div>

                      <div className="flex items-center gap-2">
                        <label
                          htmlFor={`lock-${trip.id}`}
                          className="text-xs text-muted-foreground select-none"
                        >
                          Khóa sổ
                        </label>
                        <Switch
                          id={`lock-${trip.id}`}
                          checked={trip.locked}
                          disabled={isToggling}
                          aria-label={`Khóa sổ ${trip.name}`}
                          onCheckedChange={(checked) => void handleToggleLock(trip, checked)}
                        />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
