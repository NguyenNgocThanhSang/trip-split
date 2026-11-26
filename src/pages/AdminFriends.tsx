/**
 * Màn hình quản lý danh bạ bạn bè của Admin (`/admin/friends`).
 * Cho phép thêm, sửa, xóa bạn bè kèm thông tin ngân hàng (VietQR) và ảnh QR MoMo tĩnh đã nén.
 */
import { type ChangeEvent, type FormEvent, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  AlertCircle,
  ArrowLeft,
  Building2,
  Pencil,
  Plus,
  QrCode,
  Trash2,
  Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { BankPicker } from '@/components/BankPicker'
import { ResponsiveModal } from '@/components/ResponsiveModal'
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
import { db } from '@/data/firebase'
import { deleteFriend, saveFriend, useFriends } from '@/data/friends'
import type { Friend } from '@/data/types'
import { findBank } from '@/lib/banks'
import { compressQrImage } from '@/lib/image'
import { toAscii } from '@/lib/vietqr'

const ACCOUNT_NO_PATTERN = /^[0-9A-Za-z]+$/

/**
 * Chuẩn hóa tên chủ tài khoản sang chữ IN HOA KHÔNG DẤU đúng chuẩn NAPAS/VietQR.
 *
 * @param raw - Chuỗi tên chủ tài khoản người dùng nhập
 * @returns Chuỗi không dấu viết hoa, giới hạn 60 ký tự theo `firestore.rules`
 */
function normalizeAccountName(raw: string): string {
  return toAscii(raw).toUpperCase().slice(0, 60).trim()
}

/**
 * Trang quản lý danh bạ bạn bè dành riêng cho quản trị viên.
 * Cung cấp danh sách realtime từ `useFriends()`, modal thêm/sửa và hộp thoại xác nhận xóa.
 *
 * @returns Giao diện quản lý danh bạ bạn bè
 */
export function AdminFriends() {
  const { status, friends } = useFriends()

  const [modalOpen, setModalOpen] = useState(false)
  const [editingFriend, setEditingFriend] = useState<Friend | null>(null)
  const [name, setName] = useState('')
  const [bankBin, setBankBin] = useState('')
  const [accountNo, setAccountNo] = useState('')
  const [accountNoError, setAccountNoError] = useState<string | null>(null)
  const [accountName, setAccountName] = useState('')
  const [momoQrDataUrl, setMomoQrDataUrl] = useState('')
  const [isCompressing, setIsCompressing] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  const [deletingFriend, setDeletingFriend] = useState<Friend | null>(null)
  const [isDeleting, setIsDeleting] = useState(false)

  const trimmedName = name.trim()
  const normalizedAccountName = normalizeAccountName(accountName)
  const isSaveDisabled = trimmedName.length === 0 || isSaving || isCompressing

  /**
   * Mở modal ở chế độ thêm bạn mới và đưa toàn bộ trường biểu mẫu về mặc định.
   */
  function openCreateModal() {
    setEditingFriend(null)
    setName('')
    setBankBin('')
    setAccountNo('')
    setAccountNoError(null)
    setAccountName('')
    setMomoQrDataUrl('')
    setModalOpen(true)
  }

  /**
   * Mở modal ở chế độ chỉnh sửa và nạp sẵn thông tin của người bạn được chọn.
   *
   * @param friend - Hồ sơ bạn bè cần chỉnh sửa
   */
  function openEditModal(friend: Friend) {
    setEditingFriend(friend)
    setName(friend.name)
    setBankBin(friend.bankBin ?? '')
    setAccountNo(friend.accountNo ?? '')
    setAccountNoError(null)
    setAccountName(friend.accountName ?? '')
    setMomoQrDataUrl(friend.momoQrDataUrl ?? '')
    setModalOpen(true)
  }

  /**
   * Kiểm tra số tài khoản chỉ gồm ký tự `[0-9A-Za-z]` khi nhập hoặc gửi form.
   *
   * @param raw - Giá trị ô nhập số tài khoản
   * @returns Chuỗi số tài khoản đã cắt khoảng trắng nếu hợp lệ, hoặc `null` nếu không hợp lệ
   */
  function validateAccountNo(raw: string): string | null {
    const trimmed = raw.trim()
    if (!trimmed) {
      setAccountNoError(null)
      return ''
    }
    if (!ACCOUNT_NO_PATTERN.test(trimmed)) {
      setAccountNoError('Số tài khoản chỉ được chứa chữ cái không dấu và chữ số (0-9, A-Z).')
      return null
    }
    setAccountNoError(null)
    return trimmed
  }

  /**
   * Đọc và nén ảnh QR MoMo tĩnh người dùng vừa chọn, hiển thị preview hoặc báo lỗi qua toast.
   *
   * @param event - Sự kiện thay đổi của `<input type="file">`
   */
  async function handleQrFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    setIsCompressing(true)
    try {
      const compressed = await compressQrImage(file)
      setMomoQrDataUrl(compressed)
    } catch (error) {
      const message =
        error instanceof Error && error.message === 'Ảnh quá lớn'
          ? 'Ảnh quá lớn ngay cả sau khi nén. Vui lòng chọn ảnh QR rõ hơn hoặc cắt gọn viền.'
          : 'Không xử lý được ảnh QR. Vui lòng chọn tệp ảnh hợp lệ.'
      toast.error(message)
    } finally {
      setIsCompressing(false)
      // Xóa value để người dùng có thể chọn lại cùng một tệp nếu vừa sửa hoặc thử lại
      event.target.value = ''
    }
  }

  /**
   * Xác thực dữ liệu biểu mẫu và lưu bạn bè lên Firestore qua `saveFriend`.
   */
  async function handleSave() {
    if (isSaveDisabled) {
      return
    }

    const validAccountNo = validateAccountNo(accountNo)
    if (validAccountNo === null) {
      return
    }

    const selectedBank = bankBin ? findBank(bankBin) : undefined
    // Giữ lại tên ngắn đã lưu trước đây nếu bản ghi cũ dùng mã BIN không nằm trong danh sách tĩnh hiện tại
    const fallbackShortName =
      editingFriend && bankBin && bankBin === editingFriend.bankBin
        ? editingFriend.bankShortName
        : undefined
    const resolvedShortName = selectedBank?.shortName ?? fallbackShortName

    setIsSaving(true)
    try {
      await saveFriend(db, {
        id: editingFriend?.id,
        name: trimmedName,
        bankBin: bankBin.trim() || undefined,
        bankShortName: resolvedShortName,
        accountNo: validAccountNo || undefined,
        accountName: normalizedAccountName || undefined,
        momoQrDataUrl: momoQrDataUrl || undefined,
      })

      toast.success(editingFriend ? 'Đã cập nhật thông tin bạn bè.' : 'Đã thêm bạn vào danh bạ.')
      setModalOpen(false)
    } catch {
      toast.error('Không thể lưu danh bạ. Vui lòng thử lại.')
    } finally {
      setIsSaving(false)
    }
  }

  /**
   * Xử lý submit khi người dùng nhấn Enter trong các ô nhập của modal.
   *
   * @param event - Sự kiện submit của thẻ `<form>`
   */
  function handleFormSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void handleSave()
  }

  /**
   * Xóa hồ sơ bạn bè đã xác nhận khỏi collection `friends`.
   */
  async function handleConfirmDelete() {
    if (!deletingFriend || isDeleting) {
      return
    }

    const target = deletingFriend
    setIsDeleting(true)
    try {
      await deleteFriend(db, target.id)
      toast.success(`Đã xóa ${target.name} khỏi danh bạ.`)
      setDeletingFriend(null)
    } catch {
      toast.error('Không thể xóa lúc này. Vui lòng thử lại.')
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-8">
      <header className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
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
          <h1 className="truncate text-lg font-semibold">Danh bạ bạn bè</h1>
        </div>

        <Button type="button" className="min-h-11 shrink-0" onClick={openCreateModal}>
          <Plus />
          Thêm bạn
        </Button>
      </header>

      {status === 'loading' && (
        <div className="flex flex-col gap-3" aria-busy="true">
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
          <Skeleton className="h-20 w-full rounded-xl" />
        </div>
      )}

      {status === 'error' && (
        <Alert variant="destructive">
          <AlertCircle />
          <AlertTitle>Không tải được danh bạ</AlertTitle>
          <AlertDescription>
            Kiểm tra lại kết nối mạng hoặc phiên đăng nhập quản trị rồi tải lại trang.
          </AlertDescription>
        </Alert>
      )}

      {status === 'ok' && friends.length === 0 && (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-8 text-center">
            <p className="text-sm text-muted-foreground">
              Chưa có ai trong danh bạ. Thêm thông tin ngân hàng của bạn bè một lần để chọn nhanh khi tạo chuyến đi.
            </p>
            <Button type="button" className="min-h-11" onClick={openCreateModal}>
              <Plus />
              Thêm bạn đầu tiên
            </Button>
          </CardContent>
        </Card>
      )}

      {status === 'ok' && friends.length > 0 && (
        <ul className="flex flex-col gap-3">
          {friends.map((friend) => (
            <li key={friend.id}>
              <Card size="sm">
                <CardContent className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="truncate font-medium">{friend.name}</span>
                      {friend.momoQrDataUrl && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                          <QrCode className="size-3" />
                          QR MoMo
                        </span>
                      )}
                    </div>

                    {(friend.bankShortName || friend.accountNo) && (
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <Building2 className="size-3.5 shrink-0" />
                        <span className="truncate">
                          {[friend.bankShortName, friend.accountNo].filter(Boolean).join(' · ')}
                        </span>
                      </p>
                    )}

                    {friend.accountName && (
                      <p className="truncate text-xs text-muted-foreground">{friend.accountName}</p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11"
                      aria-label={`Sửa ${friend.name}`}
                      onClick={() => openEditModal(friend)}
                    >
                      <Pencil />
                    </Button>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="min-h-11 min-w-11 text-destructive hover:text-destructive"
                      aria-label={`Xóa ${friend.name}`}
                      onClick={() => setDeletingFriend(friend)}
                    >
                      <Trash2 />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}

      <ResponsiveModal
        open={modalOpen}
        onOpenChange={(open) => {
          if (!isSaving) {
            setModalOpen(open)
          }
        }}
        title={editingFriend ? `Sửa ${editingFriend.name}` : 'Thêm bạn bè'}
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              className="min-h-11"
              onClick={() => setModalOpen(false)}
              disabled={isSaving}
            >
              Hủy
            </Button>
            <Button
              type="button"
              className="min-h-11"
              onClick={() => void handleSave()}
              disabled={isSaveDisabled}
            >
              {isSaving ? 'Đang lưu...' : 'Lưu'}
            </Button>
          </>
        }
      >
        <form onSubmit={handleFormSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="friend-name">
              Tên <span className="text-destructive">*</span>
            </Label>
            <Input
              id="friend-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              placeholder="Ví dụ: Sang"
              className="min-h-11"
              required
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="friend-bank">Ngân hàng</Label>
            <BankPicker id="friend-bank" value={bankBin} onChange={setBankBin} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="friend-account-no">Số tài khoản</Label>
            <Input
              id="friend-account-no"
              value={accountNo}
              onChange={(e) => {
                const nextValue = e.target.value
                setAccountNo(nextValue)
                if (accountNoError) {
                  validateAccountNo(nextValue)
                }
              }}
              maxLength={25}
              placeholder="Ví dụ: 0123456789"
              className="min-h-11"
              aria-invalid={accountNoError !== null}
            />
            {accountNoError && (
              <p role="alert" className="text-xs text-destructive">
                {accountNoError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="friend-account-name">Tên chủ tài khoản</Label>
            <Input
              id="friend-account-name"
              value={accountName}
              onChange={(e) => setAccountName(e.target.value)}
              maxLength={60}
              placeholder="Ví dụ: Nguyễn Ngọc Sang"
              className="min-h-11"
            />
            {accountName.trim().length > 0 && normalizedAccountName !== accountName.trim() && (
              <p className="text-xs text-muted-foreground">Sẽ lưu: {normalizedAccountName}</p>
            )}
          </div>

          <div className="flex flex-col gap-2">
            <Label htmlFor="friend-momo-qr">Ảnh QR MoMo tĩnh (tùy chọn)</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Label
                htmlFor="friend-momo-qr"
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted"
              >
                <Upload className="size-4" />
                {isCompressing ? 'Đang nén ảnh...' : momoQrDataUrl ? 'Đổi ảnh QR' : 'Chọn ảnh QR'}
              </Label>
              <input
                id="friend-momo-qr"
                type="file"
                accept="image/*"
                className="sr-only"
                onChange={(e) => void handleQrFileChange(e)}
                disabled={isCompressing}
              />
              {momoQrDataUrl && (
                <Button
                  type="button"
                  variant="ghost"
                  className="min-h-11 text-destructive hover:text-destructive"
                  onClick={() => setMomoQrDataUrl('')}
                >
                  Xóa ảnh QR
                </Button>
              )}
            </div>

            {momoQrDataUrl && (
              <div className="flex items-center gap-3 rounded-lg border p-2">
                <img
                  src={momoQrDataUrl}
                  alt="Xem trước ảnh QR MoMo"
                  className="size-20 rounded object-contain"
                />
                <p className="text-xs text-muted-foreground">
                  Ảnh đã được nén gọn ({momoQrDataUrl.length.toLocaleString('vi-VN')} ký tự) để dùng làm phương án dự phòng khi offline.
                </p>
              </div>
            )}
          </div>
        </form>
      </ResponsiveModal>

      <AlertDialog
        open={deletingFriend !== null}
        onOpenChange={(open) => {
          if (!open && !isDeleting) {
            setDeletingFriend(null)
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Xóa {deletingFriend?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              Hồ sơ này sẽ bị xóa khỏi danh bạ. Các chuyến đi đã tạo trước đó vẫn giữ nguyên thông tin thành viên và số tài khoản đã lưu.
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
                // Ngăn Radix đóng hộp thoại ngay để giữ trạng thái Đang xóa cho tới khi Firestore hoàn tất
                e.preventDefault()
                void handleConfirmDelete()
              }}
            >
              {isDeleting ? 'Đang xóa...' : 'Xóa'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
