# Famnesia Supabase Migration — AI Agent Work Pack

## Mục đích

Bộ tài liệu này chia việc thay Google Drive bằng Supabase thành các change request nhỏ, có thể giao độc lập cho AI Agent theo đúng thứ tự. Mục tiêu là giữ nguyên UI và nghiệp vụ gia phả, chỉ thay hạ tầng xác thực, metadata, ảnh/file và cộng tác.

## Tài liệu nguồn chuẩn

1. [01-CURRENT-SYSTEM.md](./01-CURRENT-SYSTEM.md) — hệ thống đang chạy và phần có thể tái sử dụng.
2. [02-TARGET-ARCHITECTURE.md](./02-TARGET-ARCHITECTURE.md) — kiến trúc Supabase mục tiêu và quyết định kỹ thuật.
3. [TASK-STATUS.md](./TASK-STATUS.md) — danh sách ngắn Done / To-do, phải cập nhật sau mỗi phase.

Nếu tài liệu phase mâu thuẫn với source code đang tồn tại, AI Agent phải dừng, ghi lại bằng chứng và cập nhật tài liệu kiến trúc trước khi triển khai.

## Thứ tự change request

| Phase | File | Kết quả chính |
|---:|---|---|
| 01 | [CR-01-BASELINE-AND-BOUNDARY.md](./CR-01-BASELINE-AND-BOUNDARY.md) | Baseline, repository boundary và feature flags |
| 02 | [CR-02-SUPABASE-FOUNDATION.md](./CR-02-SUPABASE-FOUNDATION.md) | Supabase CLI/local config và env contract |
| 03 | [CR-03-DATABASE-SCHEMA-RLS.md](./CR-03-DATABASE-SCHEMA-RLS.md) | Schema normalized, constraints, RLS và SQL tests |
| 04 | [CR-04-AUTH-MIGRATION.md](./CR-04-AUTH-MIGRATION.md) | Supabase Auth + Google phía sau feature flag |
| 05 | [CR-05-READ-REPOSITORY.md](./CR-05-READ-REPOSITORY.md) | Read path Supabase, mapper và parity tests |
| 06 | [CR-06-BATCH-WRITE.md](./CR-06-BATCH-WRITE.md) | Transactional batch commit, conflict và activity |
| 07 | [CR-07-STORAGE-MEDIA.md](./CR-07-STORAGE-MEDIA.md) | Private Storage, ảnh staging và signed access |
| 08 | [CR-08-SHARED-WORKSPACE.md](./CR-08-SHARED-WORKSPACE.md) | Membership, role, invitation và contributor review |
| 09 | [CR-09-DATA-MIGRATION.md](./CR-09-DATA-MIGRATION.md) | Công cụ nhập Drive JSON/ảnh vào Supabase và đối soát |
| 10 | [CR-10-CUTOVER-CLEANUP.md](./CR-10-CUTOVER-CLEANUP.md) | Preview, production cutover, rollback và cleanup |

## Quy tắc giao việc cho AI Agent

Khi bắt đầu một phase, cung cấp cho agent:

1. File CR tương ứng.
2. `01-CURRENT-SYSTEM.md`.
3. `02-TARGET-ARCHITECTURE.md`.
4. `TASK-STATUS.md`.

Prompt ngắn đề xuất:

```text
Đọc đầy đủ 4 tài liệu được cung cấp và kiểm tra source code thực tế trước khi làm.
Chỉ thực hiện đúng phase này; không tự chuyển sang phase tiếp theo.
Bảo toàn UI và business logic không thuộc phạm vi.
Chạy toàn bộ validation được yêu cầu, cập nhật TASK-STATUS.md và ghi handoff cuối phase.
Không deploy production, không xóa Google Drive và không push nếu chưa được yêu cầu rõ ràng.
```

## Nguyên tắc dừng an toàn

- Mỗi phase phải tạo một commit độc lập hoặc ít nhất một working tree có thể review độc lập.
- Không để runtime production phụ thuộc đồng thời vào hai nguồn ghi dữ liệu.
- Không xóa code Drive trước Phase 10.
- Không đưa `SUPABASE_SECRET_KEY`, `service_role`, database password hoặc token vào biến `VITE_*`.
- Nếu thiếu Supabase project/env, phase chỉ được hoàn thành phần local và phải ghi blocker.
- Nếu test parity thất bại, không bật feature flag Supabase cho phase tiếp theo.

## Definition of Done chung

Một phase chỉ được đánh dấu Done khi:

- Acceptance criteria của phase đạt.
- `npm test`, `npm run lint` và `npm run build` đạt, hoặc blocker môi trường được mô tả chính xác.
- Không có secret mới trong Git.
- Tài liệu/handoff phản ánh đúng code thực tế.
- `TASK-STATUS.md` được cập nhật ngắn gọn.
