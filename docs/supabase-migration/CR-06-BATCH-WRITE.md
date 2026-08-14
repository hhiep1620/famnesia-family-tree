# CR-06 — Transactional Batch Commit and Conflict Handling

## Mục tiêu

Chuyển operation-based Save all sang một Postgres transaction atomic, giữ conflict semantics và activity hiện tại. Sau phase này metadata Supabase có thể read/write trong local/Preview nhưng chưa production cutover.

## Prerequisite

- Phase 05 Done và read parity pass.
- Draft operation contract/compaction tests hiện tại được đọc đầy đủ.
- RLS policy owner/editor/contributor đã test.

## Việc phải làm

### 1. Commit contract

Request tối thiểu:

```ts
interface SupabaseFamilyCommitRequest {
  workspaceId: string
  commitId: string
  baseVersion: number
  operations: FamilyOperation[]
  clientCreatedAt: string
}
```

Response gồm canonical version mới, normalized changed entities/`FamilyData` snapshot cần thiết, applied count và auto-merge status.

### 2. Atomic RPC/transaction

Implement server/RPC sao cho cùng transaction:

- Lock/check workspace version.
- Kiểm tra role.
- Deduplicate `commit_id`.
- Apply operations theo thứ tự/compacted result.
- Validate references và constraints.
- Increment `data_version` đúng một lần.
- Insert commit + activity.
- Rollback toàn bộ nếu một operation lỗi.

Không loop nhiều Data API request rồi gọi đó là transaction.

### 3. Conflict behavior

- Nếu version đổi nhưng fields/entity không đụng nhau, cho phép rebase/auto-merge theo semantics đã test.
- Same-field different-value trả conflict có base/local/remote.
- Remote delete vs local update/delete phải rõ.
- Không xóa local pending operations khi 409/conflict.
- Retry cùng `commit_id` trả kết quả idempotent, không activity/version trùng.

### 4. Destructive operations

- Person delete cascade trong transaction.
- Import/restore/merge duplicate vẫn dùng flow riêng và tạo snapshot trước thay đổi.
- Editor không được import/restore nếu contract yêu cầu owner.

### 5. UI integration

- `saveAll`, discard, undo, conflict dialog dùng Supabase repository khi flag bật.
- Copy trạng thái giữ rõ: dirty, saving, conflicted, failed, saved.
- Timeout/unknown result phải query commit status trước khi tạo commit ID mới.

### 6. Activity

Một batch tạo một activity summary, metadata không chứa PII dư thừa. Actor lấy từ auth context.

## Test bắt buộc

- Multi-operation atomic success.
- Operation thứ N fail → không row/version/activity nào commit.
- Idempotent retry.
- Different-field auto-merge.
- Same-field conflict.
- Concurrent commits.
- Contributor direct commit denied.
- Editor direct commit allowed.
- Viewer denied.
- Cascade delete.
- Validation cycle/duplicate relationship.

## Không làm

- Không upload media binary.
- Không production cutover.
- Không xóa Drive write.
- Không dùng service role để né RLS cho normal commit.

## Acceptance criteria

- Save all tạo đúng một transaction/version/activity.
- Conflict không làm mất draft.
- Retry không duplicate.
- RLS + server validation cùng bảo vệ write.
- Supabase and Drive operation contract tests cùng pass.
- Local/Preview two-session concurrency test pass.

## Validation

```bash
npx supabase db reset
npx supabase test db
npm test
npm run lint
npm run build
git diff --check
```

## Handoff bắt buộc

- RPC/migration names.
- Concurrency evidence.
- Known conflicts chưa auto-merge.
- Update `TASK-STATUS.md`: Phase 06 Done, Phase 07 next.
