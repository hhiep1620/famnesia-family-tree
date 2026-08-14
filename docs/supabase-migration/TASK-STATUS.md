# Supabase Migration — Short Task Status

## Done

- [x] Audit kiến trúc Google Drive hiện tại ở mức hệ thống.
- [x] Xác nhận UI/business logic chính có thể tái sử dụng.
- [x] Chọn Supabase Auth + Postgres + private Storage làm kiến trúc đích.
- [x] Đo baseline dữ liệu hiện tại và xác nhận Supabase Free đủ cho metadata ban đầu.
- [x] Chia migration thành 10 phase nhỏ có điểm dừng an toàn.
- [x] Tạo bộ tài liệu kiến trúc và change request cho AI Agent.

## To-do

- [x] Phase 01 — Baseline và repository boundary. Commit `c74a34a`; 84 tests, lint, build pass.
- [x] Phase 02 — Supabase foundation/local environment. Commit `caa7e9b`; local CLI `2.114.0`, stack start/status/reset, 88 tests, lint và build pass.
- [x] Phase 03 — Database schema, constraints và RLS. Schema reset/db lint, 43 pgTAP policy/constraint tests, generated types; commit pending.
- [ ] Phase 04 — Supabase Auth migration.
- [ ] Phase 05 — Supabase read repository.
- [ ] Phase 06 — Transactional batch write.
- [ ] Phase 07 — Private Storage/media lifecycle.
- [ ] Phase 08 — Shared workspace và approval workflow.
- [ ] Phase 09 — Drive-to-Supabase migration tool và reconciliation.
- [ ] Phase 10 — Preview, production cutover, rollback và cleanup.

## Current blocker / next action

- Tiếp theo: `CR-04-AUTH-MIGRATION.md` trên stack local đã chạy được.
- Remote verification vẫn chờ Supabase project, Project URL, publishable key và secret key; production selectors tiếp tục giữ Drive.

## Update rule

Sau mỗi phase, chỉ cập nhật ba phần:

1. Chuyển checkbox phase sang Done.
2. Ghi commit/hash và validation chính trong một dòng.
3. Ghi blocker hoặc phase tiếp theo trong `Current blocker / next action`.
