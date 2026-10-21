# Việc của M4 — Kiểm thử và đảm bảo chất lượng

M4 phụ trách nghiệm thu độc lập theo mục 9 (NFR) và mục 13 (ca kiểm thử) của báo cáo: integration test API, Playwright E2E cho 4 vai trò, đo NFR còn thiếu, theo dõi lỗi và báo cáo kết quả. Test của M2 (27 ca) và M3 (8 ca) là test của người viết code; M4 kiểm lại từ bên ngoài, qua HTTP và giao diện, trên bản ghép cuối.

Đã có sẵn để dùng lại: `docs/HUONG-DAN-CHAY.md` (mở hệ thống), `docs/TRUY-VET.md` (yêu cầu → code → test), `backend/docs/API.md` (42 endpoint), `database/docs/M4-HANDOFF.md` và `TEST-RESULTS.md` (kết quả đo của M3), script `npm run benchmark` (NFR-01) và `npm run simulate` (mô phỏng vận hành).

## 1. Chuẩn bị môi trường

- Chạy được cả hệ thống: ở gốc repo `npm run setup` rồi `npm start`, giao diện và API cùng ở `http://127.0.0.1:3000`.
- Biến `tests/` thành gói workspace: tạo `tests/package.json` tên `@gomeal/tests`, thêm `"tests"` vào `workspaces` ở `package.json` gốc, rồi `npm i -D @playwright/test -w @gomeal/tests` và `npx playwright install chromium`. Thêm bước chạy E2E vào `.github/workflows/ci.yml` khi ổn định.
- **Dữ liệu cho E2E:** chạy backend với `STORE=memory` để mỗi lần khởi động có dữ liệu mẫu sạch, kết quả lặp lại được. Chạy thêm một vòng trên MySQL để kiểm dữ liệu còn sau khi khởi động lại.
- Không chạy test trên CSDL demo `gomeal_m3`. Nếu cần schema riêng cho E2E trên MySQL, nhờ M3 tạo `gomeal_e2e_test` và cấp quyền cho tài khoản `gomeal`.
- Ghi lại môi trường mỗi lần đo: máy, CPU, RAM, Node, MySQL, trình duyệt, thời điểm.

## 2. Bổ sung ca kiểm thử vào báo cáo (mục 13)

Bảng mục 13 mới có TC-01 đến TC-09, trong khi đợt 21/10/2026 thêm FR-15 đến FR-17 và mở rộng FR-05, FR-08, FR-14. M4 bổ sung các ca dưới đây, kèm đầu vào, kết quả mong đợi và kết quả thực tế cho mọi ca:

| Ca mới | Phạm vi | Kết quả bắt buộc |
|---|---|---|
| TC-10 | BR-03; FR-05, FR-16 | Phí đúng bậc km (1,3 km → 15.000đ; 4,4 km → 22.000đ; quá 10 km bị từ chối); đổi giá xăng thì phí đổi theo; tiền món ≥ 250.000đ giảm 50% phí, ≥ 500.000đ miễn phí; voucher trừ đúng tiền; voucher hết hạn, chưa đủ giá trị, của khách khác, đã dùng đều bị từ chối kèm lý do; hai đơn đồng thời dùng một voucher thì chỉ một đơn thành công; hủy đơn trả lại voucher. |
| TC-11 | FR-15 | Mỗi bước tạo thông báo cho đúng người (khách, quản lý, tài xế); có "Xác nhận đã thanh toán" (ví/thẻ khi đặt, tiền mặt khi giao xong); không đọc được thông báo của người khác; đánh dấu đã đọc đúng. Nút gọi nhanh mang đúng số điện thoại theo vai trò. |
| TC-12 | FR-17 | Bản đồ hiện tài xế từ lúc nhận đơn đến khi giao xong; trước khi có tài xế và sau khi giao xong thì API không trả vị trí tài xế; tài xế đang giao gửi vị trí 5 giây/lần. |
| TC-13 | FR-08 | Quản lý tải ảnh JPG/PNG/WEBP ≤ 2 MB thành công; file 3 MB, file không phải ảnh, quản lý nhà hàng khác đều bị từ chối; thành phần và mô tả lưu và hiện ở trang khách. |

