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

- [x] CR-01 — Threat model and boundary — [evidence](./evidence/CR-01/README.md); commit `6e28f0c`; reader/security review pass; owner approved `2026-08-30T14:32:09Z`.
- [x] CR-02 — Crypto and key contract — [evidence](./evidence/CR-02/README.md); implementation commit `5375af7`; reader/security review pass; owner approved `2026-08-31T03:04:42Z`.
- [x] CR-03 — Google Drive key vault — implementation `8c1792d` + hardening `765cc61`; owner approved `2026-08-31T10:42:52Z`; Production integration actions remain explicit deployment gates.
- [x] CR-04 — Encrypted data contract — implementation `6c9827b`; local schema/RLS/security review pass; owner approved `2026-08-31T12:04:46Z`; [evidence](./evidence/CR-04/README.md).
- [x] CR-05 — Encrypted repository and synthetic migration harness; implementation `805ea92`; owner approved; no real-data migration.
- [x] CR-06 — Member-person binding; implementation `9770e50`; local evidence complete.
- [x] CR-07 — Contact privacy and relationship grants; implementation `a64463a`; owner approved `2026-09-01`; [evidence](./evidence/CR-07/README.md).
- [x] CR-08 — Encrypted direct collaboration; target roles owner/editor/viewer; implementation `653426d`; local evidence complete; real workspace signer/checkpoint wiring remains a deployment gate.
- [x] CR-09 — GEDCOM without images and common GEDCOM/JSON/Excel export policy; implementation `60040e0` + tests `2458e22`; [evidence](./evidence/CR-09/README.md); local parser/schema evidence complete; real workspace signer wiring remains a deployment gate.
- [x] CR-10 — Self-contained recovery, encrypted backup and media; implementation/tests local; [evidence](./evidence/CR-10/README.md); Production encrypted-only media and restore remain CR-11 gates.
- [ ] CR-11 — Real-data migration, production rollout and independent security review — Observation only; local smoke/evidence recorded in [CR-11 evidence](./evidence/CR-11/README.md); Production stop conditions remain active.

## Product CRs

- [ ] CR-12 — Public homepage, five core values and truthful feature list.
- [ ] CR-13 — Family creation wizard and unique 8-character join code.
- [ ] CR-14 — Family dashboard with list/tree/mindmap/bubble views.
- [ ] CR-15 — Relationship-aware person form and year-only birth precision.
- [ ] CR-16 — Persons-only Excel template, normalization and merge import.

Mỗi CR giao diện/tính năng mới tiếp theo vẫn phải khai báo data classification và key/access impact theo `00-INDEX.md`.

## Current blocker / next action

- CR-10 implemented locally; Preview/browser and every real-data/Production action remain separate gates. CR-11 remains Observation/gated because explicit Production authorization, independent review and real-data evidence are absent.

## Update rule

Sau mỗi CR:

1. Đổi checkbox thành Done.
2. Tạo/link `evidence/CR-XX/README.md`, ghi commit hash và validation evidence trong một dòng.
3. Ghi migration/production state và CR tiếp theo.
4. Không mô tả local tests là bằng chứng production hoặc security audit độc lập.
