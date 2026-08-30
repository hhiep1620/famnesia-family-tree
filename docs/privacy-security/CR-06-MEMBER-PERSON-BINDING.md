# CR-06 — Authenticated Member to Person Binding

## Prerequisite

- CR-04/05 Done.

## Mục tiêu

Biết mỗi account là nhân vật nào trong từng family profile để tính quyền contact theo quan hệ.

## Việc phải làm

- Schema `workspace_member ↔ profile/person`, trạng thái pending/confirmed/revoked.
- User đề xuất “Tôi là ai”; owner xác nhận đúng person.
- Một account có thể bind khác nhau giữa profiles; không tự match chỉ bằng tên/email/phone.
- Chặn tự claim person khác, duplicate conflicting bindings và owner spoof.
- Rebinding yêu cầu owner review và trigger re-evaluation key grants.
- Binding confirmation pin recipient public-key fingerprint/binding version; key change yêu cầu flow riêng.
- Unbound member mặc định không nhận contact key.
- Audit dùng opaque IDs, không log person name/contact.

## Test bắt buộc

- Claim/confirm/reject/rebind/revoke.
- Contributor/viewer không tự confirm.
- Cross-workspace/profile denied.
- Binding change invalidates stale grants.

## Acceptance criteria

- Confirmed binding artifact có stable binding version và pinned recipient encryption/signing fingerprints; CR-07 phải dùng chính artifact này để trace mọi relation-based grant.
