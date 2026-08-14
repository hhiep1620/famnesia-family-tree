# CR-09 — Drive-to-Supabase Migration Tool and Reconciliation

## Mục tiêu

Tạo công cụ migration idempotent để nhập `family.json`, ảnh và metadata workspace từ Google Drive sang Supabase; không cutover production trong phase này.

## Prerequisite

- Phases 01–08 Done.
- Supabase Preview/end-to-end parity pass.
- Drive production vẫn đọc được.
- Có backup/export mới nhất.

## Nguyên tắc

- Migration phải repeatable và resumable.
- Không sửa/xóa source Drive.
- Giữ legacy IDs.
- Mỗi run có ID, status, checksum và counts.
- Không coi “script exit 0” là đủ; phải đối soát dữ liệu và ảnh.

## Việc phải làm

### 1. Input

Hỗ trợ tối thiểu một đường chính:

- Owner export JSON + ảnh bundle có manifest; hoặc
- Server migration đọc Drive bằng credential hiện tại trong controlled run.

Không yêu cầu đưa Google refresh token vào CLI plaintext.

### 2. Transform

- Parse bằng schema/migration hiện tại.
- Normalize profiles/persons/relationships/media.
- Map Drive file ID → Supabase Storage object + media row.
- Preserve dates, lunar, confidence, sort order, subject and timestamps khi hợp lệ.
- Derived analytics/kinship/layout không import.

### 3. Load

- Tạo/match workspace owner.
- Insert/upsert theo migration run + legacy keys.
- Upload ảnh staging, checksum, finalize.
- Transaction theo safe batches; canonical visibility chỉ bật sau complete.
- Re-run không duplicate rows/objects.

### 4. Reconciliation report

Report machine-readable và human-readable:

- Profile/person/relationship/media counts source vs target.
- Missing references.
- Duplicate IDs.
- JSON canonical hash hoặc normalized comparison.
- Image count, bytes và checksum.
- Warnings/errors/skipped items.
- Target workspace/version.

### 5. Dry run

- `--dry-run` không ghi DB/Storage.
- Hiển thị estimated rows/files/bytes.
- Reject invalid data trước upload.

### 6. Rollback migration run

- Chỉ xóa rows/objects thuộc đúng incomplete/test migration run.
- Không xóa data đã có trước hoặc commit sau migration.
- Production rollback chính vẫn là backend flag/Drive source, không destructive undo tùy tiện.

## Test bắt buộc

- Current sample/real export fixture.
- Legacy schema versions.
- Missing/corrupt image.
- Duplicate and rerun.
- Interrupted upload/resume.
- Cross-profile invalid references.
- Full normalized export parity after import.

## Không làm

- Không đổi production flags.
- Không revoke Google permissions.
- Không delete Drive files.
- Không migrate mirror cá nhân như canonical data.
- Không log PII/token đầy đủ.

## Acceptance criteria

- Dry-run report chính xác.
- Test migration hoàn tất và rerun không duplicate.
- Source/target counts match hoặc mọi difference có lý do.
- Ảnh migrated truy cập đúng role và checksum.
- Export Supabase sau migration semantically equal source `FamilyData`.
- Có runbook thao tác từng bước và rollback.

## Validation

```bash
npm test
npm run lint
npm run build
git diff --check
```

Chạy migration vào local/Preview project trước; lưu report không chứa secret.

## Handoff bắt buộc

- Command/dry-run usage.
- Migration report path.
- Counts/checksum summary.
- Known skipped items.
- Production migration prerequisites.
- Update `TASK-STATUS.md`: Phase 09 Done, Phase 10 next.
