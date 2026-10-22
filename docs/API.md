# Hợp đồng API M2

Base URL `http://127.0.0.1:3000/api`. Body JSON, tối đa 32 KB. Timestamp là Unix milliseconds; tiền là VND nguyên; khoảng cách là km. ID là số nguyên dương.

Thành công: `{ "data": ... }`. Lỗi: `{ "code": "CONFLICT", "error": "...", "requestId": "..." }`; PRICE_CHANGED có `data.quote` mới. Tất cả phản hồi có `X-Request-Id`. Không trả stack, SQL, mật khẩu hay token trong log.

API có xác thực dùng `Authorization: Bearer <token>`. Backend lấy userId/role từ phiên; các trường actorId/customerId/role client gửi không cấp thêm quyền. 401 = thiếu/hết hạn token; 403 = sai vai trò/chủ sở hữu; 400 = dữ liệu/quy trình sai; 404 = không tìm thấy; 409 = xung đột version/key/giá/lời mời; 422 = mock FAILED; 429 = quá 30 lần đăng ký/đăng nhập mỗi IP/phút trên tiến trình hiện tại.

## Tài khoản

| Method | Path | Quyền | Body/kết quả |
|---|---|---|---|
| POST | /auth/register | Công khai | `{name,email,password,phone?}` → `{user}`; luôn tạo CUSTOMER |
| POST | /auth/login | Công khai | `{email,password}` → `{token,expiresAt,user}` |
| POST | /auth/logout | Đăng nhập | `{}`; hủy phiên hiện tại |
| GET | /me | Đăng nhập | `{user}` |
| PATCH | /me | Đăng nhập | `{phone:"0912345678"}` → `{user}` |

Email không phân biệt hoa thường. Mật khẩu 6–128 ký tự, phone nếu có gồm 10 chữ số. Token 60 phút. Manager/Driver/Admin chỉ tạo qua fixture demo/provisioning của hệ thống, không qua đăng ký công khai.

## Danh mục và báo giá

| Method | Path | Quyền | Chi tiết |
|---|---|---|---|
| GET | /restaurants?q=...&page=1 | Công khai | ACTIVE, 20/trang; tìm theo tên; có thể thêm `lat,lng`, lọc 5 km, gần trước |
| GET | /restaurants/:id/menu | Công khai | `{restaurant,items}`; món có `options:[{id,name,surcharge,available}]` |
| POST | /cart/quote | Công khai | `{restaurantId,items}` → quote bên dưới |
| GET | /manager/dashboard?restaurantId=1 | MANAGER sở hữu | `{restaurant,items,orders}`; tối đa 100 đơn mới nhất |
| POST | /manager/menu | MANAGER | `{restaurantId?,name,price,categoryId?,description?,available?}` → `{item}` |
| PATCH | /manager/menu/:id | MANAGER sở hữu | Các trường sửa của món; không xóa vật lý, đặt available=false |
| POST | /manager/menu/:id/options | MANAGER sở hữu | `{name,surcharge,available?}` → `{item}` |
| PATCH | /manager/menu/:id/options/:optionId | MANAGER sở hữu | `{name?,surcharge?,available?}` → `{item}` |

Các option độc lập và tùy chọn trong bản này, chưa có nhóm radio/min-max bắt buộc. Nếu M1 cần nhóm option như prototype, M1/M2/M3 phải thống nhất mở rộng hợp đồng dữ liệu. Không gửi ID dạng `sauce-shoyu`; ID backend là số lấy từ menu API.

Ví dụ body báo giá:

```json
{
  "restaurantId": 1,
  "items": [{"menuItemId": 1, "quantity": 2, "selectedOptionIds": [1]}]
}
```

