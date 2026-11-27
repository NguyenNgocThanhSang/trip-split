/**
 * Kiểm thử hàm thuần `adminStateFor` suy luận trạng thái quyền quản trị từ người dùng Firebase Auth.
 * Chỉ kiểm tra logic thuần, không kết nối Firebase hay giả lập Auth SDK.
 */
import { describe, expect, it } from 'vitest'
import { adminStateFor } from './auth'

describe('adminStateFor', () => {
  it('trả về signed-out khi chưa có người dùng đăng nhập', () => {
    expect(adminStateFor(null, 'admin-uid-123')).toEqual({
      status: 'signed-out',
    })
  })

  it('trả về signed-out ngay cả khi adminUid cấu hình bị rỗng và chưa đăng nhập', () => {
    // Chưa đăng nhập luôn ưu tiên trạng thái signed-out để màn login hiện nút đăng nhập
    expect(adminStateFor(null, '')).toEqual({
      status: 'signed-out',
    })
  })

  it('trả về admin khi UID của người dùng khớp với adminUid', () => {
    expect(
      adminStateFor(
        { uid: 'admin-uid-123', email: 'chung@example.com' },
        'admin-uid-123',
      ),
    ).toEqual({
      status: 'admin',
      uid: 'admin-uid-123',
    })
  })

  it('cắt khoảng trắng thừa của adminUid khi so khớp UID quản trị', () => {
    // Biến môi trường .env đôi khi dính khoảng trắng hoặc ký tự xuống dòng cuối
    expect(
      adminStateFor(
        { uid: 'admin-uid-123', email: 'chung@example.com' },
        '  admin-uid-123 \n',
      ),
    ).toEqual({
      status: 'admin',
      uid: 'admin-uid-123',
    })
  })

  it('trả về not-admin kèm email khi UID không khớp với adminUid', () => {
    expect(
      adminStateFor(
        { uid: 'guest-uid-456', email: 'banbe@example.com' },
        'admin-uid-123',
      ),
    ).toEqual({
      status: 'not-admin',
      email: 'banbe@example.com',
    })
  })

  it('giữ nguyên email là null khi tài khoản khác không có email', () => {
    expect(
      adminStateFor({ uid: 'guest-uid-456', email: null }, 'admin-uid-123'),
    ).toEqual({
      status: 'not-admin',
      email: null,
    })
  })

  it('trả về not-admin khi adminUid bị để trống hoặc chỉ chứa khoảng trắng', () => {
    // Bảo vệ an toàn: nếu VITE_ADMIN_UID chưa được cấu hình thì không ai được coi là admin
    expect(
      adminStateFor({ uid: '', email: 'chung@example.com' }, ''),
    ).toEqual({
      status: 'not-admin',
      email: 'chung@example.com',
    })

    expect(
      adminStateFor({ uid: 'anyone', email: 'chung@example.com' }, '   '),
    ).toEqual({
      status: 'not-admin',
      email: 'chung@example.com',
    })
  })

  it('coi phiên đăng nhập ẩn danh (isAnonymous=true) là signed-out để không báo lỗi sai tài khoản ở /admin', () => {
    expect(
      adminStateFor(
        { uid: 'anon-uid-789', email: null, isAnonymous: true },
        'admin-uid-123',
      ),
    ).toEqual({
      status: 'signed-out',
    })
    expect(
      adminStateFor({ uid: 'anon-uid-789', email: null, isAnonymous: true }, ''),
    ).toEqual({
      status: 'signed-out',
    })
  })
})
