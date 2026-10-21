# Dữ liệu giao diện trong MVP

Ngày 21/10/2026, người dùng chọn giữ MVP theo hợp đồng M2: lưu categoryId hiện có, ghi phần mở rộng để M1/M2 chốt sau. Đây là quyết định phạm vi của lần triển khai M3; chưa có xác nhận độc lập từ thành viên M1/M2.

| Dữ liệu | Quyết định hiện tại | Nếu bổ sung sau |
|---|---|---|
| Danh mục món | Lưu menu_items.category_id dạng text, mặc định main; trả categoryId theo M2. | Thêm menu_categories theo nhà hàng, migration và API categories; cần chuyển category_id đang có. |
| Ảnh nhà hàng/món | Ảnh món: đã lưu `menu_items.image_url` (migration 002), quản lý tải lên qua API, file ở backend `/media/...`. Ảnh bìa/logo nhà hàng: chưa lưu, UI dùng ảnh chung. | Thêm cover_url/logo_url cho nhà hàng theo cùng cách lưu ảnh món. |
| Điểm đánh giá | Chưa lưu, không tự ghi số đánh giá giả từ prototype. | Chốt dữ liệu có phải tổng hợp hay có bảng review; xác định ai được đánh giá và cách cập nhật rating/ratingCount. |
| ETA | Chưa lưu. | Chốt ETA cố định theo nhà hàng hay tính động; min/max phút hoặc chuỗi hiển thị, không trộn với cam kết SLA. |
| Giờ mở cửa | Chưa lưu và chưa dùng làm điều kiện chặn đặt món. | Chốt múi giờ, lịch theo ngày, nghỉ lễ và nghiệp vụ đóng/mở trước khi thêm schema/API. |
| Nhóm option bắt buộc chọn một | Chưa có: option M2 độc lập, tùy chọn; không khôi phục ràng buộc từ prototype. | Thêm option_groups(min_select,max_select), group_id và kiểm Billing/quote/create/cart đồng thời; UI radio/checkbox đọc cùng contract. |

M3 đã giữ giá tiền, snapshot tên/option, vị trí, phiên và giỏ theo API hiện hành. Các mở rộng cần migration có số mới và kiểm lại quoteFingerprint/idempotency để tránh thay đổi ngầm hành vi checkout.
