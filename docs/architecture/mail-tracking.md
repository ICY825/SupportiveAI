# Mail Tracking — Thiết kế chi tiết

> Phân hệ theo dõi chuyển phát nhanh (Đề bài 3)
> Thuộc module `document_flow` trong hệ thống SupportiveAI

**Trạng thái:** `Đã chốt` — đã có file mẫu thật từ lễ tân, phần đọc file đã chốt
**Phiên bản:** 0.4
**Cập nhật:** 17/09/2026
**Đầu mối nghiệp vụ:** Phạm Thị Duyên

> **Bản 0.4 áp dụng [CR-001](CR-001-de3-cap-nhat-theo-file-that.md).** File mẫu thật
> (`mau.xlsx`) **không có** số điện thoại, mã vận đơn và phòng ban, nên khóa khớp bậc 1
> và khóa khử trùng lặp của bản 0.3 đều mất nguồn dữ liệu. Ba thay đổi lớn:
> khớp theo tên + bảng alias học từ HC ([§4](#4-khớp-người-nhận)),
> khử trùng lặp bằng khóa tổ hợp dạng **cảnh báo mềm** ([§3.3](#33-khử-trùng-lặp)),
> và **gửi một phần** thay vì chặn cả lô ([§6.4](#64-gửi-một-phần)).

> **Tài liệu này là nguồn chuẩn cho luồng nghiệp vụ Đề 3.**
> Wireframe `docs/wireframe/` chỉ là bản tham chiếu thị giác giai đoạn đầu.
> Chỗ nào hai bên khác nhau thì theo tài liệu này — xem [mục 16](#16-khác-biệt-so-với-wireframe).

---

## Mục lục

- [1. Bối cảnh và phạm vi](#1-bối-cảnh-và-phạm-vi)
- [2. Luồng nghiệp vụ](#2-luồng-nghiệp-vụ)
- [3. Tiếp nhận danh sách](#3-tiếp-nhận-danh-sách)
- [4. Khớp người nhận](#4-khớp-người-nhận)
- [5. Màn hình soát trước khi gửi](#5-màn-hình-soát-trước-khi-gửi)
- [6. Gửi thông báo](#6-gửi-thông-báo)
- [7. Xác nhận đã nhận](#7-xác-nhận-đã-nhận)
- [8. Trạng thái và SLA](#8-trạng-thái-và-sla)
- [9. Báo cáo](#9-báo-cáo)
- [10. Mô hình dữ liệu](#10-mô-hình-dữ-liệu)
- [11. API](#11-api)
- [12. Phân quyền](#12-phân-quyền)
- [13. Ước lượng công sức](#13-ước-lượng-công-sức)
- [14. Rủi ro](#14-rủi-ro)
- [15. Câu hỏi còn mở](#15-câu-hỏi-còn-mở)
- [16. Khác biệt so với wireframe](#16-khác-biệt-so-với-wireframe)
- [17. Lịch sử thay đổi](#17-lịch-sử-thay-đổi)

---

## 1. Bối cảnh và phạm vi

### 1.1. Hiện trạng

Lễ tân nhận kiện hàng, phân loại và gửi file danh sách lên Phòng Hành chính.

File thật (`mau.xlsx`, nhận 17/09/2026) có **đúng sáu cột**: `stt`, `người gửi`, `ngày nhận`, `số lượng`, `nội dung`, `người nhận`.

> ⚠️ **Không có số điện thoại, không có mã vận đơn, không có phòng ban.** Bản 0.3 giả định file có đủ ba thứ đó và xây khóa khớp lẫn khóa khử trùng lặp lên chúng. [CR-001](CR-001-de3-cap-nhat-theo-file-that.md) thay cả hai.
>
> Hai đặc điểm nữa của file thật:
>
> - **Một dòng không phải một kiện.** Lễ tân gộp nhiều kiện cùng nguồn trong cùng ngày vào một dòng rồi ghi `số lượng`. Mọi con số báo cáo phải nói rõ đang đếm dòng hay đếm kiện.
> - **Tên người nhận viết không chuẩn** — thiếu họ, hoa thường lẫn lộn, có khi viết tắt. Đó là tên ghi trên phong bì, không phải tên trong hồ sơ nhân sự.

Phòng HC hiện phải làm tay ba việc:

1. Đọc file, xác định từng kiện là của ai.
2. Soạn và gửi thông báo cho từng người.
3. Tự theo dõi ai đã xuống lấy, ai chưa, và nhắc lại.

### 1.2. Phạm vi phân hệ

Phân hệ bắt đầu **từ lúc HC nhận được file danh sách**, kết thúc ở báo cáo tổng hợp. Chặng vận chuyển của hãng và khâu phân loại tại quầy lễ tân nằm ngoài phạm vi.

### 1.3. Ghi chú về AI

Phân hệ này **không có thành phần AI**. Dữ liệu đầu vào đã có cấu trúc nên không cần OCR hay trích xuất. Toàn bộ là logic nghiệp vụ thông thường: đọc file, khớp dữ liệu, gửi thông báo, theo dõi trạng thái.

Hệ quả cần lưu ý khi lập kế hoạch:

- **Rủi ro kỹ thuật rất thấp** — gần như chắc chắn về đích đúng hạn.
- **Giá trị vận hành cao và thấy ngay** — HC bỏ được việc gõ thông báo mỗi ngày.
- **Chạy qua toàn bộ lõi chung** (dữ liệu nhân sự, notification, workflow, xác nhận, báo cáo) nên là phép thử tốt nhất cho nền tảng. Nếu phân hệ này chạy trơn ở Tuần 2 thì đến Tuần 3 khi làm Đề 4, chỉ còn phải lo đúng một thứ là pipeline đọc công văn.
- **Sẽ bị chấm thấp nếu tiêu chí đánh giá là "mức độ ứng dụng AI"** — cần thống nhất trước với ban lãnh đạo.

### 1.4. Ngoài phạm vi pilot

| Hạng mục                              | Lý do                                                                                                                                                                                                                                 |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tự động đọc hộp thư để tiếp nhận file | Tốn 2–3 ngày tích hợp, thêm điểm hỏng, trong khi mỗi ngày chỉ 1–2 file và thao tác tải tay mất 5 giây                                                                                                                                 |
| Lễ tân nhập trực tiếp vào hệ thống    | Cần thay đổi thói quen của bộ phận có thể không thuộc quyền điều phối của HC — là vấn đề tổ chức, nên bàn sau khi pilot chứng minh được giá trị                                                                                       |
| Ký điện tử khi nhận                   | Nặng, chỉ cần khi có yêu cầu pháp lý cụ thể                                                                                                                                                                                           |
| Tích hợp API hãng vận chuyển          | API các hãng được thiết kế cho **bên gửi**; công ty là bên nhận nên không có tài khoản chứa dữ liệu. Muốn tra API còn phải có mã vận đơn — mà file lễ tân không có cột đó ([§1.1](#11-hiện-trạng)) |
| **Teams** làm kênh thông báo          | Phụ thuộc phê duyệt cấp tập đoàn (Azure AD app + admin consent), không nằm trong tầm kiểm soát của nhóm. Pilot gửi qua **email** tại tên miền công ty ([CR-001](CR-001-de3-cap-nhat-theo-file-that.md) D9) |

---

## 2. Luồng nghiệp vụ

```
Lễ tân gửi file danh sách
        │
        ▼
[1] HC tải file lên
    → Đọc file (6 cột), tạo bản ghi
    → Khớp người nhận: alias → tên chính xác → tên gần đúng
    → Đánh dấu dòng nghi trùng (cảnh báo mềm, không tự bỏ)
        │
        ▼
[2] Màn hình soát trước khi gửi          ← chốt chặn quan trọng nhất
    → Hiện TOÀN BỘ dòng, phân ba mức: khớp chắc / cần soát / phải chọn
    → HC xác nhận dòng cần soát, chọn người cho dòng chưa rõ
        │
        ▼
[3] HC bấm gửi                            ← gọi lại được nhiều lần
    → Gửi các dòng đã sẵn sàng, gộp theo người
    → Dòng chưa khớp nằm lại ở `Chờ khớp`, KHÔNG chặn phần còn lại
        │
        ├──────────────► [3b] Màn hình "Chờ khớp" xuyên lô
        │                     → HC xử lý dần các ca khó
        │                     → Gán được người thì gửi ngay tại chỗ
        │                     → SLA tính từ lúc gửi bổ sung
        ▼
[4] Người nhận ra khu để đơn, tự lấy kiện của mình
    → Quét QR dán tại chỗ, nhập 4 số cuối điện thoại
    → Xác nhận đã nhận
        │
        ▼
[5] Scheduler quét mốc SLA
    → T+2 chưa nhận: nhắc lại một lần
    → T+5 chưa nhận: chuyển Tồn đọng
        │
        ▼
[6] Báo cáo tổng hợp theo kỳ
```

---

## 3. Tiếp nhận danh sách

### 3.1. Cách nhận file

Pilot dùng **tải tay**: HC tải file lên qua `POST /mail/batches/upload`. Hỗ trợ `.xlsx` và `.csv`.

> **Khuyến nghị lễ tân gửi `.xlsx`, không gửi `.csv`.** Trong `.xlsx` ô ngày là datetime thật, đọc trực tiếp được. Xuất sang `.csv` thì định dạng hiện tại (`mm-dd-yy`) thành chuỗi mơ hồ — `09/17/26` và `17/09/26` không phân biệt được. Xem [§3.4](#34-đọc-ngày).

### 3.2. Đọc file

Cấu trúc đã chốt theo file mẫu thật `mau.xlsx`:

| Cột | Header chính xác | Kiểu ô | Bắt buộc | Vào trường |
| --- | --- | --- | --- | --- |
| A | `stt` | số | Không | `row_index` — truy vết về dòng gốc |
| B | `người gửi` | chuỗi | Không | `sender_raw` — khóa khử trùng và xếp hạng ứng viên |
| C | `ngày nhận` | **datetime thật** | **Có** | `received_at` |
| D | `số lượng` | số | Không (mặc định 1) | `quantity` |
| E | `nội dung` | chuỗi | Không | `content_type` |
| F | `người nhận` | chuỗi | **Có** | `recipient_name_raw` — khóa khớp chính |

Chi tiết cần nhớ khi đọc:

- Một sheet duy nhất, tên `Trang_tính1` (nhiều khả năng xuất từ Google Sheets). Nhiều sheet thì chỉ đọc sheet đầu và cảnh báo.
- Header ở **dòng 1**, không có dòng thừa phía trên.
- Tên cột so sau khi bỏ dấu và chuẩn hóa hoa/thường, nên lễ tân viết `Người gửi` hay `NGƯỜI GỬI` đều được.
- Cột lạ (ví dụ `ghi chú`) bị bỏ qua, không làm gãy việc đọc.
- Thiếu cột bắt buộc thì **báo rõ thiếu cột nào**, không đọc tiếp.
- `importer.py` đã nhận sẵn cột `số điện thoại` cho ngày lễ tân thêm vào — xem [§4.2](#42-thứ-tự-ưu-tiên) bậc 0.

### 3.3. Khử trùng lặp

`tracking_code` không còn nguồn dữ liệu, nên khóa duy nhất của bản 0.3 bị thay bằng **khóa tổ hợp**:

```
dedup_key = sha256(người gửi + '|' + người nhận + '|' + ngày nhận)
```

Ba thành phần đều đã chuẩn hóa. Khóa này dùng được vì lễ tân gộp nhiều kiện cùng nguồn trong cùng ngày vào một dòng và ghi `số lượng` — nên hai dòng trùng khóa là dấu hiệu **tải lại file**, không phải hai kiện thật.

**Cảnh báo mềm, không tự động bỏ dòng.** Cột `dedup_key` có index nhưng **không** có ràng buộc `UNIQUE`:

| Tình huống | Xử lý |
| --- | --- |
| Trùng với dòng thuộc lô **đã gửi** | Đánh dấu `duplicate_suspect`, hiện ở màn hình soát kèm tham chiếu tới dòng cũ (lô nào, ngày nào, số lượng bao nhiêu). Mặc định **không gửi**, nhưng HC bấm giữ lại được |
| Trùng trong cùng một lô **chưa gửi** | Không tính — HC đang soát dở, không phải tải lại file |
| Cùng khóa nhưng `số lượng` khác (1 → 3) | Hiện rõ cả hai con số, HC chọn giữ giá trị nào. **Không tự cộng dồn, không tự ghi đè** |
| Tải lại file của ngày đã có lô | Cảnh báo ở đầu màn hình soát: *"Đã có lô cho ngày này, tải lên lúc …, N dòng."* HC quyết định tiếp tục hay hủy |

> **Vì sao không đặt `UNIQUE` và tự bỏ dòng:** âm thầm nuốt dữ liệu là kiểu hỏng tệ nhất — không ai phát hiện ra, và người nhận không bao giờ biết mình có kiện. Cảnh báo sai thì HC mất mười giây; nuốt mất một kiện thì không ai biết cho tới lúc có người đi hỏi.

### 3.4. Đọc ngày

Thứ tự ưu tiên trong `importer.py`:

1. Ô là datetime (trường hợp `.xlsx`) → dùng trực tiếp, **không parse chuỗi**.
2. Ô là chuỗi → đọc theo `dd/mm/yyyy` trước, quy ước Việt Nam.
3. Chuỗi mơ hồ — cả hai cách đọc đều hợp lệ và cho kết quả khác nhau → **không đoán**. Lô bị đánh dấu `ambiguous_date` và màn hình soát bắt HC xác nhận.

Năm hai chữ số hiểu là thế kỷ này (`26` → `2026`).

---

## 4. Khớp người nhận

> **Thiết kế này đổi hoàn toàn so với bản 0.3.** File không có số điện thoại, nên khóa khớp cũ mất nguồn dữ liệu. Cái khớp được bây giờ là **trí nhớ về lần HC đã chọn** — bảng `matching_alias` là cơ chế khớp chính, không phải tính năng phụ.

### 4.1. Chuẩn hóa trước khi so sánh

**Tên:** chuẩn hóa Unicode về NFC, thu gọn khoảng trắng liên tiếp, chuyển chữ thường. Bản chính **giữ nguyên dấu** — bỏ dấu làm "Hà" và "Hạ" trùng nhau. Sinh thêm một bản bỏ dấu, chỉ dùng ở bậc gần đúng.

Bản chuẩn hóa lưu vào `mail_item.recipient_name_normalized` để tra nhanh và để áp cả lô ([§4.4](#44-áp-cả-lô)).

**Người gửi:** cùng quy tắc, lưu vào `sender_normalized` — dùng cho khóa khử trùng ([§3.3](#33-khử-trùng-lặp)) và xếp hạng ứng viên ([§4.3](#43-xếp-hạng-ứng-viên)).

**Số điện thoại:** bỏ khoảng trắng, dấu chấm, gạch ngang; đổi tiền tố `+84`/`84` thành `0`. Giữ trong mã cho bậc 0, hiện chưa dùng tới.

### 4.2. Thứ tự ưu tiên

| Bậc | Điều kiện | `match_method` | `match_tier` |
| --- | --- | --- | --- |
| 0 | Số điện thoại khớp chính xác (chỉ chạy khi `MAIL_MATCH_BY_PHONE=true`) | `phone` | `confirmed` |
| 1 | Chuỗi tên thô chuẩn hóa có trong `matching_alias` | `alias` | `confirmed` |
| 2 | Tên chuẩn hóa khớp chính xác **đúng một** nhân sự | `name_exact` | `confirmed` |
| 3 | Tên chuẩn hóa khớp chính xác **nhiều** nhân sự | `name_exact` | `choose` |
| 4 | Gần đúng (bỏ dấu **hoặc** chứa nhau) ra **đúng một** ứng viên | `name_fuzzy` | `review` |
| 5 | Gần đúng ra **nhiều** ứng viên | `name_fuzzy` | `choose` |
| 6 | Không ra ứng viên nào | `none` | `choose` |

`match_tier` — không phải `match_method` — quyết định cách hiển thị và điều kiện gửi:

| Tier | Màn hình soát | Gửi được chưa |
| --- | --- | --- |
| `confirmed` | Điền sẵn | Gửi được ngay |
| `review` | Điền sẵn, **đánh dấu** | Chỉ sau khi HC bấm xác nhận |
| `choose` | Để trống, kèm danh sách gợi ý | Chỉ sau khi HC chọn người |

Tách hai khái niệm có chủ đích: cùng là `name_exact` nhưng ra một người thì `confirmed`, ra nhiều người trùng tên thì `choose`.

**Hai điều kiện của bậc gần đúng là độc lập, không phải một điểm số chung:**

- *Bỏ dấu* — `"nguyen thi thu"` tìm ra `"Nguyễn Thị Thu"`. Ngưỡng giống nhau đặt ở `MAIL_NAME_FUZZY_THRESHOLD` (mặc định `0.85`, ⚠️ tạm đặt).
- *Chứa nhau* — `"Lương hiền"` trên phong bì so với `"Nguyễn Thị Lương Hiền"` trong hồ sơ. Tỷ lệ giống nhau của cặp này rất thấp nhưng vẫn là ứng viên đúng, và **thiếu họ là kiểu viết phổ biến nhất** trong file lễ tân. Hai chặn để khỏi khớp bừa: chuỗi ngắn phải có ít nhất hai từ, và phải khớp ở ranh giới từ.

> **Đánh đổi đã biết:** bỏ dấu làm "An" và "Ân" trùng nhau. Chấp nhận được vì bậc này ra nhiều ứng viên thì kết quả là `choose` — HC chọn, máy không tự quyết.

### 4.3. Xếp hạng ứng viên

Khi ra nhiều ứng viên (bậc 3, 5), sắp danh sách gợi ý theo thứ tự:

1. Nhân sự **đã từng nhận hàng từ cùng người gửi**, nhiều lần hơn thì lên trước.
2. Độ giống tên giảm dần.
3. Còn lại theo bảng chữ cái.

Tín hiệu đầu thay cho tín hiệu "đơn vị" của bản 0.3 — file không còn cột phòng ban, nhưng ai từng nhận hàng từ "cty nam hải" thì lần sau nhiều khả năng vẫn là họ. Lịch sử lấy từ chính bảng `mail_item`, **không tạo bảng mới**, và chỉ đếm dòng đã hoàn tất việc khớp.

Xếp lên đầu **không phải** chọn sẵn: trùng tên thì vẫn là `choose`.

### 4.4. Áp cả lô

HC chọn người nhận cho một dòng thì mọi dòng khác **trong cùng lô** có cùng `recipient_name_normalized` được áp theo và đánh dấu `manual`. Một file mười dòng của cùng một người thì HC chỉ phải chọn một lần.

Tắt được bằng `apply_to_batch: false` khi hai người khác nhau lại viết trùng tên trên phong bì. Chỉ chạm tới dòng còn ở `Chờ khớp` — đã gửi email rồi thì đổi người nhận cũng không rút lại được.

### 4.5. Học alias

Ghi `matching_alias` **mỗi lần HC chọn tay hoặc sửa đề xuất của hệ thống**. Lần sau gặp đúng chuỗi tên đó thì khớp thẳng ở bậc 1.

HC sửa một dòng đã khớp bằng alias → **ghi đè alias cũ** và ghi log để truy vết. Lần chọn mới nhất là lần đúng nhất.

Alias trỏ tới người đã nghỉ việc thì bỏ qua, rơi xuống bậc sau.

> **Hệ quả cho báo cáo:** tỷ lệ khớp tự động **thấp ở tuần đầu rồi tăng dần**. Đó là hành vi đúng của thiết kế này, không phải lỗi — xem [§9.3](#93-bảng-kpi).

### 4.6. Điều kiện tiên quyết

Danh mục nhân sự phải có **họ tên đầy đủ và email**. Số điện thoại vẫn cần cho trang quét QR ([§7.2](#72-phương-án-chọn)) nhưng không còn là khóa khớp.

> ✅ **Đã xác nhận (16/09/2026):** danh mục nhân sự có số điện thoại đầy đủ, mỗi người một số. Ràng buộc `UNIQUE` trên `employee.phone_normalized` giữ nguyên.
>
> ⚠️ **Chưa ai xác nhận email.** Đây là chỗ hỏng im lặng: thiếu email thì thông báo không tới ai, mà đồng hồ SLA vẫn chạy. Màn hình soát đếm riêng số dòng `missing_email`.
>
> ⚠️ **`email` phải là hộp thư thật, không phải tài khoản AD.** Hai chuỗi này khác nhau (`v.trungab1@vinsmartfuture.tech` và `trungab1@vingroup.net`). Bảng `employee` tách riêng cột `upn`; đặt `UPN_DOMAIN_HINT` thì màn hình nhập danh mục cảnh báo ngay khi cột `email` mang tên miền AD.

### 4.7. Lưu vết

Ghi `match_method`, `match_tier` và `match_confidence` cho từng dòng.

Ngoài ra, mỗi lần HC sửa hoặc chọn đều ghi một dòng vào `mail_match_feedback`: máy đề xuất ai, HC chọn ai, tên thô là gì, người gửi là ai. Hai công dụng — và công dụng thứ hai mới là lý do chính:

1. Mẫu số để tính độ chính xác.
2. **Căn cứ bằng số để đi đòi lễ tân thêm cột số điện thoại** sau 1–2 tuần chạy thật.

---

## 5. Màn hình soát trước khi gửi

### 5.1. Vì sao bắt buộc

**Không bao giờ gửi thông báo thẳng từ file mà không qua mắt người.** Một file sai định dạng hoặc lệch cột sẽ thành hàng chục thông báo gửi nhầm người, không thu hồi được.

Với thiết kế mới, màn hình này còn quan trọng hơn: khớp theo tên vốn kém chắc chắn hơn khớp theo số điện thoại, và **mỗi lần HC chọn ở đây là một alias được học** — công sức bỏ ra tuần đầu là thứ làm tỷ lệ khớp tự động tăng ở các tuần sau.

### 5.2. Nội dung màn hình

**Phần tổng quan** — hiện luôn, kể cả khi khớp chắc 100%:

```
Lô ngày 17/09 · 10 dòng · 14 kiện
Khớp chắc 5 · Cần soát 3 · Phải chọn 2 · Nghi trùng 0
```

Đếm cả **số dòng** và **số kiện** (tổng `quantity`) — hai con số này khác nhau, báo nhầm là HC tưởng thiếu hàng.

Thêm hai cảnh báo khi có: lô cùng ngày đã tồn tại ([§3.3](#33-khử-trùng-lặp)), và ngày trong file mơ hồ ([§3.4](#34-đọc-ngày)).

**Bảng chi tiết** — hiện **toàn bộ** dòng, không chỉ dòng có vấn đề. Cột: `stt` · tên trên file · người gửi · số lượng · nội dung · người nhận đề xuất · trạng thái.

- Phân ba mức bằng **ký hiệu và màu**, không chỉ bằng màu — để người khó phân biệt màu vẫn dùng được.
- Dòng `review`: điền sẵn ứng viên, có nút xác nhận nhanh.
- Dòng `choose`: ô trống, danh sách gợi ý đã xếp hạng theo [§4.3](#43-xếp-hạng-ứng-viên).
- Dòng nghi trùng: hiện tham chiếu tới dòng cũ, có nút giữ lại.
- Ô tìm nhân sự: gõ 2–3 ký tự ra gợi ý, chọn được bằng bàn phím không cần chuột.
- Nút bỏ qua dòng (kiện không cần thông báo).

**Điều kiện gửi**

Nút gửi **luôn bật** khi có ít nhất một dòng sẵn sàng. Nhãn nút phản ánh thực tế:

- Sẵn sàng hết: `Gửi 10 dòng`
- Còn dòng chưa khớp: `Gửi 8 dòng · 2 dòng chờ khớp`

Không chặn cả lô vì một dòng chưa rõ — xem [§6.4](#64-gửi-một-phần).

---

## 6. Gửi thông báo

### 6.1. Gộp theo người

**Một người có nhiều dòng trong cùng một đợt gửi chỉ nhận một thông báo** liệt kê đầy đủ, không phải nhiều thông báo riêng lẻ.

Chi tiết nhỏ nhưng ảnh hưởng trực tiếp tới việc người dùng có thấy hệ thống phiền hay không. Hệ thống gửi 3 email cho 3 kiện của cùng một người sẽ bị coi là spam ngay tuần đầu.

Áp dụng cho **cả đợt gửi bổ sung** ([§6.4](#64-gửi-một-phần)). Một người có dòng ở cả hai đợt thì nhận hai thông báo riêng — đúng, vì hai đợt cách nhau về thời gian.

### 6.2. Nội dung thông báo

- **Tổng số kiện** (tổng `quantity`), không phải số dòng. Nói "1 kiện" khi thật ra có 3 thì người nhận lấy một kiện rồi về.
- Danh sách, mỗi dòng: **người gửi** — nội dung — số lượng — ngày về.
- Nơi lấy.
- Hạn lấy (theo SLA).
- Nút/link xác nhận đã nhận.

> Không còn mã vận đơn và đơn vị vận chuyển để in ([§1.1](#11-hiện-trạng)), nên **người gửi phải đứng đầu dòng**: đó là thứ duy nhất còn lại giúp người nhận đoán ra kiện nào của mình.
>
> Chỉ in **ngày**, không in giờ — file lễ tân không ghi giờ, in ra là giả chính xác.

### 6.3. Kênh

Dùng notification engine của lõi chung. Phân hệ này chỉ phát sự kiện `MAIL_RECEIVED`, **không quan tâm kênh** — việc chọn kênh và gộp theo người nằm ở `platform/notification`.

> ✅ **Chốt 16/09/2026, xác nhận lại ở CR-001 (D9): Đề 3 gửi qua email tại tên miền công ty.** Teams **ra khỏi phạm vi pilot** vì phụ thuộc phê duyệt cấp tập đoàn (Azure AD app + admin consent) — không đặt đường thông báo duy nhất của pilot vào thứ nhóm không kiểm soát được. Lớp trừu tượng giữ nguyên nên thêm kênh sau chỉ là viết thêm một lớp cài đặt `Channel`.
>
> ⚠️ Địa chỉ gửi lấy từ `employee.email` — **hộp thư thật**, không phải `employee.upn`. Xem [§4.6](#46-điều-kiện-tiên-quyết).

**Trạng thái hiện tại:** chưa có thông số SMTP nên hệ thống đang dùng `OutboxChannel` — thông báo vẫn lưu đầy đủ vào bảng `notification` nhưng **không gửi đi đâu**. Nhờ vậy chạy thử được toàn bộ luồng trước khi IT cấp thông số. Đặt `SMTP_HOST` là tự động chuyển sang gửi thật.

#### Lựa chọn kết nối SMTP

Xếp theo thứ tự ưu tiên:

| # | Cách | Thông số | Ghi chú |
|---|---|---|---|
| 1 | **Relay nội bộ** | Host do IT cấp, cổng `25`, không xác thực | Đơn giản nhất — không có mật khẩu để rò rỉ hay hết hạn. IT giới hạn theo IP của server. Người nhận đều là nội bộ nên thường được duyệt nhanh |
| 2 | **M365 — Direct Send** | `<tenant>.mail.protection.outlook.com`, cổng `25`, không xác thực | Chỉ gửi được cho người nhận **nội bộ** — đúng trường hợp của phân hệ này. Không cần tài khoản |
| 3 | **M365 — SMTP AUTH** | `smtp.office365.com`, cổng `587`, STARTTLS, tài khoản + mật khẩu | Microsoft đã tắt Basic Auth mặc định; phải nhờ IT bật SMTP AUTH riêng cho hộp thư đó |
| 4 | **Google Workspace** | `smtp-relay.gmail.com`, cổng `587`, STARTTLS | Relay toàn miền theo IP, không cần tài khoản riêng. Hoặc `smtp.gmail.com:587` + App Password (phải bật 2FA) |

#### Cần hỏi IT

| # | Câu hỏi | Vì sao cần |
|---|---|---|
| 1 | Có SMTP relay nội bộ cho ứng dụng gửi mail không? Host và cổng? | Quyết định chọn cách nào trong bảng trên |
| 2 | Cần xác thực, hay cho phép theo IP của server? | Nếu theo IP thì không phải quản lý mật khẩu |
| 3 | Xin **hộp thư dùng chung** kiểu `hanhchinh@congty.vn` làm địa chỉ gửi | Người nhận bấm Reply thì thư về đúng chỗ, và không phụ thuộc một cá nhân |
| 4 | Giới hạn tốc độ gửi? | M365 SMTP AUTH thường 30 mail/phút. Với lưu lượng hiện tại thì thoải mái, nhưng cần biết trước |
| 5 | **SPF/DKIM** của domain đã khai chưa? | Gửi từ server riêng mà SPF không có IP đó thì thư rơi vào spam — lỗi hay gặp và khó đoán ra |

#### Cấu hình

```bash
# .env — để trống SMTP_HOST thì dùng OutboxChannel (không gửi đi)
SMTP_HOST=
SMTP_PORT=587
SMTP_USE_STARTTLS=true        # cổng 587; dùng cổng 465 thì đổi sang SMTP_USE_SSL=true
SMTP_USE_SSL=false
SMTP_USERNAME=
SMTP_PASSWORD=
MAIL_FROM=
MAIL_FROM_NAME=Phòng Hành chính
```

### 6.4. Gửi một phần

`POST /mail/batches/{id}/send` **gọi lại được nhiều lần**.

| | Hành vi |
| --- | --- |
| Dòng được gửi | `confirmed`, hoặc `review`/`manual` đã được HC xác nhận, và không phải dòng nghi trùng chưa duyệt |
| Dòng chưa khớp | Nằm lại ở `Chờ khớp`, **không chặn** việc gửi các dòng còn lại |
| Gọi lại lần hai | Chỉ gửi phần mới sẵn sàng; dòng đã gửi **không gửi lại** |
| `sent_at` | Chỉ ghi ở lần gọi đầu tiên — đây là mốc đo "thời gian soát mỗi lô", không phải mốc gửi hết lô |
| Không còn gì để gửi | Báo lỗi, kèm danh sách dòng đang chờ khớp |

Trả về: số dòng vừa gửi, số dòng còn chờ khớp, số thông báo đã gửi (sau khi gộp).

**Màn hình "Chờ khớp" xuyên lô.** `GET /mail/items/pending-match` liệt kê **mọi dòng đang ở `Chờ khớp` trên toàn hệ thống**, không phân biệt lô — kiện của khách, thực tập sinh, người không có trong danh mục. Chờ lâu nhất lên đầu, kèm số ngày đã chờ và danh sách ứng viên.

HC gán được người nhận thì dòng đó gửi ngay tại chỗ (`POST /mail/items/{id}/send`). **Mốc SLA tính từ thời điểm này**, không phải từ lúc lô được gửi lần đầu.

**Chống tồn đọng âm thầm.** Dòng nằm ở `Chờ khớp` quá `MAIL_PENDING_MATCH_ALERT_DAYS` (mặc định 2 ngày) thì bị đánh dấu `overdue`, đẩy lên đầu màn hình và cảnh báo trên bảng điều khiển HC.

> **Không tự động chuyển sang `Tồn đọng`.** `Tồn đọng` nghĩa là "đã báo nhưng không ai lấy", khác hẳn với "chưa biết báo cho ai". Gộp hai thứ lại là mất dấu những kiện thực sự bị bỏ quên.

---

## 7. Xác nhận đã nhận

> ✅ **Chốt 16/09/2026.** Thay hẳn phương án của bản 0.1 — xem [7.1](#71-quy-trình-thật-tại-chỗ-để-đơn).

### 7.1. Quy trình thật tại chỗ để đơn

Bản 0.1 chọn "QR tại quầy, người trao quét khi giao". Khảo lại thực tế thì **không có ai trao cả**:

- Nhân viên HC ngồi trong văn phòng.
- Kiện hàng để ở khu ngoài hành lang, trước cửa.
- Người nhận tự ra lấy rồi **ký vào tờ giấy đặt trên bàn**, không vào văn phòng.
- Chỉ vào hỏi HC khi không tìm thấy kiện của mình.

Đây là **khu tự phục vụ**, nên HC không có cách nào biết ai vừa ra lấy gì. Mọi phương án dựa vào "người trao xác nhận" đều không dùng được.

Điều đáng học từ tờ giấy hiện tại: nó hiệu quả **vì nằm ngay trên bàn để đơn**, đúng lúc người ta đang cầm kiện trong tay — không phải vì ai cũng nhớ phải ký. Link trong email không có tính chất đó: email gửi từ hai hôm trước, đọc ở bàn làm việc; đứng ngoài hành lang mà phải lục lại hộp thư chính là kịch bản "lấy rồi quên bấm".

**Thứ thay thế tờ giấy phải nằm đúng chỗ tờ giấy đang nằm.**

### 7.2. Phương án chọn

**Đường chính — QR dán tại khu để đơn.** Một tấm biển đặt đúng vị trí tờ giấy ký hiện nay:

```
Lấy đơn xong, quét mã để xác nhận
          [ QR ]
```

Luồng: quét → mở trang web → nhập **4 số cuối điện thoại** → hệ thống hiện các kiện chưa nhận **của riêng người đó** → bấm xác nhận.

| Vì sao chọn                 |                                                                                                |
| --------------------------- | ---------------------------------------------------------------------------------------------- |
| Đúng chỗ, đúng lúc          | Thay tờ giấy ở nguyên vị trí, không bắt ai đổi thói quen                                       |
| Không cần đăng nhập         | Phần lớn CBNV không có tài khoản — `employee.password_hash` để nullable đúng vì vậy            |
| Không lộ dữ liệu người khác | Chỉ hiện kiện của người vừa nhập số. Tờ giấy hiện tại thì ai đi qua cũng đọc được cả danh sách |
| Không thêm việc cho HC      | Không phải in nhãn, không cần máy quét                                                         |

Khóa nhận dạng dùng **4 số cuối điện thoại**, đã có sẵn cột `employee.phone_last4` được đánh index. Có thể đổi sang mã nhân viên sau nếu cần, không phải đổi schema.

> **Rủi ro đã biết:** gõ mò 4 số có thể thấy người khác _có_ kiện hàng. Mức độ thấp và vẫn kín hơn tờ giấy hiện tại. Nếu cần chặt hơn thì đổi sang mã nhân viên.

**Đường phụ — link trong email.** Cho người muốn bấm luôn từ điện thoại mà không cần ra tới nơi quét mã.

### 7.3. HC đối chiếu, không phải HC trao

HC **không** xác nhận thay người nhận trong luồng thường. Nhưng trong pilot, quy trình cũ vẫn chạy song song (README §2) nên tờ giấy ký vẫn còn — HC dùng màn hình kiện hàng (mục “Chưa nhận”) để đối chiếu cuối ngày và tick những kiện đã ký giấy mà chưa ai bấm.

**Nút "Đã trao tay" trong pilot không phải việc mới.** Nó thay thao tác HC vốn vẫn làm bằng mắt: đọc tờ giấy rồi gạch tên. Khác ở chỗ bây giờ có chỗ ghi lại.

#### Bỏ tờ giấy thì nút này còn nghĩa gì?

Đây là chỗ dễ hiểu nhầm nhất của cả thiết kế. Nút đang mang **hai nghĩa khác nhau**, và chỉ một nghĩa sống sót sau pilot:

| Nghĩa | Căn cứ | Còn sau khi bỏ giấy? |
| --- | --- | --- |
| "Tờ giấy có chữ ký mà chưa ai bấm" | Chữ ký trên giấy | ❌ Mất luôn cùng tờ giấy |
| "HC tự tay trao kiện cho người vào hỏi" | HC chứng kiến tận mắt | ✅ Vẫn còn — [§7.1](#71-quy-trình-thật-tại-chỗ-để-đơn) ghi nhận có người vào hỏi khi không tìm thấy kiện |

> ⚠️ **Không được dùng nút này để dọn danh sách cho gọn.** Bỏ giấy rồi mà HC vẫn tick những dòng "chắc là họ lấy rồi" thì hệ thống ghi nhận một sự việc không ai chứng kiến — tệ hơn hẳn việc để dòng đó nằm lại, vì số liệu trông sạch trong khi thực tế không ai biết kiện ở đâu.

**Và đây mới là điều quan trọng: không thể quyết định trước là sẽ bỏ tờ giấy.**

Tỷ lệ `hc_reconciled` trong pilot chính là thứ trả lời câu hỏi đó ([§7.4](#74-phân-biệt-nguồn-xác-nhận)):

- Tỷ lệ **thấp** → phần lớn người nhận tự quét QR → bỏ giấy được.
- Tỷ lệ **cao** → phần lớn kiện chỉ được ghi nhận nhờ HC đọc giấy. Bỏ giấy thì đúng ngần ấy kiện sẽ nằm mãi ở `Đã thông báo`, bị nhắc ở T+2 và chuyển `Tồn đọng` ở T+5 — **dù người ta đã lấy hàng từ lâu**. Danh sách tồn đọng đầy báo động giả, và HC quay về đối chiếu tay, chỉ là không còn tờ giấy để đối chiếu.

Nói cách khác: bỏ giấy là **kết luận rút ra từ pilot**, không phải giả định đưa vào pilot. Xem [checklist mục D4](../checklist-truoc-khi-chay.md).

### 7.4. Phân biệt nguồn xác nhận

Ghi `handover_method`:

| Giá trị           | Nghĩa                                           |
| ----------------- | ----------------------------------------------- |
| `self_qr_station` | Người nhận quét QR tại khu để đơn — đường chính |
| `self_link`       | Người nhận bấm link trong email                 |
| `hc_reconciled`   | HC đối chiếu tờ ký giấy                         |

Đồng thời ghi `collected_at` và `collected_by`.

**Tỷ lệ `hc_reconciled` chính là thước đo quan trọng nhất của tính năng này**: nó trả lời câu "người nhận có thật sự chịu tự xác nhận không". Tỷ lệ này cao nghĩa là cơ chế xác nhận điện tử chưa thay được tờ giấy.

---

## 8. Trạng thái và SLA

### 8.1. Tập trạng thái

| Trạng thái     | Ý nghĩa                       | Chuyển tiếp             |
| -------------- | ----------------------------- | ----------------------- |
| `Chờ khớp`     | Chưa xác định được người nhận | → `Đã thông báo`        |
| `Đã thông báo` | Đã gửi, chờ người xuống lấy   | → `Đã nhận`, `Tồn đọng` |
| `Đã nhận`      | Kết thúc                      | —                       |
| `Tồn đọng`     | 5 ngày không ai lấy           | —                       |

### 8.2. "Quá hạn" không phải trạng thái

Quá hạn là **thuộc tính suy ra**: đang ở `Đã thông báo` và `notified_at` đã quá ngưỡng SLA.

Lý do thiết kế như vậy:

- Scheduler không phải chạy đi sửa hàng loạt bản ghi mỗi đêm.
- Không có nguy cơ lệch trạng thái khi job chạy lỗi hoặc chạy trễ.
- Truy vấn danh sách quá hạn vẫn đơn giản, chỉ là điều kiện `WHERE`.

### 8.3. SLA

> ✅ **Chốt 16/09/2026.** Đơn giản hơn nhiều so với bản 0.1: một mốc nhắc
> duy nhất, tính theo giờ đồng hồ, không leo thang.

Cấu hình được trong workflow engine, **không hard-code**.

| Mốc                            | Hành động                                                 |
| ------------------------------ | --------------------------------------------------------- |
| Ngay khi HC bấm gửi            | Gửi thông báo lần đầu                                     |
| Sau **2 ngày** vẫn `Chưa nhận` | Nhắc lại một lần, **cùng nội dung**, **không cc ai**      |
| Sau **5 ngày** vẫn `Chưa nhận` | Chuyển `Tồn đọng` để HC nắm và xử lý. **Không nhắc thêm** |

Mốc 2 ngày tính từ **thời điểm HC bấm gửi**, không phải từ lúc lễ tân nhận kiện. Lễ tân gửi danh sách mỗi ngày một lần, nên mỗi lô có đúng một mốc chung cho mọi kiện trong lô.

Mục đích của lần nhắc thứ hai chỉ là **nhắc lại cho người quên kiểm tra hộp thư**. Không phải leo thang, nên không gửi cho quản lý.

### 8.4. Tính theo giờ đồng hồ, không theo giờ làm việc

> ✅ **Chốt 16/09/2026.** Bản 0.1 yêu cầu tính theo giờ làm việc; nay bỏ.

Thư về thứ Sáu, chưa ai nhận thì Chủ Nhật nhắc lại — chấp nhận được, vì đây là email nhắc chứ không phải yêu cầu hành động gấp. Đổi lại, không phải khai báo giờ làm việc và danh sách ngày lễ mới chạy được Đề 3.

Engine vẫn hỗ trợ cả hai cách (`SLA(business_time=...)`); Đề 2 và Đề 4 nếu cần giờ làm việc thì bật cờ đó, không ảnh hưởng Đề 3.

**Nhắc vẫn gộp theo người** như bước gửi lần đầu. Một người có 3 kiện chưa lấy thì nhận một lời nhắc, không phải ba.

### 8.5. Sau lần nhắc thứ hai

> ✅ **Chốt 16/09/2026.**

Chỉ nhắc **đúng hai lần** (lúc gửi và sau 2 ngày). Sau đó dừng hẳn — kiện
nằm lại ở mục “Chưa nhận” của màn hình kiện hàng cho tới khi có người nhận.

Sau **5 ngày** vẫn chưa nhận thì chuyển `Tồn đọng`, để HC nắm và xử lý.
Đây là chuyển trạng thái tự động duy nhất theo thời gian trong phân hệ.

Cả hai mốc 2 ngày và 5 ngày đều tính từ **cùng một điểm gốc**: thời điểm
HC bấm gửi thông báo. Vậy một lô gửi ngày T sẽ có: nhắc lại ở T+2, chuyển
tồn đọng ở T+5.

---

## 9. Báo cáo

### 9.1. Màn hình kiện hàng (ưu tiên cao nhất)

HC dùng hằng ngày, nên làm **trước** cả phần báo cáo theo kỳ.

Bản 0.3 gọi đây là "màn hình quá hạn" và chỉ hiện kiện chưa lấy. Sai hai chỗ, sửa ở bản 0.4:

1. **"Quá hạn" không phải một trạng thái** mà là thuộc tính suy ra từ `notified_at` ([§8.2](#82-quá-hạn-không-phải-trạng-thái)) — lấy nó đặt tên cho màn hình là lẫn cách hiển thị với cách lưu trữ.
2. Kiện `Đã nhận` **biến mất khỏi giao diện**, nên không có chỗ nào trả lời câu hỏi HC gặp thường xuyên nhất: *"kiện của anh A đã lấy chưa?"*.

Nên đây là màn hình của **mọi kiện**, lọc theo trạng thái:

| Mục lọc | Trạng thái | Dùng khi |
| --- | --- | --- |
| **Chưa nhận** (mặc định) | `Đã thông báo` + `Tồn đọng` | Việc hằng ngày — chờ lâu nhất lên đầu |
| Đã thông báo | `Đã thông báo` | Chưa tới mốc tồn đọng |
| Tồn đọng | `Tồn đọng` | Quá 5 ngày không ai lấy |
| Đã nhận | `Đã nhận` | Tra cứu — mới nhất lên đầu |
| Tất cả | cả ba | Nhìn toàn cảnh |

Kèm ô tìm theo tên người nhận hoặc người gửi (bỏ dấu cả hai vế).

> Dòng ở `Chờ khớp` **không** nằm ở đây — chúng chưa có người nhận nên không có gì để theo dõi SLA. Chỗ của chúng là màn hình riêng ở [§6.4](#64-gửi-một-phần).

#### Nút "Đã trao tay" chỉ hiện khi chưa ai xác nhận

Kiện đã có người quét QR thì **không hiện nút nữa** — thay bằng dòng ghi đã nhận lúc nào và qua đường nào (`Quét QR` / `Bấm link` / `HC đối chiếu`).

`confirm_collect` vốn bỏ qua lần bấm thứ hai nên bấm lại không hỏng dữ liệu — `collected_at` và `handover_method` giữ nguyên, không bị ghi đè. Nhưng để nút ở đó thì HC tưởng còn việc phải làm, và tệ hơn là tưởng mình cần tick cho những kiện người ta đã tự xác nhận.

#### Tự làm mới

Đây là màn hình **duy nhất** mà dữ liệu đổi do người ngoài: ai đó vừa ra hành lang lấy kiện rồi quét QR. HC mở màn hình cả buổi, nên nó tự tải lại mỗi 45 giây và hiện rõ "cập nhật lúc mấy giờ". Tạm dừng khi tab bị ẩn và khi HC đang bấm dở một dòng.

Các màn hình còn lại không cần — chúng chỉ đổi khi chính HC thao tác.

### 9.2. Báo cáo theo kỳ

- Số dòng **và số kiện** theo kỳ, theo phòng ban.
- Tỷ lệ đã nhận / chưa nhận / tồn đọng.
- Thời gian trung bình từ lúc thông báo đến lúc lấy.
- Tỷ lệ khớp tự động theo bậc khớp, **nhóm theo tuần**.
- Tỷ lệ xác nhận qua QR so với qua link.
- Số thao tác HC phải làm mỗi lô, và số alias tích lũy.

> Bỏ "theo đơn vị vận chuyển" — file không có cột đó ([§1.1](#11-hiện-trạng)).

### 9.3. Bảng KPI

| KPI | Công thức |
| --- | --- |
| Thời gian xử lý | `sent_at − uploaded_at` theo lô; so với baseline thủ công |
| Tỷ lệ thông báo tự động | Số kiện thông báo tự động / tổng số kiện |
| **Tỷ lệ khớp tự động, theo tuần** | Dòng `confirmed` không bị HC sửa / tổng dòng, **nhóm theo tuần** |
| Số thao tác HC mỗi lô | Số dòng HC phải chọn hoặc xác nhận |
| Thời gian soát mỗi lô | `sent_at − uploaded_at` |
| Số alias tích lũy | Đếm `matching_alias`, theo tuần |
| Tỷ lệ thư chưa nhận | Số kiện quá SLA chưa xác nhận / tổng số kiện |

> ⚠️ **Tỷ lệ khớp tự động phải báo theo tuần, không phải trung bình cả kỳ.** Cơ chế alias ([§4.5](#45-học-alias)) làm tỷ lệ tăng dần theo thời gian: tuần đầu HC phải chọn gần hết, tới tuần thứ ba thì phần lớn khớp thẳng. Gộp lại thành một con số trung bình sẽ làm hệ thống trông tệ hơn hẳn thực lực, và che mất chính cái đường đi lên — thứ là bằng chứng rằng thiết kế này hoạt động.

> **Baseline** cần đo ở Tuần 0: hiện HC mất bao lâu để xử lý một file, và tỷ lệ thư bị quên nhận trong tháng gần nhất.

---

## 10. Mô hình dữ liệu

### 10.1. Bảng

```text
mail_batch
  id                       PK
  source_filename
  uploaded_by              FK -> employee
  uploaded_at
  receipt_date             ngày nhận chung của lô; NULL nếu các dòng lệch ngày
  row_count
  matched_count
  sent_count
  pending_match_count
  duplicate_suspect_count
  ambiguous_date           ngày trong file mơ hồ, HC phải xác nhận (§3.4)
  status                   reviewing / sent
  sent_at                  nullable - lần gửi ĐẦU TIÊN, không phải lúc gửi hết lô

mail_item
  id                        PK
  batch_id                  FK -> mail_batch
  row_index                 cột `stt` trong file, để truy vết dòng gốc
  sender_raw                cột `người gửi`, giữ nguyên bản
  sender_normalized         index - khử trùng và xếp hạng ứng viên
  recipient_name_raw        cột `người nhận`, giữ nguyên bản
  recipient_name_normalized index - khớp và áp cả lô
  recipient_phone_raw       LUÔN NULL với định dạng file hiện nay; giữ cho D7
  quantity                  cột `số lượng`, mặc định 1
  content_type              cột `nội dung`, ví dụ "phong bì"
  employee_id               FK -> employee, nullable
  match_method              phone / alias / name_exact / name_fuzzy / manual / none
  match_tier                confirmed / review / choose
  match_confidence
  review_confirmed          HC đã bấm xác nhận dòng `review` chưa
  dedup_key                 index, KHÔNG unique (§3.3)
  duplicate_suspect         nghi trùng với dòng thuộc lô đã gửi
  duplicate_of_id           FK -> mail_item, nullable - tham chiếu dòng cũ
  received_at               ngày lễ tân nhận kiện (file không ghi giờ)
  notified_at               nullable
  collected_at              nullable
  collected_by              FK -> employee, nullable
  handover_method           self_qr_station / self_link / hc_reconciled
  status
  note

matching_alias                  <- bảng mới, cơ chế khớp chính (§4.5)
  id                   PK
  raw_name_normalized  UNIQUE - chuỗi tên thô đã chuẩn hóa
  employee_id          FK -> employee
  hit_count
  created_by           FK -> employee - HC nào tạo
  last_used_at

mail_match_feedback             <- bảng mới, mẫu số KPI (§4.7)
  id                      PK
  mail_item_id            FK -> mail_item
  batch_id                FK -> mail_batch
  suggested_employee_id   máy đề xuất ai (NULL nếu không đề xuất)
  chosen_employee_id      HC chọn ai
  match_method_before
  match_tier_before
  raw_name
  sender_raw
  created_by              FK -> employee
```

Bảng `employee` thêm hai cột (xem [§4.6](#46-điều-kiện-tiên-quyết)):

```text
employee
  email          hộp thư THẬT - địa chỉ nhận mail
  upn            tài khoản AD, ví dụ trungab1@vingroup.net
  email_source   confirmed / derived
```

### 10.2. Vì sao giữ dữ liệu thô

Các trường `*_raw` giữ nguyên nội dung từ file lễ tân, song song với `employee_id` đã khớp. Khi có sai sót cần truy lại, phải biết file gốc ghi gì — nếu chỉ lưu kết quả đã khớp thì không điều tra được.

Với thiết kế mới còn một lý do nữa: `recipient_name_raw` là **khóa tra của bảng alias**. Chuẩn hóa mất bản gốc thì không học được gì.

### 10.3. Vì sao `dedup_key` không UNIQUE

Xem [§3.3](#33-khử-trùng-lặp). Khóa tổ hợp chỉ đủ tin để cảnh báo mềm; ràng buộc cứng sẽ âm thầm nuốt kiện thật.

### 10.4. Quan hệ với lõi chung

Workflow, notification và audit log dùng chung của nền tảng. `workflow_instance` trỏ tới `mail_item` qua cặp `entity_type = 'mail_item'` + `entity_id`.

---

## 11. API

| Method | Endpoint | Mô tả |
| --- | --- | --- |
| `POST` | `/mail/batches/upload` | **Tải file `.xlsx`/`.csv` của lễ tân** — luồng chính |
| `POST` | `/mail/batches` | Nạp từ các dòng đã đọc sẵn (kiện lẻ nhập tay, và test) |
| `GET` | `/mail/batches` | Danh sách lô |
| `GET` | `/mail/batches/{id}` | Chi tiết lô, phục vụ màn hình soát |
| `PATCH` | `/mail/items/{id}` | Chọn/sửa người nhận — học alias, áp cả lô |
| `POST` | `/mail/items/{id}/confirm` | Xác nhận nhanh dòng ở mức `review` |
| `POST` | `/mail/items/{id}/keep-duplicate` | Giữ lại dòng bị nghi trùng |
| `POST` | `/mail/batches/{id}/send` | Gửi — **gọi lại được nhiều lần** ([§6.4](#64-gửi-một-phần)) |
| `GET` | `/mail/items/pending-match` | Màn hình "Chờ khớp" **xuyên lô** |
| `POST` | `/mail/items/{id}/send` | Gửi ngay một dòng vừa gán người nhận |
| `POST` | `/mail/station/lookup` | Tra 4 số cuối tại khu để đơn — **công khai** |
| `POST` | `/mail/station/collect/{id}` | Xác nhận đã nhận tại khu để đơn — **công khai** |
| `POST` | `/mail/items/{id}/collect` | HC đối chiếu tờ ký giấy |
| `POST` | `/mail/items/{id}/collect-mine` | Người nhận tự xác nhận qua link trong email |
| `GET` | `/mail/items` | Mọi kiện, lọc theo trạng thái/phòng ban. Lặp `?status=` để lấy nhiều trạng thái |
| `GET` | `/mail/items/mine` | Kiện của chính mình |
| `GET` | `/mail/reports` | Báo cáo tổng hợp |

---

## 12. Phân quyền

> ✅ **Chốt 16/09/2026: đúng hai vai trò.** Bỏ vai trò `Quản lý` — nhân
> viên HC đã đóng luôn vai trò đó.

| Vai trò      | Mã         | Quyền                                                                         |
| ------------ | ---------- | ----------------------------------------------------------------------------- |
| Nhân viên HC | `hc`       | Tải file, soát, gửi thông báo, xem màn hình kiện quá hạn, xem toàn bộ báo cáo |
| Nhân viên    | `employee` | Xem kiện của chính mình, tự xác nhận đã nhận                                  |

Link xác nhận gửi qua email cần token có thời hạn để tránh người khác xác nhận hộ.

> ✅ **Chốt 18/09/2026: link dùng lại được, không dùng một lần.** Một email gộp nhiều kiện và người nhận có thể lấy làm hai lần; link dùng một lần thì lần sau hết đường xác nhận. Thay vào đó token (ký bằng `SECRET_KEY`) chỉ có hiệu lực với **đúng các kiện trong email đó** và vẫn phải thuộc người nhận đó; xác nhận lại kiện đã nhận thì không đổi gì. Hạn `CONFIRM_TOKEN_TTL_HOURS` = 14 ngày — dài hơn mốc tồn đọng T+5 vì người nhận vẫn lấy được hàng sau mốc đó. Link trỏ tới `PUBLIC_BASE_URL/#/confirm?token=…` (frontend dùng HashRouter), API `POST /mail/confirm/lookup` và `/mail/confirm/collect`.

Màn hình "Chờ khớp" xuyên lô ([§6.4](#64-gửi-một-phần)) và endpoint tải file đều thuộc quyền `mail.manage` — chỉ HC.

---

## 13. Ước lượng công sức

| Hạng mục | Ngày công | Trạng thái |
| --- | --- | --- |
| Khử trùng lặp, dựng lô | 0.3 | ✅ xong |
| Quy tắc khớp người nhận | 0.5 | ✅ xong |
| Gửi thông báo gộp theo người | 0.5 | ✅ xong |
| Cấu hình SLA, job nhắc tự động | 0.3 | ✅ xong |
| API cho toàn bộ luồng | 0.5 | ✅ xong |
| **Đọc file, ánh xạ cột** | 0.7 | ✅ xong — CR-001, đã có file mẫu thật |
| **CR-001: khớp theo tên + bảng alias** | 0.5 | ✅ xong |
| **CR-001: khử trùng mềm + gửi một phần** | 0.5 | ✅ xong |
| Màn hình soát (frontend) | 1.2 | ✅ xong 17/09 |
| **Màn hình "Chờ khớp" xuyên lô (frontend)** | 0.4 | ✅ xong 17/09 |
| Trang quét QR tại khu để đơn (frontend) | 0.4 | ✅ xong 17/09 |
| Nút HC đối chiếu tờ ký giấy | 0.1 | ✅ xong 17/09 |
| Báo cáo + màn hình kiện hàng (frontend) | 1.0 | ✅ xong 17/09 |
| **Tổng** | **~6.9 ngày** | backend và frontend đã xong; còn UAT |

Tăng so với bản 0.3 (5.3 ngày) vì CR-001 thêm bảng alias, khử trùng mềm, gửi một phần và một màn hình frontend mới.

Tới 17/09/2026 **cả backend lẫn frontend đã xong**. Việc còn lại không phải code: ba mục chặn cứng ở [checklist](../checklist-truoc-khi-chay.md) (danh mục nhân sự, thông số SMTP, mạng và nơi triển khai), đo baseline thủ công, và UAT.

---

## 14. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
| --- | --- | --- |
| ~~Danh mục nhân sự chưa có số điện thoại~~ | ~~Cao~~ | ✅ Đã gỡ 16/09/2026 — HR xác nhận có đầy đủ |
| ~~Số điện thoại trùng giữa hai nhân sự~~ | ~~Thấp~~ | ✅ Đã gỡ 16/09/2026 — mỗi người một số, ràng buộc `UNIQUE` ở DB |
| ~~File không có mã vận đơn nên mất khóa khử trùng~~ | ~~Cao~~ | ✅ Đã gỡ 17/09/2026 — khóa tổ hợp dạng cảnh báo mềm ([§3.3](#33-khử-trùng-lặp)) |
| **Gửi nhầm người vì khớp theo tên** | **Cao** | Đây là rủi ro lớn nhất còn lại. Bốn lớp chặn: khớp chính xác ra nhiều người thì **không đoán**; gần đúng thì bắt HC xác nhận; màn hình soát bắt buộc; và mọi lần HC sửa đều ghi lại để đo ([§4.7](#47-lưu-vết)) |
| **Tỷ lệ khớp tự động thấp ở tuần đầu** | Trung bình | Là hành vi đúng của cơ chế alias, không phải lỗi. Báo cáo **theo tuần** để thấy đường đi lên ([§9.3](#93-bảng-kpi)). Sau 1–2 tuần, dùng số liệu `mail_match_feedback` để đề nghị lễ tân thêm cột số điện thoại |
| **Email trong danh mục là tài khoản AD, không phải hộp thư** | **Cao** | Hỏng im lặng: thư không tới ai nhưng hệ thống báo gửi thành công. Tách cột `upn`, và `UPN_DOMAIN_HINT` bật cảnh báo ở màn hình nhập ([§4.6](#46-điều-kiện-tiên-quyết)) |
| **Nhân sự thiếu email** | Trung bình | Màn hình soát đếm riêng `missing_email`. Chưa chặn gửi — nhưng SLA vẫn chạy cho những dòng đó |
| Lễ tân đổi định dạng file giữa chừng | Trung bình | Tên cột so sau khi bỏ dấu và bỏ qua hoa/thường; cột lạ bị bỏ qua; thiếu cột bắt buộc thì báo rõ cột nào |
| File `.csv` làm ngày đọc sai | Trung bình | Chuỗi mơ hồ thì **không đoán**, đánh dấu để HC xác nhận ([§3.4](#34-đọc-ngày)). Khuyến nghị lễ tân gửi `.xlsx` |
| Gửi trùng do file chồng lấn | Trung bình | Khóa tổ hợp + cảnh báo lô cùng ngày. **Cảnh báo, không tự bỏ dòng** |
| Dòng `Chờ khớp` tồn đọng âm thầm | Trung bình | Màn hình xuyên lô + cảnh báo quá 2 ngày ([§6.4](#64-gửi-một-phần)) |
| Người nhận thấy thông báo phiền | Thấp | Gộp theo người ở cả thông báo lần đầu và nhắc lại |
| Người nhận lấy đơn rồi quên bấm xác nhận | **Trung bình** | QR dán ngay tại khu để đơn, đúng chỗ tờ giấy ký hiện nay ([§7.2](#72-phương-án-chọn)). Pilot vẫn giữ tờ ký giấy để HC đối chiếu ([§7.3](#73-hc-đối-chiếu-không-phải-hc-trao)); tỷ lệ `hc_reconciled` là thước đo mức độ nghiêm trọng |
| Người lạ xác nhận hộ qua endpoint công khai | Thấp | Mã trạm nhúng trong QR (`MAIL_STATION_TOKEN`). Là rào yếu — chi tiết ở ghi chú đầu `mail/router.py` |

---

## 15. Câu hỏi còn mở

> Bảng dưới đây là các câu hỏi thuộc phạm vi thiết kế phân hệ. Danh sách
> **đầy đủ những gì còn thiếu để chạy thật** — gồm cả hạ tầng, mạng, danh
> mục nhân sự và kênh thông báo — nằm ở
> [`../checklist-truoc-khi-chay.md`](../checklist-truoc-khi-chay.md).

| # | Câu hỏi | Ảnh hưởng | Người trả lời |
| --- | --- | --- | --- |
| ~~1~~ | ~~Cấu trúc file cụ thể~~ | ✅ **Đã giải 17/09/2026** — có `mau.xlsx`, chốt ở [§3.2](#32-đọc-file) | — |
| ~~2~~ | ~~Trường "đơn vị" khớp được với danh mục phòng ban không~~ | ✅ **Không còn câu hỏi** — file không có cột phòng ban. Thay bằng lịch sử người gửi ([§4.3](#43-xếp-hạng-ứng-viên)) | — |
| 3 | Quy định hiện tại về thư tồn đọng: sau bao lâu thì trả lại hoặc xử lý thế nào? | Cần số thật để đặt SLA | Phòng HC |
| 4 | Mỗi ngày đúng một file, hay có khi gửi nhiều lần? Có khi nào gửi lại bản sửa? | Quyết định mức chặt của cảnh báo trùng lô cùng ngày ([§3.3](#33-khử-trùng-lặp)) | Lễ tân |
| 5 | Lưu lượng thực tế: mỗi ngày bao nhiêu kiện? | Kiểm chứng ước lượng và lựa chọn hạ tầng | Lễ tân |
| 6 | Cột `nội dung` có bộ giá trị cố định không, hay ghi tự do? | Nếu cố định thì dùng được để nhận diện kiện giá trị cao | Lễ tân |
| 7 | Tải lại file mà `số lượng` đổi từ 1 thành 3 — là sửa lại con số cũ hay có thêm 2 kiện mới? | Hiện hiện cả hai con số cho HC chọn; biết câu trả lời thì tự động hóa được | Lễ tân |
| 8 | File có phải xuất từ Google Sheets không? | Nếu đúng thì việc thêm cột số điện thoại rất dễ | Lễ tân |
| 9 | Dòng ở `Chờ khớp` quá lâu thì quy trình xử lý ra sao? | Hiện chỉ cảnh báo, không tự chuyển trạng thái ([§6.4](#64-gửi-một-phần)) | Phòng HC |

> **Việc cần làm sau 1–2 tuần chạy thật:** dùng số liệu ở `mail_match_feedback` ([§4.7](#47-lưu-vết)) để đề nghị lễ tân thêm cột số điện thoại. Lập luận có số đo cụ thể ("HC phải chọn tay X% số dòng, mất Y phút mỗi ngày") thuyết phục hơn nhiều so với đề nghị trước khi chạy. Khi có cột đó, bật bậc 0 ở [§4.2](#42-thứ-tự-ưu-tiên) bằng `MAIL_MATCH_BY_PHONE=true` — **không phải sửa code**.

---

## 16. Khác biệt so với wireframe

Wireframe artboard `1d` (`docs/wireframe/`) được dựng sớm hơn tài liệu này và có một số chỗ không khớp. **Chốt ngày 16/09/2026: implement theo tài liệu này, không theo wireframe.**

| #   | Wireframe `1d`                                               | Tài liệu này                                                                                           | Chốt                                                                                         |
| --- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| 1   | Panel "AI · Nhận diện vận đơn" đọc ảnh tem, độ chính xác 93% | [1.3](#13-ghi-chú-về-ai): phân hệ **không có thành phần AI**                                           | **Bỏ panel AI.** Dữ liệu vào đã có cấu trúc, không có gì để OCR                              |
| 2   | Nút "+ Ghi nhận thư mới" — nhập tay từng kiện                | [3.1](#31-cách-nhận-file): HC **tải file** `.xlsx`/`.csv` qua `POST /mail/batches/upload`              | **Theo tài liệu.** Nhập tay chỉ là lối thoát cho kiện lẻ, không phải luồng chính             |
| 3   | Không có màn hình soát trước khi gửi                         | [5](#5-màn-hình-soát-trước-khi-gửi): **bắt buộc**, là chốt chặn quan trọng nhất                        | **Phải có.** Wireframe thiếu màn hình quan trọng nhất của phân hệ                            |
| 4   | Không có màn hình xác nhận đã nhận                           | [7.2](#72-phương-án-chọn): QR dán tại khu để đơn là đường chính                                        | **Phải có.** Không phải màn hình quầy như bản 0.1 — là trang web người nhận tự mở trên điện thoại |
| 5   | Có tab "Gửi đi 42"                                           | [1.2](#12-phạm-vi-phân-hệ): phạm vi chỉ có thư **đến**                                                 | **Bỏ khỏi pilot.** Cùng nhóm vấn đề với README B1 (công văn đi)                              |
| 6   | "Nhắc lại sau 24h", "quá 3 ngày chưa nhận"                   | [8.3](#83-sla): nhắc lại sau **2 ngày**, tồn đọng sau **5 ngày**, tính theo giờ đồng hồ                | **Theo tài liệu.** Cả wireframe lẫn bản 0.1 đều không còn đúng; con số phải cấu hình được, không hard-code |
| 7   | Hiển thị "Quá hạn nhận" như một trạng thái                   | [8.2](#82-quá-hạn-không-phải-trạng-thái): quá hạn là thuộc tính **suy ra**                             | Không mâu thuẫn — wireframe nói cách **hiển thị**, tài liệu nói cách **lưu trữ**. Giữ cả hai, nhưng màn hình lọc theo **trạng thái thật** ([9.1](#91-màn-hình-kiện-hàng-ưu-tiên-cao-nhất)), không lọc theo "quá hạn" |

| 8 | Không có màn hình "Chờ khớp" xuyên lô | [6.4](#64-gửi-một-phần): **bắt buộc** từ CR-001 | **Phải thêm.** Gửi một phần chỉ có nghĩa khi có chỗ xử lý phần còn lại |
| 9 | Bảng soát chỉ tô màu theo mức tin cậy | [5.2](#52-nội-dung-màn-hình): phân ba mức bằng **ký hiệu và màu** | **Theo tài liệu.** Chỉ dùng màu thì người khó phân biệt màu không dùng được |

Wireframe vẫn dùng được cho phần nó làm tốt: bảng màu, quy ước trạng thái, bố cục danh sách và thanh KPI.

---

## 17. Lịch sử thay đổi

| Bản | Ngày | Nội dung |
| --- | --- | --- |
| 0.1 | 15/09/2026 | Bản đầu, dựng luồng nghiệp vụ |
| 0.2 | 16/09/2026 | Bỏ màn hình quầy và máy quét ở §7; bỏ tính SLA theo giờ làm việc |
| 0.3 | 16/09/2026 | Chốt hai vai trò; chốt SLA T+2 / T+5; chốt kênh email |
| **0.4** | **17/09/2026** | **Áp dụng [CR-001](CR-001-de3-cap-nhat-theo-file-that.md)** theo file mẫu thật: bỏ `tracking_code`/`carrier`/`recipient_unit_raw`; khớp theo tên + bảng `matching_alias` ([§4](#4-khớp-người-nhận)); khử trùng lặp bằng khóa tổ hợp dạng cảnh báo mềm ([§3.3](#33-khử-trùng-lặp)); gửi một phần và màn hình "Chờ khớp" xuyên lô ([§6.4](#64-gửi-một-phần)); tách `employee.upn` khỏi `employee.email`; KPI khớp tự động báo theo tuần ([§9.3](#93-bảng-kpi)) |

---

_Tài liệu đã chốt. Backend (354 test xanh) và frontend đều đã implement xong; việc còn lại không phải code — xem [§13](#13-ước-lượng-công-sức) và [`../checklist-truoc-khi-chay.md`](../checklist-truoc-khi-chay.md)._
