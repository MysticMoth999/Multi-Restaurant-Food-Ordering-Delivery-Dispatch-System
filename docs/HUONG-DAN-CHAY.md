# Hướng dẫn mở và vận hành GoMeal

## 1. Hệ thống gồm những gì

Có 3 phần, nối với nhau theo một chiều. Backend phục vụ luôn giao diện nên chỉ cần mở một địa chỉ:

```
Trình duyệt → http://127.0.0.1:3000 (trang frontend do backend phục vụ)
   │  api.js gọi /api cùng địa chỉ, gửi token đăng nhập
   ▼
Backend Node.js/Express (backend, cổng 3000)
   │  Controller (src/app.js) → Service (src/services/*) → adapter dữ liệu
   ▼
MySQL 8 riêng của dự án (database, cổng 3307, dữ liệu ở %LOCALAPPDATA%\GoMealM3)
      adapter: database/src/mysql-store.js, migration: database/sql/*.sql
```

- **M1 – giao diện:** các trang HTML tĩnh. Không tự tính tiền, không đổi trạng thái đơn; mọi thứ đều hỏi backend.
- **M2 – backend:** kiểm tra đăng nhập và quyền, tính tiền, đặt đơn, chuyển trạng thái, thanh toán giả lập, điều phối tài xế, thông báo. Một **worker** chạy ngầm mỗi 30 giây để mời tài xế cho đơn đã sẵn sàng.
- **M3 – CSDL:** lưu toàn bộ dữ liệu. Backend tự áp migration và nạp tài khoản demo khi CSDL còn trống.

## 2. Cài lần đầu và mở hệ thống

Cần **Node.js 24+**, **MySQL Server 8** đã cài (Windows) và Internet cho bản đồ. Mở PowerShell tại thư mục gốc repo:

```powershell
npm run setup
```

Chỉ cần chạy một lần trên mỗi máy (chạy lại vẫn an toàn): cài thư viện (một lệnh `npm ci` cho cả backend và database), tạo `.env` ở gốc, bật MySQL riêng ở cổng 3307, tạo CSDL và tài khoản ứng dụng, áp migration, nạp dữ liệu demo.

**Mỗi lần dùng:**

```powershell
npm start
```

Thấy dòng `Giao diện GoMeal: http://127.0.0.1:3000/` thì mở địa chỉ đó. `npm start` tự bật MySQL nếu đang tắt (ví dụ sau khi khởi động lại máy). **Tắt:** Ctrl+C. MySQL vẫn chạy nền; muốn tắt hẳn: `powershell -ExecutionPolicy Bypass -File database/scripts/mysql-local.ps1 stop`.

Bản đồ dùng ảnh nền OpenStreetMap nên máy cần **Internet**; không có mạng thì các chức năng khác vẫn chạy, chỉ khung bản đồ báo không tải được.

**Máy không có MySQL hoặc muốn dữ liệu sạch mỗi lần chạy:** dữ liệu nằm trong RAM, mất khi tắt:

```powershell
npm run setup -- --no-db
npm run start:demo
```

**Mở giao diện bằng Live Server (cho M1 sửa giao diện):** vẫn chạy được ở `http://127.0.0.1:5500` (đúng `127.0.0.1`, không dùng `localhost`); khi đó trang gọi API ở `127.0.0.1:3000`, backend cho phép nguồn này qua `CORS_ORIGIN` trong `.env` ở gốc.

## 3. Tài khoản demo

Mật khẩu chung: `demo12345`. Đăng nhập xong, hệ thống tự đưa về trang theo vai trò lấy từ token.

| Email | Vai trò | Trang |
|---|---|---|
| khach@gomeal.vn, khach2@gomeal.vn | Khách | index.html, orders.html |
| chuacosdt@gomeal.vn | Khách chưa có SĐT (để demo bắt buộc nhập SĐT trước khi đặt) | |
| nhahang@gomeal.vn (Hokkaido Sachi), nhahang2@gomeal.vn (Sushi Góc Phố) | Quản lý nhà hàng | restaurant-management.html |
| taixe@gomeal.vn … taixe5@gomeal.vn | Tài xế (ban đầu ngoại tuyến) | driver.html |
| admin@gomeal.vn | Quản trị | admin.html |

Demo nhiều vai cùng lúc: mỗi vai một tab mới (tự gõ địa chỉ), **không** tick "Ghi nhớ đăng nhập". Token lưu theo từng tab nên các vai không đè nhau.

