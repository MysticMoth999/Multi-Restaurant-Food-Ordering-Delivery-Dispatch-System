# Quy trình làm việc trên GitHub

Repo dùng **GitHub Flow**: nhánh `main` luôn chạy được; mọi thay đổi đi qua nhánh ngắn và Pull Request (PR), CI phải đạt trước khi gộp.

## Ai phụ trách thư mục nào

| Thư mục | Người phụ trách | Gói npm |
|---|---|---|
| `frontend/` | M1 | (trang tĩnh, backend phục vụ) |
| `backend/` | M2 | `@gomeal/backend` |
| `database/` | M3 | `@gomeal/database` |
| `tests/` | M4 | (M4 thêm `package.json` khi viết Playwright) |
| `docs/`, `scripts/`, `.github/`, file ở gốc | Nhóm trưởng | |

Chỉ sửa thư mục của mình. Cần đổi chỗ người khác (API, schema, selector giao diện) thì nhắn người phụ trách hoặc ghi rõ trong PR.

## Các bước cho mỗi việc

```powershell
git switch main
git pull                                   # lấy bản mới nhất
git switch -c m2/voucher-het-han           # nhánh mới: <m1|m2|m3|m4|docs>/<mo-ta-ngan>
# ... sửa code ...
npm test                                   # phải đạt trước khi đẩy
git add backend
git commit -m "m2: chặn voucher hết hạn khi báo giá"
git push -u origin m2/voucher-het-han
```

Lên GitHub mở **Pull Request** vào `main`, điền mẫu có sẵn (thay đổi gì, FR/TC liên quan, đã kiểm tra gì). Chờ CI (dấu ✔) và một người duyệt, bấm **Squash and merge**, rồi xóa nhánh. Những người khác `git pull` trên `main` để nhận thay đổi.

Lời nhắn commit: `<phần>: <việc đã làm>`, ví dụ `m1: thêm bản đồ theo dõi tài xế`, `m3: migration 003 thêm cột giờ mở cửa`, `docs: cập nhật mục 16 báo cáo`.

## Quy tắc riêng từng phần

- **API (M2):** đổi request/response thì cập nhật `backend/docs/API.md` trong cùng PR.
- **CSDL (M3):** thêm file migration mới `database/sql/00X_*.sql`, không sửa file đã áp (bộ chạy migration kiểm checksum). Chạy lại `npm run export-seeds -w @gomeal/database` nếu seed đổi.
- **Giao diện (M1):** giữ `id`/`data-*` mà test E2E dùng, hoặc báo M4; đổi giao diện thấy rõ thì đính kèm ảnh để cập nhật mục 16 báo cáo.
- **Test (M4):** test mới chạy được bằng `npm test` hoặc lệnh riêng ghi trong `tests/README.md`.
- Không commit `.env`, `node_modules/`, `backend/uploads/` (đã chặn trong `.gitignore`).

## Thiết lập bảo vệ nhánh main (nhóm trưởng làm một lần)

GitHub → **Settings → Branches → Add branch ruleset** (hoặc Branch protection rule) cho `main`:

1. Require a pull request before merging, 1 approval.
2. Require status checks to pass → chọn **Test backend + database** (xuất hiện sau lần CI đầu tiên).
3. Block force pushes.
4. (Tuỳ chọn) Điền tài khoản thật vào `.github/CODEOWNERS` và bật "Require review from Code Owners".

## Mốc phát hành

Cuối mỗi tuần (hoặc mỗi mốc trong lộ trình mục 4 của báo cáo) gắn tag trên `main` để giảng viên xem lại đúng phiên bản:

```powershell
git tag -a v0.7 -m "Tuần 7: tích hợp đầu-cuối, Playwright E2E"
git push origin v0.7
```

Bản nộp cuối: `v1.0`.
