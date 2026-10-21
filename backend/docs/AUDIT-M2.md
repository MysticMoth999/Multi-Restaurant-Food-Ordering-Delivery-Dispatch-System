# Audit phạm vi M2 ngày 18/10/2026

Căn cứ: báo cáo chính của Nhóm 7, mục 3, 5–8 và 15.4–15.6. Đã đối chiếu mã tại thư mục Báo Cáo Cuối Kì/M2 với bản làm việc trước khi sửa: không có khác biệt nội dung.

## Kết luận

Bản trước còn thiếu CartController/CartService ở backend. Đã bổ sung API giỏ và kiểm thử. Các nhóm chức năng controller/service được giao cho M2 đã có mã triển khai trên adapter RAM. Không tuyên bố toàn hệ thống hay NFR liên quan CSDL đã nghiệm thu.

| Phần M2 trong báo cáo | Mã triển khai | Kết quả audit |
|---|---|---|
| OrderLifecycleService | order-service.js | Tạo đơn, idempotency, snapshot, version, trạng thái, lịch sử, hủy và hoàn tất |
| BillingService | billing-service.js | Tính tiền VND, option, phí cấu hình và xác nhận lại giá |
| MockPaymentService | payment-service.js | COD, SUCCESS/FAILED, REFUNDED/VOIDED, xác nhận COD |
| DispatchService | dispatch-service.js, server.js | Khoảng cách Haversine, độ mới vị trí, lời mời 60 giây, retry/worker 30 giây |
| AuthService | auth-service.js | Đăng ký CUSTOMER, mật khẩu băm, token 60 phút, phone |
| RestaurantService | catalog-service.js: list, restaurantView | ACTIVE, tìm tên, bán kính 5 km, phân trang 20 |
| MenuService | catalog-service.js: menu, saveItem, saveOption | Menu/option đúng chủ sở hữu, ngừng bán giữ snapshot |
| CartService | cart-service.js | Thêm, sửa, xóa, lấy giỏ; một nhà hàng, qty 1–99, option đúng món |
| AdminService | admin-service.js | Thống kê, trạng thái nhà hàng, khóa tài xế và thu hồi lời mời |
| Controller và phân quyền | app.js | HTTP, token/role, chuyển lỗi; ownership do service kiểm |

RestaurantService và MenuService hiện gộp trong CatalogService; đây là khác cách chia file so với bảng 15.5, không phải thiếu hai nhóm chức năng. Các controller cũng gom trong app.js. Chưa khẳng định khớp từng tên lớp trong thiết kế.

## Sửa sau audit

1. Thêm CartService và API giỏ có xác thực, giữ quote công khai cho khách vãng lai. Test kiểm ownership, CRUD, option, đổi nhà hàng và checkout.
2. Nhận lời mời phải kiểm số record cập nhật khi giữ tài xế và đổi lời mời; nếu cập nhật có điều kiện thất bại thì báo CONFLICT và hoàn tác. Test tiêm xung đột cho cả hai trường hợp. Đây là xử lý service M2; khóa CSDL thật vẫn do M3 bảo đảm.
3. Phản hồi chuyển trạng thái bổ sung orderId, previousStatus, currentStatus, updatedAt theo mục 7.3, giữ order để M1 tiếp tục dùng.

## Ranh giới với M3

ZIP không có schema, migration, SQL, driver CSDL, index geospatial hay bộ dữ liệu tải của M3. MemoryStore và demo-fixtures chỉ phục vụ chạy thử M2, không lưu file dữ liệu, không thay thế repository M3. Hợp đồng đề xuất nằm ở M3-CONTRACT.md.

Nghiệp vụ kiểm giá, chuyển trạng thái, chọn tài xế và yêu cầu giao dịch thuộc M2. Thiết kế bảng, truy vấn tối ưu, ràng buộc, khóa nhiều kết nối, lưu bền và thực thi transaction thật thuộc M3. Khi ghép adapter bất đồng bộ phải điều chỉnh service/controller sang async tương ứng; hiện tại hợp đồng mock đồng bộ.

## Phần chưa được nghiệm thu

NFR-01 tải lớn, NFR-02 toàn vẹn trên CSDL thật, NFR-05 độ trễ UI và NFR-06 nhiều kết nối cần tích hợp M1/M3/M4 rồi đo lại. Test HTTP một tiến trình không thay thế kiểm tranh chấp CSDL. M1 chưa nối hoàn chỉnh; cần áp dụng các endpoint và payload ở API.md/INTEGRATION.md. Không triển khai thêm để lấn sang M3 chỉ nhằm đánh dấu các mục này PASS.

Báo cáo kiểm thử lần cuối ở TEST-RESULTS.md và test-output.txt. Không commit/push GitHub.

## Audit lại ngày 21/10/2026

Chạy lại `npm run check`, `npm test`, `npm run test:coverage` trên Node.js 25.1.0: kết quả khớp TEST-RESULTS cũ (19/19, coverage 98,94%). Dò thêm các trường hợp biên ngoài bộ test và sửa:

