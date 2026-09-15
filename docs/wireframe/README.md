# Wireframe — Trung tâm Hành chính Vinsmart Future (V1, tầng 19)

Wireframe màn hình quản trị cho 4 đề bài của pilot, xuất từ dự án Claude Design
[Vinsmart Admin Wireframes](https://claude.ai/design/p/3b7f6062-3d5e-4b47-90cf-f780fba3ad1a?file=Vinsmart+Admin+Wireframes.dc.html).

## Tệp

| Tệp | Nội dung |
|-----|----------|
| `Vinsmart Admin Wireframes.dc.html` | Canvas chứa toàn bộ artboard |
| `support.js` | Runtime của Claude Design (file sinh tự động — không sửa tay) |

## Cách xem

Mở trực tiếp `Vinsmart Admin Wireframes.dc.html` trong trình duyệt, hoặc chạy server tĩnh:

```bash
cd docs/wireframe
python3 -m http.server 8000
# mở http://localhost:8000/Vinsmart%20Admin%20Wireframes.dc.html
```

Cần kết nối mạng: `support.js` tải React/Babel từ unpkg và font Inter/Caveat từ Google Fonts.
Có thể nhảy thẳng tới một artboard bằng anchor, ví dụ `#1b`.

## Danh sách artboard

| ID | Màn hình | Tương ứng tài liệu kiến trúc |
|----|----------|------------------------------|
| 0a | Nền tảng thị giác — màu, chữ, trạng thái | — |
| 1a | Shell + Dashboard tổng quan 4 đề bài, KPI | 5.6. Báo cáo & dashboard |
| 1b | Đề bài 1 — Quy hoạch văn phòng, sơ đồ tầng 19 + đề xuất AI | 4.1. Đề 1 — Quy hoạch văn phòng |
| 1c | Đề bài 2 — Quản lý tủ locker (3 khu tủ L1–L3) | 4.2. Đề 2 — Quản lý tủ locker |
| 1d | Đề bài 3 — Chuyển phát nhanh / thư đến, nhắc tự động | 4.3. Đề 3 — Chuyển phát nhanh |
| 1e | Đề bài 4 — Công văn đến/đi, AI bóc tách file scan | 4.4. Đề 4 — Quản lý công văn đến/đi |

## Quy ước thị giác

- Màu nhấn duy nhất: đỏ VSF `#D2181F` (đỏ đậm `#B3161D` cho chữ/link).
- Màu phụ cho cảnh báo: vàng đồng `#8A6F20`.
- Nền `#F6F4F1`, thẻ `#FFFFFF`, sidebar than `#1C1B1A`.
- Font Inter (600 tiêu đề, 400 nội dung); ghi chú viết tay dùng Caveat.
- Trạng thái: Quá hạn (đỏ đặc) · Chưa xử lý (viền đỏ) · Cần kiểm tra (vàng đồng) · Hoàn tất (xám).
- Panel AI luôn nằm bên phải, đánh dấu bằng badge `AI`; người dùng xác nhận trước khi hệ thống ghi dữ liệu.
