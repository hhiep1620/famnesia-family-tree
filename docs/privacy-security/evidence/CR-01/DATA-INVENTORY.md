# CR-01 Data Inventory and Classification

## Quy ước phân loại

| Class | Ý nghĩa target |
|---|---|
| `server-metadata` | Server được đọc để xác thực, RLS, routing, revision, retention và vận hành tối thiểu. Không được chứa nội dung gia đình. |
| `account-pii` | Login email, display name/avatar và identity metadata cần cho account/collaboration. Server đọc được nhưng phải có purpose, reader scope, retention và không được tự động đưa vào log/analytics. |
| `family-shared` | Nội dung chung của gia đình, phải nằm trong protected payload và được mã hóa trên client. |
| `person-private` | Nội dung riêng/tương đối nhạy cảm của một người, phải mã hóa; v1 có thể dùng person/private key theo contract CR-02/07. |
| `contact-restricted` | Điện thoại, địa chỉ và contact tương tự; phải có key/grant riêng, không chỉ UI hiding. |
| `media` | Ảnh, thumbnail, caption và metadata media; bytes phải mã hóa trước upload. |
| `credential-secret` | Auth token, recovery/key material hoặc infrastructure credential. Không phải content metadata; phải ở secret store/memory phù hợp, có owner/rotation và không log. |
| `public-config` | Identifier/key cố ý public cho browser và không cấp quyền dữ liệu. Phải restriction/quota đúng; không được dùng như secret hoặc trust decision. |

`Current` mô tả code/schema hiện tại. `Target` là boundary đã khóa cho các CR sau. Việc một cột đang plaintext không làm nó trở thành `server-metadata`.

## FamilyData domain

| Object/fields | Class | Current persistence | Target |
|---|---|---|---|
| `schemaVersion` | `server-metadata` | JSON/Postgres đọc được | Crypto/schema version rõ để dispatch decoder; không chứa domain content |
| Payload `updatedAt` | `family-shared` | JSON/Postgres đọc được | Mã hóa; server dùng row/revision timestamp độc lập |
| Profile `id` | `server-metadata` | `legacy_id` plaintext | Thay bằng random opaque record ID; không encode họ/tên/thứ tự |
| Profile `name`, `lineageSurname`, `description` | `family-shared` | `family_profiles` plaintext | Ciphertext |
| `photoFileId` | `media` | Drive/media reference rõ | Opaque ciphertext/media reference; không lộ filename |
| `subjectPersonId` | `family-shared` | FK plaintext, làm lộ topology | Ciphertext; server không biết chủ thể |
| `requiresSecret`, `isActive` | `family-shared` | Boolean plaintext | Ciphertext; không có ngoại lệ server-readable |
| Person `id` | `server-metadata` | Legacy ID plaintext | Random opaque record ID rõ |
| Person `profileId` | `family-shared` | FK rõ | Ciphertext; server không giữ profile-person mapping |
| `name`, `nickname`, `gender` | `family-shared` | `persons` plaintext | Ciphertext |
| `birthDate`, `isDeceased`, `deathDate`, `deathLunar`, confidence | `family-shared` | `persons` plaintext | Family-shared ciphertext để calendar/dashboard hoạt động client-side; không server index |
| `phone1`, `phone2` | `contact-restricted` | `persons` plaintext | Contact ciphertext + audience grants |
| `address` | `contact-restricted` | `persons` plaintext | Contact ciphertext + audience grants |
| `note` | `person-private` | `persons` plaintext | Person-private/contact-key ciphertext trong v1; không nằm trong family-shared ciphertext |
| `ancestralRole`, `sortOrder`, domain `createdAt`/`updatedAt` | `family-shared` | `persons` plaintext | Ciphertext; server có timestamps vận hành riêng không mang nghĩa domain |
| Relationship IDs, endpoints, `type`, spouse `status`, dates, order, confidence | `family-shared` | `relationships` plaintext | Toàn bộ graph topology và attributes trong ciphertext |
| Media person/profile binding, primary flag, caption, taken date, order | `media` | `media` plaintext metadata | Encrypted manifest/caption; opaque object ID rõ |
| Media original/thumbnail bytes | `media` | Private Supabase Storage hoặc legacy Drive, nhưng server/provider đọc được | Client-encrypted bytes; thumbnail cũng encrypted |
| `timezone`, `locale` | `family-shared` | Workspace plaintext | Ciphertext; pre-unlock UI dùng app defaults, không đọc family preference |
| `duplicateSuppressions` | `family-shared` | Workspace JSONB plaintext | Ciphertext |

