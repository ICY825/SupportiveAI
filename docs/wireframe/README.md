# Wireframe — Trung tâm Hành chính Vinsmart Future (Thiết kế dùng chung)

> ⚠️ **Bản tham chiếu thị giác, không phải đặc tả.** Chỗ nào wireframe lệch với tài liệu
> trong `docs/architecture/` thì **theo tài liệu kiến trúc**.
>
> Riêng **Đề 3**, bảng dưới mô tả *"AI nhận diện tem bưu cục"* — điều này **không đúng**:
> phân hệ đã chốt là **không có thành phần AI** ([mail-tracking §1.3](../architecture/mail-tracking.md#13-ghi-chú-về-ai)),
> vì dữ liệu vào đã có cấu trúc nên không có gì để OCR. Các điểm lệch khác liệt kê ở
> [mục 16](../architecture/mail-tracking.md#16-khác-biệt-so-với-wireframe).

Wireframe màn hình quản trị tích hợp 4 đề bài của pilot, chia sẻ ngôn ngữ thiết kế chung giữa các nhóm phát triển.

## Phân định vai trò & Phân hệ
- **Đang sử dụng (2 phân hệ đã triển khai & tích hợp vào ứng dụng):**
  1. **Đề bài 1: Mặt bằng văn phòng** (`#1b` / route `#/floor-planning`): Sơ đồ Tầng 16 Technopark Tower với 2 chế độ *Bố trí chỗ ngồi* (Zone B - AI & Data 116 chỗ ngồi, card thống kê 2 cột tối giản không màu, điều hướng khu vực) và *Xác minh mặt bằng* (CAD / lớp hình học thực địa).
  2. **Đề bài 2: Quản lý tủ locker** (`#1c` / route `#/lockers`): Sơ đồ 3 khu tủ L1–L3, chế độ Sơ đồ / Danh sách, quy tắc thu hồi và cấp phát tự động.
- **Sắp triển khai (2 phân hệ đồng đội đảm nhiệm):**
  3. **Đề bài 3: Chuyển phát nhanh / thư đến** (`#1d`): Bảng tiếp nhận thư/vận đơn, quy tắc thông báo tự động (email/Teams), AI nhận diện tem bưu cục.
  4. **Đề bài 4: Quản lý công văn đến/đi** (`#1e`): Danh sách công văn theo hạn, PDF viewer với vùng bôi đỏ, panel AI bóc tách OCR (Human-in-the-loop).
- **Wireframe này là thiết kế dùng chung (Shared Design):** Cung cấp layout shell, thanh điều hướng `AppNav` 210px, thanh công cụ `topbar`, token màu sắc và panel ngữ cảnh chuẩn để các nhóm đồng đội dễ dàng tích hợp và đồng bộ UX.

---

## Tệp

| Tệp | Nội dung |
|-----|----------|
| `Vinsmart Admin Wireframes.dc.html` | Canvas HTML chứa toàn bộ artboard đã căn chỉnh theo phiên bản mới nhất |
| `vsf-logo.png` / `vsf-mark.png` | Asset logo và huy hiệu thương hiệu VinSmart Future chuẩn |
| `support.js` | Runtime của Claude Design |

---

## Cách xem

Mở trực tiếp `Vinsmart Admin Wireframes.dc.html` trong trình duyệt, hoặc chạy server tĩnh:

```bash
cd docs/wireframe
python3 -m http.server 8000
# mở http://localhost:8000/Vinsmart%20Admin%20Wireframes.dc.html
```

- Có thể nhảy thẳng tới một artboard bằng anchor trên URL, ví dụ `#1b` hoặc `#1c`.
- Trong wireframe, menu bên trái hỗ trợ click trực tiếp để chuyển đổi qua lại giữa các phân hệ.

---

## Danh sách artboard

| ID | Màn hình | Vai trò & Trạng thái | Nội dung chính |
|----|----------|----------------------|----------------|
| **0a** | Nền tảng thị giác & Quy chuẩn chung | Dùng chung cho cả 4 nhóm | Bảng màu thương hiệu VSF, 5 trạng thái vận hành tài nguyên, cấu trúc thanh điều hướng AppNav 210px |
| **1a** | Shell chung + Dashboard tổng quan | Dùng chung điều hành | Tổng quan chỉ số 4 đề bài, hàng đợi tác vụ liên thông, hiệu quả pilot |
| **1b** | Đề bài 1 — Mặt bằng văn phòng | **Scope nhóm Layout (Đang sử dụng)** | Sơ đồ Tầng 16 Technopark (Zone B), chế độ *Bố trí chỗ ngồi* (116 bàn AI, card thống kê 2 cột tối giản, Inspector chi tiết) và chế độ *Xác minh mặt bằng* (CAD) |
| **1c** | Đề bài 2 — Quản lý tủ locker | **Scope Locker (Đang sử dụng)** | Sơ đồ 3 khu tủ L1–L3, chế độ Sơ đồ / Danh sách, quy tắc thu hồi và cấp phát tự động |
| **1d** | Đề bài 3 — Chuyển phát nhanh | **Đồng đội (Sắp triển khai)** | Bảng tiếp nhận thư/vận đơn, quy tắc thông báo tự động (email/Teams), AI nhận diện tem bưu cục |
| **1e** | Đề bài 4 — Công văn đến/đi | **Đồng đội (Sắp triển khai)** | Danh sách công văn theo hạn, PDF viewer với vùng bôi đỏ, panel AI bóc tách OCR (Human-in-the-loop) |

---

## Quy chuẩn giao diện dùng chung cho các nhóm đồng đội

1. **Thanh điều hướng AppNav (210px):**
   - Phía trên: Logo VSF chuẩn (`vsf-logo.png`).
   - Nhóm **"Đang sử dụng"**: Mặt bằng văn phòng (`#/floor-planning`), Tủ locker (`#/lockers`).
   - Nhóm **"Sắp triển khai"**: Chuyển phát nhanh, Công văn đến/đi (kèm tag *Sắp tới / Khóa*).
   - Vạch active phân hệ: Vạch đỏ VSF (`#D2181F`) rộng 3px mép trái, nền item active `rgba(255, 255, 255, 0.1)`.
   - Phía dưới: Nút *Cài đặt bản đồ / Cài đặt hệ thống* và nút *Thu gọn sidebar* (`‹`).
2. **Thanh Topbar tiêu chuẩn:**
   - Tiêu đề phân hệ · Hộp chọn tầng (Dropdown `Tầng 16 ▾`) · Bộ chuyển đổi chế độ xem (`view-toggle`) · Ô tìm kiếm nhanh với phím tắt `Ctrl K` · Nút Trợ giúp `?`.
3. **Bảng màu trạng thái tài nguyên (Resource Operational States):**
   - **Đang sử dụng:** Xanh lam than `#3D617F` (nền `#E8EFF5`).
   - **Còn trống:** Xanh lục `#297A60` (nền `#EEF8F3`).
   - **Đã đặt trước / Cần kiểm tra:** Vàng đồng `#9A701E` (nền `#FBF2DD`).
   - **Xung đột / Quá hạn:** Đỏ VSF `#B6443D` / `#D2181F` (nền `#FBECEA`).
   - **Tạm ngưng / Hỏng:** Xám `#6D7882` (nền `#EDF0F2`).
4. **Panel Tóm tắt & Ngữ cảnh bên phải (280–300px):**
   - **Card tóm tắt phạm vi (`ScopeSummary`):** Tên tầng (`Tầng 16`), cánh toà nhà (`Zone B` / `Zone A`), bảng thống kê số liệu dạng lưới 2 cột đơn sắc (`.fp-stats`) hiển thị số lượng chỗ ngồi, đang dùng, còn trống, đặt trước, xung đột, không khả dụng.
   - **Card chi tiết (`Inspector`):** Luôn hiển thị thông tin chi tiết đối tượng đang chọn (Bàn / Tủ / Thư / Công văn).
   - **Human-in-the-loop:** Đề xuất AI luôn đi kèm độ tin cậy và nút phê duyệt trước khi lưu vào hệ thống.
