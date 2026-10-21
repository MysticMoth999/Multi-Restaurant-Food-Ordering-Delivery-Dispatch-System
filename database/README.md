# database — CSDL GoMeal (M3, MySQL 8)

Gói npm workspace `@gomeal/database`: `sql/` (schema, migration, seed), `src/mysql-store.js` (adapter), `scripts/`, `test/`, `docs/`.

M3 có ERD, schema InnoDB, migration runner, adapter mysql2/promise, seed và kiểm thử CSDL thật. Service/controller M2 đã chuyển sang async/await cùng đợt; DTO và URL API giữ nguyên. Giữ phạm vi MVP: lưu categoryId, các dữ liệu giao diện mở rộng chờ M1/M2 chốt.

## Cài và chạy

Ở **gốc repo** chạy `npm run setup`: cài thư viện, tạo `.env` ở gốc, bật instance MySQL riêng ở `127.0.0.1:3307` (datadir `%LOCALAPPDATA%/GoMealM3/mysql8`, không đụng dịch vụ MySQL80), tạo 4 schema và tài khoản `gomeal` với mật khẩu sinh ngẫu nhiên, áp migration, nạp demo. Sau đó `npm start`.

Bật/tắt instance riêng bằng tay: `powershell -ExecutionPolicy Bypass -File database/scripts/mysql-local.ps1 start|stop|status` (đặt `MYSQL_BIN` nếu MySQL cài ở thư mục khác).

Server áp migration và nạp fixture khi users trống; restart không seed đè. Demo: khach@gomeal.vn, nhahang@gomeal.vn, taixe@gomeal.vn, admin@gomeal.vn; mật khẩu `demo12345`. Tài xế bắt đầu OFFLINE. `STORE=memory` bật test double RAM, `SEED_DEMO=false` tắt auto seed.

## Dùng MySQL khác (máy chủ, MySQL80, CI)

Yêu cầu MySQL >= 8.0.16 để CHECK được thực thi; đã kiểm trên 8.0.46. Sửa `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` trong `.env` ở gốc rồi chạy `npm run setup` với `MYSQL_ROOT_PASSWORD` để script tự tạo 4 schema (`DB_NAME`, `TEST_DB_NAME`, `BACKEND_TEST_DB_NAME`, `LOAD_DB_NAME`, collation utf8mb4_0900_ai_ci), tài khoản ứng dụng và bật `log_bin_trust_function_creators` (cần khi MySQL bật binary log vì schema có trigger). Không cấp SUPER cho tài khoản ứng dụng.

## Migration và dữ liệu mẫu

```powershell
# Ở gốc repo
npm run migrate
npm run seed:demo -w @gomeal/database  # chỉ khi chưa có users
# Dùng schema RIÊNG cho tải
$env:DB_NAME='gomeal_m3_load'
npm run seed:load -w @gomeal/database
Remove-Item Env:DB_NAME
```

`database/sql/schema.sql` chứa 14 bảng, generated-column UNIQUE, FK/CHECK, SPATIAL INDEX và trigger tọa độ. Runner dùng advisory lock, checksum và schema_migrations. DDL MySQL tự commit; có thể chạy tiếp sau lần áp dở, không hứa rollback toàn bộ DDL. Thêm 002_*.sql khi mở rộng, không sửa schema.sql đã áp.

Demo giống fixture M2: 11 users, 2 nhà hàng, 3 món, 2 option, 5 tài xế. Bộ tải có đúng 100 nhà hàng, 2.000 món, 10.000 đơn DELIVERED, một dòng/payment và 8 history mỗi đơn, thêm 100 khách tạo tải. Seed dữ liệu tổng hợp trong một transaction và từ chối CSDL đã có users.

Có sẵn `database/sql/seed_demo.sql` và `seed_load.sql` để nhập qua MySQL client/Workbench sau schema vào database trống. Nếu INSERT lỗi, ROLLBACK trước khi xử lý tiếp. SQL seed không chứa bearer session; password_hash dùng scrypt đúng định dạng AuthService. Xuất lại bằng `npm run export-seeds -w @gomeal/database` sau khi seed tải; file tải khoảng 22 MB.

Kiểm lại việc nhập SQL bằng `npm run verify-seeds -w @gomeal/database`; lệnh này reset schema test `gomeal_m2_test`, nên chạy khi test runner M2 đã dừng. Kết quả ở database/docs/SEED-VERIFICATION.json.

## Kiểm thử và đo NFR

```powershell
# Ở gốc repo
npm test             # backend trên RAM, backend trên MySQL, database (khoảng 6 phút)
npm run coverage     # coverage các service backend
npm run benchmark    # NFR-01: 2 phút làm nóng + 10 phút đo, schema LOAD_DB_NAME
```

Test chỉ reset schema tên kết thúc `_test`; backend dùng `BACKEND_TEST_DB_NAME` (gomeal_m2_test), database dùng `TEST_DB_NAME` (gomeal_m3_test). Không chạy hai runner cùng schema. Test restart mở/kill Node server thật, giữ session/cart/order rồi kiểm transaction chưa commit bị rollback khi process chết.

Benchmark dùng gomeal_m3_load và kiểm đúng lượng dữ liệu. API MySQL và client chạy ở process riêng: 100 VU, 120 giây làm nóng + 600 giây đo, nghỉ 1 giây giữa request, lặp nhà hàng → menu → đơn của khách. Worker quét 30 giây. p95/error/RPS từng API ở database/docs/NFR-01-results.json. WARMUP_SECONDS/MEASURE_SECONDS/VUS cho smoke test được đánh officialScenario=false. BENCHMARK_OUTPUT đổi file kết quả; LOAD_DB_NAME đổi schema tải.

## Tài liệu bàn giao

- database/docs/ERD_Specification.md: ERD, từ điển dữ liệu, đối chiếu mục 14.7, ràng buộc và index.
- src/mysql-store.js: pool, transaction/CAS, migration và truy vấn chuyên biệt.
- database/docs/UI-DATA-DECISIONS.md: quyết định giữ MVP của người dùng.
- database/docs/TEST-RESULTS.md: kết quả thực đo và giới hạn.
- database/docs/M4-HANDOFF.md: kiểm lại sau tích hợp M4 và vận hành.

## Bổ sung 21/10/2026: migration 002

`database/sql/002_features.sql` thêm voucher, thông báo, cấu hình giá xăng, điểm giao và khoảng cách của đơn, SĐT nhà hàng, ảnh và thành phần món. Server M2 và `npm run migrate` tự áp dụng khi mở CSDL. CSDL demo đã seed trước đó thì chạy thêm `node --env-file-if-exists=.env scripts/upgrade-demo.js` để có SĐT nhà hàng, ảnh món mẫu và voucher FREESHIP/GIAM20/KHACHMOI (chỉ cập nhật/chèn thêm, không xóa đơn).
