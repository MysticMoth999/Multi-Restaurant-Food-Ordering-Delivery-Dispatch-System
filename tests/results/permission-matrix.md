# Ma trận quyền TC-07 (NFR-03)

Kết quả: **203/203** ca đạt (100%).

| Endpoint | Trường hợp | Mong đợi | Thực tế | Kết quả |
|---|---|---:|---:|---|
| GET /me | không token | 401 | 401 | PASS |
| GET /me | token giả | 401 | 401 | PASS |
| PATCH /me | không token | 401 | 401 | PASS |
| PATCH /me | token giả | 401 | 401 | PASS |
| POST /auth/logout | không token | 401 | 401 | PASS |
| POST /auth/logout | token giả | 401 | 401 | PASS |
| GET /notifications | không token | 401 | 401 | PASS |
| GET /notifications | token giả | 401 | 401 | PASS |
| POST /notifications/read | không token | 401 | 401 | PASS |
| POST /notifications/read | token giả | 401 | 401 | PASS |
| GET /vouchers/mine | không token | 401 | 401 | PASS |
| GET /vouchers/mine | token giả | 401 | 401 | PASS |
| GET /vouchers/mine | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| GET /vouchers/mine | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| GET /vouchers/mine | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| GET /cart | không token | 401 | 401 | PASS |
| GET /cart | token giả | 401 | 401 | PASS |
| GET /cart | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| GET /cart | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| GET /cart | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /cart/items | không token | 401 | 401 | PASS |
| POST /cart/items | token giả | 401 | 401 | PASS |
| POST /cart/items | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| POST /cart/items | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /cart/items | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| PATCH /cart/items | không token | 401 | 401 | PASS |
| PATCH /cart/items | token giả | 401 | 401 | PASS |
| PATCH /cart/items | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| PATCH /cart/items | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| PATCH /cart/items | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /cart/items/remove | không token | 401 | 401 | PASS |
| POST /cart/items/remove | token giả | 401 | 401 | PASS |
| POST /cart/items/remove | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| POST /cart/items/remove | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /cart/items/remove | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| DELETE /cart | không token | 401 | 401 | PASS |
| DELETE /cart | token giả | 401 | 401 | PASS |
| DELETE /cart | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| DELETE /cart | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| DELETE /cart | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /orders | không token | 401 | 401 | PASS |
| POST /orders | token giả | 401 | 401 | PASS |
| POST /orders | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| POST /orders | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /orders | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| GET /orders/mine | không token | 401 | 401 | PASS |
| GET /orders/mine | token giả | 401 | 401 | PASS |
| GET /orders/mine | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| GET /orders/mine | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| GET /orders/mine | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| GET /orders/1 | không token | 401 | 401 | PASS |
| GET /orders/1 | token giả | 401 | 401 | PASS |
| GET /orders/1 | customer2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| GET /orders/1 | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| GET /orders/1 | driver (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| POST /orders/1/cancel | không token | 401 | 401 | PASS |
| POST /orders/1/cancel | token giả | 401 | 401 | PASS |
| POST /orders/1/cancel | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| POST /orders/1/cancel | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /orders/1/cancel | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /orders/1/cancel | customer2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| POST /manager/orders/1/cancel | không token | 401 | 401 | PASS |
| POST /manager/orders/1/cancel | token giả | 401 | 401 | PASS |
| POST /manager/orders/1/cancel | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/orders/1/cancel | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/orders/1/cancel | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /manager/orders/1/cancel | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| POST /orders/1/transitions | không token | 401 | 401 | PASS |
| POST /orders/1/transitions | token giả | 401 | 401 | PASS |
| POST /orders/1/transitions | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /orders/1/transitions | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /orders/1/transitions | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| GET /manager/dashboard | không token | 401 | 401 | PASS |
| GET /manager/dashboard | token giả | 401 | 401 | PASS |
| GET /manager/dashboard | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| GET /manager/dashboard | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| GET /manager/dashboard | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| GET /manager/dashboard | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| POST /manager/menu | không token | 401 | 401 | PASS |
| POST /manager/menu | token giả | 401 | 401 | PASS |
| POST /manager/menu | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| POST /manager/menu/1/image | không token | 401 | 401 | PASS |
| POST /manager/menu/1/image | token giả | 401 | 401 | PASS |
| POST /manager/menu/1/image | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu/1/image | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu/1/image | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu/1/image | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| PATCH /manager/menu/1 | không token | 401 | 401 | PASS |
| PATCH /manager/menu/1 | token giả | 401 | 401 | PASS |
| PATCH /manager/menu/1 | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PATCH /manager/menu/1 | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| PATCH /manager/menu/1 | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| PATCH /manager/menu/1 | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| POST /manager/menu/1/options | không token | 401 | 401 | PASS |
| POST /manager/menu/1/options | token giả | 401 | 401 | PASS |
| POST /manager/menu/1/options | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu/1/options | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu/1/options | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /manager/menu/1/options | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| PATCH /manager/menu/1/options/1 | không token | 401 | 401 | PASS |
| PATCH /manager/menu/1/options/1 | token giả | 401 | 401 | PASS |
| PATCH /manager/menu/1/options/1 | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PATCH /manager/menu/1/options/1 | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| PATCH /manager/menu/1/options/1 | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| PATCH /manager/menu/1/options/1 | manager2 (đúng vai trò, sai chủ sở hữu) | 403 | 403 | PASS |
| PUT /driver/status | không token | 401 | 401 | PASS |
| PUT /driver/status | token giả | 401 | 401 | PASS |
| PUT /driver/status | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PUT /driver/status | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| PUT /driver/status | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| PUT /driver/location | không token | 401 | 401 | PASS |
| PUT /driver/location | token giả | 401 | 401 | PASS |
| PUT /driver/location | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PUT /driver/location | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| PUT /driver/location | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| GET /driver/board | không token | 401 | 401 | PASS |
| GET /driver/board | token giả | 401 | 401 | PASS |
| GET /driver/board | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| GET /driver/board | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| GET /driver/board | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /driver/offers/1/accept | không token | 401 | 401 | PASS |
| POST /driver/offers/1/accept | token giả | 401 | 401 | PASS |
| POST /driver/offers/1/accept | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /driver/offers/1/accept | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| POST /driver/offers/1/accept | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| POST /driver/offers/1/decline | không token | 401 | 401 | PASS |
| POST /driver/offers/1/decline | token giả | 401 | 401 | PASS |
| POST /driver/offers/1/decline | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /driver/offers/1/decline | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| POST /driver/offers/1/decline | vai trò ADMIN (sai vai trò) | 403 | 403 | PASS |
| GET /admin/dashboard | không token | 401 | 401 | PASS |
| GET /admin/dashboard | token giả | 401 | 401 | PASS |
| GET /admin/dashboard | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| GET /admin/dashboard | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| GET /admin/dashboard | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/restaurants/1 | không token | 401 | 401 | PASS |
| PATCH /admin/restaurants/1 | token giả | 401 | 401 | PASS |
| PATCH /admin/restaurants/1 | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/restaurants/1 | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/restaurants/1 | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/drivers/1 | không token | 401 | 401 | PASS |
| PATCH /admin/drivers/1 | token giả | 401 | 401 | PASS |
| PATCH /admin/drivers/1 | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/drivers/1 | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/drivers/1 | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/settings | không token | 401 | 401 | PASS |
| PATCH /admin/settings | token giả | 401 | 401 | PASS |
| PATCH /admin/settings | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/settings | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/settings | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| GET /admin/vouchers | không token | 401 | 401 | PASS |
| GET /admin/vouchers | token giả | 401 | 401 | PASS |
| GET /admin/vouchers | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| GET /admin/vouchers | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| GET /admin/vouchers | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| POST /admin/vouchers | không token | 401 | 401 | PASS |
| POST /admin/vouchers | token giả | 401 | 401 | PASS |
| POST /admin/vouchers | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| POST /admin/vouchers | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| POST /admin/vouchers | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/vouchers/1 | không token | 401 | 401 | PASS |
| PATCH /admin/vouchers/1 | token giả | 401 | 401 | PASS |
| PATCH /admin/vouchers/1 | vai trò CUSTOMER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/vouchers/1 | vai trò MANAGER (sai vai trò) | 403 | 403 | PASS |
| PATCH /admin/vouchers/1 | vai trò DRIVER (sai vai trò) | 403 | 403 | PASS |
| GET /me | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /me | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /auth/logout | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /notifications | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /notifications/read | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /vouchers/mine | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /cart | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /cart/items | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /cart/items | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /cart/items/remove | token hết hạn (61 phút) | 401 | 401 | PASS |
| DELETE /cart | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /orders | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /orders/mine | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /orders/1 | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /orders/1/cancel | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /manager/orders/1/cancel | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /orders/1/transitions | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /manager/dashboard | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /manager/menu | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /manager/menu/1/image | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /manager/menu/1 | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /manager/menu/1/options | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /manager/menu/1/options/1 | token hết hạn (61 phút) | 401 | 401 | PASS |
| PUT /driver/status | token hết hạn (61 phút) | 401 | 401 | PASS |
| PUT /driver/location | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /driver/board | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /driver/offers/1/accept | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /driver/offers/1/decline | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /admin/dashboard | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /admin/restaurants/1 | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /admin/drivers/1 | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /admin/settings | token hết hạn (61 phút) | 401 | 401 | PASS |
| GET /admin/vouchers | token hết hạn (61 phút) | 401 | 401 | PASS |
| POST /admin/vouchers | token hết hạn (61 phút) | 401 | 401 | PASS |
| PATCH /admin/vouchers/1 | token hết hạn (61 phút) | 401 | 401 | PASS |
