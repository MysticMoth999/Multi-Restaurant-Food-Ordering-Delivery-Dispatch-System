# Kết quả kiểm thử M2 — bản RAM

Ngày chạy: 18/10/2026. Windows, Node.js 24.19.0, Express 5.1.0.

- Kiểm tra cú pháp: PASS.
- **19/19 test PASS**, 0 fail, 0 skip, 0 cancel. Log: test-output.txt.
- Kiểm giá VND, tùy chọn, snapshot, quote thay đổi, idempotency và vòng đời đơn.
- Kiểm 20 lỗi tạo đơn và lỗi nhận/hủy/hoàn tất đơn: hoàn tác trên mock RAM.
- Kiểm xác thực, vai trò, ownership, token hết hạn và khóa tài xế.
- 100 vòng HTTP, mỗi vòng 20 đơn/5 tài xế; thử nhận lặp và nhận trễ trên một tiến trình.
- Server + script demo chạy đơn COD 125.000 đồng tới DELIVERED, payment SUCCESS.
- Test adapter xác nhận instance độc lập, đọc trả bản sao và lỗi hoàn tác bộ nhớ.

## Coverage

Lệnh npm run test:coverage chỉ đo src/services/*.js, không gồm controller, adapter hay fixture.

| Service | Line coverage |
|---|---:|
| Order | 100% |
| Billing | 100% |
| Dispatch | 99,15% |
| Payment | 96,72% |
| Auth | 100% |
| Cart | 100% |
| Catalog | 96,20% |
| Admin | 100% |
| Tổng service | 98,94% |

Branch coverage tổng: 97,35%. Coverage không chứng minh đã kiểm mọi trường hợp.

## Giới hạn

Toàn bộ test dùng mock RAM. Không kiểm CSDL, lưu bền, nhiều kết nối, khóa hay transaction thật. MemoryStore không mô phỏng đầy đủ ràng buộc CSDL. NFR-02/NFR-06 cần ghép M3 rồi kiểm lại. Chưa đo tải NFR-01, độ trễ UI NFR-05 hoặc chạy Playwright trên M1. Không có thanh toán thật.

Audit bổ sung: test CRUD giỏ HTTP, cách ly khách hàng, checkout từ giỏ và từ chối hai kiểu cập nhật có điều kiện thất bại khi nhận lời mời.
