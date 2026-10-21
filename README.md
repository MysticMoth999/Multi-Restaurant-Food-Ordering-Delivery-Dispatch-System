# GoMeal — Multi-Restaurant Food Ordering & Delivery Dispatch System

[![CI](https://github.com/MysticMoth999/Multi-Restaurant-Food-Ordering-Delivery-Dispatch-System/actions/workflows/ci.yml/badge.svg)](https://github.com/MysticMoth999/Multi-Restaurant-Food-Ordering-Delivery-Dispatch-System/actions/workflows/ci.yml)

Đồ án Công nghệ phần mềm, nhóm 7. Đặt món từ nhiều nhà hàng, tính phí giao theo quãng đường, voucher, thanh toán mô phỏng, điều phối tài xế gần nhất, thông báo và theo dõi đơn trên bản đồ.

## Cấu trúc repo

```
.
├── frontend/          M1 · Giao diện HTML/CSS/JS (khách, nhà hàng, tài xế, quản trị)
│   ├── *.html         7 trang
│   ├── js/  css/  img/
├── backend/           M2 · @gomeal/backend — API Node.js + Express 5
│   ├── src/           app.js (controller), services/, adapters/, domain/
│   ├── test/          27 test nghiệp vụ (RAM và MySQL)
│   ├── scripts/       dữ liệu demo, mô phỏng vận hành
│   └── docs/          API.md, yêu cầu, kết quả test, audit
├── database/          M3 · @gomeal/database — MySQL 8
│   ├── sql/           schema.sql, 002_features.sql, seed_demo.sql, seed_load.sql
│   ├── src/           mysql-store.js (adapter, transaction, truy vấn vị trí)
│   ├── test/          8 test CSDL (rollback, tranh chấp đồng thời, restart)
│   ├── scripts/       migrate/seed, đo tải NFR-01, MySQL riêng cổng 3307
│   └── docs/          ERD, kết quả đo NFR, bàn giao M4
├── tests/             M4 · Kế hoạch kiểm thử, Playwright E2E, API test
├── docs/              Báo cáo, hướng dẫn chạy, bảng truy vết yêu cầu → code → test
├── scripts/           npm run setup / start / test cho cả repo
├── .github/           CI (GitHub Actions), mẫu Pull Request, mẫu báo lỗi, CODEOWNERS
├── package.json       npm workspaces: backend, database
└── .env.example       Cấu hình mẫu (npm run setup tạo .env)
```

## Chạy nhanh

Cần **Node.js 24+**, **MySQL Server 8** (Windows) và Internet (cài thư viện, bản đồ).

```powershell
git clone https://github.com/MysticMoth999/Multi-Restaurant-Food-Ordering-Delivery-Dispatch-System.git GoMeal
cd GoMeal
npm run setup
npm start
```

Mở **http://127.0.0.1:3000**. Mật khẩu chung `demo12345`: `khach@gomeal.vn`, `nhahang@gomeal.vn`, `taixe@gomeal.vn`, `admin@gomeal.vn`.

| Lệnh | Việc |
|---|---|
| `npm run setup` | Lần đầu trên mỗi máy: cài thư viện, tạo `.env`, bật MySQL riêng cổng 3307 (dữ liệu ở `%LOCALAPPDATA%\GoMealM3`), tạo CSDL và tài khoản, migration, dữ liệu demo. Chạy lại vẫn an toàn |
| `npm start` | Bật MySQL nếu đang tắt, chạy backend; backend phục vụ luôn giao diện |
| `npm run start:demo` | Không cần MySQL (dữ liệu trong RAM); dùng sau `npm run setup -- --no-db` |
| `npm run simulate -- --orders 4 --every 15` | Mô phỏng khách đặt đơn, nhà hàng xác nhận, tài xế chạy trên bản đồ |
| `npm test` | Toàn bộ test: backend trên RAM và MySQL, database |
| `npm run coverage` / `npm run benchmark` | Coverage service (NFR-04) / đo tải (NFR-01) |

## Tài liệu

- [docs/README.md](docs/README.md) — mục lục tài liệu (báo cáo, hướng dẫn, API, ERD, kết quả kiểm thử)
- [docs/HUONG-DAN-CHAY.md](docs/HUONG-DAN-CHAY.md) — chạy, kịch bản demo, lỗi thường gặp
- [docs/TRUY-VET.md](docs/TRUY-VET.md) — yêu cầu FR/NFR được làm ở đâu, kiểm bằng test nào
- [CONTRIBUTING.md](CONTRIBUTING.md) — quy trình nhánh, Pull Request, bảo vệ `main`
