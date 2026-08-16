# CR-07 — Private Supabase Storage and Media Lifecycle

## Mục tiêu

Thay Drive photo storage bằng private Supabase Storage, có thumbnail, staging, RLS và cleanup; không làm ảnh gia đình thành public URL.

## Prerequisite

- Phase 06 Done.
- `media` table và workspace RLS tồn tại.
- Đã kiểm tra image optimization hiện tại.

## Việc phải làm

### 1. Buckets/config

Tạo bằng migration/config reproducible:

- `family-media` private.
- `family-exports` private nếu cần test export.
- `family-backups` private nếu cần snapshot.

Đặt MIME allow list và max upload phù hợp; không chỉ tin `file.type` từ browser.

### 2. Object naming

Dùng generated IDs, không dùng filename người dùng làm path trực tiếp:

```text
<workspace>/<profile>/<person>/<media>/staging-original
<workspace>/<profile>/<person>/<media>/original.webp
<workspace>/<profile>/<person>/<media>/thumb.webp
```

Normalize/encode path và chặn path traversal.

### 3. Storage RLS

- Member có read phù hợp workspace.
- Owner/editor upload canonical media.
- Contributor chỉ upload staging gắn draft của chính mình.
- Viewer read, không upload/delete.
- Non-member/anonymous denied.
- Contributor A không xem staging Draft B nếu policy privacy yêu cầu.

Policy phải kiểm tra workspace membership từ object path và database, không dựa vào filename do client khai báo.

### 4. Upload lifecycle

- Client optimize ảnh và tạo thumbnail hoặc server finalization rõ ràng.
- Upload staging trước.
- Verify size, MIME, magic bytes, checksum và ownership.
- `media.attach` chỉ commit metadata sau verify.
- Commit failure giữ staging để retry theo TTL.
- Discard draft xóa staging thích hợp.

### 5. Read lifecycle

- Thay `useDriveImage` bằng backend-neutral media hook.
- Tree chỉ tải thumbnail.
- Gallery tải original khi cần.
- Private download dùng authenticated request hoặc signed URL ngắn hạn.
- Không lưu signed URL vào database/export.

### 6. Delete/cleanup

- Metadata delete và object cleanup có trạng thái retry/idempotent.
- Không xóa object committed trước transaction metadata thành công.
- Cleanup orphan theo TTL và workspace scope.
- Job/manual endpoint yêu cầu quyền/admin secret phù hợp.

### 7. Quota awareness

- Ghi metric/log size, upload count và egress-friendly behavior.
- Không tải toàn bộ original khi render cây.
- Test cache headers không làm lộ private asset.

## Test bắt buộc

- Role matrix Storage.
- Invalid MIME/magic/oversize/path rejected.
- Upload → attach → read thumb/original.
- Commit conflict giữ staging.
- Discard/expiry cleanup.
- Delete idempotent.
- Cross-workspace object denied.
- Signed URL expires/không persist.

## Không làm

- Không migrate ảnh Drive production.
- Không public bucket.
- Không Telegram hosting.
- Không bật MEDIA_BACKEND=supabase production.

## Acceptance criteria

- Supabase local/Preview upload/read/delete đạt.
- Tree không tải original.
- RLS denial cases pass.
- Không orphan trong normal success/discard flows.
- Drive media regression pass khi flag Drive.
- Build không chứa secret/service key.

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

- Bucket/policy migrations.
- Object path contract.
- Max size/MIME/TTL decisions.
- Quota assumptions.
- Update `TASK-STATUS.md`: Phase 07 Done, Phase 08 next.
