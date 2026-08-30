# CR-01 — Threat Model and Security Boundary

## Mục tiêu

Khóa threat model, data classification, plaintext boundary và các security claim trước khi chọn thuật toán hoặc sửa schema.

## Việc phải làm

- Inventory mọi trường trong FamilyData, Supabase tables, Storage, drafts, activity, backups, logs và analytics.
- Gán mỗi field/content surface vào `server-metadata`, `account-pii`, `family-shared`, `person-private`, `contact-restricted`, `media`, `credential-secret` hoặc `public-config`. Các lớp bổ sung không phải subtype được phép log của `server-metadata`.
- Data-flow diagram từ browser → Vercel API → Supabase → Drive.
- Xác định adversaries, trust assumptions, breach scenarios và web-client limitation.
- Xác nhận quyết định đã khóa: graph topology, names và media đều thuộc protected payload; chỉ metadata tối thiểu trong target architecture được để rõ.
- Liệt kê chính xác dữ liệu server vẫn phải đọc để RLS/revision hoạt động.
- Viết wording được phép/không được phép dùng trong privacy/security communication.
- Inventory invitation token, OAuth/provider token, query string, browser history/referrer, telemetry, service worker/cache, crash report, WAL/replica/PITR và legacy backups.
- Tạo claim → assumptions → evidence → exclusions matrix.

## Không làm

- Không chọn crypto bằng code thử nghiệm.
- Không đổi schema hoặc production env.
- Không tuyên bố E2EE/zero knowledge trước khi acceptance criteria đạt.

## Acceptance criteria

- Mọi persistent/logged field có classification.
- Plaintext boundary cho graph topology/media và mọi persistence/logging surface được xác nhận.
- Có attacker matrix và residual risks.
- User duyệt security claims và non-recoverability contract.

## Validation/handoff

- Architecture review; threat scenarios reader-test.
- Handoff gồm data inventory, diagram, claims và open decisions đã đóng.
