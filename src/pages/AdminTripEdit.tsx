/**
 * Màn hình tạo chuyến đi mới (`/admin/trips/new`) và chỉnh sửa chuyến đi (`/admin/trips/:tripId`).
 * Cho phép chọn thành viên từ danh bạ theo thứ tự, đồng bộ snapshot ngân hàng/QR mới nhất, bật/tắt khóa sổ và xóa chuyến dây chuyền.
 */
import { type FormEvent, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Copy,
  ExternalLink,
  RefreshCw,
  Trash2,
  Users,
} from 'lucide-react'
import { toast } from 'sonner'
import { MemberLinksSection } from '@/components/MemberLinksSection'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Switch } from '@/components/ui/switch'
import { useExpenses } from '@/data/expenses'
import { db } from '@/data/firebase'
import { type FriendsState, useFriends } from '@/data/friends'
import {
  generateMissingSecrets,
  rotateMemberSecret,
  useMemberSecrets,
} from '@/data/memberAccess'
import { usePayments } from '@/data/payments'
import {
  createTrip,
  deleteTripCascade,
  memberFromFriend,
  updateTrip,
  useTrip,
} from '@/data/trips'
import type { Expense, Friend, Member, Payment, Trip } from '@/data/types'
import { logError, logWarn } from '@/lib/logger'
import { memberInUse } from '@/lib/members'

/** Mục chọn thành viên kết hợp giữa danh bạ hiện hành và thành viên cũ đã lưu trong chuyến. */
interface MemberChoice {
  /** Mã thành viên (trùng `friend.id`). */
  id: string
  /** Tên hiển thị của thành viên. */
  name: string
  /** Hồ sơ bạn bè hiện có trong danh bạ (nếu chưa bị xóa khỏi danh bạ). */
  friend?: Friend
  /** Bản sao thành viên cũ lấy từ chuyến đi (dùng khi bạn đã bị xóa khỏi danh bạ). */
  member?: Member
}

/** Props của biểu mẫu con `TripEditorForm`. */
interface TripEditorFormProps {
  /** Dữ liệu chuyến đi hiện tại nếu đang chỉnh sửa; `undefined` khi tạo mới. */
  initialTrip?: Trip
  /** Trạng thái và danh sách bạn bè từ danh bạ. */
  friendsState: FriendsState
  /** Danh sách khoản chi của chuyến (dùng kiểm tra `memberInUse`). */
  expenses: Expense[]
  /** Danh sách thanh toán của chuyến (dùng kiểm tra `memberInUse`). */
  payments: Payment[]
}

/**
 * Biểu mẫu chỉnh sửa chi tiết chuyến đi; được gắn `key={trip.id}` hoặc `"new"`
 * để khởi tạo state trực tiếp từ `initialTrip` mà không cần đồng bộ qua `useEffect`.
 *
 * @param props - Thông tin chuyến hiện có, danh bạ bạn bè và dữ liệu phát sinh
 * @returns Giao diện biểu mẫu tạo/sửa và xóa chuyến đi
 */
