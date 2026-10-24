> Bản ghi kiểm thử ngày 22/10/2026. Ngày 24/10 Hưng cho phép push bản này lên M2; các câu “chưa push” bên dưới mô tả thời điểm kiểm thử. M2 tự kiểm tra/sửa nghiệp vụ, M4 phụ trách nghiệm thu kiểm thử tích hợp.

# Nhóm 7 — Kiểm thử tĩnh, kiểm thử động và AI trên M2

Ngày thực hiện: 22/10/2026. Phạm vi: bản backend M2 dùng Node.js, Express và dữ liệu giả trong RAM. Không sửa database M3, không commit/push và không cập nhật PR.

Đã áp dụng công cụ vào mã nguồn, tìm và sửa 3 lỗi qua AI review có test tái hiện. Kết quả cuối: kiểm tra tĩnh không còn cảnh báo theo cấu hình đã chọn; 22/22 test động đạt. Đây là kết quả của phạm vi kiểm thử đã chạy, không phải chứng nhận phần mềm hết lỗi.

## 1. Công cụ đã dùng

| Nhóm | Công cụ và cách áp dụng | Bằng chứng |
|---|---|---|
| Tĩnh | node --check kiểm cú pháp, không chạy nghiệp vụ | reports/syntax-after.txt |
| Tĩnh | ESLint 10.13.0, @eslint/js 10.0.1; recommended và rule cấm eval, Function động, khối rỗng, so sánh lỏng | eslint.config.js; reports/static-before.json và static-after.json |
| Tĩnh | eslint-plugin-sonarjs 4.2.2; 5 rule kiểm hàm trùng, các nhánh trùng toàn bộ, ghi đè phần tử, biểu thức vô ích và dùng giá trị trả về rỗng | Cấu hình có tên từng rule, cùng báo cáo ESLint |
| Động | node:test + assert; test service, HTTP server, auth và script demo | test/*.test.js; reports/dynamic-after.txt |
| Động | Coverage V8 của Node, ngưỡng line coverage service tối thiểu 70% | npm run quality; reports/quality-summary.json |
| AI hỗ trợ | Tú đọc mã, lập giả thuyết lỗi, viết test chứng minh, sửa mã rồi chạy lại | test/ai-regression.test.js; reports/ai-before.txt |

ESLint đã quét 25 file JavaScript, gồm mã nguồn, script, test và cấu hình. Không có bước gửi source lên một dịch vụ AI ngoài cuộc trao đổi này. Không thêm AI vào API đặt món và không cần API key để chạy test.

**Phân biệt với slide:** Fagan là quy trình inspection có con người, không phải chương trình quét mã. SonarJS dùng qua ESLint không phải SonarLint/SonarQube for IDE. JUnit thuộc hệ Java; M2 dùng JavaScript nên dùng node:test. Selenium phục vụ kiểm thử qua trình duyệt; bản này chưa ghép UI M1 nên chưa chạy Selenium/Playwright và không ghi nhận kết quả UI giả.

## 2. Kết quả thực tế

| Phép kiểm | Trước sửa | Sau sửa |
|---|---|---|
| Phân tích tĩnh tự động | 1 lỗi no-unused-vars tại src/app.js:350 | 0 error, 0 warning |
| 3 test hồi quy do AI đề xuất | 0/3 đạt; có log lỗi thực tế | 3/3 đạt, nằm trong bộ test đầy đủ |
| Toàn bộ test động cuối | Không dùng lần chạy cũ để thay kết quả mới | 22/22 đạt, 0 fail, 0 skip |
| Line coverage các service | Không so sánh do đã thêm mã và test | 98,97% |
| Branch coverage các service | Không so sánh do đã thêm mã và test | 97,45% |

Coverage chỉ tính src/services/*.js, không tính controller, adapter RAM, script hay test vào mẫu số này. Không gọi đây là coverage toàn dự án. Ngưỡng 70% được kiểm bằng cờ --test-coverage-lines=70; tiến trình trả lỗi nếu test hỏng hoặc coverage thấp hơn ngưỡng.

Môi trường: Windows 10.0.19045, Node.js v24.19.0, Intel Core i5-6200U, RAM 12 GiB. Lần chạy cuối: kiểm cú pháp khoảng 2,05 giây, phân tích tĩnh 2,52 giây, test động kèm coverage 27,42 giây. Đây là thời gian công cụ trên máy này; không phải số đo tải, thời gian phản hồi API hoặc chi phí phổ quát của hai loại kiểm thử.

## 3. Lỗi tìm được và sửa như thế nào

### ST-01 — Tham số next không dùng trong middleware lỗi

Nguồn phát hiện: ESLint, mức nhẹ về chất lượng mã. Vị trí: src/app.js:350. Express nhận diện error middleware bằng đủ 4 tham số; không được xóa tham số thứ tư chỉ để làm lint xanh. Đổi tên thành _next và cấu hình argsIgnorePattern cho tham số cố ý không dùng. Báo cáo tĩnh sau sửa không còn lỗi; test HTTP tiếp tục đạt.

### AI-01 — optionIds sai kiểu gây HTTP 500

Nguồn phát hiện: AI đọc normalizeItems, mức trung bình. Code chọn selectedOptionIds để kiểm kiểu, nhưng khi cả hai alias có mặt lại dùng spread với optionIds mà chưa xác nhận nó là mảng. Payload có selectedOptionIds: [1] và optionIds: 123 làm phát sinh TypeError.

- Mong đợi: HTTP 400 với code VALIDATION vì đầu vào sai.
- Trước sửa: test quan sát HTTP 500.
- Sửa: kiểm cả hai alias nếu có mặt trước khi duyệt hoặc so sánh. Vị trí hiện tại: src/services/billing-service.js:18.
- Sau sửa: test lần lượt thử số, object, boolean và chuỗi; đều trả 400. Không bắt lỗi bằng catch rỗng hoặc đổi mọi lỗi thành 400.

### AI-02 — Mật khẩu bị tự cắt khoảng trắng

Nguồn phát hiện: AI đọc AuthService, mức trung bình. Hàm text() trả value.trim(), nhưng lại được dùng cho password khi đăng ký và đăng nhập. Vì vậy mật khẩu có khoảng trắng đầu/cuối bị coi như mật khẩu không có khoảng trắng.

- Test: đăng ký với " secret123 ", thử đăng nhập bằng "secret123".
- Mong đợi: từ chối; hai chuỗi là hai mật khẩu khác nhau.
- Trước sửa: đăng nhập thành công ngoài mong đợi.
- Sửa: hàm passwordValue giữ nguyên chuỗi, kiểm kiểu/độ dài và từ chối chuỗi chỉ có khoảng trắng. Vị trí: src/services/auth-service.js:14.
- Sau sửa: mật khẩu khác bị từ chối, mật khẩu chính xác đăng nhập được. Test cũ cũng bắt lỗi 400/401 trong lần sửa đầu; đã giữ HTTP 401 cho mật khẩu sai không rỗng nhưng ngắn. Không thay test cũ để che lỗi.

Các tài khoản có mật khẩu bị trim từ bản cũ, nếu được lưu bền ở một hệ thống khác, cần xử lý khi tích hợp. Bản M2 này dùng RAM và nạp lại fixture nên không có migration database.

### AI-03 — Tọa độ trống bị hiểu thành số 0

Nguồn phát hiện: AI đọc CatalogService, mức trung bình. Number("") và Number(" ") bằng 0; phép kiểm tọa độ sau chuyển kiểu không phát hiện được dữ liệu người dùng chưa nhập.

- Test GET /restaurants?lat=&lng=106: mong đợi 400, trước sửa nhận 200.
- Sửa: yêu cầu đủ lat/lng, không nhận chuỗi rỗng/trắng và không nhận object/array trước khi chuyển kiểu; vẫn kiểm giới hạn địa lý. Vị trí: src/services/catalog-service.js:23.
- Sau sửa: lat/lng trống và khoảng trắng trả 400; lat=0&lng=0 vẫn hợp lệ và trả 200.

Ba lỗi AI ở trên không được ESLint tự động phát hiện trong cấu hình này. Chúng được xác nhận bằng chạy test; không ghi thành “3 cảnh báo SonarLint”.

## 4. Kết hợp AI và inspection theo Fagan

Đây là hồ sơ chuẩn bị inspection theo 5 pha trong slide, không phải biên bản giả về một cuộc họp nhóm đã diễn ra.

| Pha | Đã làm trong bản này | Việc nhóm cần xác nhận |
|---|---|---|
| Preparation | Đọc yêu cầu và mã M2; chạy static; AI lập giả thuyết và test tái hiện | Mỗi thành viên đọc độc lập |
| Inspection Meeting | Có danh sách lỗi ST-01, AI-01–03 để họp | Chưa tổ chức họp 4 vai trò |
| Evaluation | Có mức độ đề xuất, đầu vào, kỳ vọng và kết quả trước sửa | Nhóm quyết định chấp nhận/phân loại lỗi |
| Rework | Đã sửa 4 vị trí nêu trên | Hưng xem diff và phạm vi sửa |
| Follow-up | Công cụ tĩnh và 22 test chạy lại đạt | Reviewer con người xác nhận trước khi merge |

Phân vai gợi ý để nhóm tự điền tên: Hưng là Author phần M2; chọn người khác làm Moderator và Reader; Scribe ghi kết luận. AI không được tính là bốn thành viên độc lập và không thay quyền duyệt của nhóm.

Prompt có thể dùng lại:

> Đọc yêu cầu M2 và mã nguồn. Chỉ tìm lỗi trong phạm vi controller/service, không viết database M3. Với mỗi nghi vấn, nêu file, hàm, đầu vào tối thiểu, kết quả mong đợi và lý do. Viết test phải thất bại trên mã cũ trước khi sửa. Không đổi assertion để che lỗi, không thêm thư viện khi chưa giải thích nhu cầu, không dùng catch rỗng, không đưa secret vào source. Sau sửa chạy lint và toàn bộ test, báo đúng giới hạn bằng chứng.

AI review trong lần này tập trung vào đầu vào không hợp lệ, alias, chuyển kiểu và xác thực. Các test sẵn có kiểm thêm ownership, rollback RAM, requestKey, chuyển trạng thái, COD, snapshot và 100 vòng điều phối HTTP với 20 đơn/5 tài xế. Không coi review này là kiểm toán bảo mật đầy đủ.

## 5. Hưng chạy lại

Trong thư mục M2 sau giải nén, dùng Node.js 24.x:

```powershell
npm ci
npm run quality
```

Các lệnh riêng:

```powershell
npm run lint
npm run test:regression
npm run test:coverage
```

npm run quality tạo lại static-after.json, dynamic-after.txt và quality-summary.json; file ai-before.txt/static-before.json là bằng chứng lịch sử và không bị lệnh này ghi đè. Exit code khác 0 nếu bất kỳ bước nào lỗi. Không dùng npm ci --omit=dev vì bộ kiểm thử tĩnh cần devDependencies.

## 6. Giới hạn và phần thuộc M3/M4

- Không có SQL/database trong gói nên rà prepared statements/SQL injection trên repository CSDL là chưa áp dụng, không được ghi “100% an toàn SQL”.
- Fixture và mật khẩu demo là dữ liệu mẫu local, không phải secret production. .env được gitignore; không đưa .env thật vào ZIP. Không tuyên bố đã chạy công cụ dò secret chuyên dụng.
- Test rollback và tranh chấp hiện dùng RAM một tiến trình; chưa chứng minh transaction/khóa nhiều kết nối của M3.
- Chưa đo NFR tải lớn hoặc độ trễ UI, chưa chạy browser E2E của M1/M4.
- Chưa cài SonarQube for IDE/SonarLint và chưa chụp 3 cảnh báo trong IDE theo bài tập ở trang 22. Bản này cung cấp log của công cụ CLI thực sự chạy, không dựng ảnh cảnh báo.
- Không thêm workflow GitHub hay đổi branch protection. Chưa commit/push và chưa cập nhật PR.

## Nguồn đối chiếu

- Slide 8-10.Slides-all.pdf Hưng cung cấp: trang 14–15 (tĩnh/động, Fagan, loại lỗi), trang 22 (bài tập IDE), trang 28–29 (AI và kiểm chứng).
- [ESLint configuration](https://eslint.org/docs/latest/use/configure/configuration-files): cấu hình rule và recommended.
- [SonarSource SonarJS](https://github.com/SonarSource/SonarJS): plugin phân tích JavaScript/TypeScript.
- [SonarQube for IDE](https://www.sonarsource.com/products/sonarqube/ide/): sản phẩm trước đây mang tên SonarLint, khác với plugin CLI đã dùng.
- [Node test coverage](https://nodejs.org/learn/test-runner/collecting-code-coverage): đo coverage và giới hạn tập file được tính.

## Cập nhật trước khi push ngày 24/10/2026

Cài sạch phát hiện advisory GHSA-27r3-jxmh-p828 ở body-parser. Đã cập nhật dependency bắc cầu lên 2.4.0 trong lockfile; npm báo 0 lỗ hổng đã biết sau cập nhật. Chạy lại npm run quality trước khi push thẳng M2. Báo cáo 22/10 ở trên giữ làm bằng chứng lịch sử; reports/quality-summary.json và dynamic-after.txt chứa lần chạy mới. Không tạo/cập nhật pull request.
