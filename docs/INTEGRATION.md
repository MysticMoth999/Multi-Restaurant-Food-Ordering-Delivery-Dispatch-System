# Ghép M1 và M3 sau khi nhóm duyệt

Không tự thay file trên nhánh M1/M3. Bản ZIP chứa M2 và dữ liệu giả trong RAM để chạy thử.

## M1

1. Chạy M2 ở cổng 3000; chạy M1 bằng HTTP server (không mở file://). Đặt CORS_ORIGIN trong .env của M2 bằng đúng origin của M1, ví dụ http://127.0.0.1:5500. Khởi động lại backend.
2. M1 `api.js`: USE_MOCK=false; API_BASE=`http://127.0.0.1:3000/api`. Giữ envelope `{data}` và xử lý error/code. Không tải mock-backend.js để tránh nhầm dữ liệu localStorage với dữ liệu RAM của M2.
3. Quote: lưu cả `quoteFingerprint`. Giữ giỏ lựa chọn, không tự tính total. Body tạo đơn bổ sung fingerprint và requestKey; mỗi lần đặt mới tạo key, khi retry lỗi mạng giữ nguyên key cùng payload. Khi khách sửa giỏ/địa chỉ/phương thức, đó là yêu cầu mới. Không sinh key mới chỉ vì timeout.
4. Chuyển trạng thái: đổi `/manager/orders/:id/next` và `/driver/orders/:id/next` sang `/orders/:id/transitions` với targetStatus và expectedVersion lấy từ đơn đang hiển thị. Hủy cũng gửi expectedVersion.
5. Nhận/bỏ qua: `board.offer.offerId` thay cho `board.offer.id`. Hiện đồng hồ expiresAt; vẫn để backend quyết định còn hạn. Sau 409 tải lại bảng việc.
6. Menu: options là danh sách độc lập, ID số; không phải optionGroups/radio và ID chuỗi của mock M1. Hộp tùy chọn phải đọc hợp đồng mới hoặc nhóm chốt mô hình nhóm option trước khi nối. `lines[].options` là object, hiển thị option.name.
7. Fixture demo có 2 nhà hàng, 3 món và 5 tài xế; không dùng ID/giá cứng của mock. Ảnh, logo, rating, số đánh giá, ETA là phần UI/metadata chưa có trong hợp đồng API này; M1 cần fallback hoặc M3 bổ sung dữ liệu thật. Dashboard manager trả restaurant/items/orders; M1 có thể tính chỉ số hiển thị từ dữ liệu hoặc chốt API thống kê thêm với M2, không tự tính giá đơn.
8. Không gọi `/admin/reset` hay `/manager/restaurant` của mock: chưa có các endpoint đó. Phạm vi MVP quản trị trạng thái đã có qua `/admin/restaurants/:id`; sửa hồ sơ nhà hàng không nằm trong FR-08 của bản M2 này.

Những thay đổi contract này giúp đáp ứng yêu cầu của Word mà prototype trước chưa làm đủ: idempotency, xác nhận lại giá, xung đột trạng thái và định danh lời mời. Đây **chưa phải bản giao diện tích hợp hoàn chỉnh**.

## M3

M3 tự thiết kế và triển khai CSDL. ZIP không kèm schema, migration, SQL hoặc driver CSDL. Xem M3-CONTRACT.md để bàn hợp đồng giữa service M2 và adapter M3. Không coi dữ liệu fixture là thiết kế bảng chính thức.

CartService đã có API thêm/sửa/xóa/lấy giỏ theo customer đã xác thực. Khách chưa đăng nhập giữ lựa chọn tại UI và gọi quote công khai; đăng nhập thì M1 đồng bộ lựa chọn qua API giỏ. Giỏ dùng adapter RAM nên chưa lưu bền. Bản mock dùng một bản payment cho một order. Hai điểm này cần chốt cùng nhóm trước khi ghép dữ liệu thật.

## M4

Chạy `npm test` và test:coverage trước khi review. Đọc TEST-RESULTS.md để biết phạm vi đo. Bổ sung Playwright sau khi M1 nối API; thử giá đổi trong lúc checkout, timeout/retry cùng key, lời mời vừa hết hạn và đổi trạng thái đồng thời. Các test hiện tại không thay thế NFR-01/05 trên giao diện thật.