function TripEditorForm({
  initialTrip,
  friendsState,
  expenses,
  payments,
}: TripEditorFormProps) {
  const navigate = useNavigate()
  const isEditing = Boolean(initialTrip)

  const [name, setName] = useState(initialTrip?.name ?? '')
  const [startDate, setStartDate] = useState(initialTrip?.startDate ?? '')
  const [endDate, setEndDate] = useState(initialTrip?.endDate ?? '')
  const [selectedMembers, setSelectedMembers] = useState<Member[]>(initialTrip?.members ?? [])
  const [allowGuestExpenses, setAllowGuestExpenses] = useState(
    initialTrip?.allowGuestExpenses ?? false,
  )
  const [locked, setLocked] = useState(initialTrip?.locked ?? false)
  // Lưu các thay đổi ảnh QR MoMo tĩnh chờ ghi batch khi cập nhật chuyến (chuỗi để ghi, null để xóa)
  const [pendingQrs, setPendingQrs] = useState<Record<string, string | null>>({})
  const [isSaving, setIsSaving] = useState(false)
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const secretsState = useMemberSecrets(initialTrip?.id ?? '', Boolean(initialTrip))

  const friendsById = useMemo(
    () => new Map(friendsState.friends.map((f) => [f.id, f])),
    [friendsState.friends],
  )

  const initialQrMap = useMemo(
    () => new Map((initialTrip?.members ?? []).map((m) => [m.id, m.hasStaticQr])),
    [initialTrip],
  )

  const selectedIds = useMemo(
    () => new Set(selectedMembers.map((m) => m.id)),
    [selectedMembers],
  )

  const lockedMemberIds = useMemo(() => {
    if (!isEditing) {
      return new Set<string>()
    }
    return new Set(
      selectedMembers
        .filter((m) => memberInUse(m.id, expenses, payments))
        .map((m) => m.id),
    )
  }, [isEditing, selectedMembers, expenses, payments])

  // Gộp danh bạ hiện tại với thành viên cũ lỡ đã bị xóa khỏi danh bạ để admin không làm mất dữ liệu chuyến
  const memberChoices = useMemo<MemberChoice[]>(() => {
    const choices: MemberChoice[] = friendsState.friends.map((friend) => ({
      id: friend.id,
      name: friend.name,
      friend,
    }))
    for (const member of selectedMembers) {
      if (!friendsById.has(member.id)) {
        choices.push({
          id: member.id,
          name: member.name,
          member,
        })
      }
    }
    return choices
  }, [friendsState.friends, selectedMembers, friendsById])

  const trimmedName = name.trim()
  const dateError =
    startDate && endDate && endDate < startDate
      ? 'Ngày về không được trước ngày đi.'
      : null
  const needsMoreMembers = selectedMembers.length < 2
  const isSaveDisabled = trimmedName.length === 0 || needsMoreMembers || Boolean(dateError) || isSaving

  /**
   * Sao chép liên kết chia sẻ chuyến đi `/t/<tripId>` vào clipboard.
   */
  async function handleCopyLink() {
    if (!initialTrip) {
      return
    }
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/t/${initialTrip.id}`)
      toast.success('Đã copy link')
    } catch (error) {
      logWarn('tripEdit.copyLink', 'Không copy được link chia sẻ', {
        tripId: initialTrip.id,
        reason: error instanceof Error ? error.message : String(error),
      })
      toast.error('Không thể copy tự động. Hãy sao chép trực tiếp từ thanh địa chỉ.')
    }
  }

  /**
   * Thêm hoặc bỏ tick một thành viên khỏi chuyến, giữ đúng thứ tự tick và đánh dấu QR cần thêm/xóa.
   *
   * @param choice - Mục thành viên tương ứng vừa được tick/bỏ tick
   */
  function handleToggleMember(choice: MemberChoice) {
    const currentlySelected = selectedIds.has(choice.id)

    if (currentlySelected) {
      if (lockedMemberIds.has(choice.id)) {
        return
      }
      setSelectedMembers((prev) => prev.filter((m) => m.id !== choice.id))

      if (isEditing) {
        const hadInitialQr = initialQrMap.get(choice.id) ?? false
        setPendingQrs((prev) => {
          const next = { ...prev }
          if (hadInitialQr) {
            next[choice.id] = null
          } else {
            delete next[choice.id]
          }
          return next
        })
      }
      return
    }

    const nextMember = choice.friend ? memberFromFriend(choice.friend) : choice.member
    if (!nextMember) {
      return
    }

    // Nối vào cuối danh sách để giữ đúng thứ tự tick của Admin (dùng cho chia 1đ lẻ ở computeShares)
    setSelectedMembers((prev) => [...prev, nextMember])

    if (isEditing && choice.friend) {
      const friendQr = choice.friend.momoQrDataUrl
      const hadInitialQr = initialQrMap.get(choice.id) ?? false
      setPendingQrs((prev) => {
        const next = { ...prev }
        if (friendQr) {
          next[choice.id] = friendQr
        } else if (hadInitialQr) {
          next[choice.id] = null
        } else {
          delete next[choice.id]
        }
        return next
      })
    }
  }

  /**
   * Làm mới snapshot thông tin ngân hàng và ảnh QR MoMo của các thành viên đang chọn theo danh bạ mới nhất.
   */
  function handleRefreshFromDirectory() {
    const nextQrs: Record<string, string | null> = { ...pendingQrs }
    let updatedCount = 0

    const refreshed = selectedMembers.map((member) => {
      const friend = friendsById.get(member.id)
      if (!friend) {
        return member
      }
      updatedCount += 1
      nextQrs[friend.id] = friend.momoQrDataUrl ? friend.momoQrDataUrl : null
      return memberFromFriend(friend)
    })

    setSelectedMembers(refreshed)
    setPendingQrs(nextQrs)

    if (updatedCount > 0) {
      toast.success('Đã lấy thông tin mới từ danh bạ. Bấm Lưu để áp dụng vào chuyến.')
    } else {
      toast.info('Không tìm thấy thành viên nào trong danh bạ hiện tại để cập nhật.')
    }
  }

  /**
   * Lưu chuyến đi mới hoặc cập nhật chuyến hiện tại lên Firestore.
   */
  async function handleSave() {
    if (isSaveDisabled) {
      return
    }

    const tripInput = {
      name: trimmedName,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      members: selectedMembers,
      allowGuestExpenses,
      locked,
    }

    setIsSaving(true)
    try {
      if (!initialTrip) {
        // Khi tạo mới chỉ gửi QR của những thành viên có ảnh MoMo tĩnh trong danh bạ
        const qrs: Record<string, string> = {}
        for (const member of selectedMembers) {
          const qr = friendsById.get(member.id)?.momoQrDataUrl
          if (qr) {
            qrs[member.id] = qr
          }
        }
        const newTripId = await createTrip(db, tripInput, qrs)
        toast.success('Đã tạo chuyến đi mới.')
        navigate(`/admin/trips/${newTripId}`, { replace: true })
      } else {
        await updateTrip(db, initialTrip.id, tripInput, pendingQrs, initialTrip.memberIds)
        setPendingQrs({})
        toast.success('Đã lưu thay đổi.')
      }
    } catch (error) {
      logError('tripEdit.save', error, { isEditing, tripId: initialTrip?.id })
      toast.error('Không thể lưu chuyến đi. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Xử lý submit form khi nhấn Enter.
   *
   * @param event - Sự kiện submit của `<form>`
   */
  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSave()
  }

  /**
   * Xóa hoàn toàn chuyến đi cùng toàn bộ chi tiêu, thanh toán và ảnh QR sau khi xác nhận.
   */
  async function handleConfirmDelete() {
    if (!initialTrip || isDeleting) {
      return
    }
    setIsDeleting(true)
    try {
      await deleteTripCascade(db, initialTrip.id)
      toast.success(`Đã xóa chuyến "${initialTrip.name}".`)
      setDeleteDialogOpen(false)
      navigate('/admin/trips', { replace: true })
    } catch (error) {
      logError('tripEdit.delete', error, { tripId: initialTrip.id })
      toast.error('Không thể xóa chuyến đi lúc này. Vui lòng thử lại.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <header className="flex items-center gap-2">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="min-h-11 min-w-11 shrink-0"
          aria-label="Quay lại danh sách chuyến đi"
        >
          <Link to="/admin/trips">
            <ArrowLeft />
          </Link>
        </Button>
        <h1 className="truncate text-lg font-semibold">
          {isEditing ? 'Chỉnh sửa chuyến đi' : 'Tạo chuyến đi mới'}
        </h1>
      </header>

      {initialTrip && (
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            className="min-h-11 flex-1"
            onClick={() => void handleCopyLink()}
          >
            <Copy />
            Copy link chia sẻ
          </Button>
          <Button asChild variant="secondary" className="min-h-11 flex-1">
            <Link to={`/t/${initialTrip.id}`}>
              <ExternalLink />
              Mở trang chuyến
            </Link>
          </Button>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-col gap-4">
        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="trip-name">
                Tên chuyến đi <span className="text-destructive">*</span>
              </Label>
              <Input
                id="trip-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Ví dụ: Đà Lạt 2026"
                className="min-h-11"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              {/* Đặt min-w-0 để input[type="date"] không đẩy rộng cột grid trên màn hình hẹp 375px */}
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="trip-start-date">Ngày đi</Label>
                <Input
                  id="trip-start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="min-h-11"
                />
              </div>
              <div className="flex min-w-0 flex-col gap-1.5">
                <Label htmlFor="trip-end-date">Ngày về</Label>
                <Input
                  id="trip-end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="min-h-11"
                />
              </div>
            </div>
            {dateError && (
              <p role="alert" className="text-xs text-destructive">
                {dateError}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-semibold">
                  Thành viên ({selectedMembers.length})
                </h2>
                <p className="text-xs text-muted-foreground">
                  Chọn theo thứ tự ưu tiên làm tròn tiền lẻ.
                </p>
              </div>
              {isEditing && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="min-h-11"
                  onClick={handleRefreshFromDirectory}
                >
                  <RefreshCw />
                  Cập nhật từ danh bạ
                </Button>
              )}
            </div>

            {friendsState.status === 'loading' && (
              <div className="flex flex-col gap-2">
                <Skeleton className="h-11 w-full rounded-lg" />
                <Skeleton className="h-11 w-full rounded-lg" />
              </div>
            )}

            {friendsState.status === 'error' && (
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Không tải được danh bạ</AlertTitle>
                <AlertDescription>
                  Vẫn giữ được danh sách thành viên hiện tại; tải lại trang để chọn thêm từ danh bạ.
                </AlertDescription>
              </Alert>
            )}

            {friendsState.status === 'ok' && memberChoices.length === 0 && (
              <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed p-4 text-center">
                <p className="text-xs text-muted-foreground">
                  Danh bạ chưa có ai. Hãy thêm bạn bè trước khi tạo chuyến đi.
                </p>
                <Button asChild variant="outline" size="sm" className="min-h-11">
                  <Link to="/admin/friends">
                    <Users />
                    Tới danh bạ bạn bè
                  </Link>
                </Button>
              </div>
            )}

            {memberChoices.length > 0 && (
              <ul className="flex flex-col gap-2">
                {memberChoices.map((choice) => {
                  const checked = selectedIds.has(choice.id)
                  const isLockedMember = checked && lockedMemberIds.has(choice.id)
                  const checkboxId = `trip-member-${choice.id}`
                  const selectedSnapshot = checked
                    ? selectedMembers.find((m) => m.id === choice.id)
                    : undefined
                  const bankInfo = selectedSnapshot
                    ? [selectedSnapshot.bankShortName, selectedSnapshot.accountNo]
                        .filter(Boolean)
                        .join(' · ')
                    : [choice.friend?.bankShortName, choice.friend?.accountNo]
                        .filter(Boolean)
                        .join(' · ')

                  return (
                    <li
                      key={choice.id}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <input
                        id={checkboxId}
                        type="checkbox"
                        checked={checked}
                        disabled={isLockedMember}
                        onChange={() => handleToggleMember(choice)}
                        className="mt-0.5 size-5 shrink-0 accent-primary"
                      />
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <label
                          htmlFor={checkboxId}
                          className="cursor-pointer text-sm font-medium leading-snug"
                        >
                          {choice.name}
                        </label>
                        {bankInfo && (
                          <p className="truncate text-xs text-muted-foreground">{bankInfo}</p>
                        )}
                        {isLockedMember && (
                          <p className="text-xs text-amber-700 dark:text-amber-400">
                            Đã có trong khoản chi/thanh toán
                          </p>
                        )}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )}

            {needsMoreMembers && (
              <p className="text-xs font-medium text-destructive">Cần ít nhất 2 thành viên</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <label htmlFor="switch-allow-guest" className="text-sm font-medium">
                  Cho phép nhóm nhập
                </label>
                <p className="text-xs text-muted-foreground">
                  Bạn bè có link được tự thêm và sửa khoản chi do họ nhập.
                </p>
              </div>
              <Switch
                id="switch-allow-guest"
                checked={allowGuestExpenses}
                onCheckedChange={setAllowGuestExpenses}
              />
            </div>

            <div className="flex items-center justify-between gap-3 border-t pt-3">
              <div className="flex flex-col gap-0.5">
                <label htmlFor="switch-locked" className="text-sm font-medium">
                  Khóa sổ
                </label>
                <p className="text-xs text-muted-foreground">
                  Chặn khách thêm chi tiêu hay đánh dấu chuyển khoản mới.
                </p>
              </div>
              <Switch id="switch-locked" checked={locked} onCheckedChange={setLocked} />
            </div>
          </CardContent>
        </Card>

        <Button
          type="submit"
          className="min-h-11 w-full"
          disabled={isSaveDisabled}
        >
          {isSaving ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </form>

      {initialTrip && (
        <Card>
          <CardContent className="flex flex-col gap-3">
            <div>
              <h2 className="text-sm font-semibold">Link cá nhân từng thành viên</h2>
              <p className="text-xs text-muted-foreground">
                Mỗi người một link riêng để xác nhận đã chuyển hoặc thêm chi tiêu — không gửi vào nhóm chung.
              </p>
            </div>
            <MemberLinksSection
              tripId={initialTrip.id}
              members={initialTrip.members}
              secretsState={secretsState}
              onGenerateMissing={async () => {
                await generateMissingSecrets(
                  db,
                  initialTrip.id,
                  initialTrip.memberIds,
                  secretsState.secrets,
                )
              }}
              onRotateSecret={async (memberId) => {
                await rotateMemberSecret(
                  db,
                  initialTrip.id,
                  memberId,
                  secretsState.secrets[memberId]?.code,
                )
              }}
            />
          </CardContent>
        </Card>
      )}

      {initialTrip && (
        <Card className="border-destructive/40">
          <CardContent className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-destructive">Vùng nguy hiểm</h2>
            <p className="text-xs text-muted-foreground">
              Xóa vĩnh viễn chuyến đi cùng toàn bộ các khoản chi, lịch sử chuyển khoản và ảnh QR đính kèm.
            </p>
            <Button
              type="button"
              variant="destructive"
              className="min-h-11 w-full"
              onClick={() => setDeleteDialogOpen(true)}
            >
              <Trash2 />
              Xóa chuyến đi
            </Button>
          </CardContent>
        </Card>
      )}

      <AlertDialog
        open={deleteDialogOpen}
        onOpenChange={(open) => {
          if (!isDeleting) {
            setDeleteDialogOpen(open)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa chuyến &ldquo;{initialTrip?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              Thao tác này sẽ xóa toàn bộ khoản chi, lịch sử thanh toán và không thể hoàn tác.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="min-h-11" disabled={isDeleting}>
              Hủy
            </AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              className="min-h-11"
              disabled={isDeleting}
              onClick={(e) => {
                e.preventDefault()
                void handleConfirmDelete()
              }}
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa chuyến'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/**
 * Trang bao bọc cho `/admin/trips/new` và `/admin/trips/:tripId`.
 * Tải dữ liệu chuyến đi (nếu đang sửa) và danh bạ bạn bè trước khi dựng biểu mẫu `TripEditorForm`.
 *
 * @returns Trạng thái tải, báo lỗi hoặc biểu mẫu tạo/chỉnh sửa chuyến đi
 */
export function AdminTripEdit() {
  const { tripId = '' } = useParams()
  const isEditing = Boolean(tripId)

  const friendsState = useFriends()
  const tripState = useTrip(tripId)
  const expensesState = useExpenses(tripId)
  const paymentsState = usePayments(tripId)

  if (isEditing) {
    if (tripState.status === 'loading') {
      return (
        <div className="flex flex-col gap-4 p-4" aria-busy="true">
          <Skeleton className="h-10 w-56" />
          <Skeleton className="h-40 w-full rounded-xl" />
          <Skeleton className="h-56 w-full rounded-xl" />
        </div>
      )
    }

    if (tripState.status !== 'ok') {
      return (
        <div className="flex flex-col gap-4 p-4">
          <Alert variant="destructive">
            <AlertCircle />
            <AlertTitle>
              {tripState.status === 'not-found'
                ? 'Không tìm thấy chuyến đi'
                : tripState.status === 'offline-empty'
                  ? 'Chưa tải được chuyến đi'
                  : 'Có lỗi khi tải chuyến đi'}
            </AlertTitle>
            <AlertDescription>
              {tripState.status === 'error'
                ? tripState.message
                : 'Kiểm tra lại đường dẫn hoặc kết nối mạng rồi thử lại.'}
            </AlertDescription>
          </Alert>
          <Button asChild variant="outline" className="min-h-11">
            <Link to="/admin/trips">
              <ArrowLeft />
              Về danh sách chuyến đi
            </Link>
          </Button>
        </div>
      )
    }

    return (
      <TripEditorForm
        key={tripState.trip.id}
        initialTrip={tripState.trip}
        friendsState={friendsState}
        expenses={expensesState.expenses}
        payments={paymentsState.payments}
      />
    )
  }

  return (
    <TripEditorForm
      key="new"
      friendsState={friendsState}
      expenses={[]}
      payments={[]}
    />
  )
}
