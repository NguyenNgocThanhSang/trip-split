/**
 * Biểu mẫu nhập hoặc chỉnh sửa một khoản chi tiêu (DESIGN.md §9).
 * Tính preview chia tiền theo thời gian thực qua `computeShares`, hỗ trợ chia không đều và chống double-submit.
 */
import { type FormEvent, useMemo, useRef, useState } from 'react'
import { AlertCircle, Check, ChevronDown, ChevronUp } from 'lucide-react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import type { ExpenseFormValues } from '@/data/expenses'
import type { Member } from '@/data/types'
import { todayISO } from '@/lib/date'
import { formatVND } from '@/lib/money'
import { computeShares } from '@/lib/split'
import type { VND } from '@/lib/types'
import { MemberChips } from './MemberChips'
import { MoneyInput } from './MoneyInput'

/** Props của component `ExpenseForm`. */
export interface ExpenseFormProps {
  /** Danh sách thành viên của chuyến theo thứ tự ưu tiên làm tròn. */
  members: Member[]
  /** Mã thành viên mặc định cho ô "Người ứng" (thường là người dùng hiện tại `me`). */
  defaultPayerId: string | null
  /** Giá trị ban đầu khi mở ở chế độ chỉnh sửa khoản chi đã có. */
  initial?: ExpenseFormValues
  /** Hàm bất đồng bộ lưu khoản chi; nút Lưu bị khóa trong suốt thời gian Promise chưa hoàn tất. */
  onSubmit: (values: ExpenseFormValues) => Promise<void>
  /** Callback đóng biểu mẫu khi người dùng bấm Hủy. */
  onCancel: () => void
}

/**
 * Form thêm hoặc sửa khoản chi tiêu với hai phần thu gọn mặc định ("Chia không đều" và "Thêm chi tiết").
 *
 * @param props - Danh sách thành viên, người ứng mặc định, giá trị sửa và callback xử lý
 * @returns Phần tử `<form>` hoàn chỉnh dùng bên trong `ResponsiveModal`
 */
