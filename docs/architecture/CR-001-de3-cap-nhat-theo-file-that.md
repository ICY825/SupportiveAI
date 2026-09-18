# CR-001 — Cập nhật Đề 3 theo file mẫu thật từ lễ tân

**Loại:** Change Request
**Phạm vi:** `modules/document_flow/mail/`, `shared/employee/`, tài liệu Đề 3
**Ngày:** 17/09/2026
**Trạng thái:** Đã chốt, sẵn sàng implement

---

## 0. Tóm tắt thay đổi

File mẫu thật từ lễ tân **không có số điện thoại, không có mã vận đơn, không có phòng ban**. Điều này làm mất khóa khớp bậc 1 và khóa khử trùng lặp — hai trụ cột của thiết kế hiện tại.

CR này thay thế cả hai bằng cơ chế khác, và chốt luồng gửi một phần khi có dòng chưa khớp được.

**Không thay đổi:** cơ chế xác nhận đã nhận (mục 7), SLA (mục 8), gộp thông báo theo người (mục 6.1), báo cáo (mục 9), phân quyền (mục 12). Bốn số cuối điện thoại dùng ở trang quét QR lấy từ bảng `employee` (nguồn HR), không lấy từ file — nên không bị ảnh hưởng.

---

## 1. File mẫu thật

Đã nhận `mau.xlsx`. Cấu trúc xác nhận:

| Cột | Tên header | Kiểu ô | Ví dụ |
|---|---|---|---|
| A | `stt` | số | 1, 2, 3 |
| B | `người gửi` | chuỗi | "cty nam hải", "an nguyễn" |
| C | `ngày nhận` | **datetime thật** (format `mm-dd-yy`) | 17/09/2026 |
| D | `số lượng` | số | 1, 2 |
| E | `nội dung` | chuỗi | "phong bì" |
| F | `người nhận` | chuỗi | "Lương hiền", "Nguyễn Thị Thu", "Hùng Mạnh" |

Đặc điểm cần lưu ý khi viết `importer.py`:

