/**
 * Trang chuyến đi công khai `/t/:tripId` dành cho tất cả thành viên và quản trị viên.
 * Tính số dư và kế hoạch thanh toán bằng `computeBalances`/`settle`, hỗ trợ xem offline, chọn "Bạn là ai",
 * xem bảng tổng kết và thêm/sửa/xóa khoản chi tiêu theo đúng quyền từ `firestore.rules`.
 */
import { useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import {
  AlertTriangle,
  ArrowRight,
  Calendar,
  Copy,
  Edit3,
  Lock,
  MoreVertical,
  Plus,
  RefreshCw,
  UserCheck,
} from 'lucide-react'
import { toast } from 'sonner'
import { ExpenseForm } from '@/components/ExpenseForm'
import { ExpenseList } from '@/components/ExpenseList'
import { OfflineBanner } from '@/components/OfflineBanner'
import { ResponsiveModal } from '@/components/ResponsiveModal'
import { SummaryTable } from '@/components/SummaryTable'
import { WhoAmI } from '@/components/WhoAmI'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useAdmin } from '@/data/auth'
import {
  addExpense,
  deleteExpense,
  type ExpenseFormValues,
  updateExpense,
  useExpenses,
} from '@/data/expenses'
import { db } from '@/data/firebase'
import { hasPendingWrites, usePayments } from '@/data/payments'
import { updateTrip, useTrip } from '@/data/trips'
import type { Expense, Trip } from '@/data/types'
import { useMe } from '@/hooks/useMe'
import { computeBalances } from '@/lib/balances'
import { formatDateVN } from '@/lib/date'
import { formatVND } from '@/lib/money'
import { settle } from '@/lib/settle'

/**
 * Kiểm tra lỗi Firestore trả về mã `permission-denied` để hiện thông báo đúng ngữ cảnh.
 *
 * @param error - Lỗi phát sinh từ thao tác ghi Firestore
 * @returns `true` nếu bị chặn bởi `firestore.rules`
 */
function isPermissionDenied(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'permission-denied'
  )
}

/**
 * Định dạng khoảng ngày đi/về tiếng Việt cho phần đầu trang chuyến đi.
 *
 * @param startDate - Ngày đi dạng `"YYYY-MM-DD"` (tùy chọn)
 * @param endDate - Ngày về dạng `"YYYY-MM-DD"` (tùy chọn)
 * @returns Chuỗi ngày hiển thị gọn hoặc `null`
 */
function formatTripDates(startDate?: string, endDate?: string): string | null {
  if (startDate && endDate) {
    return startDate === endDate
      ? formatDateVN(startDate)
      : `${formatDateVN(startDate)} – ${formatDateVN(endDate)}`
  }
  if (startDate) return `Từ ${formatDateVN(startDate)}`
  if (endDate) return `Đến ${formatDateVN(endDate)}`
  return null
}

/**
 * Giao diện chính của trang chuyến đi `/t/:tripId` sau khi tải thành công `Trip`.
 *
 * @param props - Document `trip` và danh sách `expenses`, `payments` đã đồng bộ
 * @returns Trang chuyến đi gồm OfflineBanner, Header, Tabs (Tổng kết & Chi tiêu), modal WhoAmI và ExpenseForm
 */
