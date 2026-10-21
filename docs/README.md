# Tài liệu dự án GoMeal

## Báo cáo

- [bao-cao/](bao-cao/) — báo cáo đồ án (Word): yêu cầu, use case, thiết kế, kiến trúc, giao diện, kiểm thử.

## Chạy và vận hành

- [HUONG-DAN-CHAY.md](HUONG-DAN-CHAY.md) — cài lần đầu, mở hệ thống, tài khoản demo, kịch bản demo trọn luồng, mô phỏng, lỗi thường gặp.
- [../CONTRIBUTING.md](../CONTRIBUTING.md) — quy trình làm việc trên GitHub.

## Truy vết và kiểm thử

- [TRUY-VET.md](TRUY-VET.md) — bảng FR/NFR → giao diện → backend → CSDL → test → ca kiểm thử TC.
- [../backend/docs/TEST-RESULTS.md](../backend/docs/TEST-RESULTS.md) — kết quả test và coverage backend.
- [../database/docs/TEST-RESULTS.md](../database/docs/TEST-RESULTS.md) — kết quả đo NFR-01, NFR-02, NFR-06 trên MySQL (số liệu gốc: `NFR-0x-results.json` cùng thư mục).
- [../tests/README.md](../tests/README.md) — kế hoạch nghiệm thu của M4 (TC-01 đến TC-13, Playwright, NFR-05).
- Kết quả CI mỗi Pull Request: tab **Actions** trên GitHub.

## Thiết kế theo phần

| Phần | Tài liệu |
|---|---|
| Backend (M2) | [API.md](../backend/docs/API.md) (hợp đồng API), [REQUIREMENTS.md](../backend/docs/REQUIREMENTS.md) (đối chiếu FR/NFR), [M3-CONTRACT.md](../backend/docs/M3-CONTRACT.md) (hợp đồng dữ liệu với CSDL), [AUDIT-M2.md](../backend/docs/AUDIT-M2.md) |
| CSDL (M3) | [ERD_Specification.md](../database/docs/ERD_Specification.md) (ERD, từ điển dữ liệu, ràng buộc, index), [M4-HANDOFF.md](../database/docs/M4-HANDOFF.md), [UI-DATA-DECISIONS.md](../database/docs/UI-DATA-DECISIONS.md) |
| Giao diện (M1) | Mục 16 của báo cáo; mã ở [../frontend/](../frontend/) |
