# CR-05 — Client Encrypted Repository and Migration Harness

## Prerequisite

- CR-04 Done.

## Mục tiêu

Thêm read/write repository mã hóa phía client và migration harness trên synthetic/Preview fixtures. Phase này không migrate workspace thật, để tránh contact bị mã hóa nhầm bằng workspace key trước CR-06/07.

## Việc phải làm

- Repository lấy envelope, giải mã trong browser, validate FamilyData rồi mới render.
- Write validate → encrypt → revision-checked commit; API không nhận plaintext.
- Không cache decrypted data vào localStorage/IndexedDB nếu chưa có encrypted cache contract.
- Migration harness per data class: family-shared, person-private/contact, media và workflow; mỗi lớp có count/reconciliation riêng.
- Contact legacy data phải quarantine cho đến khi binding, policy và contact-key grants từ CR-06/07 tồn tại; không được dùng workspace key làm fallback.
- Trước CR-07, repository phải fail closed nếu payload mới chứa phone, contact email, address hoặc private note; không chỉ quarantine dữ liệu legacy.
- Idempotent resume; không tạo hai key set cho một workspace.
- Dual-read chỉ trong migration flag rõ; không dual-write lâu dài.
- Rollback harness giữ encrypted changes, không âm thầm quay về stale plaintext.
- Search/calendar/analytics chạy trên decrypted in-memory data.

## Test bắt buộc

- Load/save/conflict/offline failure.
- Refresh/multi-tab không mất key state hoặc ghi plaintext.
- Migration idempotent, interrupted resume, checksum/reconciliation.
- Reconciliation không dùng unkeyed low-entropy plaintext fingerprint; manifest integrity theo CR-02.
- Legacy and encrypted workspace isolation.
- Create/update contact/private fields before CR-07 is rejected and never encrypted with workspace key.
- Browser/network inspection không có family plaintext trong request.

## Acceptance criteria

- Synthetic/ephemeral Preview workspace E2E pass; không dùng dữ liệu thật và production chưa cutover.
- Plaintext path có kill switch và migration audit evidence.
- Actual workspace migration chỉ được thực hiện trong CR-11 sau CR-06–10.
