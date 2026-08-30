# CR-14 — Family Dashboard and Multi-View Explorer

## Prerequisite

- CR-05, CR-07, CR-08 và CR-13 Done.
- Dùng `Profile.subjectPersonId`/active-profile contract từ encrypted data schema CR-04/05; missing subject là trạng thái được test, không phải blocker ngầm.

## Mục tiêu

Biến màn hình chi tiết gia phả thành dashboard tổng quan có một khung explorer thống nhất cho bốn chế độ `Danh sách | Sơ đồ cây | Mindmap | Bong bóng`.

## Dashboard header

- Tên gia đình, quê gốc/mô tả ngắn và subject hiện tại.
- KPI cơ bản: tổng thành viên, số thế hệ, nam/nữ/khác/chưa rõ, còn sống/đã mất, sự kiện sắp tới và cảnh báo chất lượng dữ liệu.
- Search toàn family và CTA `Thêm người` chỉ hiện với owner/editor.
- KPI tính trên decrypted in-memory data; không tạo plaintext analytics table/server event chứa family values.

## KPI semantics

- Population chỉ gồm person thuộc active profile; `isDeceased=true` là đã mất, còn lại là còn sống theo schema hiện tại.
- Số thế hệ là số generation index phân biệt tính được từ `subjectPersonId`; person disconnected/không tính được được báo riêng, không tự tạo đời.
- Gender luôn có bốn bucket `male | female | other | unknown` và tổng bucket bằng population.
- Sự kiện sắp tới mặc định 30 ngày theo `settings.timezone` (mặc định `Asia/Ho_Chi_Minh`), gồm birthday có day precision và death anniversary theo solar/lunar contract hiện hành; không tạo event từ year-only date.
- Quality count là số issue actionable chưa suppress từ canonical validator + duplicate detector; warning informational hiển thị riêng.

## Data classification

- Tên, quê gốc, profile/person/relationship và KPI nguồn đều là family-shared protected payload.
- Contact/private fields giữ lớp CR-07; selected/focus person ID chỉ là opaque client route state.
- View preference có thể lưu local hoặc server metadata nếu chỉ chứa enum/opaque ID và contract retention đã duyệt; không lưu tên/search text.

## Shared explorer contract

- Bốn view dùng cùng một `selectedPersonId`, `focus/rootPersonId`, filters, search result và collapse state phù hợp.
- State có URL trong `/app` bằng opaque person IDs; không đưa tên/contact vào query string.
- Chuyển view không làm mất người đang chọn hoặc tự thay family data.
- Person card/popover dùng cùng component dữ liệu, contact fields vẫn theo CR-07.

## Bốn chế độ

### Danh sách

- Accessible table/card list, sort/filter theo tên, đời, giới tính, còn sống/đã mất và nhánh.
- Là fallback đầy đủ cho keyboard/screen reader và thiết bị yếu.

### Sơ đồ cây

- Canonical genealogy layout theo thế hệ từ trên xuống; couple và parent-child connector rõ, không chồng card/line.
- Zoom, pan, fit, focus branch, collapse/expand tại card và generation labels.

### Mindmap

- Focus-centric hierarchy từ một người/gia đình hạt nhân; tổ tiên, anh chị em và hậu duệ thành nhánh có thể thu gọn.
- Đây là navigation view, không thay canonical generation semantics của sơ đồ cây.

### Bong bóng

- Force/network exploration; couple/family unit có thể nhóm thành bubble, relationship là edge.
- Có legend, focus selector, deterministic initial seed và nút reset; không dùng vị trí vật lý làm biểu nghĩa đời/vai vế.

## Responsive và interaction

- Desktop đặt KPI phía trên explorer; mobile dùng KPI horizontal snap hoặc 2 cột và view switcher cuộn ngang có label đầy đủ.
- Canvas controls không che card/navigation; touch target tối thiểu 44px.
- Pan/zoom không trap page scroll trên mobile; có fit/reset và keyboard alternative.
- Reduced motion tắt force animation liên tục và animated transitions.

## Performance budgets

- Khóa fixture tối thiểu 50, 500 và 2.000 people trong evidence; 2.000 là stress/observation, 500 là acceptance tier.
- List virtualize khi cần; graph layout chạy worker/memoized và không block main thread vượt budget đã chốt.
- Chỉ render visible/detail level thích hợp; view change không re-fetch/decrypt toàn workspace nếu data version không đổi.
- Trên pinned reference device/CI profile: 500-person cached-data initial explorer render ≤ 2.0s, view switch p95 ≤ 500ms, không long task > 200ms; đồng thời không regression >10% so với baseline ghi trước implementation.

## Test bắt buộc

- KPI đúng với unknown gender/date và profile filter.
- State preservation khi đổi cả bốn view, refresh deep link và đổi subject.
- Multiple spouse, half-sibling, missing parent, disconnected/cyclic-invalid fixtures.
- Tree connector visual regression không overlap ở desktop/mobile.
- Bubble deterministic/reset; mindmap collapse; list keyboard/screen-reader flow.
- Viewer không thấy edit CTA; contact restricted không leak qua card, search, aria-label, tooltip hoặc analytics.

## Acceptance criteria

- User nhìn được bức tranh gia đình và chuyển giữa bốn cách khám phá trong cùng một màn hình.
- Sơ đồ cây vẫn là nguồn trình bày phả hệ canonical; mindmap/bong bóng không làm sai nghĩa quan hệ.
- 500-person fixture đạt performance/a11y budget đã ghi trong evidence CR.