function TripLoadedView({
  trip,
  isAdmin,
  expenses,
  paymentsCount,
  rows,
  invalidExpenseIds,
  totalSpent,
  transfers,
}: {
  trip: Trip
  isAdmin: boolean
  expenses: Expense[]
  paymentsCount: number
  rows: ReturnType<typeof computeBalances>['rows']
  invalidExpenseIds: string[]
  totalSpent: number
  transfers: ReturnType<typeof settle>
}) {
  const navigate = useNavigate()
  const { me, setMe } = useMe(trip.id, trip.memberIds)

  const [whoAmIOpen, setWhoAmIOpen] = useState(false)
  const [dismissedWhoAmITripId, setDismissedWhoAmITripId] = useState<string | null>(null)
  const [expenseModalOpen, setExpenseModalOpen] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Expense | null>(null)
  const [isUpdatingTripFlag, setIsUpdatingTripFlag] = useState(false)

  const memberNameById = useMemo(
    () => new Map(trip.members.map((m) => [m.id, m.name])),
    [trip.members],
  )

  const meName = me ? memberNameById.get(me) ?? null : null
  const myRow = me ? rows.find((r) => r.memberId === me) : undefined

  const canAddExpense = isAdmin || (trip.allowGuestExpenses && !trip.locked)

  /**
   * Kiểm tra người đang xem có quyền sửa/xóa khoản chi hay không (admin sửa hết, khách chỉ sửa khoản do khách tạo khi mở).
   *
   * @param expense - Khoản chi cần kiểm tra
   * @returns `true` nếu được phép sửa hoặc xóa
   */
  function canEditExpense(expense: Expense): boolean {
    return isAdmin || (canAddExpense && expense.createdBy === 'guest')
  }

  // Tự mở hộp thoại "Bạn là ai" ở lần đầu truy cập khi `me === null`
  const showWhoAmIModal =
    whoAmIOpen || (me === null && dismissedWhoAmITripId !== trip.id)

  const dateLabel = formatTripDates(trip.startDate, trip.endDate)

  /**
   * Đóng hoặc mở hộp thoại "Bạn là ai" và ghi nhớ đã hỏi ở phiên này để không bật lại liên tục.
   *
   * @param nextOpen - Trạng thái mở mới
   */
  function handleWhoAmIOpenChange(nextOpen: boolean) {
    setWhoAmIOpen(nextOpen)
    if (!nextOpen) {
      setDismissedWhoAmITripId(trip.id)
    }
  }

  /**
   * Sao chép liên kết chuyến đi hiện tại vào clipboard.
   */
  async function handleCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/t/${trip.id}`)
      toast.success('Đã copy link')
    } catch {
      toast.error('Không thể copy tự động. Hãy sao chép từ thanh địa chỉ.')
    }
  }

  /**
   * Cập nhật nhanh cờ `allowGuestExpenses` hoặc `locked` từ menu `⋮` của Admin.
   *
   * @param patch - Các trường cờ cần thay đổi
   * @param successText - Thông báo tiếng Việt khi thành công
   */
  async function handleAdminToggle(
    patch: { allowGuestExpenses?: boolean; locked?: boolean },
    successText: string,
  ) {
    if (isUpdatingTripFlag) return
    setIsUpdatingTripFlag(true)
    try {
      await updateTrip(
        db,
        trip.id,
        {
          name: trip.name,
          startDate: trip.startDate,
          endDate: trip.endDate,
          members: trip.members,
          allowGuestExpenses: patch.allowGuestExpenses ?? trip.allowGuestExpenses,
          locked: patch.locked ?? trip.locked,
        },
        {},
      )
      toast.success(successText)
    } catch {
      toast.error('Không thể cập nhật thiết lập chuyến. Vui lòng thử lại.')
    } finally {
      setIsUpdatingTripFlag(false)
    }
  }

  /**
   * Mở form thêm khoản chi mới.
   */
  function handleOpenAddExpense() {
    setEditingExpense(null)
    setExpenseModalOpen(true)
  }

  /**
   * Mở form chỉnh sửa một khoản chi đã có.
   *
   * @param expense - Khoản chi được chọn để sửa
   */
  function handleOpenEditExpense(expense: Expense) {
    setEditingExpense(expense)
    setExpenseModalOpen(true)
  }

  /**
   * Lưu khoản chi mới hoặc cập nhật khoản chi đang sửa lên Firestore.
   *
   * @param values - Dữ liệu hợp lệ từ `ExpenseForm`
   */
  async function handleSubmitExpense(values: ExpenseFormValues) {
    try {
      if (editingExpense) {
        await updateExpense(db, trip.id, editingExpense.id, values)
        toast.success('Đã cập nhật khoản chi.')
      } else {
        await addExpense(db, trip.id, values, isAdmin ? 'admin' : 'guest')
        toast.success('Đã thêm khoản chi.')
      }
      setExpenseModalOpen(false)
      setEditingExpense(null)
    } catch (error) {
      if (isPermissionDenied(error)) {
        toast.error('Chuyến đã khóa hoặc chưa cho phép nhập')
      } else {
        toast.error('Không thể lưu khoản chi. Vui lòng thử lại.')
      }
      throw error
    }
  }

  /**
   * Xóa một khoản chi khỏi chuyến đi.
   *
   * @param expenseId - Mã document khoản chi cần xóa
   */
  async function handleDeleteExpense(expenseId: string) {
    try {
      await deleteExpense(db, trip.id, expenseId)
      toast.success('Đã xóa khoản chi.')
    } catch (error) {
      if (isPermissionDenied(error)) {
        toast.error('Chuyến đã khóa hoặc chưa cho phép nhập')
      } else {
        toast.error('Không thể xóa khoản chi. Vui lòng thử lại.')
      }
      throw error
    }
  }

  // Đưa các giao dịch liên quan tới `me` lên đầu để dễ theo dõi (DESIGN.md §9)
  const prioritizedTransfers = useMemo(() => {
    if (!me) return transfers
    return [...transfers].sort((a, b) => {
      const aMine = a.fromId === me || a.toId === me ? 0 : 1
      const bMine = b.fromId === me || b.toId === me ? 0 : 1
      return aMine - bMine
    })
  }, [transfers, me])

  return (
    <div className="flex min-h-dvh flex-col pb-24">
      <OfflineBanner hasPendingWrites={hasPendingWrites()} />

      <header className="flex flex-col gap-3 border-b bg-card px-4 py-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-xl font-bold">{trip.name}</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              {dateLabel && (
                <span className="inline-flex items-center gap-1">
                  <Calendar className="size-3.5" />
                  {dateLabel}
                </span>
              )}
              <span className="font-medium text-foreground tabular-nums">
                Tổng chi: {formatVND(totalSpent)}
              </span>
            </div>
          </div>

          {isAdmin && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11 shrink-0"
                  aria-label="Menu quản trị chuyến đi"
                >
                  <MoreVertical />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => navigate(`/admin/trips/${trip.id}`)}>
                  Chỉnh sửa chuyến đi
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isUpdatingTripFlag}
                  onSelect={() =>
                    void handleAdminToggle(
                      { allowGuestExpenses: !trip.allowGuestExpenses },
                      !trip.allowGuestExpenses
                        ? 'Đã bật cho cả nhóm nhập chi tiêu.'
                        : 'Đã tắt quyền nhóm tự nhập chi tiêu.',
                    )
                  }
                >
                  {trip.allowGuestExpenses ? 'Tắt cho nhóm nhập' : 'Bật cho nhóm nhập'}
                </DropdownMenuItem>
                <DropdownMenuItem
                  disabled={isUpdatingTripFlag}
                  onSelect={() =>
                    void handleAdminToggle(
                      { locked: !trip.locked },
                      !trip.locked ? 'Đã khóa sổ chuyến đi.' : 'Đã mở lại sổ chuyến đi.',
                    )
                  }
                >
                  {trip.locked ? 'Mở lại sổ' : 'Khóa sổ chuyến đi'}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {trip.locked ? (
            <Badge variant="secondary">
              <Lock />
              Đã khóa sổ
            </Badge>
          ) : trip.allowGuestExpenses ? (
            <Badge variant="outline">
              <Edit3 />
              Cả nhóm cùng nhập
            </Badge>
          ) : null}
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 flex-1"
            onClick={() => void handleCopyLink()}
          >
            <Copy />
            Copy link
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 flex-1"
            onClick={() => setWhoAmIOpen(true)}
          >
            <UserCheck />
            <span className="truncate">{meName ? `Tôi: ${meName}` : 'Bạn là ai?'}</span>
          </Button>
        </div>
      </header>

      <Tabs defaultValue="summary" className="flex-1 p-4">
        <TabsList className="grid h-11 w-full grid-cols-2">
          <TabsTrigger value="summary" className="min-h-10">
            Tổng kết & Thanh toán
          </TabsTrigger>
          <TabsTrigger value="expenses" className="min-h-10">
            Chi tiêu ({expenses.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="summary" className="mt-4 flex flex-col gap-4">
          {invalidExpenseIds.length > 0 && (
            <Alert variant="destructive">
              <AlertTriangle />
              <AlertTitle>Có {invalidExpenseIds.length} khoản chi chưa hợp lệ</AlertTitle>
              <AlertDescription>
                Các khoản bị lỗi chia tiền hoặc lệch thành viên đang được tạm bỏ qua khỏi tổng kết. Hãy kiểm tra lại ở tab Chi tiêu.
              </AlertDescription>
            </Alert>
          )}

          {myRow ? (
            <Card
              className={
                myRow.balance < 0
                  ? 'border-destructive/40 bg-destructive/5'
                  : myRow.balance > 0
                    ? 'border-emerald-500/40 bg-emerald-500/5'
                    : undefined
              }
            >
              <CardContent className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">Số dư của bạn ({meName})</span>
                {myRow.balance < 0 && (
                  <p className="text-xl font-bold text-destructive tabular-nums">
                    Bạn cần trả {formatVND(-myRow.balance)}
                  </p>
                )}
                {myRow.balance > 0 && (
                  <p className="text-xl font-bold text-emerald-600 tabular-nums dark:text-emerald-400">
                    Bạn được nhận lại {formatVND(myRow.balance)}
                  </p>
                )}
                {myRow.balance === 0 && (
                  <p className="text-xl font-bold">Bạn đã xong 🎉</p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="flex items-center justify-between gap-3">
                <p className="text-sm text-muted-foreground">
                  Chọn tên của bạn để xem riêng số tiền cần trả hoặc nhận lại.
                </p>
                <Button
                  type="button"
                  variant="outline"
                  className="min-h-11 shrink-0"
                  onClick={() => setWhoAmIOpen(true)}
                >
                  Chọn tên
                </Button>
              </CardContent>
            </Card>
          )}

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Ai trả cho ai</h2>
            {prioritizedTransfers.length === 0 ? (
              <Card size="sm">
                <CardContent className="text-center text-sm font-medium text-emerald-700 dark:text-emerald-400">
                  {totalSpent === 0 && paymentsCount === 0
                    ? 'Chưa có khoản chi cần thanh toán.'
                    : '🎉 Cả nhóm đã thanh toán xong!'}
                </CardContent>
              </Card>
            ) : (
              <ul className="flex flex-col gap-2">
                {prioritizedTransfers.map((t) => {
                  const fromName = memberNameById.get(t.fromId) ?? t.fromId
                  const toName = memberNameById.get(t.toId) ?? t.toId
                  const involvesMe = me !== null && (t.fromId === me || t.toId === me)

                  return (
                    <li key={`${t.fromId}-${t.toId}`}>
                      <Card size="sm" className={involvesMe ? 'ring-primary/50' : undefined}>
                        <CardContent className="flex items-center justify-between gap-2">
                          <span className="flex min-w-0 items-center gap-1.5 text-sm font-medium">
                            <span className="truncate">{fromName}</span>
                            <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                            <span className="truncate">{toName}</span>
                          </span>
                          <span className="shrink-0 font-bold tabular-nums">
                            {formatVND(t.amount)}
                          </span>
                        </CardContent>
                      </Card>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>

          <section className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold">Bảng từng người</h2>
            <SummaryTable members={trip.members} rows={rows} me={me} />
          </section>
        </TabsContent>

        <TabsContent value="expenses" className="mt-4">
          <ExpenseList
            expenses={expenses}
            members={trip.members}
            canAdd={canAddExpense}
            canEditExpense={canEditExpense}
            onAddClick={handleOpenAddExpense}
            onEdit={handleOpenEditExpense}
            onDelete={handleDeleteExpense}
          />
        </TabsContent>
      </Tabs>

      {canAddExpense && (
        <Button
          type="button"
          size="icon"
          aria-label="Thêm khoản chi"
          className="fixed right-4 bottom-5 z-30 size-14 rounded-full shadow-lg"
          onClick={handleOpenAddExpense}
        >
          <Plus className="size-6" />
        </Button>
      )}

      <WhoAmI
        open={showWhoAmIModal}
        onOpenChange={handleWhoAmIOpenChange}
        members={trip.members}
        currentMe={me}
        onSelect={setMe}
      />

      <ResponsiveModal
        open={expenseModalOpen}
        onOpenChange={(open) => {
          setExpenseModalOpen(open)
          if (!open) {
            setEditingExpense(null)
          }
        }}
        title={editingExpense ? 'Sửa khoản chi' : 'Thêm khoản chi'}
      >
        <ExpenseForm
          key={editingExpense?.id ?? 'new-expense'}
          members={trip.members}
          defaultPayerId={me}
          initial={
            editingExpense
              ? {
                  name: editingExpense.name,
                  amount: editingExpense.amount,
                  payerId: editingExpense.payerId,
                  participantIds: editingExpense.participantIds,
                  fixedAmounts: editingExpense.fixedAmounts,
                  note: editingExpense.note,
                  date: editingExpense.date,
                }
              : undefined
          }
          onSubmit={handleSubmitExpense}
          onCancel={() => {
            setExpenseModalOpen(false)
            setEditingExpense(null)
          }}
        />
      </ResponsiveModal>
    </div>
  )
}

/**
 * Trang chuyến đi `/t/:tripId`: xử lý các trạng thái tải/lỗi của Firestore và tính sẵn số dư cho các tab.
 *
 * @returns Khung chờ Skeleton, thông báo lỗi/offline hoặc `TripLoadedView`
 */
export function TripPage() {
  const { tripId = '' } = useParams()
  const adminState = useAdmin()
  const tripState = useTrip(tripId)
  const expensesState = useExpenses(tripId)
  const paymentsState = usePayments(tripId)

  const loadedTrip = tripState.status === 'ok' ? tripState.trip : null

  const { rows, invalidExpenseIds, totalSpent } = useMemo(() => {
    if (!loadedTrip) {
      return { rows: [], invalidExpenseIds: [], totalSpent: 0 }
    }
    return computeBalances(loadedTrip.memberIds, expensesState.expenses, paymentsState.payments)
  }, [loadedTrip, expensesState.expenses, paymentsState.payments])

  const transfers = useMemo(() => {
    if (!loadedTrip) {
      return []
    }
    return settle(rows, loadedTrip.memberIds)
  }, [loadedTrip, rows])

  if (tripState.status === 'loading') {
    return (
      <div className="flex flex-col gap-4 p-4" aria-busy="true">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-11 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-44 w-full rounded-xl" />
      </div>
    )
  }

  if (tripState.status === 'not-found') {
    return (
      <div className="flex min-h-dvh flex-col justify-center gap-4 p-4">
        <Card>
          <CardContent className="flex flex-col gap-3 text-center">
            <h1 className="text-lg font-semibold">Link không đúng hoặc chuyến đã bị xóa</h1>
            <p className="text-sm text-muted-foreground">
              Hãy kiểm tra lại đường dẫn nhóm đã gửi hoặc liên hệ trưởng nhóm để lấy link mới.
            </p>
            <Button asChild variant="outline" className="min-h-11">
              <Link to="/">Về trang chủ</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (tripState.status === 'offline-empty') {
    return (
      <div className="flex min-h-dvh flex-col justify-center gap-4 p-4">
        <Card>
          <CardContent className="flex flex-col gap-3 text-center">
            <h1 className="text-lg font-semibold">Không tải được chuyến đi — kiểm tra mạng rồi thử lại</h1>
            <p className="text-sm text-muted-foreground">
              Thiết bị chưa từng mở chuyến này trước khi mất sóng nên chưa có bản lưu ngoại tuyến.
            </p>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => window.location.reload()}
            >
              <RefreshCw />
              Thử lại
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (tripState.status === 'error') {
    return (
      <div className="flex min-h-dvh flex-col justify-center gap-4 p-4">
        <Alert variant="destructive">
          <AlertTriangle />
          <AlertTitle>Không tải được chuyến đi</AlertTitle>
          <AlertDescription>{tripState.message}</AlertDescription>
        </Alert>
        <Button type="button" className="min-h-11" onClick={() => window.location.reload()}>
          <RefreshCw />
          Thử lại
        </Button>
      </div>
    )
  }

  return (
    <TripLoadedView
      trip={tripState.trip}
      isAdmin={adminState.status === 'admin'}
      expenses={expensesState.expenses}
      paymentsCount={paymentsState.payments.length}
      rows={rows}
      invalidExpenseIds={invalidExpenseIds}
      totalSpent={totalSpent}
      transfers={transfers}
    />
  )
}
