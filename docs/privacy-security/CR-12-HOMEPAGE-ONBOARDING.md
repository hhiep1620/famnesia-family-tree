# CR-12 — Public Homepage and Entry Onboarding

## Prerequisite

- CR-01 security claims đã được duyệt.
- CR-13 Done để CR-12 acceptance/E2E được tính hoàn tất. Homepage shell có thể phát triển sớm nhưng chưa được đánh dấu Done.

## Mục tiêu

Tạo homepage công khai giới thiệu Famnesia, cho người dùng bắt đầu bằng mã/link gia đình hoặc tạo gia đình mới, nhưng không quảng cáo quá khả năng bảo mật đã deploy.

## Information architecture

1. Header: logo Famnesia, `Tính năng`, `Quyền riêng tư`, `Đăng nhập`.
2. Hero: slogan hiện tại, minh họa cây gia đình tương tác nhẹ, ô `Nhập mã hoặc link gia đình`, CTA `Tham gia gia đình` và `Tạo gia đình mới`.
3. Năm yếu tố cốt lõi:
   - **Riêng tư theo từng người** — dữ liệu protected được mã hóa phía client và key grant theo user/quan hệ khi security rollout đã hoàn tất.
   - **Hiểu đúng quan hệ Việt** — họ nội/ngoại, vai vế và gia đình nhiều thế hệ.
   - **Ghi nhớ ngày quan trọng** — sinh nhật, ngày giỗ và lịch âm/dương.
   - **Cùng gia đình cập nhật** — owner/editor/viewer với lịch sử thay đổi rõ ràng.
   - **Dữ liệu thuộc về gia đình** — import/export Excel, JSON và GEDCOM theo quyền export.
4. Feature list lấy cảm hứng chức năng, không sao chép giao diện/copy, từ [Gia Phả Online](https://giapha.licham365.com/#features) và [AncestorTree](https://ancestortree.info/welcome#quickstart): cây tương tác; danh sách/mindmap/bong bóng; lịch gia đình; tìm quan hệ; analytics; nhập/xuất; ảnh; cộng tác và phân quyền.
5. Privacy truth section: dữ liệu nào được mã hóa, giới hạn web client, trường hợp mất key và link tới tài liệu chi tiết.
6. Footer: project/repository, privacy, terms, version và trạng thái dịch vụ.

## Route và hành vi

- `/` là public homepage; ứng dụng sau đăng nhập ở `/app`.
- `/join/:code` nhận join code CR-13. Full URL được chấp nhận trong ô nhập và normalize về code.
- Người chưa đăng nhập được chuyển qua Google/Supabase Auth rồi quay lại đúng `returnTo`; không để OAuth callback quay về localhost hoặc làm mất code.
- `Tạo gia đình mới` yêu cầu đăng nhập rồi mở creation wizard CR-13.
- Code sai/hết hiệu lực dùng thông báo chung, không tiết lộ workspace name/member count.
- Homepage không tải ciphertext, member list, family analytics hoặc protected family name.

## Feature-truth contract

- Dùng một capability/claim registry chung cho cả năm core values và feature list, có trạng thái `available | beta | planned`; homepage production chỉ diễn đạt như hiện có khi capability thật sự `available`.
- Security claim state tách `new-encrypted workspace`, `migrated-encrypted workspace`, `legacy workspace` và `global provider-retention cleared`.
- Public homepage chỉ dùng claim toàn dịch vụ như “operator không đọc được dữ liệu” khi evidence bao phủ mọi workspace áp dụng và provider-retained plaintext đã hết retention. Trước đó dùng wording có điều kiện như “Famnesia hỗ trợ mã hóa theo user cho workspace đã bật bảo vệ”; trạng thái cụ thể chỉ hiển thị sau đăng nhập trong workspace.
- Không dùng “zero knowledge tuyệt đối”, “an toàn 100%” hoặc claim chống người đã được phép xem tự sao chép.

## Visual direction

- Giữ logo và tông xanh Famnesia; không sao chép palette đỏ-vàng/card layout của trang tham khảo.
- Signature element: một “living lineage” mini-tree trong hero, các nhánh nối nhẹ khi load và dừng hoàn toàn khi `prefers-reduced-motion`.
- Typography và spacing phải dùng design tokens hiện có; hero không làm navigation/CTA bị co trên desktop hoặc mobile.
- Mobile: CTA xếp dọc, ô join code có nút rõ, core values thành list một cột; không horizontal overflow.

## Data classification và security

- Marketing copy/feature registry: public server metadata.
- Join code: routing identifier, không phải encryption/auth secret và không tự cấp membership.
- Không lưu full join URL trong analytics/referrer/crash log; chỉ event tổng hợp không code.

## Test bắt buộc

- Public render, authenticated redirect, CR-13 create flow và join return-to E2E.
- Nhập raw code, full URL, whitespace, mixed case; không tự lowercase.
- OAuth success/error/retry không làm mất route intent.
- Feature registry không lộ planned item như available; security copy bị gate đúng rollout state.
- Keyboard navigation, visible focus, landmarks, contrast, reduced motion và responsive 320px–desktop.
- Pinned mobile Lighthouse lab: Performance ≥ 90, Accessibility ≥ 95, LCP ≤ 2.5s và CLS ≤ 0.1; hero không làm tải protected API. Nếu CI runner không ổn định, dùng median 3 runs và ghi cấu hình.

## Acceptance criteria

- User mới hiểu Famnesia làm gì và chọn được `Tham gia` hoặc `Tạo mới` trong một màn hình.
- Homepage không tiết lộ dữ liệu gia đình và không đưa ra security claim vượt evidence production.
- Visual identity nhận ra là Famnesia, không phải bản sao của hai trang tham khảo.
