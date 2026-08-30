# CR-03 — Google Drive User Key Vault

## Prerequisite

- CR-02 Done.
- Google OAuth/Drive scope decision được user duyệt.

## Mục tiêu

Tạo và khôi phục recovery secret trong Drive của chính user mà không đưa plaintext secret qua Famnesia API.

## Việc phải làm

- Chọn visible app-created folder với `drive.file` hoặc hidden `appDataFolder`; ưu tiên visible folder nếu user cần tự kiểm tra/sao lưu.
- Tách Drive authorization khỏi assumption “Supabase login luôn có Drive token”.
- Xử lý provider token expiry/reconnect; không lưu Google refresh token ở client plaintext.
- Tạo versioned key file không chứa PII trong filename/content ngoài metadata tối thiểu.
- Browser tạo recovery secret, upload trực tiếp lên Drive và dùng nó mở encrypted user private key.
- Implement minimal encrypted-private-key blob/RLS contract đã khóa ở CR-02; CR-04 mở rộng family/key-envelope schema.
- Drive key manifest pin own encryption/signing public-key fingerprints, genesis trust anchor và recovery checkpoint; public-key change không được silent.
- Invitation onboarding verify owner-signed envelope và client-generated out-of-band/URL-fragment commitment trước khi pin workspace genesis fingerprint; không log/referrer-leak fragment.
- Multi-device restore, duplicate key-file detection và explicit account mismatch.
- Recovery kit download/print và confirmation trước khi bật encryption.
- Tạo/restore `per-user recovery backup` tối thiểu trong clean crypto fixture trước khi phase Done; phase này chỉ chứng minh user identity/private-key bootstrap, chưa claim restore toàn workspace.
- Không overwrite key file nếu chưa xác minh key hiện tại và encrypted data compatibility.

## Test bắt buộc

- First device create; second device restore.
- Wrong Google account/file denied.
- Server-substituted genesis fingerprint/invitation fails commitment verification.
- Missing/deleted/corrupt key file fail closed.
- Expired Drive token reconnect.
- Supabase-only và Drive-only attacker không giải mã được test fixture.
- Supabase auth/private-key store loss: user crypto principal và test envelope được restore bằng per-user backup + Drive/recovery kit; workspace disaster restore được kiểm tra ở CR-10 sau khi data contract tồn tại.

## Acceptance criteria

- API/log không thấy recovery secret.
- User hiểu mất Drive secret + recovery kit có thể mất dữ liệu.
- Không phụ thuộc Google Picker folder selection cho Supabase workspace.
