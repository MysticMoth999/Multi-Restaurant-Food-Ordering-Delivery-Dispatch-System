# Nhóm 7 — M2 Backend

Bản local để Hưng xem và bàn với nhóm. Không commit hoặc push GitHub.

M2 triển khai Order Lifecycle API, Billing, Mock Payment và Dispatch theo báo cáo của nhóm; kèm auth, phân quyền và API phụ trợ để thử luồng. **Không triển khai database. M3 phụ trách CSDL, schema, migration, truy vấn và adapter lưu trữ thật.**

## Chạy thử

Cài Node.js 24.x có npm, giải nén rồi mở Terminal tại M2:

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

API: http://127.0.0.1:3000/api/health. Server tự nạp dữ liệu giả trong RAM; mỗi lần khởi động lại sẽ mất đơn, phiên đăng nhập và các thay đổi. Không có file CSDL. Nếu cổng bận, sửa PORT trong .env.

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


Tài xế bắt đầu OFFLINE. Bật AVAILABLE và cập nhật tọa độ để nhận lời mời. Mật khẩu được băm scrypt, token được băm SHA-256 và hết hạn sau 60 phút; dữ liệu đều ở RAM.

Mở Terminal thứ hai và chạy `npm run demo`: script tạo đơn COD 125.000 đồng, quản lý xác nhận/chuẩn bị món, tài xế nhận/giao và xác nhận thu tiền. Thanh toán ví/thẻ chỉ là mô phỏng. Có thể đổi MOCK_PAYMENT_RESULT=FAILED rồi khởi động lại để thử lỗi.

## Kiểm thử và bàn giao

```powershell
npm run check
npm test
npm run test:coverage
```

- src/services/: nghiệp vụ M2; src/app.js: HTTP controller và phân quyền.
- src/adapters/memory-store.js: bộ giả lập dữ liệu cho demo/test; không phải database của M3.
- scripts/demo-fixtures.js: dữ liệu mẫu trong RAM.
- docs/API.md: endpoint, request và response để M1 nối vào.
- docs/M3-CONTRACT.md: hợp đồng dữ liệu đề xuất để bàn với M3.
- docs/INTEGRATION.md: các chỗ M1 cần sửa khi nối API.
- docs/REQUIREMENTS.md và TEST-RESULTS.md: đối chiếu yêu cầu, bằng chứng và giới hạn.

MemoryStore mô phỏng hoàn tác bằng bản sao bộ nhớ. Test này không chứng minh transaction, khóa, ràng buộc duy nhất hay lưu bền trên CSDL thật. Khi ghép M3 phải kiểm thử lại các điểm đó. Frontend M1 chưa được tích hợp trong ZIP này.

Audit ngày 18/10/2026: xem docs/AUDIT-M2.md. Đã bổ sung CartService/API CRUD giỏ; cập nhật hợp đồng ở docs/API.md.
