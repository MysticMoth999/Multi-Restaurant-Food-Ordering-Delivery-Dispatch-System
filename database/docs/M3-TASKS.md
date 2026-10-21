# Việc của M3 — CSDL MySQL 8

Nhóm chốt **MySQL 8 (InnoDB)** ngày 21/10/2026 (đã cân nhắc chuyển sang SQL Server nhưng giữ MySQL vì phần M3 đã hoàn thành và đo đạt). Căn cứ: báo cáo chính (mục 3, 7, 8, 9, 14.7, 15.1, 15.5, 15.10) và hợp đồng dữ liệu ở `backend/docs/M3-CONTRACT.md`.

## Đã xong

| Việc | Kết quả |
|---|---|
| ERD | `database/docs/ERD_Specification.md` |
| Schema, ràng buộc | `database/sql/schema.sql`: InnoDB, utf8mb4; UNIQUE email, requestKey; cột sinh + UNIQUE cho lời mời đang chờ và đơn đang giao; CHECK tiền, số lượng; tọa độ nhà hàng NOT NULL |
| Truy vấn vị trí | POINT SRID 4326 + spatial index, `ST_Distance_Sphere` cho lọc 5 km và `nearestDriver` |
| Seed | `seed_demo.sql`, `seed_load.sql` (100 nhà hàng, 2.000 món, 10.000 đơn) |
| Adapter | `src/mysql-store.js` (mysql2/promise, transaction + savepoint, `FOR UPDATE`, ánh xạ lỗi 1062/1213 → CONFLICT); M2 đã chuyển service sang async và dùng adapter này mặc định |
| Migration 002 | Voucher + lượt dùng (UNIQUE voucher+khách), thông báo, settings giá xăng, tọa độ/khoảng cách điểm giao, SĐT nhà hàng, ảnh/thành phần món; CHECK tổng tiền có giảm giá |
| Kiểm thử, đo | M3 8/8, M2 trên MySQL 27/27; NFR-01, NFR-02 (20/20), NFR-06 (100/100) đạt trên máy nhóm — xem `TEST-RESULTS.md` |

## Còn lại

- **Dữ liệu giao diện mở rộng** (đánh giá, ETA, giờ mở cửa, danh mục, nhóm option bắt buộc; ảnh món đã có từ migration 002): đang giữ MVP, chờ M1/M2 chốt — xem `UI-DATA-DECISIONS.md`.
- **Bàn giao M4:** M4 chạy lại các lệnh trong `M4-HANDOFF.md` trên bản ghép cuối để nghiệm thu NFR-01/02/06 và đo NFR-05 trên giao diện.
- **Cài trên máy khác:** cần MySQL ≥ 8.0.16 để CHECK được thực thi; làm theo `README.md`, không commit `.env`.
