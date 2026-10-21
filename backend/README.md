# backend — API GoMeal (M2)

Gói npm workspace `@gomeal/backend` trong repo GoMeal. Không commit `.env`, `node_modules/`, `uploads/`.

M2 triển khai Order Lifecycle API, Billing, Mock Payment, Dispatch, auth và API phụ trợ. Đã tích hợp MySQL 8 của M3 ngày 21/10/2026; service/controller dùng async/await, DTO giữ nguyên. CSDL, schema, migration và adapter thuộc gói `@gomeal/database` (thư mục `database/`).

## Chạy thử

Ở **gốc repo**: `npm run setup` (lần đầu) rồi `npm start`, mở http://127.0.0.1:3000 — backend phục vụ luôn giao diện trong `frontend/`. Cấu hình đọc từ `.env` ở gốc repo (`--env-file-if-exists=../.env`).

Chạy riêng gói này (sau khi đã `npm run setup` ở gốc):

```powershell
npm start -w @gomeal/backend          # hoặc: cd backend; npm start
npm test -w @gomeal/backend
```

API: http://127.0.0.1:3000/api/health. Server mặc định dùng MySQL; tự migrate và seed nếu users trống. Đơn, giỏ và phiên chưa hết hạn còn sau restart. STORE=memory chuyển sang demo RAM. Nếu cổng bận, sửa PORT trong `.env`.

Mật khẩu demo lấy từ DEMO_PASSWORD (mẫu demo12345). Chỉ dùng server demo trên máy local.

| Email | Vai trò |
|---|---|
| khach@gomeal.vn | Customer |
| khach2@gomeal.vn | Customer thứ hai để kiểm quyền |
| chuacosdt@gomeal.vn | Customer chưa có số điện thoại |
| nhahang@gomeal.vn | Manager nhà hàng 1 |
| nhahang2@gomeal.vn | Manager nhà hàng 2 |
| taixe@gomeal.vn, taixe2@gomeal.vn đến taixe5@gomeal.vn | 5 Driver |
| admin@gomeal.vn | Admin |


Tài xế bắt đầu OFFLINE. Bật AVAILABLE và cập nhật tọa độ để nhận lời mời. Mật khẩu được băm scrypt, token được băm SHA-256 và hết hạn sau 60 phút.

Mở Terminal thứ hai và chạy `npm run demo -w @gomeal/backend`: script tạo đơn COD 125.000 đồng, quản lý xác nhận/chuẩn bị món, tài xế nhận/giao và xác nhận thu tiền. Thanh toán ví/thẻ chỉ là mô phỏng. Có thể đổi MOCK_PAYMENT_RESULT=FAILED rồi khởi động lại để thử lỗi.

## Kiểm thử và bàn giao

```powershell
npm run check
npm test
npm run test:mysql
npm run test:coverage
```

- src/services/: nghiệp vụ M2; src/app.js: HTTP controller và phân quyền.
- src/adapters/memory-store.js: bộ giả lập dữ liệu cho demo/test; không phải database của M3.
- scripts/demo-fixtures.js: dữ liệu demo dùng được với cả MemoryStore và MySQL.
- docs/API.md: endpoint, request và response để M1 nối vào.
- docs/M3-CONTRACT.md: hợp đồng dữ liệu đề xuất để bàn với M3.
- docs/INTEGRATION.md: các chỗ M1 cần sửa khi nối API.
- docs/REQUIREMENTS.md và TEST-RESULTS.md: đối chiếu yêu cầu, bằng chứng và giới hạn.

MemoryStore dùng bản sao bộ nhớ và queue transaction async; npm test kiểm test double. npm run test:mysql chạy các fixture nghiệp vụ trên schema gomeal_m2_test riêng (trừ test adapter RAM và runtime demo có chủ đích). M3 có thêm kiểm nhiều kết nối, rollback, restart/crash và NFR trong database/docs. Cần chạy lại E2E khi ghép M4.

Audit ngày 18/10/2026 và 21/10/2026: xem docs/AUDIT-M2.md. Đã bổ sung CartService/API CRUD giỏ; cập nhật hợp đồng ở docs/API.md. Bản 21/10 sửa điều phối khi tài xế trực tuyến muộn, chặn điều phối khi nhà hàng thiếu tọa độ và dọn phiên hết hạn.

## Tính năng bổ sung 21/10/2026

- **Phí giao theo quãng đường:** khách chọn điểm giao trên bản đồ; phí theo bậc km (đến 3/5/7/10 km), nhân theo giá xăng admin cập nhật; đơn từ 250.000đ giảm 50% phí, từ 500.000đ miễn phí giao. Xem `GET /api/pricing`.
- **Voucher:** admin tạo/bật/tắt; khách chọn khi đặt; mỗi khách dùng một lần, hủy đơn được trả lại. Voucher mẫu: FREESHIP, GIAM20, KHACHMOI (riêng khach@gomeal.vn).
- **Thông báo:** chuông 🔔 trên mọi trang; đặt đơn, xác nhận đã thanh toán, từng bước trạng thái, lời mời tài xế, hủy đơn.
- **Gọi nhanh:** nút gọi nhà hàng/tài xế/khách trên trang đơn, tài xế và quản lý.
- **Theo dõi vị trí:** bản đồ OpenStreetMap (cần Internet) cho khách và tài xế; tài xế đang giao gửi vị trí 5 giây/lần, có chế độ "Mô phỏng di chuyển".
- **Ảnh và thành phần món:** quản lý tải ảnh (JPG/PNG/WEBP ≤ 2 MB, lưu ở `uploads/`, không commit) và nhập thành phần; ảnh mẫu ở `public/demo`.
- **Mô phỏng vận hành:** khi server đang chạy, mở terminal khác chạy `npm run simulate -- --orders 4 --every 15`. Khách khach@gomeal.vn đặt đơn, hai nhà hàng tự xác nhận, taixe2–taixe5 tự nhận và chạy trên bản đồ; taixe@gomeal.vn để bạn tự thao tác.