1. **Tài xế trực tuyến muộn phải chờ 30 giây.** Khi đơn READY_FOR_PICKUP chưa có ai để mời, `retry_at` chặn luôn việc mời tài xế mới bật trực tuyến. Nay `retry_at` chỉ hẹn giờ xóa danh sách đã bỏ qua; tài xế mới (chưa bỏ qua đơn) được mời ngay ở lần tick kế tiếp, mà app gọi ngay sau `PUT /driver/status`.
2. **Nhà hàng thiếu tọa độ vẫn được điều phối** (khoảng cách tính ra hàng nghìn km). Nay đơn không được mời, hẹn thử lại 30 giây và ghi một dòng hoạt động cho quản trị. Mục 7.4 yêu cầu tọa độ nhà hàng hợp lệ; M3 cần bảo đảm `lat/lng` không rỗng.
3. **Phiên hết hạn không bao giờ bị xóa.** Nay dọn khi đăng nhập và khi gặp phiên hết hạn.
4. `package.json`: sửa mô tả bị lỗi mã hóa; `engines` đổi thành `>=24.0.0` vì đã chạy được trên Node 25.1.

Thêm 3 test hồi quy trong `test/audit.test.js`; tổng 22/22 PASS, coverage service 99,16% dòng, 97,83% nhánh.

## Audit sau khi ghép MySQL của M3 (21/10/2026)

- `npm test` 22/22, `npm run test:mysql` 22/22, M3 `npm test` 8/8 đều PASS.
- Chạy thử HTTP trên schema gomeal_m2_test: lọc 5 km, báo giá, hai yêu cầu tạo đơn cùng requestKey chỉ tạo một đơn (một replay), cùng key khác nội dung trả 409, khách tự hủy PENDING (COD → VOIDED), version cũ trả 409, worker mời tài xế gần nhất, bấm nhận hai lần cùng lúc trả 200/409, giao COD → SUCCESS, khởi động lại server vẫn còn đơn và phiên đăng nhập.
- Giao diện M1 đọc dữ liệu từ server chạy MySQL, không lỗi console.
- Lưu ý còn lại (không chặn):
  - Đã sửa: `AuthService.purgeExpired` trước duyệt toàn bộ bảng sessions mỗi lần đăng nhập; nay gọi `purgeSessions(now)` của adapter MySQL (một câu `DELETE … WHERE expires_at <= ?` dùng index `ix_sessions_expiry`), MemoryStore giữ vòng lặp.
  - Trong transaction, adapter đọc mọi dòng bằng `FOR UPDATE`, kể cả nhà hàng và người dùng khi dựng orderView; các đơn cùng nhà hàng ghi tuần tự. Đúng về dữ liệu, chỉ giới hạn thông lượng ghi.
  - Đã sửa: bộ dữ liệu tải trước đặt cả 100 nhà hàng trong cùng vòng 5 km; nay trải trên lưới 0,03° (mỗi vòng 5 km ~11 nhà hàng), benchmark tìm quanh nhiều điểm. Đo lại NFR-01: p95 12,55 / 31,50 / 32,17 ms, 0 lỗi; sau migration 002 đo lần nữa: 20,84 / 29,25 / 30,46 ms. Với 100 dòng MySQL vẫn chọn quét bảng vì rẻ hơn; spatial index có tác dụng khi bảng lớn.

## Đợt tính năng 21/10/2026: phí giao theo km, voucher, thông báo, bản đồ, ảnh món

- Tiền vẫn do backend tính: phí theo bậc km × giá xăng, giảm theo giá trị đơn, voucher; fingerprint báo giá gồm điểm giao và voucher nên đổi điểm/voucher sau khi xem giá thì phải xác nhận lại. Tổng tiền không dưới 1.000đ; CHECK MySQL `total = subtotal + delivery_fee - discount`.
- Voucher: kiểm ở backend (đúng khách, còn hạn, đủ giá trị, chưa dùng); UNIQUE(voucher_id, customer_id) chặn hai đơn đồng thời; hủy đơn xóa lượt dùng trong cùng transaction.
- Thông báo ghi trong transaction nghiệp vụ (rollback thì không còn); API chỉ trả thông báo của người đang đăng nhập.
- Vị trí tài xế chỉ trả khi đơn đang trên đường; số điện thoại chỉ nằm trong order DTO mà người xem đã có quyền đọc.
- Ảnh: chỉ quản lý của nhà hàng sở hữu món; kiểm byte đầu file (JPG/PNG/WEBP), không tin Content-Type; tối đa 2 MB (413); tên file ngẫu nhiên; xóa ảnh cũ; `uploads/` không commit.
- Lỗi phát hiện khi chạy thử và đã sửa: trường `distanceKm` của lời mời ghi đè khoảng cách giao của đơn (đổi tên thành `driverDistanceKm`); bản đồ đè lên bảng thông báo (cô lập z-index); dòng giảm giá lệch cột; ảnh dòng giỏ không hiện.
- Kết quả: 27/27 test trên RAM và MySQL, M3 8/8, NFR-01 p95 20,84 / 29,25 / 30,46 ms; `npm run simulate` 2 đơn chạy trọn tới giao xong.