## 4. Kịch bản demo trọn luồng

| # | Ai | Thao tác trên giao diện | Backend làm gì |
|---|---|---|---|
| 1 | Khách | Trang chủ → chọn nhà hàng → thêm món, chọn option (thẻ món có ảnh và thành phần) | `GET /restaurants`, `GET /restaurants/:id/menu` |
| 2 | Khách | Mở giỏ | `POST /cart/quote`: backend tính tiền món, phí giao theo km, giảm giá, tổng và trả `quoteFingerprint` |
| 3 | Khách | Đặt hàng: chọn điểm giao trên bản đồ (bấm hoặc kéo 🏠), chọn voucher (ví dụ FREESHIP), chọn COD hoặc ví/thẻ giả lập | Báo giá lại theo điểm giao và voucher; `POST /orders` kèm `requestKey`: một transaction ghi Order, OrderItem, Payment, lượt dùng voucher, lịch sử, thông báo. Gửi lại cùng key không tạo đơn thứ hai |
| 4 | Khách | Trang "Đơn của tôi": theo dõi trên bản đồ, nút gọi nhà hàng/tài xế, lịch sử, hủy khi còn **Chờ xác nhận** | Trang tự tải lại mỗi 4 giây; hủy thì COD → VOIDED, ví/thẻ → REFUNDED, voucher được trả lại |
| 5 | Quản lý | Xác nhận → Đang chuẩn bị → Sẵn sàng giao | `POST /orders/:id/transitions` kèm `expectedVersion`; sai thứ tự trả 400, dữ liệu cũ trả 409 |
| 6 | Tài xế | Bật **Trực tuyến** (trình duyệt gửi vị trí GPS; không lấy được sau 4 giây thì dùng vị trí demo gần Hokkaido Sachi) | Lưu vị trí; trang gửi lại vị trí mỗi 30 giây |
| 7 | — | Chờ tối đa 30 giây | Worker tìm tài xế rảnh gần nhà hàng nhất (vị trí cập nhật trong 2 phút) và gửi lời mời hạn 60 giây |
| 8 | Tài xế | **Nhận** hoặc **Bỏ qua** | Nhận: gán đơn, tài xế thành BUSY. Bỏ qua/hết hạn: mời người kế tiếp |
| 9 | Tài xế | Đã lấy món → Đang giao → Đã giao (COD: xác nhận đã thu tiền) | Thanh toán COD → SUCCESS, tài xế về AVAILABLE |
| 10 | Admin | Xem tổng quan, khóa/mở tài xế, bật/tắt nhà hàng, đổi giá xăng, tạo/bật/tắt voucher | `GET /admin/dashboard`, `PATCH /admin/...`, `POST /admin/vouchers` |

Mỗi bước, người liên quan nhận thông báo ở chuông 🔔 (kèm toast; bấm "Bật thông báo trình duyệt" để nhận cả khi tab ẩn). Ví/thẻ giả lập báo "Xác nhận đã thanh toán" ngay khi đặt; COD báo khi tài xế xác nhận thu tiền.

Trên trang tài xế, bật **"Mô phỏng di chuyển (demo)"** để xe tự chạy tới nhà hàng rồi tới điểm giao (gửi vị trí 5 giây/lần); khách thấy xe chạy trên bản đồ.

### Chạy mô phỏng tự động

Khi backend đang chạy, mở thêm một cửa sổ tại thư mục gốc repo:

```powershell
npm run simulate -- --orders 4 --every 15
```

Khách `khach@gomeal.vn` tự đặt 4 đơn (mỗi 15 giây một đơn, điểm giao ngẫu nhiên 0,8–3,5 km), hai nhà hàng tự xác nhận, `taixe2`–`taixe5` tự nhận đơn và chạy trên bản đồ tới khi giao xong. Đăng nhập `khach@gomeal.vn` ở trang "Đơn của tôi" để xem. `taixe@gomeal.vn` không bị mô phỏng điều khiển nên bạn vẫn tự nhận đơn được. Ctrl+C để dừng (tài xế mô phỏng tự về ngoại tuyến).

Trạng thái đơn: `PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP → DRIVER_ASSIGNED → PICKED_UP → DELIVERING → DELIVERED`; `CANCELLED` khi khách hủy lúc PENDING hoặc quản lý hủy lúc PENDING/CONFIRMED.

