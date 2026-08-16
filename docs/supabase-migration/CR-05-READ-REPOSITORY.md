# CR-05 — Supabase Read Repository and FamilyData Mapping

## Mục tiêu

Cho phép Famnesia đọc workspace/canonical family data từ Supabase và dựng đúng `FamilyData` hiện tại, phía sau `DATA_BACKEND=supabase`. Phase này chưa bật write Supabase.

## Prerequisite

- Phase 04 Done.
- Có ít nhất seed workspace và user membership trong local Supabase.
- Schema mapping đã được xác nhận.

## Việc phải làm

### 1. Supabase repository

Implement read methods:

- List workspaces của current user.
- Load workspace access/capabilities.
- Load profiles, persons, relationships và media.
- Load recent activity.
- Load draft summaries phù hợp role nếu UI cần.

### 2. Mapper

Tạo mapper hai chiều có test, nhưng phase này chỉ dùng DB → domain:

- Null/optional values giữ semantics.
- Date trả `YYYY-MM-DD`; timestamp ISO UTC.
- Lunar date map đầy đủ.
- Relationship/person IDs giữ nguyên.
- Media object key không giả làm Drive file ID; domain cần field trung lập hoặc adapter URL.
- Sort deterministic để snapshot/parity test ổn định.

### 3. Read API parity

Giữ response shape mà `useFamilyData` cần hoặc thực hiện một thay đổi typed, nhỏ và có compatibility adapter.

- Empty workspace behavior giống hiện tại.
- Workspace selection không tạo workspace rỗng ngoài ý muốn.
- Viewer/contributor/owner capabilities map đúng.
- API response nhạy cảm `no-store` nếu vẫn qua Vercel.

### 4. Seed/parity fixtures

- Seed dữ liệu đại diện: nhiều profile, deceased/lunar, spouse status, confidence, media, subject.
- Tạo cùng fixture dạng `FamilyData` và database rows.
- Assert DB read → `FamilyData` bằng expected normalized fixture.

### 5. UI read-only smoke

Với Supabase data backend, xác minh read-only:

- Tree render.
- Calendar render.
- Search/kinship/analytics render.
- Person details/media placeholder render.
- Data page hiển thị workspace/activity.

Write controls phải disabled hoặc trả thông báo “write backend chưa bật” thay vì ghi Drive/Supabase nhầm.

## Không làm

- Không implement commit/write.
- Không upload Storage.
- Không import dữ liệu production.
- Không xóa Drive adapter.
- Không bật production.

## Acceptance criteria

- Local/Preview Supabase seed render đủ các view chính.
- Parity fixture không mất field.
- User chỉ list/load workspace có membership theo RLS.
- Không có N+1 nghiêm trọng; query count/latency được ghi lại.
- Drive read path regression pass.
- Unsupported write bị chặn rõ.

## Validation

```bash
npx supabase db reset
npm test
npm run lint
npm run build
git diff --check
```

Manual/App test:

- Owner seed.
- Viewer seed.
- Non-member.
- Empty workspace.
- Multi-profile switch.

## Handoff bắt buộc

- Query/mapping files.
- Parity test evidence.
- UI views smoke-tested.
- Missing write/media behavior.
- Update `TASK-STATUS.md`: Phase 05 Done, Phase 06 next.
