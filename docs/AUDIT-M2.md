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