## Supabase/Auth/Postgres inventory

Danh sách authoritative duy nhất về field được để rõ nằm tại [Server-readable plaintext whitelist](./DATA-FLOW.md#server-readable-plaintext-whitelist--authoritative). Bảng inventory này phân loại content/surface, không tạo whitelist thứ hai. FK graph giữa profile/person/relationship/media không được rõ; ngoại lệ hẹp là opaque `person_id + field_class + key_epoch` của contact authorization và confirmed member-person binding. Ngoại lệ này không chứa tên hay graph edges nhưng làm lộ số contact records/grants theo opaque person.

| Table/surface | Fields | Class and target decision |
|---|---|---|
| `auth.users` (provider-managed) | user ID, login email, provider metadata, auth/session records | ID/session timing là `server-metadata`; email/name/avatar/provider identity là `account-pii`; session/token là `credential-secret`. Provider retention/backup chưa được source-local xác minh. |
| `user_profiles` | `id`, login `email`, `display_name`, `avatar_url`, timestamps | ID/timestamps là `server-metadata`; email/name/avatar là `account-pii`, chỉ self + current workspace peers theo purpose collaboration, không log/analytics; deletion/retention theo account lifecycle CR-11. Đây không phải contact field của nhân vật. |
| `workspaces` | `id`, owner, name, schema/data version, timezone, locale, duplicate suppressions, legacy Drive ID, canonical-ready, timestamps | IDs/owner/version/readiness/timestamps là `server-metadata`; workspace name/timezone/locale/suppressions là `family-shared` ciphertext; legacy Drive ID là sensitive routing metadata và phải xóa sau rollback window. |
| `workspace_members` | workspace/user IDs, role, inviter, timestamps | `server-metadata`; server cần cho RLS. |
| `workspace_invitations` | workspace, target email, role/status, token hash, inviter/acceptor, expiry/accept/revoke timestamps | Workflow fields là `server-metadata`; target email là `account-pii`; raw token là `credential-secret`. Chỉ hash lưu DB; raw query-token flow là legacy exception. |
| `family_profiles` | toàn bộ profile fields và FK chủ thể | Chỉ random row ID + workspace ID + operational timestamps được rõ; còn lại `family-shared`/`media` ciphertext. |
| `persons` | toàn bộ person fields | Như bảng FamilyData phía trên; target không còn plaintext domain columns. |
| `relationships` | endpoints/type/status/dates/order/confidence | `family-shared`; target ciphertext vì làm lộ graph topology. |
| `media` | bindings, paths, MIME, sizes, checksum, caption/date/order/status | Random object ID, crypto version, ciphertext size/checksum/status là `server-metadata`; checksum chỉ trên ciphertext. Person/profile binding, caption/date/order là encrypted `media`; MIME rõ chỉ là generic encrypted-blob type. |
| `activity_events` | actor identity, action, entity type/ID, summary, metadata, time | actor/action/time là `server-metadata`; free-text `summary`, entity mapping và arbitrary `metadata` hiện có thể lộ `family-shared`. Target dùng event code + opaque IDs/counts, không tên/người/contact. |
| `commits` | commit ID, actor, base/result version, operation counts, status/error code/client time, `auto_merged`, `request_checksum` | IDs/version/count/status/flag/time là `server-metadata`. Current `request_checksum` là MD5 của base version + plaintext operations nên là plaintext-derived protected fingerprint, không an toàn; target thay bằng random idempotency token hoặc digest trên ciphertext/keyed digest. |
| `draft_submissions` | contributor, version/revision/checksum/status/note/reviewer/timestamps | workflow IDs/version/status/timestamps là `server-metadata`. Current checksum là deterministic SHA-256 của plaintext operations và bị coi là protected fingerprint; target checksum chỉ trên ciphertext hoặc keyed digest. `review_note` luôn encrypted `family-shared`. |
| `draft_operations` | operation ID/type/entity/profile, `value`, `changes`, `base_values`, status/note | Opaque operation ID/status là `server-metadata`; operation type/entity mapping và values có thể thuộc `family-shared`, `person-private`, `contact-restricted` hoặc `media` và phải mã hóa. |
| `draft_review_events` | revision/reviewer/decision/operation IDs/note/time | reviewer/decision/opaque operation IDs/time là workflow metadata; note luôn encrypted `family-shared`. |
| `workspace_snapshots` | version/schema/reason/`family_data`, creator/time | version/reason/time metadata rõ; `family_data` là full plaintext snapshot hiện tại, target chỉ encrypted backup envelope. Reason phải dùng enum/code, không free text PII. |
| `migration_runs` | source type/revision, source/manifest checksums, status/dry-run/report/cursor/actor/timestamps | Operational fields là `server-metadata`; current source/manifest checksums derive từ plaintext bundle/manifest và là protected fingerprints. Sau migration chúng phải bị xóa theo retention hoặc thay bằng ciphertext-only/keyed digests. `report` phải schema-closed/redacted. |
| `media_uploads` | workspace/person/profile bindings, creator/status/object paths/MIME/sizes/checksum/legacy claim/expiry/timestamps | Random object state/size/ciphertext checksum được rõ; person/profile binding là encrypted `media`; paths opaque, MIME generic, không legacy/domain IDs. |
| `media_cleanup_queue` | workspace, paths, status/attempt/error/timestamps | `server-metadata`; `last_error` phải sanitized, path opaque. |
| DB functions/RLS | membership, revision, commit/draft operations, snapshot builders | Hiện functions đọc và dựng lại plaintext FamilyData. Target functions chỉ authorize/store opaque ciphertext và không parse family fields. |

## Supabase Storage

| Bucket/object | Current | Class | Target |
|---|---|---|---|
| `family-media` original + thumbnail | Private bucket; RLS hạn chế member nhưng provider/operator vẫn đọc bytes | `media` | Encrypted bytes; random opaque paths; no EXIF/plain thumbnail |
| `family-exports` | Bucket được tạo, không thấy production code path ghi trong source review | Có thể chứa `family-shared`, `person-private`, `contact-restricted`, `media` | Export plaintext chỉ được tạo client-side/download trực tiếp; không persist server-side. Nếu cần server artifact thì phải encrypted và TTL. |
| `family-backups` | Bucket được tạo; canonical backup hiện dùng Postgres `workspace_snapshots` | `family-shared`, `person-private`, `contact-restricted`, `media` | Chỉ encrypted self-contained bundle, retention rõ |
| `storage.objects` metadata | bucket, path/name, owner, MIME, size, timestamps, provider metadata | `server-metadata` | Path/name phải random opaque; MIME generic encrypted blob; checksum nếu có chỉ tính trên ciphertext; object size/timing vẫn là traffic metadata |

Private bucket/RLS là access control, không phải encryption khỏi operator/provider.

## Browser inventory

| Surface | Current content | Class/risk | Target rule |
|---|---|---|---|
| In-memory React state | Full decoded FamilyData, forms, image blobs | `family-shared`, `person-private`, `contact-restricted`, `media`; unlocked keys là `credential-secret` | Plaintext được phép trong memory sau unlock; clear on sign-out/lock best-effort |
| IndexedDB `famnesia-drafts` | `workspaceId`, `userId`, base revision, full operations including values/baseValues, timestamps | IDs/revision/timestamps là `server-metadata`; operation content có thể là `family-shared`, `person-private`, `contact-restricted`, `media` plaintext | Encrypt local draft with unlocked device/workspace key; TTL vẫn 7 ngày |
| `localStorage['family-tree-workspace']` | active workspace ID | `server-metadata` | Opaque ID allowed; no key/secret/payload |
| Supabase JS persisted session | access/refresh session material managed by SDK | `credential-secret` | Không copy vào app logs/query; rely on SDK storage controls, CSP/XSS defense; document sign-out limits |
| URL query `invite` | raw invitation token until accepted/removed by `history.replaceState` | `credential-secret` | Current gap: no `Referrer-Policy` header and external Google Fonts load exists before React scrub. Legacy flow must be removed; target uses non-authorizing join code/POST. |
| OAuth callback URL/hash | PKCE single-use authorization code/state, hoặc legacy implicit access/refresh token | `credential-secret` | Target chỉ cho ngoại lệ hẹp code+state: exact allowlist, verifier binding, no-referrer, immediate scrub và no logging. Access/refresh token trong URL/hash bị cấm và phải fail closed |
| Browser history/referrer | May retain invite/OAuth URL before scrub or be sent to third parties | Invite/OAuth values là `credential-secret`; route/workspace ID là `server-metadata`; login identity có thể là `account-pii` | Explicit headers and immediate scrub; negative browser tests in rollout |
| Cache API/service worker | No app service-worker/cache implementation found | Future cache could contain `family-shared`, `person-private`, `contact-restricted`, `media` hoặc `credential-secret` | Do not cache API/ciphertext-decrypted responses; any future PWA CR must re-review |
| JSON family export | Full FamilyData including contact/note via `serializeFamilyData` | `family-shared`, `person-private`, `contact-restricted`, `media` plaintext download | Current Data tab renders export for every workspace role, including viewer; đây là current exposure. CR-09 thay bằng common signed export policy + client-only download |
| Excel family export | Full FamilyData passed to workbook exporter | `family-shared`, `person-private`, `contact-restricted`, `media` plaintext download | Current Data tab cũng hiển thị cho mọi workspace role; CR-09 áp dụng cùng common policy như JSON/GEDCOM, không server persistence |
| Draft recovery download | Full local operations and `baseValues` JSON | `server-metadata` plus possible `family-shared`, `person-private`, `contact-restricted`, `media` plaintext | Không phải portability export; target encrypt recovery draft or remove path during CR-08, never bypass common recovery/export authorization |
| Clipboard/download generally | Invite links and user-authorized plaintext can leave app | `credential-secret`, `family-shared`, `person-private`, `contact-restricted` hoặc `media` | Explicit user action/warning; no promise to revoke already copied plaintext |

## Infrastructure and server credentials

| Secret/config | Current owner/storage | Blast radius if compromised | Required control |
|---|---|---|---|
| `SUPABASE_SECRET_KEY` / service-role | Vercel/server secret; migration CLI env | Bypass RLS, read/write/delete current plaintext DB/metadata and invoke migration paths | `credential-secret`; server/migration only, least-use, rotate in Supabase, audit use; never `VITE_*` |
| `SESSION_SECRET` | Vercel server env | Forge/validate legacy OAuth state integrity depending on implementation; session flow compromise | `credential-secret`; ≥32 chars, rotate with legacy-session invalidation |
| `TOKEN_ENCRYPTION_KEY` | Vercel server env | Decrypt legacy Google access/refresh tokens in Redis | `credential-secret`; rotate/re-encrypt or revoke tokens; remove after rollback window |
| `GOOGLE_CLIENT_SECRET` | Vercel server env | Abuse OAuth client/token exchange; combined with tokens increases Drive exposure | `credential-secret`; Google Secret Manager/Vercel secret, rotate in Google Cloud |
| Upstash Redis REST token | Vercel server env | Read/delete legacy sessions, encrypted tokens and legacy collaboration/draft/mirror records | `credential-secret`; rotate in Upstash, purge legacy data, network/account audit |
| Google Picker API key/project number | Browser config/server response; `public-config` | Quota abuse or unauthorized API use if restrictions weak; does not itself grant Drive data | Strict HTTP referrer/API restrictions; never market as encryption key |
| Supabase publishable key/URL | Browser `public-config` | Expected public; security relies on Auth/RLS, not secrecy | RLS production verification required |
| Vercel/GitHub/Supabase/Google deployment admin credentials | Provider-controlled operator accounts, not repository | Change JS/env/schema, read secrets, disable protections | `credential-secret`; MFA, least privilege, audit logs, break-glass and rotation; malicious deploy remains web-client residual risk |

Infrastructure credential inventory records control ownership, but these secrets do not decrypt target protected payload by themselves. Combined compromise scenarios are covered in the threat model.

## Vercel/API/logging inventory

| Surface | Finding | Classification/decision |
|---|---|---|
| API request bodies | Current family commit/replace/draft requests contain plaintext FamilyData/operations | `family-shared`, `person-private`, `contact-restricted`, `media`; target API accepts ciphertext only |
| Authorization/cookies | Supabase bearer header or HttpOnly legacy session cookie | `credential-secret`; never log or return |
| API responses | Current family/snapshot/draft responses contain plaintext | `family-shared`, `person-private`, `contact-restricted`, `media`; target returns ciphertext envelope |
| `apiError` | Known errors return code/message/details; unknown errors log name/message | Fixed code/status là `server-metadata`; current free text/details can reflect `account-pii`, protected content hoặc `credential-secret`, nên phải schema-close/redact |
| Repository logging | Supabase error code/message, workspace ID, deferred cleanup error; Drive errors sometimes message | `server-metadata` only. Redaction tests required; provider messages must be mapped before log. |
| Analytics UI | Aggregation runs client-side over loaded FamilyData; no third-party analytics SDK found in dependencies/source | Derived counts are `family-shared` and can infer `person-private`; keep client-side, do not emit names/count breakdown |
| Crash reporting/telemetry | No Sentry/PostHog/Mixpanel or similar integration found | Future capture may contain `account-pii`, protected content hoặc `credential-secret`; default-deny payload/context capture |
| CDN/browser cache | API JSON sets `Cache-Control: no-store`; current Supabase media response sets only `Content-Type`, so plaintext original/thumbnail may enter browser/intermediary caches | Current gap: add `no-store` before encryption rollout and purge/expire legacy caches where possible. Target encrypted blobs may be cacheable only after explicit review. |
| Security headers | `vercel.json` has rewrites only; no CSP or `Referrer-Policy`; CSS imports Google Fonts cross-origin | Current gap: invitation/OAuth and malicious-script risk are not fully mitigated. CR-11 must evidence CSP, `Referrer-Policy: no-referrer`, no third-party script/resource on secret-bearing entry flow and browser tests. |
| Vercel/provider access logs | Not visible in repository | Route/status/latency là `server-metadata`; IP/UA là `account-pii`; current secret-bearing URL could add `credential-secret`. Verify retention and redact/query exclusion in CR-11 |

## Legacy Drive/Redis rollback surfaces

Các paths này vẫn tồn tại trong code để rollback/migration dù production target đã cut over Supabase.

| Surface | Current content | Class/decision |
|---|---|---|
| Drive `family.json`, backup JSON, activity JSONL | Full FamilyData/activity plaintext | `family-shared`, `person-private`, `contact-restricted`, `media` references plus actor `account-pii`; legacy exception only |
| Drive photos/thumbnails | Plain image bytes and filenames containing timestamp + original filename | `media`; legacy exception; target encrypted opaque filenames |
| Drive collaboration draft JSON/assets | Full operations and photo bytes | `server-metadata` plus `family-shared`, `person-private`, `contact-restricted`, `media`; legacy exception |
| Drive mirrors/history | Full canonical JSON/photos/backups/activity copies | `account-pii`, `server-metadata`, `family-shared`, `person-private`, `contact-restricted`, `media`; replicated outside owner revocation |
| Upstash legacy sessions | Google identity + encrypted access/refresh token, expiry | Identity là `account-pii`, session timing/ID là `server-metadata`, token là `credential-secret`; ciphertext depends on `TOKEN_ENCRYPTION_KEY` |
| Upstash legacy collaboration index | member email/role, Drive IDs, full draft summaries/operations, mirror manifest/status | `account-pii`, `server-metadata` plus possible `family-shared`, `person-private`, `contact-restricted`, `media`; purge after rollback window |
| Migration reports/bundles | Checksums, paths, reconciliation metadata; input bundle contains full plaintext | `server-metadata` plus `family-shared`, `person-private`, `contact-restricted`, `media`; checksum may be protected fingerprint; ephemeral/redacted only |

## Backup, replica, WAL and retention boundary

- Postgres `workspace_snapshots` currently duplicates full plaintext FamilyData.
- Supabase managed WAL, replicas, PITR, database backups, Storage replication/versioning and deletion latency are not defined by repository source. Until verified, assume ciphertext/plaintext persists according to provider policy and may outlive row deletion.
- Target security must not depend on immediate provider deletion: old backups may retain ciphertext, nhưng không được lưu plaintext checksum/fingerprint; revoked/rotated keys must prevent decryption where the threat model promises it.
- Legacy Drive backup/mirror copies and user exports are outside owner revocation once copied to another account/device.
- Exact production retention, Vercel logs and Supabase backup settings are CR-11 evidence items, not claims completed by CR-01.
