// @vitest-environment jsdom
/**
 * Bộ kiểm thử đơn vị cho hook `useMemberBinding` trong `memberAccess.ts`.
 * Kiểm tra đầy đủ vòng đời khôi phục phiên ẩn danh, `onSnapshot` bound/unbound/revoked và re-bind sau thu hồi.
 */
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureAnonymousAuth, useAuthUser } from './auth'
import { useMemberBinding } from './memberAccess'

type SnapshotNext = (snap: { exists: () => boolean; data: () => unknown }) => void
type SnapshotError = (err: { code?: string; message?: string }) => void

const mockDoc = vi.fn()
const mockSetDoc = vi.fn()
const mockOnSnapshot = vi.fn()
const mockServerTimestamp = vi.fn(() => ({ _serverTimestamp: true }))

vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: (...args: unknown[]) => mockDoc(...args),
  onSnapshot: (...args: unknown[]) => mockOnSnapshot(...args),
  serverTimestamp: () => mockServerTimestamp(),
  setDoc: (...args: unknown[]) => mockSetDoc(...args),
  writeBatch: vi.fn(),
}))

vi.mock('./firebase', () => ({
  db: {},
}))

vi.mock('./auth', () => ({
  useAuthUser: vi.fn(),
  ensureAnonymousAuth: vi.fn(),
}))

const mockUseAuthUser = vi.mocked(useAuthUser)
const mockEnsureAnonymousAuth = vi.mocked(ensureAnonymousAuth)

interface ListenerHandle {
  emitNext: SnapshotNext
  emitError: SnapshotError
  unsubscribe: ReturnType<typeof vi.fn>
}

let listeners: ListenerHandle[] = []

beforeEach(() => {
  listeners = []
  mockDoc.mockImplementation((_db: unknown, ...segments: string[]) => ({
    path: segments.join('/'),
  }))
  mockSetDoc.mockResolvedValue(undefined)
  mockEnsureAnonymousAuth.mockResolvedValue('anon-uid-1')
  mockOnSnapshot.mockImplementation((_ref: unknown, onNext: SnapshotNext, onError: SnapshotError) => {
    const unsubscribe = vi.fn()
    listeners.push({ emitNext: onNext, emitError: onError, unsubscribe })
    return unsubscribe
  })
})

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useMemberBinding', () => {
  it('trả về unbound và không mở listener onSnapshot khi là Admin', () => {
    mockUseAuthUser.mockReturnValue({ status: 'ready', uid: 'admin-uid', isAnonymous: false })

    const { result } = renderHook(() => useMemberBinding('trip123456', true))

    expect(result.current.status).toBe('unbound')
    expect(result.current.boundMemberId).toBeNull()
    expect(result.current.uid).toBeNull()
    expect(mockOnSnapshot).not.toHaveBeenCalled()
  })

  it('trả về loading khi phiên Auth đang khôi phục', () => {
    mockUseAuthUser.mockReturnValue({ status: 'loading' })

    const { result } = renderHook(() => useMemberBinding('trip123456', false))

    expect(result.current.status).toBe('loading')
    expect(result.current.boundMemberId).toBeNull()
    expect(mockOnSnapshot).not.toHaveBeenCalled()
  })

  it('trả về unbound khi chưa có anonymous uid và chuyển sang invalid sau markInvalidLink', () => {
    mockUseAuthUser.mockReturnValue({ status: 'ready', uid: null, isAnonymous: false })

    const { result } = renderHook(() => useMemberBinding('trip123456', false))

    expect(result.current.status).toBe('unbound')
    expect(mockOnSnapshot).not.toHaveBeenCalled()

    act(() => {
      result.current.markInvalidLink()
    })
    expect(result.current.status).toBe('invalid')
  })

  it('trả về bound kèm memberId khi phiên ẩn danh khôi phục có document bindings hợp lệ', () => {
    mockUseAuthUser.mockReturnValue({ status: 'ready', uid: 'anon-uid-1', isAnonymous: true })

    const { result } = renderHook(() => useMemberBinding('trip123456', false))
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)

    act(() => {
      listeners[0].emitNext({
        exists: () => true,
        data: () => ({ memberId: 'chung', code: 'chungcode1234' }),
      })
    })

    expect(result.current.status).toBe('bound')
    expect(result.current.boundMemberId).toBe('chung')
    expect(result.current.uid).toBe('anon-uid-1')
  })

  it('trả về unbound khi phiên ẩn danh tồn tại nhưng chưa có document bindings trên trip này', () => {
    mockUseAuthUser.mockReturnValue({ status: 'ready', uid: 'anon-uid-1', isAnonymous: true })

    const { result } = renderHook(() => useMemberBinding('trip123456', false))

    act(() => {
      listeners[0].emitNext({
        exists: () => false,
        data: () => undefined,
      })
    })

    expect(result.current.status).toBe('unbound')
    expect(result.current.boundMemberId).toBeNull()
  })

  it('chuyển sang trạng thái revoked khi onSnapshot báo lỗi permission-denied', () => {
    mockUseAuthUser.mockReturnValue({ status: 'ready', uid: 'anon-uid-1', isAnonymous: true })

    const { result } = renderHook(() => useMemberBinding('trip123456', false))

    act(() => {
      listeners[0].emitError({ code: 'permission-denied', message: 'Missing or insufficient permissions' })
    })

    expect(result.current.status).toBe('revoked')
    expect(result.current.boundMemberId).toBeNull()
  })

  it('tăng subscribeEpoch và gắn listener mới khi bindWithKey thành công từ trạng thái revoked', async () => {
    mockUseAuthUser.mockReturnValue({ status: 'ready', uid: 'anon-uid-1', isAnonymous: true })

    const { result } = renderHook(() => useMemberBinding('trip123456', false))
    expect(mockOnSnapshot).toHaveBeenCalledTimes(1)

    act(() => {
      listeners[0].emitError({ code: 'permission-denied' })
    })
    expect(result.current.status).toBe('revoked')

    let bindResult: string | undefined
    await act(async () => {
      bindResult = await result.current.bindWithKey('chung', 'newcode123456')
    })

    expect(bindResult).toBe('bound')
    expect(mockEnsureAnonymousAuth).toHaveBeenCalledTimes(1)
    expect(mockSetDoc).toHaveBeenCalledWith(
      { path: 'trips/trip123456/bindings/anon-uid-1' },
      {
        memberId: 'chung',
        code: 'newcode123456',
        updatedAt: { _serverTimestamp: true },
      },
    )
    // Phải hủy listener chết cũ và đăng ký listener mới sau khi tăng epoch
    expect(listeners[0].unsubscribe).toHaveBeenCalledTimes(1)
    expect(mockOnSnapshot).toHaveBeenCalledTimes(2)
    expect(result.current.status).toBe('bound')
    expect(result.current.boundMemberId).toBe('chung')
  })

  it('trả về invalid và chuyển trạng thái sang invalid khi setDoc bị rules từ chối permission-denied', async () => {
    mockUseAuthUser.mockReturnValue({ status: 'ready', uid: 'anon-uid-1', isAnonymous: true })
    mockSetDoc.mockRejectedValueOnce({ code: 'permission-denied' })

    const { result } = renderHook(() => useMemberBinding('trip123456', false))

    let bindResult: string | undefined
    await act(async () => {
      bindResult = await result.current.bindWithKey('chung', 'wrongcode1234')
    })

    expect(bindResult).toBe('invalid')
    expect(result.current.status).toBe('invalid')
    expect(result.current.boundMemberId).toBeNull()
  })
})
