# CR-09 — GEDCOM and Common Portability Export

## Prerequisite

- CR-05, CR-07 và CR-08 Done.

## Mục tiêu

Import/export GEDCOM hoàn toàn trên client, không import ảnh, đồng thời khóa một authorization/privacy pipeline chung cho mọi plaintext export tích hợp: GEDCOM, JSON và Excel.

## Common portability-export contract

- `portability_export` là signed authorization purpose riêng theo CR-04/07; view/decrypt grant không tự tạo quyền export.
- Authorization bind actor, workspace/profile, format, person/field scope, policy/graph/binding version, signing fingerprint, expiry và single-use nonce.
- JSON/Excel/GEDCOM dùng cùng living-person/contact omission-redaction policy và cùng audit metadata; format serializer không được bypass policy.
- Plaintext output chỉ được tạo/download trong browser sau authorization. Không gửi file/payload plaintext lên API, telemetry hoặc backup.
- V1 export không đưa media blob, signed URL, storage/Drive ID hoặc ảnh vào JSON/Excel/GEDCOM; media portability cần contract riêng.
- Nếu JSON/Excel serializer chưa migrate sang pipeline này khi encrypted write cutover, disable nút export tương ứng thay vì giữ legacy bypass.

## Format contract

- Import GEDCOM 5.5.1 và FamilySearch GEDCOM 7.0; pin patch/version compatibility matrix trong artifact.
- Export GEDCOM 7.0 mặc định.
- Chỉ thêm export 5.5.1 compatibility nếu test matrix xác nhận nhu cầu.
- V1 chỉ nhận `.ged`, từ chối `.gdz` rõ ràng.
- GEDCOM 7.0 yêu cầu UTF-8. GEDCOM 5.5.1 xử lý charset theo `HEAD.CHAR` trong version matrix; unsupported charset bị reject rõ, không best-effort decode.
- Chốt số cụ thể cho kích thước, line length, nesting depth và record count trước implementation.
- Gặp `OBJE`, `FILE`, URL hoặc GEDZIP media: không fetch/upload; preview cảnh báo số media bị bỏ qua.

## Việc phải làm

- Streaming/defensive parser, syntax diagnostics và version detection.
- Intermediate GEDCOM AST/domain mapping; không map trực tiếp vào DB rows.
- `INDI`, `FAM`, `NAME/NICK`, `SEX`, `BIRT/DEAT`, `FAMC/FAMS`, `MARR/DIV`, notes/contact theo policy.
- Stable UID/REFN mapping; duplicate/merge preview.
- Famnesia extension registry cho lunar, subject, order, confidence nếu cần round-trip.
- Unknown extension preservation strategy hoặc explicit loss report.
- Unknown tags/extensions mặc định quarantine/loss report, không opaque round-trip. Chỉ registry entry có data classification/export policy mới được preserve.
- Preview render untrusted content như text; parser/preview không phát network request cho bất kỳ tag, URL, note hoặc extension nào.
- Import: parse → preview → map → integrity validate → encrypt → commit.
- Contact/private data import phải đi qua binding, policy và contact-key pipeline của CR-07; thiếu policy/key thì quarantine hoặc bỏ qua có báo cáo, tuyệt đối không fallback sang workspace key.
- Export: kiểm tra common authorization record → decrypt allowed fields → apply format-independent policy → serialize GEDCOM/JSON/Excel → browser download.
- Authorization được tạo/ký trên client bởi policy principal, lưu dưới encrypted/signed artifact + plaintext metadata tối thiểu theo schema reserved ở CR-04; server RLS/API kiểm tra issuer role/binding, expiry, purpose/scope và atomically consume nonce. Policy/binding/key rotation revoke authorization chưa dùng bằng version/fingerprint mismatch.
- Contact không có key thì omit/redact và báo export scope.
- Chốt một hành vi `omit` hoặc `redact` theo tag trong mapping; không để agent tự chọn. Living-person/export policy áp dụng độc lập với decryptability.
- Explicit deny của person chặn contact export kể cả owner/steward; owner chỉ quyết định cho person chưa bind hoặc đã mất theo CR-07.
- Export authorization chỉ kiểm soát luồng tích hợp; tài liệu không claim ngăn được user đã xem plaintext tự sao chép ngoài ứng dụng.

## Test bắt buộc

- Official/minimal fixtures 5.5.1 và 7.x; malformed, recursive/deep, oversized, invalid encoding.
- Round-trip semantic equality cho supported fields và extensions.
- Multi-spouse, divorce, missing parent, unknown sex/date, Vietnamese Unicode.
- OBJE ignored without network request.
- `.gdz` rejected; unknown extension cannot bypass contact/media classification.
- Export của restricted member không leak contact.
- Expired/replayed/wrong-scope export authorization fail; view-only member không thể gọi luồng export tích hợp.
- Concurrent replay chỉ một request consume nonce thành công; revoked policy/binding/signing key fail dù record còn hạn.
- Golden policy fixture cho cùng actor/scope tạo tập person/contact giống nhau ở GEDCOM, JSON và Excel; không format nào leak media reference hoặc field bị omit.

## Acceptance criteria

- Application không gửi/persist plaintext portability file ngoài file user chủ động chọn/tải; giới hạn browser/device/extensions được công bố.
- Import lỗi không thay đổi active data.
- Validator/readers/corpus được pin tên và version; golden, differential và fuzz/property tests pass.
