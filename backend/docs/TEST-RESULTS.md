# Kết quả kiểm thử M2

**Chạy lại 21/10/2026 sau khi thêm phí giao theo km, voucher, thông báo, theo dõi vị trí và ảnh món:** `npm test` 27/27 PASS; `npm run test:mysql` 27/27 PASS; M3 `npm test` 8/8 PASS. Coverage các service: 96,76% dòng, 94,29% nhánh. 5 test mới ở `test/features.test.js`: bậc phí theo km + giá xăng + giảm theo giá trị đơn + giới hạn 10 km; voucher (giảm, mỗi khách một lần, hủy đơn trả voucher, voucher riêng khách, hết hạn, tắt); thông báo theo từng người nhận và trạng thái đã đọc; vị trí tài xế chỉ hiện khi đơn đang trên đường; tải ảnh món (đúng chủ, kiểm byte đầu file, giới hạn 2 MB, phục vụ qua /media, xóa ảnh cũ).

**Chạy lại 21/10/2026 sau khi ghép MySQL của M3:** `npm test` (MemoryStore) 22/22 PASS; `npm run test:mysql` (schema gomeal_m2_test) 22/22 PASS; M3 `npm test` 8/8 PASS. Kết quả đo NFR trên MySQL xem database/docs/TEST-RESULTS.md. Phần dưới là kết quả bản RAM trước khi ghép.

Ngày chạy: 21/10/2026. Windows, Node.js 25.1.0, Express 5.1.0 (lần chạy 18/10/2026 trên Node.js 24.19.0 cũng PASS).

- Kiểm tra cú pháp: PASS.
- **22/22 test PASS**, 0 fail, 0 skip, 0 cancel. Log: test-output.txt.
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
| Dispatch | 100% |
| Payment | 96,72% |
| Auth | 100% |
| Cart | 100% |
| Catalog | 96,20% |
| Admin | 100% |
| Tổng service | 99,16% |

Branch coverage tổng: 97,83%. Coverage không chứng minh đã kiểm mọi trường hợp.

## Giới hạn

(Trước khi ghép M3.) Toàn bộ test dùng mock RAM. Không kiểm CSDL, lưu bền, nhiều kết nối, khóa hay transaction thật. MemoryStore không mô phỏng đầy đủ ràng buộc CSDL. NFR-02/NFR-06 cần ghép M3 rồi kiểm lại. Chưa đo tải NFR-01, độ trễ UI NFR-05 hoặc chạy Playwright trên M1. Không có thanh toán thật.

Audit bổ sung: test CRUD giỏ HTTP, cách ly khách hàng, checkout từ giỏ và từ chối hai kiểu cập nhật có điều kiện thất bại khi nhận lời mời.

Audit 21/10/2026: thêm 3 test hồi quy (tài xế trực tuyến sau khi đơn đã hẹn thử lại được mời ngay; nhà hàng thiếu tọa độ không được điều phối và có ghi hoạt động; phiên hết hạn bị từ chối và được dọn). Cả ba FAIL trên mã trước khi sửa và PASS sau khi sửa.
