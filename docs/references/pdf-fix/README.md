# Bản vẽ đã sửa

Chỗ để **bản vẽ đã chỉnh lại**, khác với `docs/references/` là nơi chứa bản gốc
nhận từ bên thiết kế.

Thư mục này **theo repo**, không giống phần còn lại của `docs/references/`. Lý
do: dataset mặt bằng sinh ra từ file ở đây, và sha256 của file chính là
`layout_version` ghi vào mỗi bản ghi gán chỗ ngồi. Mất file thì không ai đối
chiếu lại được lịch sử ai ngồi đâu. Ngoại lệ này nằm ở cuối `.gitignore`.

## Vì sao phải sửa bản vẽ chứ không sửa dữ liệu

Khu vực phòng ban **không nằm trong bản vẽ CAD**. Chúng là **annotation đánh
dấu (markup) trên PDF** — ai đó mở Acrobat, tô một vùng màu rồi ghi tên phòng
ban cạnh đó. Bộ trích xuất đọc đúng những annotation ấy, tra theo id trong
`tools/floorplan_extract/floors/floor16.py`:

```python
ZONES = [
    {
        "annot": "36779c41-a897-4fac-8bae-c17ee8ed462a",  # Polygon, cyan
        "labelAnnot": "e54c1caa-f7f4-4171-9406b8aca574f12a",
        "id": "zone-16-bds-smart-city",
        "name": "BẤT ĐỘNG SẢN - SMART CITY",
    },
    ...
]
```

Nên vùng màu vẽ sai thì **phải vẽ lại trên PDF**. Sửa thẳng vào JSON trong
`data/floors/` là vô nghĩa: file đó ghi rõ "GENERATED — do not edit by hand", và
lần chạy trích xuất kế tiếp sẽ ghi đè, không báo gì.

## ⚠️ Vẽ lại thì id đổi

Mỗi annotation vẽ mới mang một **UUID mới**. Id cũ trong `floor16.py` sẽ không
khớp với gì cả, và bộ trích xuất **bỏ qua trong im lặng** — khu vực đó biến mất
khỏi dataset mà không có thông báo lỗi nào.

Vì vậy quy trình bắt buộc có bước 3:

1. Vẽ lại vùng màu phòng ban trên bản sao của PDF, kèm nhãn tên phòng ban.
2. Lưu vào thư mục này, tên có ngày: `260918_VSF_Layout tang 16 (zones fixed).pdf`.
3. **Lấy id annotation mới** và cập nhật `ZONES` trong `floor16.py`, cùng với
   `FLOOR["sourcePdf"]` trỏ sang file mới.
4. Chạy lại trích xuất, kết quả rơi vào `data/floors/floor-16/`.
5. Chạy `tools/verify_*.py` và bộ test frontend.
6. Chạy `GET /api/seats/floors/floor-16/reconcile`. Bản vẽ mới đổi hash nên mọi
   bản ghi gán hiện có sẽ báo `old-layout`; nếu có bản ghi nào báo
   `missing-seat` thì mã bàn đó đã biến mất — phải xử lý trước khi chốt.

Bước 3 không tự động được. Người vẽ phải chép id ra, hoặc chạy một lần liệt kê
annotation của file mới.

## Đang chờ sửa (18/09/2026)

Ghi lại đúng những gì đã quan sát được trên dataset hiện tại, để người vẽ biết
cần nhìn vào đâu:

| Khu vực | Hiện trạng | Vấn đề |
| --- | --- | --- |
| `zone-16-bds-smart-city` | bbox `[121, 241, 642, 473]`, **14 polygon** | Trải gần nửa mặt bằng và bao trọn cả vùng của VINFAST-KDO2O (`[120, 211, 194, 364]`). Gần như chắc chắn vùng tô bị vẽ lan. |
| `zone-16-ai-platform` | bbox `[807, 235, 1009, 666]`, 116 chỗ | Vùng tô đã phủ gần đúng cánh B. Hai chỗ chưa phủ: hai lõi thang máy nằm lọt trong vùng, và dải hành lang phía nam tới mép nhà. Nhỏ, chưa gấp. |
| ~~`zone-16-unlabeled-01`~~ | **Đã xử lý 18/09** | Vùng tô lavender không nhãn, 38 chỗ ngồi tại x 722–756. Nghiệp vụ xác nhận đây là nửa còn lại của Mô hình & Nền tảng AI, bị lõi thang máy tách khỏi khối chính. Nay là `zone-16-ai-platform-02`, `verification: UNVERIFIED` vì **tên do người nói, bản vẽ không ghi**. Bản vẽ sửa xong mà có nhãn ở đây thì bỏ cờ `nameSource: team` trong `floor16.py`. |

`workspace/scope.ts:56` đang ánh xạ khu vực sang cánh toà nhà bằng bảng viết
tay. Bản vẽ sửa xong thì xem lại bảng đó — nếu vùng tô đã đúng, bảng ấy có thể
không cần nữa.

## Không thuộc việc này

Chữ **"PHÒNG CÁCH ÂM TƯỜNG TRẦN SÀN"** trên bản vẽ là ghi chú thi công, không
phải tên phòng. Bản đồ đã lọc bỏ nó từ trước ở `map/sheetLabels.ts:12`
(`/^PHÒNG CÁCH ÂM/i`), nên **không cần xoá khỏi PDF** trừ khi bản in cũng phải
sạch. Nếu vẫn thấy dòng chữ ấy hiện ở đâu đó trong ứng dụng thì đó là lỗi khác —
báo kèm ảnh chụp màn hình.
