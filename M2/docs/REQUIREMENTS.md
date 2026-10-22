# Đối chiếu yêu cầu với bản M2

| Yêu cầu | Triển khai | Bằng chứng/giới hạn |
|---|---|---|
| FR-01, FR-12 | AuthService, controller guards, kiểm ownership ở service | Test HTTP vai trò, token, tài xế khóa, sai chủ sở hữu; scrypt + salt; đăng ký chỉ CUSTOMER |
| FR-02 | Danh sách ACTIVE 20/trang, tên, bán kính 5 km, Haversine | Có kiểm thử lọc; chưa spatial index chuyên dụng/tập tải M3 |
| FR-03 | Kiểm một nhà hàng, số lượng 1–99, option đúng món/còn bán; gộp dòng giống nhau | Có quote/checkout validation; CartService và API CRUD giỏ phía server, adapter RAM; khách chưa đăng nhập dùng quote công khai |
| FR-04, FR-05 | OrderLifecycleService, BillingService | Integer VND, phí cấu hình, giá snapshot, quote fingerprint, requestKey |
| FR-06 | MockPaymentService | COD, MOCK_CARD, MOCK_WALLET; result từ config backend; FAILED rollback |
| FR-07 | Đơn/chi tiết/lịch sử thuộc đúng khách, 20/trang | Sắp created_at rồi id giảm dần |
| FR-08 | Thêm/sửa/ngừng bán món và option | Option độc lập, chưa nhóm radio/min-max như UI prototype |
| FR-09 | State machine, version, quyền và history | Nhảy cóc sai trả 400; version cũ 409; kiểm giao dịch |
| FR-10 | Haversine, TTL 60s, freshness 2 phút, retry/worker 30s, tie-break | Test hết hạn, bỏ qua, stale, hòa trên mock RAM |
| FR-11 | Online/offline/location, offer board, nhận, giao, COD, giải phóng tài xế | BUSY không tự offline; completion idempotent |
| FR-13 | Hủy đúng vai trò/trạng thái/lý do và payment | Transaction, rollback cả hủy; không hoàn tiền thật |
| FR-14 | Admin dashboard, nhà hàng ACTIVE/INACTIVE, khóa/mở tài xế | Không khóa BUSY; thu hồi phiên/lời mời; audit activity |
| NFR-01 | Chưa nghiệm thu | Chưa đo tải 100 VU, 100 nhà hàng, 2.000 món, 10.000 đơn |
| NFR-02 | 20 ca chèn lỗi tạo đơn và ca mock FAILED | PASS với mô phỏng RAM; chưa nghiệm thu transaction CSDL thật |
| NFR-03 | Test quyền cho API triển khai, một số ca ownership/token | Chưa tuyên bố full ma trận mọi biến thể/penetration test production |
| NFR-04 | Coverage các service đo bằng Node test runner | Xem số thực trong TEST-RESULTS; không tính controller/repository vào mẫu số này |
| NFR-05 | Chưa nghiệm thu | Phụ thuộc M1 polling và tải thực, chưa đo p95 100 chuyển trạng thái |
| NFR-06 | 100 vòng HTTP 20 đơn/5 tài xế trên một tiến trình RAM | PASS mock local; chưa nghiệm thu tranh chấp nhiều kết nối CSDL; late expiry dùng clock/dữ liệu điều khiển |

Các thành phần kiến trúc đã áp dụng: Controller → Service → Repository; service quản transaction; worker là lối vào nội bộ khác Controller. Một thư viện repository dùng chung được chọn cho bản review làm hợp đồng đề xuất cho M3, chưa tách mỗi thực thể thành một file repository riêng.

Đây là bản backend có thể chạy/kiểm thử, không phải tuyên bố toàn bộ dự án đã nghiệm thu. Các điểm còn lại ở đây là danh sách cần thống nhất khi bàn nhóm, không được ghi PASS trong báo cáo nếu chưa có đo lường tương ứng.
