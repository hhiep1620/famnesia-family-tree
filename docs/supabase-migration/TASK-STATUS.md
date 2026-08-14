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
- [x] Phase 03 — Database schema, constraints và RLS. Commit `2ce26e7`; schema reset/db lint, 43 pgTAP policy/constraint tests và generated types pass.
- [x] Phase 04 — Supabase Auth migration. Commit `c82ada6`; 96 tests, local email auth smoke, schema reset/db lint và build pass.
- [x] Phase 05 — Supabase read repository. Commit `6014246`; 103 tests, owner/viewer/outsider API smoke, browser smoke, schema reset/db lint và build pass.
- [x] Phase 06 — Transactional batch write. Commit `11f1d7a`; 106 app tests, 81 pgTAP tests, DB lint/reset, read/write API smoke, concurrent-role browser smoke, lint và build pass.
- [x] Phase 07 — Private Storage/media lifecycle. Commit `ecdddf6`; 111 app tests, 108 pgTAP tests, DB reset/lint, read/write/media API smoke, browser thumbnail/original smoke, lint và build pass.
- [x] Phase 08 — Shared workspace và approval workflow. Commit `7f5cabb`; 111 app tests, 138 pgTAP tests, DB reset/lint, read/write/media/collaboration API smoke, owner browser approval/invitation smoke, lint và build pass.
- [x] Phase 09 — Drive-to-Supabase migration tool và reconciliation. Commit `9f588b6`; 117 app tests, 159 pgTAP tests, DB reset/lint, dry/live/image/RLS/idempotent migration smoke, typecheck, lint và build pass.
- [ ] Phase 10 — Preview, production cutover, rollback và cleanup. Safety/preflight tooling commit `168b095`; local RLS/preflight rehearsal, 122 app tests, 159 pgTAP tests, typecheck, DB lint, lint và build pass. Production cutover/observation/cleanup chưa chạy.

## Current blocker / next action

- Phase 09 đã hoàn tất; Phase 10 đã sẵn sàng về tooling/runbook nhưng dừng đúng production stop condition: chưa có explicit authorization, final Production backup/reconciliation, remote RLS evidence và rollback/observation owner.
- Google provider/redirect trên remote Supabase Preview vẫn chờ Project URL/key và cấu hình Dashboard thực tế.
- Remote verification vẫn chờ Supabase project, Project URL, publishable key và secret key; production selectors tiếp tục giữ Drive.

## Update rule

Sau mỗi phase, chỉ cập nhật ba phần:

1. Chuyển checkbox phase sang Done.
2. Ghi commit/hash và validation chính trong một dòng.
3. Ghi blocker hoặc phase tiếp theo trong `Current blocker / next action`.
