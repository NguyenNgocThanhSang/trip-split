/**
 * Khu vực quản lý link cá nhân từng thành viên cho Admin (trong `AdminTripEdit` và modal trên `TripPage`).
 * Hỗ trợ copy link `?k=<memberId>.<code>`, tạo mã bổ sung cho chuyến cũ và xoay vòng mã khi bị lộ.
 */
import { useState } from 'react'
import { AlertCircle, Copy, KeyRound, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import type { MemberSecretsState } from '@/data/memberAccess'
import type { Member } from '@/data/types'
import { logError, logWarn } from '@/lib/logger'
import { buildPersonalTripUrl } from '@/lib/memberLink'

/** Props của component `MemberLinksSection`. */
export interface MemberLinksSectionProps {
  /** Mã chuyến đi 10 ký tự. */
  tripId: string
  /** Danh sách thành viên hiện tại của chuyến đi. */
  members: Member[]
  /** Trạng thái tải và bản đồ mã bí mật `memberSecrets` dành cho Admin. */
  secretsState: MemberSecretsState
  /** Callback tạo mã bổ sung cho những thành viên chưa có `memberSecrets`. */
  onGenerateMissing: () => Promise<void>
  /** Callback xoay vòng mã mới cho một thành viên (vô hiệu hóa link cũ). */
  onRotateSecret: (memberId: string) => Promise<void>
}

/**
 * Hiển thị danh sách thành viên kèm trạng thái mã bí mật, nút Copy link cá nhân và Tạo lại mã.
 *
 * @param props - Thông tin chuyến đi, thành viên, trạng thái mã bí mật và callback quản trị
 * @returns Giao diện quản lý link cá nhân từng thành viên
 */
export function MemberLinksSection({
  tripId,
  members,
  secretsState,
  onGenerateMissing,
  onRotateSecret,
}: MemberLinksSectionProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [rotatingTarget, setRotatingTarget] = useState<Member | null>(null)
  const [isRotating, setIsRotating] = useState(false)

  if (secretsState.status === 'loading' || secretsState.status === 'idle') {
    return (
      <div className="flex flex-col gap-2" aria-busy="true">
        <Skeleton className="h-12 w-full rounded-lg" />
        <Skeleton className="h-12 w-full rounded-lg" />
      </div>
    )
  }

  if (secretsState.status === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle />
        <AlertDescription>
          Không tải được mã liên kết cá nhân. Kiểm tra quyền Admin hoặc tải lại trang.
        </AlertDescription>
      </Alert>
    )
  }

  const missingMembers = members.filter((m) => !Object.hasOwn(secretsState.secrets, m.id))

  /**
   * Sao chép link cá nhân `?k=<memberId>.<code>` của một thành viên vào clipboard.
   *
   * @param member - Thành viên cần copy link cá nhân
   */
  async function handleCopyPersonalLink(member: Member) {
    const secret = secretsState.secrets[member.id]
    if (!secret) {
      return
    }
    const url = buildPersonalTripUrl(window.location.origin, tripId, member.id, secret.code)
    try {
      await navigator.clipboard.writeText(url)
      toast.success(`Đã copy link cá nhân của ${member.name} — chỉ gửi riêng cho ${member.name}`)
    } catch (error) {
      logWarn('memberLinks.copy', 'Không copy được link cá nhân', {
        tripId,
        memberId: member.id,
        reason: error instanceof Error ? error.message : String(error),
      })
      toast.error('Không thể copy tự động. Vui lòng thử lại.')
    }
  }

  /**
   * Tạo mã bí mật cho các thành viên chưa có mã (chuyến cũ hoặc mới thêm tay).
   */
  async function handleGenerateMissing() {
    if (isGenerating) {
      return
    }
    setIsGenerating(true)
    try {
      await onGenerateMissing()
      toast.success('Đã tạo mã cá nhân cho các thành viên còn thiếu.')
    } catch (error) {
      logError('memberLinks.generateMissing', error, { tripId })
      toast.error('Không thể tạo mã lúc này. Vui lòng thử lại.')
    } finally {
      setIsGenerating(false)
    }
  }

  /**
   * Xác nhận xoay vòng mã bí mật cho thành viên đang chọn để thu hồi link cũ.
   */
  async function handleConfirmRotate() {
    if (!rotatingTarget || isRotating) {
      return
    }
    const target = rotatingTarget
    setIsRotating(true)
    try {
      await onRotateSecret(target.id)
      toast.success(`Đã tạo lại mã cho ${target.name}. Hãy gửi link mới cho họ.`)
      setRotatingTarget(null)
    } catch (error) {
      logError('memberLinks.rotate', error, { tripId, memberId: target.id })
      toast.error('Không thể tạo lại mã lúc này. Vui lòng thử lại.')
    } finally {
      setIsRotating(false)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-xs text-muted-foreground">
        Lỡ gửi link cá nhân/nhắc nợ riêng vào nhóm? Bấm Tạo lại mã cho người đó.
      </p>

      {missingMembers.length > 0 && (
        <Alert>
          <KeyRound />
          <AlertDescription className="flex flex-col gap-2">
            <span>
              Có {missingMembers.length} thành viên chưa có mã liên kết cá nhân.
            </span>
            <Button
              type="button"
              size="sm"
              className="min-h-11 w-full"
              disabled={isGenerating}
              onClick={() => void handleGenerateMissing()}
            >
              <KeyRound />
              {isGenerating ? 'Đang tạo mã...' : 'Tạo mã cho thành viên chưa có mã'}
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <ul className="flex flex-col gap-2">
        {members.map((member) => {
          const hasSecret = Object.hasOwn(secretsState.secrets, member.id)
          return (
            <li
              key={member.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-lg border p-2.5"
            >
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate text-sm font-medium">{member.name}</span>
                <Badge variant={hasSecret ? 'outline' : 'secondary'}>
                  {hasSecret ? 'Đã có mã' : 'Chưa có mã'}
                </Badge>
              </div>

              <div className="flex shrink-0 items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  disabled={!hasSecret}
                  onClick={() => void handleCopyPersonalLink(member)}
                >
                  <Copy />
                  Copy link
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="min-h-11 text-muted-foreground hover:text-destructive"
                  disabled={!hasSecret}
                  onClick={() => setRotatingTarget(member)}
                >
                  <RefreshCw />
                  Tạo lại mã
                </Button>
              </div>
            </li>
          )
        })}
      </ul>

      <AlertDialog
        open={rotatingTarget !== null}
        onOpenChange={(open) => {
          if (!open && !isRotating) {
            setRotatingTarget(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tạo lại mã cho {rotatingTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Link cá nhân cũ sẽ ngừng hoạt động ngay lập tức. Bạn cần gửi lại link mới cho{' '}
              {rotatingTarget?.name} để họ tiếp tục xác nhận thanh toán hoặc nhập chi tiêu.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={isRotating}>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              disabled={isRotating}
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmRotate()
              }}
            >
              {isRotating ? 'Đang tạo lại...' : 'Tạo lại mã'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
