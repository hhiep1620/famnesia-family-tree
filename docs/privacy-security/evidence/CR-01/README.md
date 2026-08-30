# CR-01 Evidence — Threat Model and Security Boundary

## Trạng thái

`DONE` — inventory, data flow, threat model và claim matrix đã được soạn từ source/schema hiện tại; reader/security review không còn P0/P1/P2; owner đã phê duyệt toàn bộ decision rows lúc `2026-08-30T14:32:09Z`.

CR-01 chỉ thay đổi tài liệu. Không có code, database migration, environment variable hay production state nào được thay đổi.

## Canonical artifacts

- [DATA-INVENTORY.md](./DATA-INVENTORY.md) — mọi surface lưu trữ/logging đã biết và phân loại dữ liệu.
- [DATA-FLOW.md](./DATA-FLOW.md) — current/target flows và plaintext boundary.
- [THREAT-MODEL.md](./THREAT-MODEL.md) — assets, adversaries, attacker matrix, assumptions và residual risks.
- [CLAIM-MATRIX.md](./CLAIM-MATRIX.md) — wording được phép/cấm, evidence gate và exclusions.

## Kết luận kiến trúc khóa tại CR-01

1. Tên người, graph topology, ngày tháng, ghi chú, contact, caption và media bytes đều là protected payload; không trường nào trong nhóm này được giữ plaintext trong target architecture.
2. Server chỉ được đọc các trường trong closed [Server-readable plaintext whitelist](./DATA-FLOW.md#server-readable-plaintext-whitelist--authoritative); mọi trường không có trong whitelist mặc định phải mã hóa hoặc bị loại bỏ.
3. Supabase/Storage hiện tại vẫn chứa FamilyData, snapshot, draft operation và media dạng server đọc được. Vì vậy production hiện tại **chưa** đạt client-side encryption, E2EE hay zero knowledge.
4. Contact phải có cryptographic denial riêng; ẩn số điện thoại bằng UI không phải biện pháp bảo mật.
5. Web client không bảo vệ được key trước JavaScript độc hại được chính origin hợp lệ phát hành, thiết bị/browser bị chiếm quyền hoặc người nhận đã xem rồi sao chép.
6. Không có operator master key. Recovery cần một tổ hợp artifact + credential hợp lệ được mô tả trong threat model; mất mọi tổ hợp phục hồi và thiết bị đã unlock có thể làm toàn bộ hoặc một phần dữ liệu mất khả năng phục hồi vĩnh viễn.

## Source evidence đã đọc

| Surface | Source |
|---|---|
| FamilyData và validation | `src/types/family.ts`, `src/schema/familyDataSchema.ts` |
| Browser draft/session/workspace selection | `src/draft/draftStorage.ts`, `src/services/authRepository.ts`, `src/services/supabase/browserClient.ts`, `src/services/familyRepository.ts` |
| Supabase relational schema/RLS/Storage | `supabase/migrations/20260814000100_initial_family_schema.sql` đến `20260814000600_drive_migration_runs.sql` |
| Supabase mapping/read/write | `api/_server/supabase/familyMapper.ts`, `readBackend.ts`, `writeBackend.ts`, `mediaBackend.ts`, `collaborationBackend.ts` |
| HTTP auth/error boundary | `api/_server/auth.ts`, `api/_server/http.ts`, `api/_server/supabase/serverClient.ts` |
| Legacy Drive/Redis rollback path | `api/_server/drive.ts`, `sessionRepository.ts`, `collaborationRepository.ts`, `mirror.ts` |
| OAuth token protection | `api/_server/oauth.ts`, `tokenEncryption.ts`, `cookies.ts` |
| Runtime selectors | `api/_server/backendSelectors.ts`, `requestBackend.ts`, `.env.example`, `vercel.json` |

Đây là bằng chứng source-local, không phải bằng chứng cấu hình production hiện hành, provider retention hoặc independent security audit.

## Completion gate

Nguồn sự thật duy nhất cho quyết định owner là bảng **Approval record** trong [CLAIM-MATRIX.md](./CLAIM-MATRIX.md). Không đánh dấu CR-01 Done nếu thiếu một trong ba gate:

- [x] Reader review không còn P0/P1/P2 mở.
- [x] Security review không còn P0/P1/P2 mở.
- [x] Mọi owner decision row trong Approval record có owner identity, UTC timestamp và `APPROVED`.

Cả ba gate đã hoàn thành. Theo chỉ đạo hiện tại, dừng sau CR-01 và không bắt đầu CR-02.

## Validation

- Source/schema baseline: commit `c4b01131aad2b400cb1121b911ad5f36385c9e68`, branch `codex/fix-supabase-shared-workspace-connect`, reviewed ngày 2026-08-30. Working tree có untracked documentation pack và `famnesia-template-v3.xlsx`; workbook không được đọc hay sửa trong CR-01.
- Secret/PII check: artifact không chứa production token, raw key, email người thật hoặc family payload thật.
- Reader review: pass; không còn P0/P1/P2 sau ba vòng.
- Security review: pass; không còn P0/P1/P2 sau ba vòng.
- Markdown links/final newlines: 25 files pass.
- `npm test`: 29 files, 128 tests pass.
- `npm run lint`: pass.
- `npm run build`: pass; chỉ còn cảnh báo bundle chunk >500 kB, không liên quan CR-01 docs.
- `git diff --check`: pass.
- Commit: `PENDING`.
