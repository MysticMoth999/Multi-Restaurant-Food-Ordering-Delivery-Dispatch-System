# Kết quả kiểm thử M3 trên MySQL 8

Ngày 21/10/2026, Asia/Bangkok. Lần chạy lại sau audit (xóa phiên hết hạn bằng một câu DELETE, trải dữ liệu tải): M2 22/22 trên RAM và MySQL, M3 8/8, seed SQL nhập lại đạt. Sau migration 002: M2 27/27 trên RAM và MySQL, M3 8/8 (NFR-02 so sánh cả 18 bảng, NFR-06 100/100 vòng), seed_demo.sql và seed_load.sql xuất lại và nhập thử đạt. Kết quả đo thực tế trên MySQL Community 8.0.46, InnoDB, mysql2 3.24.6, Node.js 25.1.0, Windows 10.0.26300. Máy Intel Core i5-12450H, 12 logical CPU, RAM khoảng 15,71 GiB. MySQL instance riêng localhost:3307; pool API tối đa 20 connection. Không dùng MemoryStore để kết luận NFR CSDL.

## Kiểm thử chức năng và tích hợp

| Lệnh / nội dung | Kết quả |
|---|---|
| M2 npm run check | PASS |
| M2 npm test sau chuyển async | 22/22 PASS |
| M2 chạy test:mysql trên gomeal_m2_test | 22/22 PASS; fixture nghiệp vụ dùng MySQL, riêng test adapter RAM và runtime demo vẫn kiểm MemoryStore có chủ đích |
| M3 npm test trên gomeal_m3_test | 8/8 PASS, 0 fail/skip/cancel |
| Import seed_demo.sql vào schema test trống | 2 nhà hàng, 3 món; tài khoản đăng nhập thành công |
| Import seed_load.sql vào schema test trống | 100 nhà hàng, 2.000 món, 10.000 đơn; đọc snapshot/8 history và đăng nhập thành công |

Các kiểm tra gồm FK, email và requestKey UNIQUE, generated-column UNIQUE cho pending offer/active order, kiểu tiền nguyên, tọa độ NOT NULL, binding chống chèn SQL, CAS nguyên tử, nested savepoint, dữ liệu đọc độc lập, DTO và Haversine/index vị trí.

Hai pool độc lập gửi cùng requestKey đồng thời chỉ tạo một đơn, một phản hồi tạo mới và một replay; payload khác nhận CONFLICT. Hai cập nhật cùng version có đúng một lần thành công. Hai tài xế nhận cùng một lời mời chỉ một người được gán; tài xế còn lại bị từ chối quyền sở hữu lời mời. Bấm lặp của đúng tài xế nhận CONFLICT.

Test restart mở Node HTTP server thật, lưu giỏ/đơn/phiên, kill rồi mở lại và dùng cùng bearer token để đọc dữ liệu/nhận replay. Process riêng chết khi đang giữ transaction chưa commit; lần đọc sau không thấy thay đổi chưa commit. Kiểm CHECK TABLE orders và truy vấn bản ghi mồ côi sau phục hồi đều đạt. Bài này kiểm restart/crash ứng dụng, chưa kiểm mất điện phần cứng hoặc restart toàn host MySQL.

## NFR-02

**20/20 PASS** trên InnoDB: 5 điểm chèn lỗi (sau Order, Item, History, Payment, trước commit) × 3 phương thức COD/MOCK_WALLET/MOCK_CARD, cộng 5 Mock FAILED. So toàn bộ 14 bảng với snapshot trước lỗi qua cả pool chính và pool độc lập; không có dữ liệu ghi dở dang. Kiểm bổ sung rollback nhận đơn, hủy/refund và hoàn tất COD cũng PASS. Chi tiết: NFR-02-results.json.

## NFR-06

**100/100 vòng PASS**: mỗi vòng 20 đơn READY_FOR_PICKUP và 5 driver AVAILABLE. Dùng 10 peer pool độc lập, mỗi pool giới hạn một connection; Promise.all gửi I/O MySQL đồng thời, transaction dùng connection riêng. Có 500 lần nhận sau hạn và 500 lần nhận trùng, cùng hai worker quét hàng đợi đồng thời.

Mỗi vòng đúng 5 đơn được gán, 15 đơn tiếp tục chờ, không có tài xế/đơn giữ nhiều lời mời pending hoặc một tài xế giao nhiều đơn. Sau khi hoàn tất một đơn bằng service, worker mời tiếp được; hàng đợi được hoàn tất qua nghiệp vụ. Clock kiểm thử tăng đơn điệu qua các mốc 60 giây/30 giây. Chi tiết: NFR-06-results.json. Đây là kiểm kết nối CSDL đồng thời với thời gian được kiểm soát; không phải kiểm bấm UI.

## NFR-01

**PASS trong lượt đo cục bộ này.** Đo lại lần ba 13:16:37–13:28:37 ngày 21/10/2026 (Asia/Bangkok) sau khi thêm migration 002 (phí giao theo km, voucher, thông báo); bộ dữ liệu tải trải đều: 100 nhà hàng nằm trên lưới cách nhau 0,03° (~3,3 km), phủ khoảng 30 × 33 km, mỗi vòng 5 km chứa khoảng 11 nhà hàng thay vì cả 100 như bản trước; mỗi VU tìm quanh một ô lưới khác nhau. 120 giây làm nóng, 600 giây đo, 100 VU, nghỉ 1 giây giữa request. Lặp tìm nhà hàng có tọa độ → xem menu → xem đơn thuộc khách. Dataset đúng 100 nhà hàng, 2.000 món, 10.000 đơn; worker dispatch mỗi 30 giây. Client tạo tải chạy process riêng trên cùng máy với API và MySQL.

| API đọc | Request đo | p95 | Lỗi | RPS |
|---|---:|---:|---:|---:|
| GET /api/restaurants?lat=...&lng=... | 19.606 | 20,84 ms | 0 | 32,68 |
| GET /api/restaurants/:id/menu | 19.664 | 29,25 ms | 0 | 32,77 |
| GET /api/orders/:id | 19.600 | 30,46 ms | 0 | 32,67 |

Tổng 58.870 request trong phần đo, khoảng 98,12 request/giây. Lượt đo trước khi có migration 002 (cùng dữ liệu trải đều) có p95 12,55 / 31,50 / 32,17 ms; tìm nhà hàng tăng vì mỗi nhà hàng đọc thêm cấu hình giá xăng để hiện phí giao. Lượt đầu (dữ liệu dồn trong một vòng 5 km) có p95 38,54 / 30,05 / 50,17 ms. Với 100 nhà hàng, MySQL tự chọn quét toàn bảng vì rẻ hơn dùng spatial index (EXPLAIN cost 10,2); index được dùng khi bảng lớn hơn hoặc khi ép FORCE INDEX. Mỗi API p95 <=500 ms và tỷ lệ lỗi <=1%. Công cụ đo từ trước fetch tới sau khi nhận/parse xong JSON; response không thành công hoặc timeout đều tính lỗi. Số liệu gốc: NFR-01-results.json.

Trong lượt này có chạy regression M2/M3 và kiểm SQL seed trên cùng MySQL host nhưng schema riêng; đây là đo local có workload nền, chưa phải môi trường nghiệm thu độc lập của nhóm. Thư mục hiện chưa có M4. Chạy lại các lệnh trong M4-HANDOFF.md trên bản ghép cuối; không dùng số liệu ở đây để khẳng định NFR-05/UI hay hệ thống triển khai khác cũng đạt.
