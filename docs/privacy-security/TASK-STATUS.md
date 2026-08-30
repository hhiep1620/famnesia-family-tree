# Privacy, Encryption and GEDCOM — Short Task Status

## Locked decisions

- [x] Supabase tiếp tục là datastore vận hành.
- [x] Family payload phải được mã hóa client-side trước khi lưu.
- [x] User recovery secret được giữ trong Google Drive của chính user.
- [x] Contact data dùng key riêng; không dựa vào UI hiding.
- [x] GEDCOM chỉ dùng import/export.
- [x] Không import ảnh từ GEDCOM/GEDZIP.
- [x] Target role chỉ còn owner/editor/viewer; editor commit trực tiếp, không có “Editor cần duyệt”.
- [x] Join code là mã routing 8 ký tự, không tự cấp quyền.
- [x] Excel import đơn giản chỉ nhập sheet người và merge vào active family.
- [x] Nếu chỉ biết năm, UI có thể gợi ý ngày/tháng `01-01` nhưng storage chỉ lưu `{year, precision: 'year'}` — không lưu month/day 01-01 và không tạo sinh nhật giả.

## To-do

- [x] CR-01 — Threat model and boundary — [evidence](./evidence/CR-01/README.md); reader/security review pass; owner approved `2026-08-30T14:32:09Z`.
- [ ] CR-02 — Crypto and key contract.
- [ ] CR-03 — Google Drive key vault.
- [ ] CR-04 — Encrypted data contract.
- [ ] CR-05 — Encrypted repository and migration harness; no real-data migration.
- [ ] CR-06 — Member-person binding.
- [ ] CR-07 — Contact privacy and relationship grants.
- [ ] CR-08 — Encrypted direct collaboration; target roles owner/editor/viewer.
- [ ] CR-09 — GEDCOM without images and common GEDCOM/JSON/Excel export policy.
- [ ] CR-10 — Self-contained recovery, encrypted backup and media.
- [ ] CR-11 — Real-data migration, production rollout and independent security review.

## Product CRs

- [ ] CR-12 — Public homepage, five core values and truthful feature list.
- [ ] CR-13 — Family creation wizard and unique 8-character join code.
- [ ] CR-14 — Family dashboard with list/tree/mindmap/bubble views.
- [ ] CR-15 — Relationship-aware person form and year-only birth precision.
- [ ] CR-16 — Persons-only Excel template, normalization and merge import.

Mỗi CR giao diện/tính năng mới tiếp theo vẫn phải khai báo data classification và key/access impact theo `00-INDEX.md`.

## Current blocker / next action

- CR-01 Done; evidence tại [evidence/CR-01/README.md](./evidence/CR-01/README.md).
- Dừng theo yêu cầu của owner. Không tạo crypto code và không bắt đầu CR-02.

## Update rule

Sau mỗi CR:

1. Đổi checkbox thành Done.
2. Tạo/link `evidence/CR-XX/README.md`, ghi commit hash và validation evidence trong một dòng.
3. Ghi migration/production state và CR tiếp theo.
4. Không mô tả local tests là bằng chứng production hoặc security audit độc lập.