## 3. Integration test API (qua HTTP)

Viết trong `tests/api-tests/` (node:test + fetch, hoặc `request` của Playwright), chạy trên backend `STORE=memory`.

- TC-01: đặt món có option; COD, ví và thẻ đều đúng tiền; tài khoản chưa có số điện thoại (`chuacosdt@gomeal.vn`) bị chặn; gửi lại cùng `requestKey` không tạo đơn thứ hai, cùng key khác nội dung trả 409.
- TC-03: đi hết chuỗi trạng thái hợp lệ; nhảy bước trả 400; sai vai trò, sai chủ sở hữu trả 403; `expectedVersion` cũ trả 409.
- TC-04: tài xế gần nhất được mời; bỏ qua hoặc hết 60 giây thì mời người kế tiếp; tài xế ngoại tuyến hoặc vị trí cũ quá 2 phút không được mời; hai tài xế cùng bấm nhận thì một người được, người kia 409.
- TC-05, TC-06, TC-09: COD phải xác nhận thu tiền; giao xong tài xế về AVAILABLE; hủy đúng quyền và trạng thái, REFUNDED/VOIDED đúng; tạm ngưng nhà hàng, khóa tài xế.
- TC-10 đến TC-13 như bảng trên.
- **TC-07, ma trận quyền (NFR-03):** với mỗi endpoint trong `API.md`, thử không token, token hết hạn, 4 vai trò, đúng và sai chủ sở hữu. Mức đạt 100%: bị từ chối, không lộ dữ liệu, không sửa được dữ liệu. Ghi thành bảng endpoint × trường hợp.

## 4. Playwright E2E cho 4 vai trò

Mỗi vai trò dùng một browser context riêng. Token lưu theo tab nên không đè nhau. Viết trong `tests/e2e/`.

| Kịch bản | Bước chính | Selector có sẵn |
|---|---|---|
| Đăng nhập theo vai trò | 4 tài khoản vào đúng trang; sai mật khẩu báo lỗi | `#email`, `#password`, `#submit-button`, `#form-error` |
| Khách đặt đơn | Thêm món, chọn option, chọn điểm giao, chọn voucher, đặt COD | `[data-a]`, `#optF`, `#checkout`, `#addr`, `#pickMap`, `#voucherSelect`, `#voucherCode`, `#voucherApply`, `#coSubmit`, `#doneD` |
| Nhà hàng xử lý | Xác nhận → chuẩn bị → sẵn sàng; hủy có lý do | `[data-next]`, `[data-cancel]`, `#cancel-form` |
| Tài xế nhận và giao | Bật trực tuyến (đặt geolocation của context gần nhà hàng), nhận lời mời, lấy món, giao, xác nhận thu tiền | `[data-availability]`, `[data-accept]`, `[data-decline]`, `[data-next]`, `#cod-collected`, `#simulate` |
| Khách theo dõi và tự hủy | Thấy trạng thái đổi; đơn chờ xác nhận tự hủy được | `.order-item`, `[data-cancel]`, `#cancel-form`, `.track-map` |
| Thông báo | Chuông tăng số khi có sự kiện; mở danh sách thì về 0 | `.notify-bell`, `.notify-badge`, `.notify-item` |
| Quản lý món | Thêm món có ảnh (`setInputFiles`), mô tả, thành phần; ngừng bán | `#add-menu-item`, `#item-form`, `#item-image`, `[data-edit]`, `[data-toggle]` |
| Quản trị | Tạm ngưng nhà hàng, khóa tài xế, đổi giá xăng, tạo và tắt voucher | `[data-restaurant]`, `[data-driver]`, `#fuel-form`, `#voucher-form`, `[data-voucher]` |