Kết quả có `lines`, `subtotal:110000`, `deliveryFee:15000`, `total:125000`, `quoteFingerprint` (chuỗi hash). Mỗi dòng có menuItemId, name, options snapshot, unitPrice, quantity, lineTotal. `optionIds` được nhận như alias đầu vào của selectedOptionIds; nếu gửi cả hai phải giống nhau. Số lượng 1–99; cùng món và cùng bộ option được gộp, tổng gộp không vượt 99; khác option giữ riêng. Giỏ tối đa 100 dòng. Không tin giá/total do client gửi.

## Đơn hàng

| Method | Path | Quyền | Body/kết quả |
|---|---|---|---|
| POST | /orders | CUSTOMER | Tạo đơn theo mẫu bên dưới → `{order,replayed}` |
| GET | /orders/mine?page=1 | CUSTOMER | `{items,page,pageSize:20,total}`, mới trước |
| GET | /orders/:id | CUSTOMER sở hữu; MANAGER của nhà hàng; DRIVER được gán; ADMIN | `{order}` |
| POST | /orders/:id/cancel | CUSTOMER sở hữu | `{expectedVersion,reason?}`; chỉ PENDING |
| POST | /manager/orders/:id/cancel | MANAGER sở hữu | `{expectedVersion,reason}`; PENDING/CONFIRMED, lý do bắt buộc |
| POST | /orders/:id/transitions | MANAGER hoặc DRIVER sở hữu | `{targetStatus,expectedVersion,codCollected?}` |

Ví dụ tạo đơn (lấy fingerprint thực từ quote, không chép chữ placeholder):

```json
{
  "restaurantId": 1,
  "items": [{"menuItemId":1,"quantity":2,"selectedOptionIds":[1]}],
  "deliveryAddress": "18 Lê Văn Sỹ, Quận 3",
  "paymentMethod": "COD",
  "requestKey": "uuid-do-client-tao-mot-lan-cho-lan-dat-nay",
  "quoteFingerprint": "gia-tri-trong-phan-hoi-cart-quote"
}
```

Giữ nguyên requestKey và body khi retry do lỗi mạng. Cùng khách/key/nội dung trả bản kết quả tạo đơn ban đầu, không tạo đơn khác. Cùng key khác nội dung trả 409. Nếu PRICE_CHANGED: hiển thị báo giá mới, yêu cầu người dùng xác nhận lại rồi tạo yêu cầu mới; không tự động xác nhận thay khách. Fingerprint kiểm dữ liệu giá/option/tên đã thay đổi; không phải cơ chế phân quyền.

Order có `id`, `orderId`, `code`, `status`, `orderStatus`, `version`, `subtotal`, `deliveryFee`, `total`, `paymentMethod`, `paymentStatus`, `transactionId`, `lines`, `history`, `restaurant`, `driverId`, `driverName`, `customerName`, `deliveryAddress`, `contactPhone`, `cancelReason`, `createdAt`, `updatedAt`. `lines[].options` là mảng object `{id,name,surcharge}`. Không có ảnh/rating giả lập trong backend này.

Luồng Manager: PENDING → CONFIRMED → PREPARING → READY_FOR_PICKUP. READY_FOR_PICKUP → DRIVER_ASSIGNED chỉ qua API nhận lời mời. Luồng Driver: DRIVER_ASSIGNED → PICKED_UP → DELIVERING → DELIVERED. Mỗi lần gửi expectedVersion lấy từ order đang hiển thị. Không tự lấy version mới rồi gửi lại thao tác cũ khi nhận 409; tải lại và để người dùng quyết định.

Hoàn tất COD cần `codCollected:true`: xác nhận đã thu đủ total đang hiển thị; Payment SUCCESS + Driver AVAILABLE + lịch sử + Order DELIVERED cùng transaction. Gửi lại hoàn tất cho đúng tài xế/đơn DELIVERED trả đơn hiện tại và không thu/ghi lịch sử lần hai. Hủy mock SUCCESS → REFUNDED; COD PENDING → VOIDED; không gọi cổng thanh toán thật.

## Driver và Dispatch

