# Hợp đồng M2 ↔ M3 — đề xuất để nhóm thống nhất

M2 cần đọc/ghi dữ liệu để chạy nghiệp vụ. File này mô tả giao tiếp; không quyết định bảng, cột, khóa hay công nghệ CSDL của M3. MemoryStore chỉ là test double dùng RAM.

## Điểm nối

`createSystem({ store: adapterM3 })` nhận adapter thay cho mặc định MemoryStore. Hợp đồng hiện tại đồng bộ để chạy demo. Nếu M3 dùng driver bất đồng bộ, M2 phải đổi service/controller và transaction sang async/await cùng lúc; không truyền Promise vào hợp đồng hiện tại.

| Hàm/thuộc tính | Kết quả và ý nghĩa |
|---|---|
| rows(name, where = {}) | Danh sách record khớp tất cả thuộc tính; bản sao, không sửa dữ liệu bằng cách sửa object trả về |
| find(name, where) | Một record hoặc undefined |
| insert(name, values) | Trả ID mới |
| update(name, where, values) | Trả số record thay đổi; điều kiện có version phải được xét nguyên tử |
| remove(name, where) | Trả số record xóa; yêu cầu điều kiện |
| transaction(callback), inTransaction | Chạy nghiệp vụ nguyên tử, lỗi phải hoàn tác toàn bộ; inTransaction cho biết đang trong giao dịch |
| user(id), restaurant(id), driver(userId), order(id), offer(id) | Đọc thực thể; chú ý driver nhận userId |
| history(orderId, status, actorId, at) | Ghi lịch sử chuyển trạng thái |
| activity(actorId, message, at) | Ghi hoạt động quản trị |
| orderView(id) | DTO đơn theo docs/API.md, gồm payment, dòng snapshot và history theo thứ tự ghi |
| close() | Giải phóng tài nguyên adapter |

Các tên tập record service hiện dùng: users, sessions, restaurants, menu_items, menu_options, drivers, orders, order_items, payments, order_history, driver_offers, dispatch_skips, activity, carts. Đây là tên logic của hợp đồng mock; M3 được ánh xạ sang thiết kế riêng. Hình dạng record xem nơi gọi insert/update trong src/services và fixture; DTO gửi M1 xem API.md. Tên snake_case trong record không bắt buộc M3 đặt tên cột giống vậy.

Record logic carts gồm customer_id, restaurant_id, items_json (danh sách menuItemId, quantity, selectedOptionIds). Mỗi customer có một giỏ hoạt động trong bản M2; đây là lựa chọn triển khai cần M3 ánh xạ, không phải schema. Dữ liệu hết khi dừng mock.

## Điều kiện nghiệp vụ phải giữ khi tích hợp

- Giá nguyên VND; đơn giữ snapshot tên món, tùy chọn và giá tại lúc đặt.
- Một email không được đăng ký trùng; một customer + requestKey chỉ tạo một đơn. Retry cùng payload trả lại kết quả tạo ban đầu, payload khác trả CONFLICT.
- Tạo đơn, dòng món, payment và history thành công hoặc thất bại cùng nhau. Nhận lời mời phải cập nhật đơn, tài xế và lịch sử cùng giao dịch.
- Mỗi đơn/tài xế có tối đa một lời mời đang chờ. Mỗi tài xế chỉ nhận một đơn đang giao. Kiểm hạn lời mời và version trong thao tác nhận/chuyển trạng thái.
- Hủy/hoàn tiền mô phỏng và hoàn tất COD phải nguyên tử. Gọi lại hoàn tất không sinh lịch sử trùng.
- M3 chọn cách bảo đảm các điều kiện trên bằng CSDL và ánh xạ xung đột sang DomainError(CONFLICT); controller không dò chuỗi lỗi riêng của một CSDL.
- M3 phụ trách lưu bền, transaction, truy vấn/index và xử lý nhiều kết nối. Khi ghép, chạy lại test hoàn tác, hai yêu cầu cùng nhận đơn, idempotency đồng thời và phục hồi sau restart. Chưa nghiệm thu NFR-02/NFR-06 trên dữ liệu thật.

Phần service hiện tìm/lọc record trong bộ nhớ để dễ review. Nhóm cần thống nhất các truy vấn chuyên biệt và phân trang tại adapter khi ghép M3, rồi mới đo tải; không bê cách quét toàn bộ RAM thành thiết kế truy vấn production.
