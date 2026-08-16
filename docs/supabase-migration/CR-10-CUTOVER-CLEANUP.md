# CR-10 — Preview Verification, Production Cutover, Rollback and Cleanup

## Mục tiêu

Chuyển production Famnesia sang Supabase có kiểm soát, quan sát sau deploy và giữ rollback về Drive. Chỉ cleanup Drive code sau thời gian ổn định được user xác nhận.

## Prerequisite

- Phases 01–09 Done.
- Migration dry-run và Preview reconciliation pass.
- User cấp quyền rõ cho production env change/deploy.
- Có backup Drive mới nhất và rollback owner.

## Cutover plan

### 1. Preflight

- Freeze window cho write Drive hoặc đặt app maintenance/read-only trong thời gian ngắn.
- Chạy final Drive export/backup.
- Ghi source revision/version/checksum.
- Xác nhận Supabase quotas, project health và env Production.
- Xác nhận Google provider production redirect.
- Xác nhận RLS tests trên linked production schema.

### 2. Final migration

- Dry run.
- Execute migration bằng migration ID production.
- Reconciliation counts/hash/images.
- Không tiếp tục nếu error hoặc unexplained warning.

### 3. Deploy selector

Đổi đồng bộ:

```text
AUTH_BACKEND=supabase
DATA_BACKEND=supabase
MEDIA_BACKEND=supabase
```

Không để combination unsupported. Redeploy và kiểm tra stable production alias.

### 4. Production smoke

Ít nhất:

- Google sign-in owner/editor/contributor/viewer.
- Workspace list/switch.
- Tree/calendar/search/detail.
- Batch edit/save/conflict.
- Upload/read/delete photo.
- Invite/accept/remove.
- Contributor submit/review.
- Export/backup/restore permission.
- Mobile basic smoke.

### 5. Observation

Theo dõi trong thời gian được thống nhất:

- Auth errors.
- RLS 401/403 anomalies.
- Commit conflict/error rate.
- Storage upload/read failures.
- Function errors/latency.
- Database/storage/egress quota.

Không log PII/token.

## Rollback

Rollback trigger ví dụ:

- Auth diện rộng thất bại.
- Data reconciliation lệch.
- Commit làm mất/corrupt data.
- RLS cho phép cross-workspace hoặc chặn owner diện rộng.
- Media inaccessible diện rộng.

Rollback steps:

1. Dừng write Supabase nếu cần.
2. Export mọi Supabase changes phát sinh sau cutover.
3. Không âm thầm bỏ các thay đổi này.
4. Chuyển flags về Drive-compatible combination.
5. Redeploy.
6. Reconcile changes trước khi retry cutover.

## Cleanup sau ổn định

Chỉ khi user xác nhận riêng:

- Xóa Google Picker UI/config.
- Xóa Drive OAuth refresh-token/session code không còn dùng.
- Xóa Drive persistence/media/collaboration adapters.
- Đánh giá Upstash còn cần lock/session nào; không xóa nếu workflow vẫn dùng.
- Gỡ env Google Drive cũ khỏi Vercel sau khi rollback window đóng.
- Giữ immutable Drive backup/export theo retention quyết định.
- Cập nhật README và system architecture thành Supabase canonical.

Cleanup phải là commit riêng sau cutover, không trộn với deploy switch.

## Acceptance criteria

- Final migration report clean.
- Production smoke pass đủ role.
- Không cross-workspace data leak.
- Save/upload/invite/review hoạt động.
- Backup/export tải được.
- Rollback được diễn tập hoặc ít nhất validated trên Preview.
- Google Drive chưa bị xóa trong rollback window.
- README/env/runbook đúng production thực tế.

## Validation

```bash
npm test
npm run lint
npm run build
git diff --check
```

Thêm browser/API end-to-end checks theo production scope. Local structural tests không được mô tả là bằng chứng production pass.

## Handoff bắt buộc

- Deployment URL/hash/time.
- Final migration/reconciliation summary.
- Smoke matrix theo role.
- Observation/rollback owner.
- Cleanup deferred list.
- Update `TASK-STATUS.md`: Phase 10 Done và trạng thái rollback window.

## Stop conditions

- Không có explicit production authorization.
- Final reconciliation không sạch.
- Missing backup/rollback path.
- RLS security test chưa pass.
- Preview end-to-end chưa pass.