- Một sheet duy nhất, tên `Trang_tính1` (nhiều khả năng xuất từ Google Sheets).
- Header ở **dòng 1**, không có dòng thừa phía trên.
- `ngày nhận` là ô datetime thật, đọc trực tiếp được — **không parse chuỗi**. Nhưng nếu lễ tân xuất sang `.csv` thì định dạng `mm-dd-yy` sẽ thành chuỗi mơ hồ (`09/17/26` vs `17/09/26`). Xem [§3.4](#34-đọc-ngày).
- Tên người nhận viết **không chuẩn**: thiếu họ, viết hoa/thường lẫn lộn, có thể viết tắt. Đây là tên người gửi ghi trên phong bì, không phải tên trong hồ sơ nhân sự.

---

## 2. Các quyết định đã chốt

| # | Quyết định | Thay cho |
|---|---|---|
| D1 | Bỏ `tracking_code` làm khóa duy nhất | File không có mã vận đơn |
| D2 | Khử trùng lặp bằng khóa tổ hợp `(người gửi + người nhận + ngày nhận)`, **cảnh báo mềm, không tự động bỏ dòng** | Khóa `tracking_code UNIQUE` |
| D3 | Khớp theo tên là chính; bảng `matching_alias` học từ lần HC chọn trở thành **cơ chế khớp chính**, không phải tính năng phụ | Khớp theo số điện thoại (bậc 1 cũ) |
| D4 | Xếp hạng ứng viên ưu tiên người từng nhận hàng từ cùng người gửi | Tín hiệu phụ "đơn vị" (file không có) |
| D5 | **Gửi một phần**: dòng chưa khớp được nằm lại ở `Chờ khớp`, không chặn cả lô | Chặn toàn lô cho tới khi xử lý hết |
| D6 | Màn hình soát hiện **toàn bộ** dòng, phân ba mức: khớp chắc / cần soát / phải chọn | Chỉ cảnh báo dòng có vấn đề |
| D7 | Giữ nguyên nhánh khớp theo số điện thoại trong mã, để sau này lễ tân thêm cột là bật lên được bằng cấu hình, không phải sửa code | — |
| D8 | Tách `employee.email` (hộp thư thật) và `employee.upn` (tài khoản AD) | Một trường `email` gộp |
| D9 | Đề 3 gửi qua email tại tên miền công ty; Teams ra khỏi phạm vi pilot vì phụ thuộc phê duyệt cấp tập đoàn | Kênh để ngỏ |

---

## 3. Thay đổi mô hình dữ liệu

### 3.1. Bảng `mail_item`

**Bỏ các cột:**

```
tracking_code          -- không còn nguồn dữ liệu
carrier                -- file không có đơn vị vận chuyển
recipient_unit_raw     -- file không có phòng ban
```

**Giữ nhưng chuyển sang nullable, không dùng với file hiện tại:**

```
recipient_phone_raw    -- giữ cho D7; luôn NULL với định dạng file hiện nay
```

**Thêm các cột:**

```
row_index          integer        -- cột stt trong file, phục vụ truy vết về dòng gốc
sender_raw         text           -- cột "người gửi", giữ nguyên bản
sender_normalized  text           -- đã chuẩn hóa, dùng cho khử trùng và xếp hạng
quantity           integer NOT NULL DEFAULT 1   -- cột "số lượng"
content_type       text           -- cột "nội dung", ví dụ "phong bì"
dedup_key          text           -- xem §5
match_tier         text           -- confirmed | review | choose
```

**Đổi tập giá trị `match_method`:**

| Giá trị cũ | Giá trị mới | Ghi chú |
|---|---|---|
| `phone` | `phone` | Giữ, không kích hoạt với file hiện tại (D7) |
| `phone4_name` | *(bỏ)* | Không có số điện thoại để khớp |
| `name` | `name_exact` | Tên chuẩn hóa ra đúng một nhân sự |
| — | `alias` | Khớp từ bảng `matching_alias` |
| — | `name_fuzzy` | Khớp gần đúng sau khi bỏ dấu |
| `manual` | `manual` | HC chọn tay |
| — | `none` | Không khớp được |

**Ràng buộc:**

- Bỏ `UNIQUE` trên `tracking_code`.
- Thêm index trên `dedup_key`, **không phải UNIQUE** (xem §5.2 — cảnh báo mềm).
- Thêm index trên `sender_normalized` (phục vụ xếp hạng ở §4.3).

### 3.2. Bảng `mail_batch`

**Thêm:**

```
receipt_date        date       -- ngày nhận của các dòng trong lô, để phát hiện tải lại cùng ngày
sent_count          integer DEFAULT 0
pending_match_count integer DEFAULT 0
duplicate_suspect_count integer DEFAULT 0
```

`sent_at` đổi nghĩa: thời điểm **lần gửi đầu tiên**, không phải thời điểm gửi hết lô. Một lô có thể được gửi nhiều đợt (D5).

### 3.3. Bảng mới `matching_alias`

```
matching_alias
  id                   PK
  raw_name_normalized  text NOT NULL   -- chuỗi tên thô đã chuẩn hóa, khóa tra
  employee_id          FK → employee NOT NULL
  hit_count            integer DEFAULT 0
  created_by           FK → employee   -- HC nào tạo
  created_at           timestamptz
  last_used_at         timestamptz

  UNIQUE (raw_name_normalized)
```

Ghi alias **mỗi lần HC chọn tay hoặc sửa đề xuất của hệ thống**. Lần sau gặp đúng chuỗi đó thì khớp thẳng với `match_method = 'alias'`, `match_tier = 'confirmed'`.

Nếu HC sửa một dòng đã khớp bằng alias, **ghi đè alias cũ** và ghi log để truy vết.

### 3.4. Đọc ngày

Thứ tự ưu tiên trong `importer.py`:

1. Ô là datetime (trường hợp `.xlsx`) → dùng trực tiếp.
2. Ô là chuỗi → parse theo `dd/mm/yyyy` trước (quy ước Việt Nam).
3. Nếu chuỗi mơ hồ (cả hai cách parse đều hợp lệ và cho kết quả khác nhau) → **không đoán**, đánh dấu lô cần HC xác nhận ngày, hiện rõ ở màn hình soát.

Ghi trong tài liệu: khuyến nghị lễ tân gửi `.xlsx`, không gửi `.csv`, vì định dạng ngày hiện tại là `mm-dd-yy`.

### 3.5. Bảng `employee` (D8)

**Thêm:**

```
upn           text        -- tài khoản AD, ví dụ trungab1@vingroup.net
email_source  text        -- confirmed | derived
```

`email` giữ nguyên nghĩa là **hộp thư thật sự nhận mail** (ví dụ `v.trungab1@vinsmartfuture.tech`).

**Kiểm tra khi nhập danh mục:** nếu giá trị cột `email` trùng tên miền cấu hình ở biến `UPN_DOMAIN_HINT` thì cảnh báo ngay ở màn hình nhập — gần như chắc chắn là lấy nhầm cột tài khoản AD. Đây là lỗi im lặng nguy hiểm nhất: thư không tới ai nhưng hệ thống vẫn báo gửi thành công.

---

## 4. Thuật toán khớp

### 4.1. Chuẩn hóa tên

```
- Chuẩn hóa Unicode về NFC
- Bỏ khoảng trắng thừa, thu gọn khoảng trắng liên tiếp
- Chuyển về chữ thường
- Giữ nguyên dấu ở bản chính; sinh thêm bản bỏ dấu để dùng ở bậc fuzzy
```

Lưu bản chuẩn hóa vào `recipient_name_normalized` để tra nhanh.

### 4.2. Các bậc khớp, theo thứ tự

| Bậc | Điều kiện | `match_method` | `match_tier` |
|---|---|---|---|
| 0 | Số điện thoại khớp chính xác (chỉ chạy khi file có cột này — D7) | `phone` | `confirmed` |
| 1 | Chuỗi tên thô chuẩn hóa có trong `matching_alias` | `alias` | `confirmed` |
| 2 | Tên chuẩn hóa khớp chính xác **đúng một** nhân sự | `name_exact` | `confirmed` |
| 3 | Tên chuẩn hóa khớp chính xác **nhiều** nhân sự | `name_exact` | `choose` |
| 4 | Khớp gần đúng (bỏ dấu, hoặc chứa nhau) ra **đúng một** ứng viên | `name_fuzzy` | `review` |
| 5 | Khớp gần đúng ra **nhiều** ứng viên | `name_fuzzy` | `choose` |
| 6 | Không ra ứng viên nào | `none` | `choose` |

`match_tier` quyết định cách hiển thị ở màn hình soát và điều kiện được gửi:

- `confirmed` — điền sẵn, gửi được ngay.
- `review` — điền sẵn nhưng đánh dấu, HC phải bấm xác nhận mới gửi.
- `choose` — để trống, HC phải chọn.

### 4.3. Xếp hạng ứng viên (D4)

Khi ra nhiều ứng viên (bậc 3, 5, 6), sắp xếp danh sách gợi ý theo thứ tự:

1. Nhân sự đã từng nhận hàng từ **cùng `sender_normalized`** này, nhiều lần hơn thì lên trước.
2. Độ tương đồng tên giảm dần.
3. Còn lại theo bảng chữ cái.

Truy vấn lịch sử lấy từ chính bảng `mail_item` (`sender_normalized` + `employee_id` của các dòng đã hoàn tất), **không tạo bảng mới**.

### 4.4. Áp dụng cả lô

Khi HC chọn người nhận cho một dòng, **tự động áp dụng cho mọi dòng khác trong cùng lô có cùng `recipient_name_normalized`**, và đánh dấu các dòng đó là `manual`. HC vẫn sửa lại được từng dòng nếu cần.

---

## 5. Khử trùng lặp

### 5.1. Khóa

```
dedup_key = sha256(
    sender_normalized + '|' +
    recipient_name_normalized + '|' +
    receipt_date.isoformat()
)
```

Khóa này dùng được vì lễ tân **gộp nhiều kiện cùng nguồn trong cùng ngày vào một dòng và ghi `số lượng`**. Nên hai dòng trùng khóa là dấu hiệu tải lại file, không phải mất dữ liệu.

### 5.2. Cảnh báo mềm, không tự động bỏ

**Không đặt ràng buộc `UNIQUE`.** Khi import, nếu `dedup_key` đã tồn tại ở một dòng **thuộc lô đã gửi**:

- Đánh dấu dòng mới là `duplicate_suspect`.
- Hiện ở màn hình soát kèm tham chiếu tới dòng cũ (lô nào, ngày nào, số lượng bao nhiêu).
- **Mặc định là bỏ qua**, nhưng HC bấm được nút giữ lại.
- Đếm vào `mail_batch.duplicate_suspect_count`.

Lý do không tự động bỏ: âm thầm nuốt dữ liệu là kiểu hỏng tệ nhất — không ai phát hiện ra, và người nhận không bao giờ biết mình có kiện.

### 5.3. Tải lại cùng ngày

Nếu `mail_batch.receipt_date` trùng với một lô đã có, hiện cảnh báo ở đầu màn hình soát: *"Đã có lô cho ngày này, tải lên lúc ..., N dòng."* HC quyết định tiếp tục hay hủy.

Trường hợp `số lượng` của cùng một `dedup_key` đổi giá trị (ví dụ 1 → 3): hiện rõ cả hai con số, HC chọn giữ giá trị nào. Không tự động cộng dồn, không tự động ghi đè.

---

## 6. Gửi một phần (D5)

### 6.1. Hành vi của `POST /mail/batches/{id}/send`

Endpoint trở nên **gọi lại được nhiều lần**:

- Gửi các dòng có `employee_id IS NOT NULL` và `match_tier` là `confirmed`, hoặc `review` đã được HC xác nhận.
- Các dòng còn `employee_id IS NULL` giữ nguyên `status = 'Chờ khớp'`, **không chặn** việc gửi các dòng còn lại.
- Cập nhật `sent_count`, `pending_match_count`.
- `sent_at` chỉ ghi ở lần gọi đầu tiên.

Trả về: số dòng vừa gửi, số dòng còn chờ khớp, số người nhận được thông báo (sau khi gộp).

### 6.2. Màn hình "Chờ khớp" xuyên lô

Thêm một màn hình riêng liệt kê **mọi dòng đang ở `Chờ khớp` trên toàn hệ thống**, không phân biệt lô. HC vào đây xử lý dần các trường hợp khó: kiện của khách, thực tập sinh, người không có trong danh mục.

Khi HC gán được người nhận, dòng đó gửi thông báo ngay tại chỗ và chuyển sang `Đã thông báo`. Mốc SLA tính từ thời điểm này, không phải từ lúc lô được gửi lần đầu.

Endpoint: `GET /mail/items?status=pending_match`

### 6.3. Chống tồn đọng âm thầm

Dòng nằm ở `Chờ khớp` quá **2 ngày** thì đẩy lên đầu màn hình và hiện cảnh báo trên bảng điều khiển của HC. **Không tự động chuyển sang `Tồn đọng`** — vì `Tồn đọng` có nghĩa là "đã báo nhưng không ai lấy", khác hẳn với "chưa biết báo cho ai".

---

## 7. Màn hình soát — yêu cầu chi tiết (D6)

### 7.1. Phần tổng quan

Hiện luôn, kể cả khi khớp chắc 100%:

```
Lô ngày 17/09 · 10 dòng · 14 kiện
Khớp chắc 5 · Cần soát 3 · Phải chọn 2 · Nghi trùng 0
```

Đếm cả **số dòng** và **số kiện** (tổng `quantity`) vì hai con số này khác nhau.

### 7.2. Bảng chi tiết

Cột hiển thị: `stt` · tên trên file · người gửi · số lượng · nội dung · người nhận đề xuất · trạng thái.

- Phân biệt ba mức bằng ký hiệu và màu, **không chỉ bằng màu** (để người khó phân biệt màu vẫn dùng được).
- Dòng `review`: điền sẵn ứng viên, có nút xác nhận nhanh.
- Dòng `choose`: ô trống, danh sách gợi ý đã xếp hạng theo §4.3.
- Ô tìm nhân sự: gõ 2–3 ký tự ra gợi ý, chọn được bằng bàn phím không cần chuột.
- Nút bỏ qua dòng (kiện không cần thông báo).

### 7.3. Điều kiện nút gửi

Nút gửi **luôn bật** khi có ít nhất một dòng sẵn sàng. Nhãn nút phản ánh thực tế:

- Sẵn sàng hết: `Gửi 10 dòng`
- Còn dòng chưa khớp: `Gửi 8 dòng · 2 dòng chờ khớp`

Không chặn cả lô vì một dòng chưa rõ.

---

## 8. KPI và ghi log

### 8.1. Ghi lại mọi lần HC can thiệp

Bảng `ai_feedback` (hoặc tương đương trong module) ghi mỗi lần HC sửa hoặc chọn:

```
mail_item_id, batch_id,
suggested_employee_id   -- hệ thống đề xuất ai (NULL nếu không đề xuất)
chosen_employee_id      -- HC chọn ai
match_method_before, match_tier_before
raw_name, sender_raw
created_by, created_at
```

Đây là mẫu số để tính độ chính xác, **và là căn cứ bằng số để đi đòi lễ tân thêm cột số điện thoại** sau 1–2 tuần chạy thật.

### 8.2. Chỉ số bổ sung

Thêm vào báo cáo:

| Chỉ số | Công thức |
|---|---|
| Tỷ lệ khớp tự động **theo tuần** | Dòng `confirmed` không bị HC sửa / tổng dòng, nhóm theo tuần |
| Số thao tác HC mỗi lô | Số dòng HC phải chọn hoặc xác nhận |
| Thời gian soát mỗi lô | `sent_at − uploaded_at` |
| Số alias tích lũy | Đếm `matching_alias`, theo tuần |

Chỉ số đầu phải báo cáo **theo tuần, không phải trung bình cả kỳ**. Cơ chế alias làm tỷ lệ tăng dần theo thời gian; nếu chỉ báo một con số trung bình thì kết quả trông tệ hơn thực lực của hệ thống.

---

## 9. Phần xác nhận rõ là KHÔNG thay đổi

Để tránh sửa nhầm:

- **Mục 7 — xác nhận đã nhận.** QR dán tại khu để đơn, nhập 4 số cuối điện thoại. Số này lấy từ `employee.phone_last4` (nguồn HR), không liên quan tới file lễ tân.
- **Mục 8 — SLA.** T+2 nhắc một lần, T+5 chuyển `Tồn đọng`, tính theo giờ đồng hồ.
- **Mục 6.1 — gộp thông báo theo người.** Giữ nguyên, và áp dụng cả cho các đợt gửi bổ sung ở §6.
- **Mục 12 — phân quyền.** Hai vai trò `hc` và `employee`.
- **Tập trạng thái.** `Chờ khớp` / `Đã thông báo` / `Đã nhận` / `Tồn đọng` — không thêm trạng thái mới.

---

## 10. Danh sách file cần sửa

### Mã nguồn

| File | Việc |
|---|---|
| `modules/document_flow/mail/models.py` | §3.1, §3.2, §3.3 |
| `modules/document_flow/mail/importer.py` | §1, §3.4 — viết mới theo cấu trúc 6 cột |
| `modules/document_flow/mail/matcher.py` | §4 — viết lại bậc khớp, thêm alias và xếp hạng |
| `modules/document_flow/mail/service.py` | §5, §6 — khử trùng mềm, gửi một phần |
| `modules/document_flow/mail/router.py` | §6.1, §6.2 — endpoint gửi gọi lại được, thêm lọc `pending_match` |
| `modules/document_flow/mail/schemas.py` | Đồng bộ DTO với schema mới |
| `shared/employee/models.py` | §3.5 — thêm `upn`, `email_source` |
| `shared/employee/service.py` | §3.5 — cảnh báo khi email trùng tên miền UPN |
| `migrations/versions/` | Migration mới, đặt tên `00XX_mail_real_file_format.py` |
| `core/config.py` | Thêm `UPN_DOMAIN_HINT` |

### Tài liệu

| File | Mục cần sửa |
|---|---|
| `docs/architecture/mail-tracking.md` | 1.1, 2, 3, 4, 5, 6.3, 9.3, 10, 11, 13, 14, 15 → **v0.4** |
| `docs/checklist-truoc-khi-chay.md` | B1 chuyển sang ✅ đã giải; A1 ghi rõ "email hộp thư, không phải tài khoản AD"; C1 chuyển sang ✅ → **v1.1** |
| `README.md` §4.3 | Cập nhật danh sách trường đầu vào và ghi chú về khớp theo tên |

---

## 11. Tiêu chí nghiệm thu

Test cần có trước khi coi CR là xong:

**Importer**
- Đọc đúng `mau.xlsx`, ra 3 dòng với `quantity` lần lượt 1, 2, 1.
- Ô ngày datetime đọc đúng 17/09/2026.
- Chuỗi ngày mơ hồ thì báo lỗi, không đoán.
- File thiếu cột bắt buộc thì báo rõ cột nào thiếu.
- `số lượng` để trống thì mặc định 1.

**Matcher**
- Alias đã có thì khớp `confirmed`, không hỏi lại.
- Tên khớp đúng một người thì `confirmed`.
- Tên khớp nhiều người thì `choose`, danh sách xếp hạng theo lịch sử người gửi.
- "Lương hiền" và "lương hiền" và "Lương Hiền" cho cùng kết quả.
- Bỏ dấu khớp được: "nguyen thi thu" tìm ra "Nguyễn Thị Thu".
- HC sửa một dòng thì các dòng cùng tên trong lô tự cập nhật.
- HC sửa dòng đã khớp bằng alias thì alias bị ghi đè.

**Khử trùng**
- Tải lại đúng file cũ: mọi dòng đánh dấu nghi trùng, mặc định bỏ, HC giữ lại được.
- Cùng `dedup_key` nhưng `số lượng` khác: hiện cả hai giá trị, không tự cộng dồn.
- Trùng trong cùng một lô chưa gửi: không tính là nghi trùng.

**Gửi một phần**
- Lô 10 dòng, 2 dòng chưa khớp: gửi được 8, 2 dòng ở `Chờ khớp`.
- Gọi lại endpoint gửi sau khi HC xử lý xong: 2 dòng còn lại được gửi, 8 dòng cũ **không gửi lại**.
- SLA của dòng gửi bổ sung tính từ thời điểm gửi bổ sung.
- Một người có dòng ở cả hai đợt: nhận hai thông báo riêng (đúng, vì cách nhau về thời gian), mỗi thông báo gộp các kiện trong đợt đó.

**Không hồi quy**
- 251 test hiện có phải còn xanh, trừ những test gắn với `tracking_code`, `carrier`, `recipient_unit_raw` — sửa hoặc bỏ có ghi chú lý do.

---

## 12. Câu hỏi còn mở (không chặn CR này)

| # | Câu hỏi | Người trả lời |
|---|---|---|
| 1 | Cột `nội dung` có bộ giá trị cố định không, hay ghi tự do? Nếu cố định thì dùng được để nhận diện kiện giá trị cao (mục B11 trong tài liệu gửi lãnh đạo) | Lễ tân |
| 2 | Tải lại file mà `số lượng` đổi từ 1 thành 3 — là sửa lại con số cũ hay có thêm 2 kiện mới? | Lễ tân |
| 3 | Mỗi ngày đúng một file, hay có khi gửi nhiều lần? | Lễ tân |
| 4 | File có phải xuất từ Google Sheets không? Nếu đúng thì việc thêm cột số điện thoại rất dễ | Lễ tân |
| 5 | Dòng ở `Chờ khớp` quá lâu thì quy trình xử lý ra sao? | Phòng HC |

**Việc cần làm sau 1–2 tuần chạy thật:** dùng số liệu ở §8.1 để đề nghị lễ tân thêm cột số điện thoại. Lập luận có số đo cụ thể ("HC phải chọn tay X% số dòng, mất Y phút mỗi ngày") thuyết phục hơn nhiều so với đề nghị trước khi chạy. Khi có cột đó, bật bậc 0 ở §4.2 bằng cấu hình, không phải sửa code (D7).
