/**
 * Hộp thoại quét mã VietQR động và QR MoMo tĩnh dự phòng cho một giao dịch thanh toán (DESIGN.md §9).
 * Tự động chuyển sang khối thông tin dạng chữ kèm nút Copy từng dòng khi ảnh lỗi hoặc thiết bị ngoại tuyến.
 */
import { useRef, useState } from 'react'
import { AlertCircle, Copy, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { db } from '@/data/firebase'
import { getMemberQr } from '@/data/memberQrs'
import type { Member } from '@/data/types'
import { useOnlineStatus } from '@/hooks/useOnlineStatus'
import { findBank } from '@/lib/banks'
import { logError, logWarn } from '@/lib/logger'
import { formatVND } from '@/lib/money'
import type { Transfer } from '@/lib/types'
import { buildVietQrUrl, defaultTransferNote } from '@/lib/vietqr'
import { ResponsiveModal } from './ResponsiveModal'

/** Trạng thái tải lười ảnh QR MoMo tĩnh từ subcollection `memberQrs`. */
type MomoQrState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ok'; dataUrl: string }
  | { status: 'empty' }
  | { status: 'error' }

/** Props của component `QrSheet`. */
export interface QrSheetProps {
  /** Trạng thái mở/đóng hộp thoại. */
  open: boolean
  /** Callback thay đổi trạng thái mở/đóng. */
  onOpenChange: (open: boolean) => void
  /** Giao dịch cần thanh toán (`fromId`, `toId`, `amount`). */
  transfer: Transfer
  /** Thành viên chuyển tiền. */
  from: Member
  /** Thành viên nhận tiền (chứa thông tin ngân hàng và cờ `hasStaticQr`). */
  to: Member
  /** Tên chuyến đi để tạo nội dung chuyển khoản mặc định không dấu. */
  tripName: string
  /** Mã chuyến đi để tải ảnh QR MoMo khi người dùng mở tab QR MoMo. */
  tripId: string
  /** Callback khi người dùng bấm nút `"Tôi đã chuyển"` để mở bước xác nhận số tiền. */
  onPaid: () => void
  /** Có cho phép đánh dấu đã chuyển hay không (ẩn nút khi chuyến đã khóa với khách). */
  canMarkPaid?: boolean
}

/**
 * Sao chép một giá trị vào clipboard và hiển thị thông báo tiếng Việt.
 *
 * @param text - Chuỗi cần sao chép
 * @param label - Tên trường dùng hiển thị toast
 */
async function copyField(text: string, label: string) {
  try {
    await navigator.clipboard.writeText(text)
    toast.success(`Đã copy ${label}`)
  } catch (error) {
    logWarn('qr.copyField', 'Không copy được thông tin chuyển khoản', {
      field: label,
      reason: error instanceof Error ? error.message : String(error),
    })
    toast.error(`Không thể copy ${label} tự động.`)
  }
}

/**
 * Hiển thị mã VietQR động (Quick Link), fallback dạng chữ khi lỗi/offline và tab QR MoMo tĩnh theo yêu cầu.
 *
 * @param props - Thông tin giao dịch, thành viên gửi/nhận, chuyến đi và callback xác nhận đã trả
 * @returns `ResponsiveModal` chứa mã QR hoặc thông tin chuyển khoản kèm nút Copy
 */
export function QrSheet({
  open,
  onOpenChange,
  transfer,
  from,
  to,
  tripName,
  tripId,
  onPaid,
  canMarkPaid = true,
}: QrSheetProps) {
  const isOnline = useOnlineStatus()
  const sheetKey = `${tripId}:${transfer.fromId}:${transfer.toId}:${transfer.amount}:${open}`
  const [prevKey, setPrevKey] = useState(sheetKey)
  const [imgError, setImgError] = useState(false)
  const [activeTab, setActiveTab] = useState('vietqr')
  const [momoState, setMomoState] = useState<MomoQrState>({ status: 'idle' })
  // Chặn đồng bộ trường hợp Radix Tabs gọi onValueChange hai lần liên tiếp khi vừa focus vừa click
  const momoRequestedKeyRef = useRef<string | null>(null)

  // Đặt lại trạng thái ảnh lỗi và tab khi mở cho giao dịch khác mà không cần useEffect
  if (sheetKey !== prevKey) {
    setPrevKey(sheetKey)
    setImgError(false)
    setActiveTab('vietqr')
    setMomoState({ status: 'idle' })
  }

  const bankBin = to.bankBin?.trim() ?? ''
  const accountNo = to.accountNo?.trim() ?? ''
  const accountName = to.accountName?.trim() ?? ''
  const hasBankInfo = bankBin.length > 0 && accountNo.length > 0
  const bankLabel =
    to.bankShortName?.trim() || (bankBin ? findBank(bankBin)?.shortName : undefined) || bankBin
  const transferNote = defaultTransferNote(from.name, tripName)
  const qrUrl = hasBankInfo
    ? buildVietQrUrl(
        {
          bankBin,
          accountNo,
          accountName: accountName || undefined,
        },
        transfer.amount,
        transferNote,
      )
    : ''

  /**
   * Chỉ tải ảnh QR MoMo tĩnh từ Firestore khi người dùng chủ động mở tab "QR MoMo" (tiết kiệm lượt đọc).
   */
  async function loadMomoQr() {
    if (
      momoRequestedKeyRef.current === sheetKey ||
      momoState.status === 'loading' ||
      momoState.status === 'ok' ||
      momoState.status === 'empty'
    ) {
      return
    }
    momoRequestedKeyRef.current = sheetKey
    setMomoState({ status: 'loading' })
    try {
      const dataUrl = await getMemberQr(db, tripId, to.id)
      if (dataUrl) {
        setMomoState({ status: 'ok', dataUrl })
      } else {
        setMomoState({ status: 'empty' })
      }
    } catch (error) {
      logError('qr.loadMomo', error, { tripId, memberId: to.id })
      momoRequestedKeyRef.current = null
      setMomoState({ status: 'error' })
    }
  }

  /**
   * Khối hiển thị thông tin ngân hàng dạng văn bản và nút Copy từng dòng khi ngoại tuyến hoặc ảnh QR lỗi.
   */
  const bankTextFallback = (
    <div className="flex flex-col gap-2 rounded-xl border bg-muted/30 p-3 text-sm">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Ngân hàng</p>
          <p className="truncate font-medium">{bankLabel}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0"
          aria-label="Copy Ngân hàng"
          onClick={() => void copyField(bankLabel, 'tên ngân hàng')}
        >
          <Copy />
          Copy
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Số tài khoản</p>
          <p className="truncate font-semibold tabular-nums">{accountNo}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0"
          aria-label="Copy STK"
          onClick={() => void copyField(accountNo, 'STK')}
        >
          <Copy />
          Copy
        </Button>
      </div>

      {accountName && (
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Chủ tài khoản</p>
            <p className="truncate font-medium">{accountName}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0"
            aria-label="Copy Chủ TK"
            onClick={() => void copyField(accountName, 'tên chủ tài khoản')}
          >
            <Copy />
            Copy
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 border-t pt-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">Số tiền</p>
          <p className="font-semibold tabular-nums">{formatVND(transfer.amount)}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11 shrink-0"
          aria-label="Copy Số tiền"
          onClick={() => void copyField(String(transfer.amount), 'số tiền')}
        >
          <Copy />
          Copy
        </Button>
      </div>

      {transferNote && (
        <div className="flex items-center justify-between gap-2 border-t pt-2">
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">Nội dung</p>
            <p className="break-words font-medium">{transferNote}</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="min-h-11 shrink-0"
            aria-label="Copy Nội dung"
            onClick={() => void copyField(transferNote, 'nội dung')}
          >
            <Copy />
            Copy
          </Button>
        </div>
      )}
    </div>
  )

  const vietQrContent = !hasBankInfo ? (
    <Alert>
      <AlertCircle />
      <AlertDescription>
        Người nhận chưa có thông tin ngân hàng. Bạn có thể chuyển tiền mặt hoặc nhắn riêng, rồi bấm &ldquo;Tôi đã chuyển&rdquo; bên dưới.
      </AlertDescription>
    </Alert>
  ) : isOnline && !imgError ? (
    <div className="flex flex-col gap-3">
      <div className="flex justify-center">
        {/* Đặt referrerPolicy="no-referrer" để không lộ URL chuyến đi sang máy chủ VietQR (DESIGN.md §7.3) */}
        <img
          src={qrUrl}
          alt={`Mã VietQR chuyển cho ${to.name}`}
          referrerPolicy="no-referrer"
          onError={() => {
            logWarn('qr.vietqrImageError', 'Ảnh VietQR lỗi, chuyển sang chế độ copy chữ', {
              memberId: to.id,
            })
            setImgError(true)
          }}
          className="w-full max-w-[260px] rounded-xl border bg-white p-2 object-contain"
        />
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => void copyField(accountNo, 'STK')}
        >
          <Copy />
          STK
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => void copyField(String(transfer.amount), 'số tiền')}
        >
          <Copy />
          Số tiền
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="min-h-11"
          onClick={() => void copyField(transferNote, 'nội dung')}
        >
          <Copy />
          Nội dung
        </Button>
      </div>
    </div>
  ) : (
    bankTextFallback
  )

  const momoContent = (
    <div className="flex flex-col items-center gap-3">
      {momoState.status === 'loading' && <Skeleton className="size-60 rounded-xl" />}
      {momoState.status === 'ok' && (
        <>
          <img
            src={momoState.dataUrl}
            alt={`Mã QR MoMo của ${to.name}`}
            className="w-full max-w-[240px] rounded-xl border bg-white p-2 object-contain"
          />
          <p className="text-center text-xs text-muted-foreground">
            QR MoMo tĩnh không điền sẵn số tiền — vui lòng nhập đúng{' '}
            <strong className="text-foreground">{formatVND(transfer.amount)}</strong> khi quét.
          </p>
        </>
      )}
      {momoState.status === 'empty' && (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Không tìm thấy ảnh QR MoMo của {to.name}.
        </p>
      )}
      {momoState.status === 'error' && (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <p className="text-sm text-destructive">Không tải được ảnh QR MoMo lúc này.</p>
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() => {
              setMomoState({ status: 'idle' })
              void loadMomoQr()
            }}
          >
            <RefreshCw />
            Thử lại
          </Button>
        </div>
      )}
    </div>
  )

  return (
    <ResponsiveModal
      open={open}
      onOpenChange={onOpenChange}
      title={`${from.name} → ${to.name} (${formatVND(transfer.amount)})`}
      footer={
        canMarkPaid ? (
          <Button type="button" className="min-h-11 w-full" onClick={onPaid}>
            Tôi đã chuyển
          </Button>
        ) : undefined
      }
    >
      {to.hasStaticQr ? (
        <Tabs
          value={activeTab}
          onValueChange={(nextTab) => {
            setActiveTab(nextTab)
            if (nextTab === 'momo') {
              void loadMomoQr()
            }
          }}
        >
          <TabsList className="grid h-11 w-full grid-cols-2">
            <TabsTrigger value="vietqr" className="min-h-10">
              VietQR
            </TabsTrigger>
            <TabsTrigger value="momo" className="min-h-10">
              QR MoMo
            </TabsTrigger>
          </TabsList>
          <TabsContent value="vietqr" className="mt-3">
            {vietQrContent}
          </TabsContent>
          <TabsContent value="momo" className="mt-3">
            {momoContent}
          </TabsContent>
        </Tabs>
      ) : (
        vietQrContent
      )}
    </ResponsiveModal>
  )
}
