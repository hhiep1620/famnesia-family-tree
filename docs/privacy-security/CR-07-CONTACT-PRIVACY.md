# CR-07 — Relationship-Aware Contact Privacy

## Prerequisite

- CR-02, 04 và 06 Done.

## Mục tiêu

Phone/email/address chỉ giải mã được bởi đúng audience; họ hàng vượt affinal boundary mặc định không được cấp key.

## Policy contract

Audience tối thiểu:

- `self_only`
- `direct_family`
- `close_blood`
- `blood_only`
- `workspace_members`
- `custom`

Default policy phải chặn đường đi qua spouse rồi tiếp tục sang họ hàng của spouse. Person đã bind kiểm soát policy của chính họ; explicit deny của person thắng owner. Owner chỉ là steward cho person chưa bind/chưa có account/đã mất. Deny thắng allow khi mâu thuẫn; không có emergency override trong v1.

## Việc phải làm

- Split contact payload khỏi family-shared payload và split ciphertext record theo enforceable field class; cùng key vẫn không cho phép bundle update vượt signed field scope.
- Tạo person contact key và wrapped grants per recipient.
- Tách view grant khỏi signed edit authorization. Policy principal cấp edit scope theo person/field cho owner/editor cụ thể; viewer hoặc recipient chỉ có view key không được ghi ciphertext mới.
- Policy engine dùng confirmed member-person binding và graph đã giải mã trên authorized client.
- Viết normative truth table cho distance, parent/child/sibling/spouse, half/step/adoptive, multiple paths, remarriage, disconnected/cyclic graph và affinal boundary. Khi có cả blood path và affinal path, policy dùng đường được phép mạnh nhất nhưng explicit deny vẫn thắng.
- Chỉ policy principal hợp lệ được ký grant bằng per-user policy signing key của CR-02; RLS kiểm tra principal/binding role, còn client kiểm tra key purpose, fingerprint, signature và policy/graph/binding versions.
- Preview “ai sẽ được xem” trước khi áp dụng.
- Relationship/policy/member changes re-evaluate recipients.
- Khi loại recipient, rotate contact key và re-encrypt contact payload; chỉ xóa grant là chưa đủ.
- Rotation/grant replacement là epoch state machine nguyên tử có fencing, resume và stale-envelope cleanup.
- API trả ciphertext cho member có quyền RLS nhưng chỉ recipient có envelope mới decrypt được.
- Export/search/card/detail không được leak contact qua derived text, accessibility label hoặc error.

## Test bắt buộc

- Direct family, blood cousin, cousin spouse và spouse-family boundary fixtures.
- Custom allow/deny.
- Unbound member denied.
- Revoke/relationship change rotates key.
- Malicious editor/client không thể tự cấp grant nếu không có policy-principal signature.
- Actor có contact view grant nhưng thiếu/expired/wrong-field `contact_edit_authorization` không update/clear được contact ciphertext.
- Malicious client có phone-edit authorization nhưng gửi operation target address/private-note hoặc ciphertext bundle nhiều field bị server từ chối dựa trên row metadata + signed scope, không dựa vào UI/client semantic check.
- UI tamper/API direct call không mở được contact.

## Acceptance criteria

- Ví dụ “gia đình vợ của anh họ” không giải mã được contact theo default policy.
- User có thể xem và override audience một cách rõ ràng.
- Artifact gồm truth table, signed-grant contract và failure-injection evidence.