- Bản đồ cần Internet. Test chỉ kiểm có ghim (`.map-pin`) và dòng khoảng cách, không so ảnh nền bản đồ.
- Worker điều phối chạy 30 giây/lần, nhưng mỗi lần đổi trạng thái backend cũng điều phối ngay. Đặt timeout chờ lời mời khoảng 40 giây.
- Thêm kiểm tra cuộn ngang ở bề rộng 390 px cho 7 trang, và không có lỗi console.

## 5. Nghiệm thu NFR trên bản ghép cuối

| NFR | Việc của M4 |
|---|---|
| NFR-01 | Chạy lại `npm run benchmark` ở gốc repo trên môi trường ổn định, không chạy việc khác cùng lúc; lưu JSON, so với số M3 đã đo (p95 21–30 ms). |
| NFR-02, NFR-06 | Chạy lại `npm test` ở gốc repo (gồm test MySQL của backend và database); đối chiếu `NFR-02-results.json`, `NFR-06-results.json`. Thêm ca hai đơn đồng thời dùng một voucher. |
| NFR-03 | Ma trận quyền ở mục 3. |
| NFR-04 | `npm run coverage` ở gốc repo: Order Lifecycle, Dispatch, Billing mỗi module ≥ 70% dòng (lần chạy 21/10/2026: Billing 100%, Order Lifecycle 100%, Dispatch 99,64%). |
| NFR-05 | **Chưa ai đo.** Viết script Playwright: mở trang Đơn của tôi, đổi trạng thái qua API, đo từ lúc API trả về đến lúc nhãn trạng thái trên màn hình đổi. Làm ít nhất 100 lần, trong lúc chạy tải NFR-01. Mức đạt: p95 ≤ 5 giây (trang tự tải lại 4 giây/lần). |

## 6. Kiểm thử thăm dò và ca biên

- Điểm giao xa hơn 10 km; bấm "Dùng vị trí của tôi" khi trình duyệt từ chối quyền.
- Đổi giá xăng hoặc giá món trong lúc khách đang ở hộp đặt hàng: phải hiện PRICE_CHANGED và bắt xác nhận lại.
- Hai tab cùng dùng một voucher; hủy đơn rồi dùng lại voucher.
- Ảnh đúng 2 MB và trên 2 MB; file đổi đuôi `.jpg` nhưng không phải ảnh.
- Mất mạng lúc bấm đặt hàng rồi bấm lại.
- Tài xế đóng trang khi đang giao; tài xế bị khóa khi đang trực tuyến.
- Thử trên Chrome, Edge, Firefox và màn hình 390 px.

## 7. Theo dõi lỗi và hồi quy

- Mỗi lỗi ghi: mã, bước tái hiện, kết quả mong đợi và thực tế, mức độ, FR/NFR liên quan, người sửa (M1, M2 hoặc M3).
- Sửa xong thì chạy lại ca liên quan và toàn bộ bộ test tự động (`npm test` ở gốc repo, CI chạy lại trên mỗi Pull Request), cùng E2E của M4.

## 8. Bàn giao cuối (tuần 7–8)

- `tests/TEST-REPORT.md`: kết quả TC-01 đến TC-13, ma trận quyền, số đo NFR-01 đến NFR-06 kèm môi trường, danh sách lỗi và trạng thái.
- Cập nhật báo cáo: mục 13 (thêm TC-10 đến TC-13 và kết quả thực tế), mục 16.8 (kết quả Playwright).
- Kịch bản demo cho buổi trình bày: dùng `npm run simulate -- --orders 4 --every 15` để có nhiều đơn và tài xế chạy trên bản đồ, kết hợp thao tác tay bằng `khach@gomeal.vn`, `nhahang@gomeal.vn`, `taixe@gomeal.vn`, `admin@gomeal.vn`.

## Lưu ý

- Test của M2/M3 chỉ xóa schema có đuôi `_test`. Không chạy hai bộ test MySQL cùng lúc trên cùng một schema.
- Instance MySQL ở cổng 3307 dùng tài khoản root không mật khẩu và chỉ nghe trên máy này. Không mở ra mạng.
- Không commit `.env`, `uploads/`, `node_modules/`, video hay trace của Playwright.