export function ExpenseForm({
  members,
  defaultPayerId,
  initial,
  onSubmit,
  onCancel,
}: ExpenseFormProps) {
  const memberOrder = useMemo(() => members.map((m) => m.id), [members])
  const initialDate = initial?.date ?? todayISO()

  const [name, setName] = useState(initial?.name ?? '')
  const [amount, setAmount] = useState<VND | null>(initial?.amount ?? null)
  const [isAmountInvalid, setIsAmountInvalid] = useState(false)
  const [payerId, setPayerId] = useState<string>(() => {
    if (initial?.payerId && memberOrder.includes(initial.payerId)) {
      return initial.payerId
    }
    if (defaultPayerId && memberOrder.includes(defaultPayerId)) {
      return defaultPayerId
    }
    // Không tự gán memberOrder[0] khi chưa có góc nhìn để tránh nhập nhầm người ứng tiền
    return ''
  })
  const [participantIds, setParticipantIds] = useState<string[]>(() =>
    initial ? initial.participantIds.filter((id) => memberOrder.includes(id)) : memberOrder,
  )
  const [fixedAmounts, setFixedAmounts] = useState<Record<string, VND>>(() =>
    initial ? { ...initial.fixedAmounts } : {},
  )
  const [invalidFixedIds, setInvalidFixedIds] = useState<Set<string>>(() => new Set())
  const [note, setNote] = useState(initial?.note ?? '')
  const [date, setDate] = useState(initialDate)

  const [showCustomSplit, setShowCustomSplit] = useState(
    Boolean(initial && Object.keys(initial.fixedAmounts).length > 0),
  )
  const [showDetails, setShowDetails] = useState(
    Boolean(initial && (initial.note.trim().length > 0 || initial.date !== todayISO())),
  )
  const [isSubmitting, setIsSubmitting] = useState(false)
  // Ref chặn đồng bộ để double-click liên tiếp trong cùng tick không bao giờ gửi hai lần
  const submittingRef = useRef(false)

  const participantSet = useMemo(() => new Set(participantIds), [participantIds])
  const participatingMembers = useMemo(
    () => members.filter((m) => participantSet.has(m.id)),
    [members, participantSet],
  )

  const splitResult = useMemo(() => {
    if (amount === null || participantIds.length === 0) {
      return null
    }
    return computeShares({
      amount,
      participantIds,
      fixedAmounts,
      memberOrder,
    })
  }, [amount, participantIds, fixedAmounts, memberOrder])

  const hasParticipants = participantIds.length > 0
  const hasValidAmount = amount !== null && !isAmountInvalid
  const hasInvalidFixed = invalidFixedIds.size > 0
  const allSelected = memberOrder.length > 0 && participantIds.length === memberOrder.length

  let splitErrorMessage: string | null = null
  if (!hasParticipants) {
    splitErrorMessage = 'Phải chọn ít nhất 1 người tham gia'
  } else if (hasInvalidFixed) {
    splitErrorMessage = 'Có ô số tiền riêng chưa hợp lệ'
  } else if (splitResult && !splitResult.ok) {
    splitErrorMessage = splitResult.message
  }

  const isSaveDisabled =
    name.trim().length === 0 ||
    !hasValidAmount ||
    !hasParticipants ||
    hasInvalidFixed ||
    !payerId ||
    (splitResult !== null && !splitResult.ok) ||
    isSubmitting

  /**
   * Cập nhật danh sách người tham gia theo đúng thứ tự thành viên chuyến đi
   * và dọn bỏ ngay số tiền cố định của những người vừa bị bỏ chọn.
   *
   * @param nextIds - Danh sách `id` mới từ `MemberChips` hoặc nút Chọn tất cả/Bỏ hết
   */
  function handleParticipantsChange(nextIds: string[]) {
    const nextSet = new Set(nextIds)
    const orderedNext = memberOrder.filter((id) => nextSet.has(id))
    setParticipantIds(orderedNext)

    // Bỏ chọn thành viên thì xóa luôn khoản cố định gắn với họ để không làm sai payload và computeShares
    setFixedAmounts((prev) => {
      const nextFixed: Record<string, VND> = {}
      for (const id of orderedNext) {
        if (Object.hasOwn(prev, id)) {
          nextFixed[id] = prev[id]
        }
      }
      return nextFixed
    })
    setInvalidFixedIds((prev) => {
      const nextInvalid = new Set<string>()
      for (const id of prev) {
        if (nextSet.has(id)) {
          nextInvalid.add(id)
        }
      }
      return nextInvalid
    })
  }

  /**
   * Cập nhật số tiền cố định của một thành viên tham gia; xóa key nếu ô trống.
   *
   * @param memberId - Mã thành viên
   * @param value - Giá trị VND mới hoặc `null` nếu ô rỗng/không hợp lệ
   */
  function handleFixedAmountChange(memberId: string, value: VND | null) {
    setFixedAmounts((prev) => {
      const next = { ...prev }
      if (value === null) {
        delete next[memberId]
      } else {
        next[memberId] = value
      }
      return next
    })
  }

  /**
   * Cập nhật cờ ô nhập số cố định đang có văn bản sai định dạng để khóa nút Lưu kịp thời.
   *
   * @param memberId - Mã thành viên
   * @param invalid - `true` nếu ô nhập có chữ nhưng `parseVND` trả `null`
   */
  function handleFixedInvalidChange(memberId: string, invalid: boolean) {
    setInvalidFixedIds((prev) => {
      const next = new Set(prev)
      if (invalid) {
        next.add(memberId)
      } else {
        next.delete(memberId)
      }
      return next
    })
  }

  /**
   * Gửi dữ liệu khoản chi lên hàm cha `onSubmit`, khóa nút Lưu trong lúc chờ hoàn tất.
   *
   * @param event - Sự kiện submit của `<form>`
   */
  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (isSaveDisabled || submittingRef.current || amount === null) {
      return
    }

    submittingRef.current = true
    setIsSubmitting(true)
    try {
      await onSubmit({
        name: name.trim(),
        amount,
        payerId,
        participantIds,
        fixedAmounts,
        note: note.trim(),
        date: date || todayISO(),
      })
    } finally {
      submittingRef.current = false
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expense-name">Tên khoản chi</Label>
        <Input
          id="expense-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={100}
          placeholder="Ví dụ: Ăn sáng, Nhà nghỉ..."
          className="min-h-11"
          disabled={isSubmitting}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="expense-amount">Số tiền</Label>
        <MoneyInput
          id="expense-amount"
          value={amount}
          onChange={setAmount}
          onInvalidChange={setIsAmountInvalid}
          placeholder="Ví dụ: 190k, 1tr2..."
          disabled={isSubmitting}
        />
      </div>

      <div role="group" aria-labelledby="expense-payer-label" className="flex flex-col gap-2">
        <span id="expense-payer-label" className="text-sm font-medium">
          Người ứng
        </span>
        <MemberChips
          members={members}
          mode="single"
          value={payerId ? [payerId] : []}
          onChange={(ids) => {
            if (ids[0]) {
              setPayerId(ids[0])
            }
          }}
        />
        {!payerId && (
          <p className="text-xs text-destructive">Chọn người đã ứng tiền</p>
        )}
      </div>

      <div
        role="group"
        aria-labelledby="expense-participants-label"
        className="flex flex-col gap-2"
      >
        <div className="flex items-center justify-between gap-2">
          <span id="expense-participants-label" className="text-sm font-medium">
            Người tham gia ({participantIds.length}/{members.length})
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="min-h-11 px-2 text-xs"
            onClick={() => handleParticipantsChange(allSelected ? [] : memberOrder)}
            disabled={isSubmitting}
          >
            {allSelected ? 'Bỏ hết' : 'Chọn tất cả'}
          </Button>
        </div>
        <MemberChips
          members={members}
          mode="multi"
          value={participantIds}
          onChange={handleParticipantsChange}
        />
      </div>

      <div className="rounded-xl border">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
          aria-expanded={showCustomSplit}
          onClick={() => setShowCustomSplit((prev) => !prev)}
        >
          <span>Chia không đều</span>
          {showCustomSplit ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showCustomSplit && (
          <div className="flex flex-col gap-3 border-t p-3">
            {participatingMembers.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                Chọn ít nhất 1 người tham gia để nhập phần tiền riêng.
              </p>
            ) : (
              participatingMembers.map((member) => {
                const hasFixed = Object.hasOwn(fixedAmounts, member.id)
                const fixedVal = hasFixed ? fixedAmounts[member.id] : null
                const autoShare =
                  !hasFixed && splitResult?.ok ? splitResult.shares[member.id] : undefined

                return (
                  <div
                    key={member.id}
                    className="grid grid-cols-[minmax(0,1fr)_10rem] items-start gap-2"
                  >
                    <div className="flex min-h-11 flex-col justify-center">
                      <span className="truncate text-sm font-medium">{member.name}</span>
                      {autoShare !== undefined && (
                        <span className="text-xs text-muted-foreground tabular-nums">
                          Tự tính: {formatVND(autoShare)}
                        </span>
                      )}
                    </div>
                    <MoneyInput
                      allowZero
                      value={fixedVal}
                      aria-label={`Số tiền riêng của ${member.name}`}
                      placeholder="Chia đều"
                      disabled={isSubmitting}
                      onChange={(val) => handleFixedAmountChange(member.id, val)}
                      onInvalidChange={(invalid) => handleFixedInvalidChange(member.id, invalid)}
                    />
                  </div>
                )
              })
            )}
          </div>
        )}
      </div>

      {splitErrorMessage && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertDescription>{splitErrorMessage}</AlertDescription>
        </Alert>
      )}

      {!splitErrorMessage && hasValidAmount && splitResult?.ok && (
        <div className="flex items-center gap-1.5 rounded-lg bg-emerald-500/10 px-3 py-2 text-xs font-medium text-emerald-700 dark:text-emerald-400">
          <Check className="size-4 shrink-0" />
          <span>✔ Khớp {formatVND(amount)}</span>
        </div>
      )}

      <div className="rounded-xl border">
        <button
          type="button"
          className="flex min-h-11 w-full items-center justify-between px-3 py-2 text-left text-sm font-medium"
          aria-expanded={showDetails}
          onClick={() => setShowDetails((prev) => !prev)}
        >
          <span>Thêm chi tiết</span>
          {showDetails ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
        </button>

        {showDetails && (
          <div className="flex flex-col gap-3 border-t p-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-note">Ghi chú</Label>
              <Input
                id="expense-note"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={200}
                placeholder="Tùy chọn (ví dụ: Ăn tối ngày 1)"
                className="min-h-11"
                disabled={isSubmitting}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <Label htmlFor="expense-date">Ngày</Label>
              <Input
                id="expense-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="min-h-11"
                disabled={isSubmitting}
              />
            </div>
          </div>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <Button
          type="button"
          variant="outline"
          className="min-h-11 flex-1"
          onClick={onCancel}
          disabled={isSubmitting}
        >
          Hủy
        </Button>
        <Button type="submit" className="min-h-11 flex-1" disabled={isSaveDisabled}>
          {isSubmitting ? 'Đang lưu...' : 'Lưu'}
        </Button>
      </div>
    </form>
  )
}