| Method | Path | Quyền | Body/kết quả |
|---|---|---|---|
| PUT | /driver/status | DRIVER | `{status:"AVAILABLE",location:{lat,lng}}` hoặc `{status:"OFFLINE"}` |
| PUT | /driver/location | DRIVER đang online | `{lat,lng}`; timestamp lấy từ server |
| GET | /driver/board | DRIVER | `{driver,offer,active,history,summary}` |
| POST | /driver/offers/:offerId/accept | DRIVER được mời | `{}` → `{order}` |
| POST | /driver/offers/:offerId/decline | DRIVER được mời | `{}` → `{declined:true,orderId}` |

`offer` trong board có thông tin đơn + **offerId**, expiresAt, distanceKm. `offer.id` vẫn là **orderId**; đường dẫn nhận/bỏ qua phải dùng `offer.offerId`. Không suy đoán hai ID giống nhau. Chỉ lời mời PENDING còn hạn và đúng tài xế AVAILABLE mới nhận được. Bỏ qua hoặc hết hạn thì chọn người tiếp theo. Không còn ai: giữ đơn chờ và thử lại sau 30 giây với toàn bộ tài xế. Lọc vị trí mới trong 2 phút, không khóa, không giữ lời mời khác. Hòa khoảng cách: updated_at cũ hơn rồi driverId nhỏ hơn.

Client gửi vị trí mỗi 30 giây khi AVAILABLE/BUSY; OFFLINE không gửi. BUSY không tự chuyển AVAILABLE/OFFLINE. Worker tự chạy, không có endpoint công khai để gọi worker hoặc chọn tài xế bất kỳ.

## Admin

| Method | Path | Body |
|---|---|---|
| GET | /admin/dashboard | Không; trả summary, orders (100 mới nhất), restaurants, drivers, activity (50 mới nhất) |
| PATCH | /admin/restaurants/:id | `{status:"ACTIVE"}` hoặc INACTIVE |
| PATCH | /admin/drivers/:id | `{locked:true}` hoặc false |

Đều cần ADMIN. Khóa Driver BUSY bị 409. Khóa tài xế thu hồi phiên và lời mời đang giữ. Tạm ngưng nhà hàng chặn duyệt và tạo đơn mới, không tự hủy đơn đã tạo. Không có `/admin/reset` và không có API cấp quyền từ client.


## Giỏ phía server — bổ sung audit 18/10/2026

Các endpoint sau cần token CUSTOMER, danh tính lấy từ token, bỏ qua customerId gửi trong body:

| Method | Endpoint | Body |
|---|---|---|
| GET | /api/cart | Không có |
| POST | /api/cart/items | {restaurantId, item: {menuItemId, quantity, selectedOptionIds}} |
| PATCH | /api/cart/items | {line: {menuItemId, selectedOptionIds}, item: {menuItemId, quantity, selectedOptionIds}} |
| POST | /api/cart/items/remove | {line: {menuItemId, selectedOptionIds}} |
| DELETE | /api/cart | Không có |

line định danh dòng cũ bằng món và tập option; item là dòng thay thế đầy đủ. Cùng món/cùng option thì gộp số lượng, khác option thì tách dòng. Giỏ có món nhà hàng khác trả 409; không tự xóa. GET trả {restaurantId, items}; thao tác ghi giỏ không rỗng trả thêm quote mới. Giỏ rỗng trả {restaurantId:null, items:[]} và không tính phí giao. Checkout gửi items của giỏ cùng quoteFingerprint tới POST /api/orders như trước. Giỏ không tự xóa sau tạo đơn; M1 gọi DELETE /api/cart sau khi nhận tạo đơn thành công.

Khách chưa đăng nhập vẫn được chọn món tại UI và POST /api/cart/quote; khi đăng nhập M1 đồng bộ qua API giỏ. Chưa có lưu bền vì adapter chỉ dùng RAM.

POST /api/orders/:id/transitions trả data gồm order, orderId, previousStatus, currentStatus, updatedAt. Khi gửi lại DELIVERED, trả thông tin lần hoàn tất đã có, không thêm lịch sử.
