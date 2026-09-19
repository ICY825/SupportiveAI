# `data/` — dữ liệu dùng chung, nằm ngoài cả backend lẫn frontend

## `data/floors/` — dataset mặt bằng, theo repo

Sinh ra từ `tools/floorplan_extract/extract_floor.py`, tất định, kèm hash của
file PDF nguồn. Không sửa tay.

Trước đây chỗ này nằm trong `frontend/src/features/floor-planning/data/floors/`.
Chuyển ra đây vì **backend cũng phải đọc cùng một nguồn**: theo Issue #2 mục 3,
backend không bao giờ tự tạo chỗ ngồi, nên nó phải biết danh sách mã ghế hợp lệ —
mà nó không thể với tay vào trong `frontend/`.

Ai đọc gì:

| Bên | Cách đọc |
|---|---|
| frontend | `fetch` theo URL lấy từ `import.meta.glob('@data/floors/*/*.json', { query: '?url' })` trong `features/floor-planning/data/floorAssets.ts` — alias `@data` khai ở `frontend/vite.config.ts` và `frontend/tsconfig.app.json`. Cố ý **không** `import` thẳng file JSON: làm vậy thì bundler biến 2,9 MB hình học thành một module JavaScript. |
| backend | đọc file trực tiếp từ gốc repo |
| `tools/verify_*.py` | đọc file trực tiếp từ gốc repo |

Thêm một tầng mới: chạy extractor với config mới trong
`tools/floorplan_extract/floors/`, kết quả tự rơi vào `data/floors/<floor-id>/`,
rồi khai tầng đó trong `features/floor-planning/data/registry.ts`. Không có
loader riêng cho từng tầng: artifact được tìm bằng glob và ráp bằng
`data/floorLoader.ts`. Checklist đầy đủ ở `docs/floor-planning/adding-a-floor.md`.

## Phần còn lại của `data/` **không** theo repo

`.gitignore` để `/data/*`, tức mọi thứ trong `data/` bị loại trừ **trừ**
`data/floors/`. Chỗ này dành cho dữ liệu thật — danh sách nhân sự, file mẫu chấm
KPI — không được đưa lên repo công khai.

Viết `/data/*` chứ không phải `/data/` là có lý do: git không mở lại được một
file nằm trong thư mục đã bị loại, nên `/data/` sẽ làm mọi dòng `!` phía dưới
mất tác dụng, và `data/floors/` sẽ bị bỏ qua trong im lặng.
