# Bàn giao M3 và kiểm lại với M4

Server M2 đã nối MySQL 8 InnoDB mặc định; service/controller/fixture/test dùng async/await. Thư mục hiện tại chưa có module/test runner M4. Kết quả CSDL ở đây hỗ trợ bàn giao; cần chạy lại E2E khi có bản ghép M4.

1. Ghi Node/MySQL/OS/CPU/RAM, cấu hình pool, dữ liệu, thời điểm Asia/Bangkok và workload khác. Không ghi mật khẩu/token vào báo cáo.
2. Chạy npm run check và npm test của M2 trên MemoryStore; tiếp tục chạy M2_TEST_STORE=mysql trên gomeal_m2_test theo README. Ca thiếu tọa độ xác nhận MySQL chặn ghi NULL, thay vì tạo dữ liệu lỗi như MemoryStore.
3. Chạy npm test tại M3 trên gomeal_m3_test: rollback, unique/CAS, requestKey đồng thời, hai tài xế cùng nhận một lời mời, 100 vòng tranh chấp và HTTP restart/crash. Giữ log và JSON NFR-02/NFR-06.
4. Chạy npm run benchmark mặc định trên gomeal_m3_load, dùng môi trường ổn định khi nghiệm thu nhóm. Giữ JSON p95/error/RPS từng API; không lấy smoke test thay bài đo 2 phút làm nóng + 10 phút đo.
5. Nối UI M1 với server MySQL, kiểm đặt/giỏ/hủy/refund/nhận/giao và retry sau mất phản hồi; restart server giữ dữ liệu. Chạy ma trận quyền và E2E M4, bổ sung NFR-05 nếu nghiệm thu độ trễ hiển thị.

NFR-02 có 15 lỗi chèn (5 điểm × 3 phương thức) và 5 Mock FAILED; so toàn bộ 14 bảng trước/sau và qua pool độc lập. Rollback gán đơn, refund và hoàn tất COD có test riêng.

NFR-06 dùng 10 pool độc lập, mỗi pool giới hạn 1 connection, cộng pool điều phối chính. Mỗi vòng có 20 đơn READY_FOR_PICKUP và 5 driver; hai worker tick đồng thời, 5 late accepts, 10 accepts có bấm hai lần. Kiểm đúng 5 đơn gán và 15 đơn chờ, hoàn tất một đơn qua service và xác nhận worker mời tiếp. Clock giả lập tăng đơn điệu qua hạn 60s và retry 30s. Hàng đợi được hoàn tất qua service, không sửa trạng thái trực tiếp để giải phóng tài xế.

Reset chỉ được chạy trên schema `_test`; tránh hai runner cùng schema. Đây là thao tác phá dữ liệu test có chủ đích. Không trỏ TEST_DB_NAME vào schema ứng dụng. Mặc định M2/M3 dùng hai schema khác nhau.

Backup MySQL bằng công cụ phù hợp, ví dụ mysqldump --single-transaction cho InnoDB; giữ thông tin migration và bảo vệ credential. Không sao chép datadir của server đang chạy để thay backup. Test kill Node xác minh rollback connection chưa commit và dữ liệu đã commit còn sau restart ứng dụng; chưa chứng minh mất điện phần cứng hay phục hồi toàn MySQL host. Không đưa .env, datadir hoặc log chứa bí mật vào Git.
