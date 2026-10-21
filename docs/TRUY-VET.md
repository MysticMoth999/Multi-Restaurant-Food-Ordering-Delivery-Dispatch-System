# Bảng truy vết yêu cầu → mã nguồn → kiểm thử

Mỗi yêu cầu chức năng (FR) và phi chức năng (NFR) trong báo cáo (mục 6, 9, 13) được thực hiện ở đâu và được kiểm bằng test nào. Test tự động chạy bằng `npm test` ở gốc repo và trên GitHub Actions mỗi Pull Request. Cột TC là ca kiểm thử nghiệm thu của M4 (TC-10 đến TC-13 do M4 bổ sung, xem `tests/README.md`).

Viết tắt file test: **core** = `backend/test/core.test.js`, **http** = `backend/test/http.test.js`, **audit** = `backend/test/audit.test.js`, **feat** = `backend/test/features.test.js`, **db** = `database/test/database.test.js`, **restart** = `database/test/restart.test.js`.

## Yêu cầu chức năng

| Mã | Nội dung | Giao diện (`frontend/`) | Backend (`backend/src/`) | CSDL (`database/sql/`) | Test tự động | TC |
|---|---|---|---|---|---|---|
| FR-01 | Đăng ký, đăng nhập bằng email | `login.html`, `js/login.js` | `services/auth-service.js`, route `/api/auth/*` | users, sessions | http: Ownership, token expiry…; audit: Auth expired sessions | TC-07 |
| FR-02 | Duyệt nhà hàng, lọc 5 km, xem menu | `index.html`, `hokkaidosachi.html` | `services/catalog-service.js` | restaurants (POINT + spatial index), menu_items, menu_options | http: Catalog/menu/options…; db: indexed location… | TC-08 |
| FR-03 | Giỏ hàng một nhà hàng, option | `js/menu.js` | `services/cart-service.js`, `billing-service.js` (normalizeItems) | carts | audit: Cart HTTP…; core: Billing canonical options… | TC-01 |
| FR-04 | Tạo đơn (CreateOrder), idempotency | `js/menu.js` (hộp đặt hàng) | `services/order-service.js` (create) | orders, order_items, payments, order_history | core: CreateOrder replay…, 20 injected failures; db: NFR-02… | TC-01, TC-02 |
| FR-05 | Tính tiền: tiền món, phí giao theo km × giá xăng, giảm theo giá trị đơn | `js/menu.js` (chỉ hiển thị số backend trả) | `services/billing-service.js`, `domain/constants.js` | orders (subtotal, delivery_fee, discount, total, CHECK) | core: Billing correct VND…; feat: Delivery fee… | TC-01, TC-10 |
| FR-06 | Thanh toán mô phỏng COD / ví / thẻ | `js/menu.js` | `services/payment-service.js` | payments | core: Mock FAILED rolls back… | TC-01, TC-02 |
| FR-07 | Khách xem đơn, lịch sử 20 đơn/trang | `orders.html`, `js/orders.js` | `services/order-service.js` (mine, get) | orders, order_history | http: HTTP full lifecycle… | (M4 bổ sung) |
| FR-08 | Quản lý món, option, ảnh, thành phần | `restaurant-management.html`, `js/restaurant.js` | `services/catalog-service.js` (saveItem, saveOption, setImage) | menu_items (image_url, ingredients), menu_options | http: Catalog/menu/options…; feat: Menu image upload… | TC-13 |
| FR-09 | Chuyển trạng thái đơn đúng quy trình, version | `js/restaurant.js`, `js/driver.js` | `services/order-service.js` (transition) | orders (version), order_history | core: Order transitions enforce… | TC-03 |
| FR-10 | Mời tài xế gần nhất, hết hạn, thử lại | (worker chạy ngầm) | `services/dispatch-service.js` (tick, offerNearest) | driver_offers (UNIQUE lời mời đang chờ), dispatch_skips, drivers | core: Dispatch Haversine…, older updated_at…; audit: Dispatch ×3; http: 100 HTTP dispatch rounds; db: NFR-06…, indexed location… | TC-04 |
| FR-11 | Tài xế trực tuyến, nhận/bỏ qua, giao, COD | `driver.html`, `js/driver.js` | `services/dispatch-service.js` (setStatus, respond, board) | drivers, orders | core: Delivery COD confirmation…; db: assignment, refund, completion… | TC-05 |
| FR-12 | Xác thực, phân quyền, chủ sở hữu | mọi trang (`js/app.js` requireRole) | `app.js` (identify, role), kiểm chủ sở hữu trong service | sessions | http: Sensitive API role matrix…, Ownership… | TC-07 |
| FR-13 | Hủy đơn đúng quyền, hoàn/hủy thu tiền | `js/orders.js`, `js/restaurant.js` | `services/order-service.js` (cancel), `payment-service.js` | orders, payments, voucher_redemptions | core: Mock FAILED… refunds and voids, Atomic rollback… | TC-06 |
| FR-14 | Quản trị: nhà hàng, tài xế, giá xăng, voucher | `admin.html`, `js/admin.js` | `services/admin-service.js` | restaurants, drivers, activity, settings, vouchers | http: Catalog/menu/options/admin…; feat: Delivery fee (giá xăng), Vouchers | TC-09 |
| FR-15 | Thông báo, xác nhận đã thanh toán, gọi nhanh | `js/app.js` (chuông), nút gọi ở `orders.js`, `driver.js`, `restaurant.js` | `services/notification-service.js`, route `/api/notifications` | notifications | feat: Notifications… | TC-11 |
| FR-16 | Voucher | `js/menu.js`, `js/admin.js` | `services/billing-service.js` (usableVoucher), `admin-service.js` | vouchers, voucher_redemptions (UNIQUE voucher + khách) | feat: Vouchers… | TC-10 |
| FR-17 | Theo dõi vị trí tài xế trên bản đồ | `js/map.js`, `js/orders.js`, `js/driver.js` | `adapters/order-view.js` (driverLocation), `dispatch-service.js` (updateLocation) | drivers (lat, lng, location_at), orders (delivery_lat, delivery_lng) | feat: Tracking… | TC-12 |

## Yêu cầu phi chức năng

| Mã | Cách đo / kiểm | Bằng chứng |
|---|---|---|
| NFR-01 | `npm run benchmark`: 100 người dùng ảo, 2 phút làm nóng + 10 phút đo | `database/docs/NFR-01-results.json`, `database/docs/TEST-RESULTS.md` |
| NFR-02 | 20 ca chèn lỗi khi tạo đơn + Mock FAILED, so toàn bộ bảng | core: 20 injected…; db: NFR-02…; `database/docs/NFR-02-results.json` |
| NFR-03 | Ma trận quyền API | http: Sensitive API role matrix…; ma trận đầy đủ do M4 làm (`tests/README.md`) |
| NFR-04 | Coverage service ≥ 70% | `npm run coverage`; `backend/docs/TEST-RESULTS.md` |
| NFR-05 | Độ trễ hiển thị trạng thái ≤ 5 giây (p95) | Chưa đo — việc của M4 (`tests/README.md`, mục 5) |
| NFR-06 | 100 vòng 20 đơn / 5 tài xế nhận đồng thời | http: 100 HTTP dispatch rounds; db: NFR-06…; `database/docs/NFR-06-results.json` |