## 5. Code nằm ở đâu

| Muốn xem | File |
|---|---|
| Gọi API, lưu token | `frontend/js/api.js`, `frontend/js/app.js` |
| Trang khách / menu-giỏ / đơn | `frontend/js/home.js`, `menu.js`, `orders.js` (HTML ở `frontend/*.html`) |
| Trang quản lý / tài xế / admin | `frontend/js/restaurant.js`, `driver.js`, `admin.js` |
| Kiểu giao diện, ảnh | `frontend/css/`, `frontend/img/` |
| Danh sách API, kiểm quyền theo vai trò | `backend/src/app.js` (controller) |
| Đăng ký, đăng nhập, token | `backend/src/services/auth-service.js` |
| Tính tiền, báo giá | `billing-service.js`, `cart-service.js` |
| Đặt đơn, chuyển trạng thái, hủy | `order-service.js`, `payment-service.js` |
| Mời tài xế, nhận/bỏ qua, worker | `dispatch-service.js` |
| Thời hạn (60 s, 2 phút, 30 s, phiên 1 giờ), bảng phí theo km | `backend/src/domain/constants.js` |
| Thông báo | `backend/src/services/notification-service.js`; chuông ở `frontend/js/app.js` |
| Voucher, giá xăng | `billing-service.js`, `admin-service.js` |
| Bản đồ | `frontend/js/map.js` (Leaflet + OpenStreetMap) |
| Mô phỏng vận hành | `backend/scripts/simulate.js` |
| Bảng, ràng buộc, index | `database/sql/schema.sql`, `database/docs/ERD_Specification.md` |
| Đọc/ghi MySQL, transaction | `database/src/mysql-store.js` |

## 6. Kiểm thử

```powershell
npm test             # cả ba bộ (~6 phút): backend trên RAM (27 test), backend trên MySQL (27 test), database (8 test, có 100 vòng tranh chấp)
npm run test:backend # chỉ backend trên RAM (~20 giây)
npm run coverage     # coverage các service backend
npm run benchmark    # đo NFR-01: 2 phút làm nóng + 10 phút đo
```

Test chỉ xóa các schema có đuôi `_test`; không đụng dữ liệu demo `gomeal_m3`.

## 7. Lỗi thường gặp

| Hiện tượng | Nguyên nhân / cách xử lý |
|---|---|
| Giao diện báo không kết nối được máy chủ | Backend chưa chạy (`npm start`), hoặc mở trang Live Server bằng `localhost:5500` thay vì `127.0.0.1:5500` (CORS) |
| Backend báo `ECONNREFUSED 127.0.0.1:3307` | MySQL chưa bật: chạy `npm start` ở gốc repo (tự bật), hoặc `mysql-local.ps1 start` |
| `npm run setup` báo không thấy `mysqld.exe` | Chưa cài MySQL Server 8, hoặc cài ở thư mục khác: đặt biến `MYSQL_BIN` trỏ tới thư mục `bin` rồi chạy lại |
| Báo `Cổng 3000 đang được chương trình khác dùng` | Còn một server cũ đang chạy; tắt cửa sổ đó (Ctrl+C) rồi chạy lại |
| Tài xế không nhận được lời mời | Chưa bật trực tuyến, vị trí cũ quá 2 phút, đang giữ đơn khác, hoặc chưa đủ 30 giây cho worker |
| Báo "Đơn đã thay đổi" (409) | Người khác vừa thao tác trên đơn; tải lại trang rồi làm tiếp |
| Đặt đơn bị yêu cầu nhập SĐT | Tài khoản chưa có số điện thoại; nhập 10 chữ số |
| Báo giá thay đổi khi đặt | Giá/món đổi sau khi xem giỏ; xem lại giỏ và xác nhận lại |
| Báo "ngoài phạm vi giao 10 km" | Điểm giao chọn quá xa nhà hàng; chọn lại điểm gần hơn trên bản đồ |
| Voucher báo lỗi | Đọc lý do ở dưới ô voucher: chưa đủ giá trị đơn, đã dùng, hết hạn, hoặc voucher riêng của khách khác |
| Bản đồ trống | Máy không có Internet hoặc mạng chặn tile.openstreetmap.org |
| Trang báo không tìm thấy bảng/cột | Server tự migrate khi khởi động; nếu vẫn lỗi, chạy `npm run migrate` ở gốc repo |
