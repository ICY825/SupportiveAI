# Mail Tracking — Thiết kế chi tiết

> Phân hệ theo dõi chuyển phát nhanh (Đề bài 3)
> Thuộc module `document_flow` trong hệ thống SupportiveAI

**Trạng thái:** `Draft` — chờ file mẫu từ lễ tân để chốt phần đọc file
**Phiên bản:** 0.2
**Cập nhật:** 16/09/2026
**Đầu mối nghiệp vụ:** Phạm Thị Duyên

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

---

## 1. Bối cảnh và phạm vi

### 1.1. Hiện trạng

Lễ tân nhận kiện hàng, phân loại và gửi file danh sách lên Phòng Hành chính. File đã chứa đầy đủ: tên người nhận, số điện thoại, đơn vị, mã/vận đơn, thời gian nhận.

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

| Hạng mục | Lý do |
|---|---|
| Tự động đọc hộp thư để tiếp nhận file | Tốn 2–3 ngày tích hợp, thêm điểm hỏng, trong khi mỗi ngày chỉ 1–2 file và thao tác tải tay mất 5 giây |
| Lễ tân nhập trực tiếp vào hệ thống | Cần thay đổi thói quen của bộ phận có thể không thuộc quyền điều phối của HC — là vấn đề tổ chức, nên bàn sau khi pilot chứng minh được giá trị |
| Ký điện tử khi nhận | Nặng, chỉ cần khi có yêu cầu pháp lý cụ thể |
| Tích hợp API hãng vận chuyển | API các hãng được thiết kế cho **bên gửi**; công ty là bên nhận nên không có tài khoản chứa dữ liệu. Ngoài ra muốn tra API phải có mã vận đơn trước — mà mã đó đã nằm sẵn trong file của lễ tân, nên API không cho thêm thông tin nào |

---

## 2. Luồng nghiệp vụ

```
Lễ tân gửi file danh sách
        │
        ▼
[1] HC tải file lên
    → Đọc file, tạo bản ghi
    → Khử trùng lặp theo mã vận đơn
    → Khớp người nhận với danh mục nhân sự
        │
        ▼
[2] Màn hình soát trước khi gửi          ← chốt chặn quan trọng nhất
    → HC rà lại các dòng cần kiểm
    → Sửa người nhận ở dòng sai/thiếu
        │
        ▼
[3] HC bấm gửi
    → Thông báo đi hàng loạt, gộp theo người
        │
        ▼
[4] Người nhận xuống quầy lấy
    → Người trao quét QR xác nhận
        │
        ▼
[5] Scheduler nhắc các trường hợp chưa nhận theo SLA
        │
        ▼
[6] Báo cáo tổng hợp theo kỳ
```

---

## 3. Tiếp nhận danh sách

### 3.1. Cách nhận file

Pilot dùng **tải tay**: HC tải file lên qua giao diện web. Hỗ trợ `.xlsx` và `.csv`.

### 3.2. Đọc file

Cấu trúc file chưa chốt (cần file mẫu thật — xem [mục 15](#15-câu-hỏi-còn-mở)). Thiết kế nên cho phép **ánh xạ cột** ở lần chạy đầu và ghi nhớ cho các lần sau, để khỏi phải sửa code khi lễ tân đổi định dạng.

Các trường cần lấy:

| Trường | Bắt buộc | Ghi chú |
|---|---|---|
| Tên người nhận | Có | |
| Số điện thoại | Nên có | Khóa khớp chính |
| Đơn vị | Không | Tín hiệu phụ khi tên trùng |
| Mã/vận đơn | Có | Khóa duy nhất, dùng khử trùng |
| Đơn vị vận chuyển | Không | Phục vụ báo cáo |
| Thời gian nhận | Có | |

### 3.3. Khử trùng lặp

Lấy `tracking_code` làm khóa duy nhất trong bảng `mail_item`.

Thực tế lễ tân hay gửi lại file có phần chồng lấn với hôm trước, hoặc gửi bản sửa. Không khử trùng thì người nhận bị bắn thông báo hai lần cho cùng một kiện — lỗi này rất mất uy tín hệ thống ngay tuần đầu.

Quy tắc:

- Mã vận đơn đã tồn tại → bỏ qua dòng, đếm vào `skipped_duplicate`, hiển thị ở màn hình soát.
- Mã vận đơn trống → không khử trùng được, đánh dấu cần kiểm tay.

---

## 4. Khớp người nhận

### 4.1. Chuẩn hóa trước khi so sánh

**Số điện thoại:** bỏ khoảng trắng, dấu chấm, dấu gạch ngang; đổi tiền tố `+84`/`84` thành `0`. Bước nhỏ này quyết định phần lớn tỷ lệ khớp tự động.

**Tên:** chuẩn hóa Unicode, bỏ khoảng trắng thừa, chuyển về chữ thường khi so sánh.

### 4.2. Thứ tự ưu tiên

| Bậc | Cách khớp | Mức tin cậy | Xử lý |
|---|---|---|---|
| 1 | Số điện thoại trùng khớp chính xác | Cao | Đề xuất sẵn, không cần soát |
| 2 | 4 số cuối điện thoại + tên gần đúng | Trung bình | Đề xuất, đánh dấu cần soát |
| 3 | Chỉ khớp tên, ra nhiều ứng viên | Thấp | Hiện danh sách để HC chọn |
| 4 | Không khớp gì | — | Đánh dấu, xử lý tay |

Nếu trường "đơn vị" trong file khớp được với danh mục phòng ban, dùng làm tín hiệu phụ để thu hẹp ứng viên ở bậc 2 và 3.

> **Vì sao ưu tiên số điện thoại:** tên người Việt trùng lặp rất nhiều (Nguyễn Văn A, Trần Thị B...). Khớp theo tên đơn thuần sẽ cho nhiều ứng viên và dễ gửi nhầm.

### 4.3. Điều kiện tiên quyết

Danh mục nhân sự **phải có số điện thoại** — nếu thiếu thì bậc 1 không dùng được và tỷ lệ khớp tự động tụt hẳn.

> ✅ **Đã xác nhận (16/09/2026):** danh mục nhân sự có số điện thoại đầy đủ. Bậc 1 dùng được, thiết kế khớp ở [mục 4.2](#42-thứ-tự-ưu-tiên) giữ nguyên.
>
> ✅ **Đã xác nhận (16/09/2026):** mỗi nhân sự dùng **một số điện thoại riêng**. Vì vậy `employee.phone_normalized` đặt ràng buộc `UNIQUE` ở tầng DB, và bậc 1 luôn trả về nhiều nhất một ứng viên.
>
> Còn lại cần kiểm ở Tuần 0: mã nhân viên đã chuẩn hóa và duy nhất chưa (README A4).

### 4.4. Lưu vết

Ghi lại `match_method` (cách khớp ở bậc nào) và `match_confidence` cho từng dòng. Đây là dữ liệu để tính KPI "tỷ lệ khớp tự động" và để cải thiện quy tắc sau này.

---

## 5. Màn hình soát trước khi gửi

### 5.1. Vì sao bắt buộc

**Không bao giờ gửi thông báo thẳng từ file mà không qua mắt người.** Một file sai định dạng hoặc lệch cột sẽ thành hàng chục thông báo gửi nhầm người, không thu hồi được.

Chi phí thêm khoảng nửa ngày công, nhưng đây là thứ giữ cho hệ thống được tin dùng.

### 5.2. Nội dung màn hình

**Phần tổng quan**

- Tổng số dòng đọc được từ file.
- Số dòng khớp chắc (bậc 1).
- Số dòng cần soát (bậc 2, 3).
- Số dòng không khớp (bậc 4).
- Số dòng trùng đã bỏ.

**Bảng chi tiết**

- Mỗi dòng: dữ liệu thô từ file + người nhận hệ thống đề xuất.
- Tô màu theo mức tin cậy để HC nhìn là biết chỗ nào cần nhìn kỹ.
- Cho sửa người nhận trực tiếp trên từng dòng, có ô tìm nhân sự gợi ý theo vài ký tự đầu.
- Cho bỏ qua dòng không cần gửi.

**Điều kiện gửi**

Nút gửi chỉ bật khi không còn dòng nào ở trạng thái chưa xử lý.

---

## 6. Gửi thông báo

### 6.1. Gộp theo người

**Một người có nhiều kiện trong cùng lô chỉ nhận một thông báo** liệt kê đầy đủ các kiện, không phải nhiều thông báo riêng lẻ.

Chi tiết nhỏ nhưng ảnh hưởng trực tiếp tới việc người dùng có thấy hệ thống phiền hay không. Hệ thống gửi 3 email cho 3 kiện của cùng một người sẽ bị coi là spam ngay tuần đầu.

### 6.2. Nội dung thông báo

- Số lượng kiện.
- Danh sách: mã vận đơn, đơn vị vận chuyển, thời gian đến.
- Nơi lấy.
- Hạn lấy (theo SLA).
- Nút/link xác nhận đã nhận.

### 6.3. Kênh

Dùng notification engine của lõi chung. Kênh cụ thể chưa chốt ở cấp hệ thống (email, Teams hay Zalo OA) — phân hệ này chỉ phát sự kiện `MAIL_RECEIVED`, không quan tâm kênh.

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

| Vì sao chọn | |
|---|---|
| Đúng chỗ, đúng lúc | Thay tờ giấy ở nguyên vị trí, không bắt ai đổi thói quen |
| Không cần đăng nhập | Phần lớn CBNV không có tài khoản — `employee.password_hash` để nullable đúng vì vậy |
| Không lộ dữ liệu người khác | Chỉ hiện kiện của người vừa nhập số. Tờ giấy hiện tại thì ai đi qua cũng đọc được cả danh sách |
| Không thêm việc cho HC | Không phải in nhãn, không cần máy quét |

Khóa nhận dạng dùng **4 số cuối điện thoại**, đã có sẵn cột `employee.phone_last4` được đánh index. Có thể đổi sang mã nhân viên sau nếu cần, không phải đổi schema.

> **Rủi ro đã biết:** gõ mò 4 số có thể thấy người khác *có* kiện hàng. Mức độ thấp và vẫn kín hơn tờ giấy hiện tại. Nếu cần chặt hơn thì đổi sang mã nhân viên.

**Đường phụ — link trong email.** Cho người muốn bấm luôn từ điện thoại mà không cần ra tới nơi quét mã.

### 7.3. HC đối chiếu, không phải HC trao

HC **không** xác nhận thay người nhận trong luồng thường. Nhưng trong pilot, quy trình cũ vẫn chạy song song (README §2) nên tờ giấy ký vẫn còn — HC dùng màn hình quá hạn để đối chiếu cuối ngày và tick những kiện đã ký giấy mà chưa ai bấm.

### 7.4. Phân biệt nguồn xác nhận

Ghi `handover_method`:

| Giá trị | Nghĩa |
|---|---|
| `self_qr_station` | Người nhận quét QR tại khu để đơn — đường chính |
| `self_link` | Người nhận bấm link trong email |
| `hc_reconciled` | HC đối chiếu tờ ký giấy |

Đồng thời ghi `collected_at` và `collected_by`.

**Tỷ lệ `hc_reconciled` chính là thước đo quan trọng nhất của tính năng này**: nó trả lời câu "người nhận có thật sự chịu tự xác nhận không". Tỷ lệ này cao nghĩa là cơ chế xác nhận điện tử chưa thay được tờ giấy.

---

## 8. Trạng thái và SLA

### 8.1. Tập trạng thái

| Trạng thái | Ý nghĩa | Chuyển tiếp |
|---|---|---|
| `Chờ khớp` | Chưa xác định được người nhận | → `Đã thông báo` |
| `Đã thông báo` | Đã gửi, chờ người xuống lấy | → `Đã nhận`, `Tồn đọng` |
| `Đã nhận` | Kết thúc | — |
| `Tồn đọng` | 5 ngày không ai lấy | — |

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

| Mốc | Hành động |
|---|---|
| Ngay khi HC bấm gửi | Gửi thông báo lần đầu |
| Sau **2 ngày** vẫn `Chưa nhận` | Nhắc lại một lần, **cùng nội dung**, **không cc ai** |
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
nằm lại trong màn hình quá hạn của HC cho tới khi có người nhận.

Sau **5 ngày** vẫn chưa nhận thì chuyển `Tồn đọng`, để HC nắm và xử lý.
Đây là chuyển trạng thái tự động duy nhất theo thời gian trong phân hệ.

Cả hai mốc 2 ngày và 5 ngày đều tính từ **cùng một điểm gốc**: thời điểm
HC bấm gửi thông báo. Vậy một lô gửi ngày T sẽ có: nhắc lại ở T+2, chuyển
tồn đọng ở T+5.

---

## 9. Báo cáo

### 9.1. Màn hình quá hạn (ưu tiên cao nhất)

HC dùng hằng ngày, nên làm **trước** cả phần báo cáo theo kỳ. Nội dung: danh sách kiện đang ở `Đã thông báo` và đã quá SLA, sắp xếp theo số ngày quá hạn giảm dần, có nút nhắc lại thủ công và nút chuyển `Tồn đọng`.

### 9.2. Báo cáo theo kỳ

- Số kiện theo kỳ, theo đơn vị vận chuyển, theo phòng ban.
- Tỷ lệ đã nhận / chưa nhận / tồn đọng.
- Thời gian trung bình từ lúc thông báo đến lúc lấy.
- Tỷ lệ khớp tự động (theo bậc khớp).
- Tỷ lệ xác nhận qua QR so với qua link.

### 9.3. Bảng KPI

| KPI | Công thức |
|---|---|
| Thời gian xử lý | Trung bình `sent_at − uploaded_at` theo lô; so với baseline thủ công |
| Tỷ lệ thông báo tự động | Số kiện thông báo tự động / tổng số kiện |
| Tỷ lệ khớp tự động | Số dòng khớp bậc 1 không bị HC sửa / tổng số dòng |
| Tỷ lệ thư chưa nhận | Số kiện quá SLA chưa xác nhận / tổng số kiện |

> **Baseline** cần đo ở Tuần 0: hiện HC mất bao lâu để xử lý một file, và tỷ lệ thư bị quên nhận trong tháng gần nhất.

---

## 10. Mô hình dữ liệu

### 10.1. Bảng

```text
mail_batch
  id                  PK
  source_filename
  uploaded_by         FK → employee
  uploaded_at
  row_count
  matched_count
  skipped_duplicate
  sent_at             nullable

mail_item
  id                  PK
  tracking_code       UNIQUE
  carrier
  recipient_name_raw
  recipient_phone_raw
  recipient_unit_raw
  employee_id         FK → employee, nullable
  match_method        bậc khớp: phone / phone4_name / name / manual
  match_confidence
  received_at         thời gian lễ tân nhận kiện
  notified_at         nullable
  collected_at        nullable
  collected_by        FK → employee, nullable
  handover_method     qr_counter / self_link
  status
  batch_id            FK → mail_batch
  note
```

### 10.2. Vì sao giữ dữ liệu thô

Các trường `*_raw` giữ nguyên nội dung từ file lễ tân, song song với `employee_id` đã khớp. Khi có sai sót cần truy lại, phải biết file gốc ghi gì — nếu chỉ lưu kết quả đã khớp thì không điều tra được.

### 10.3. Quan hệ với lõi chung

Workflow, notification và audit log dùng chung của nền tảng. `workflow_instance` trỏ tới `mail_item` qua cặp `entity_type = 'mail_item'` + `entity_id`.

---

## 11. API

| Method | Endpoint | Mô tả |
|---|---|---|
| `POST` | `/mail/batches` | Tải file danh sách, trả về kết quả đọc và khớp |
| `GET` | `/mail/batches/{id}` | Xem chi tiết lô, phục vụ màn hình soát |
| `PATCH` | `/mail/items/{id}` | Sửa người nhận của một dòng |
| `POST` | `/mail/batches/{id}/send` | Xác nhận và gửi thông báo hàng loạt |
| `POST` | `/mail/items/{id}/collect` | Ghi nhận đã nhận (từ QR hoặc link) |
| `GET` | `/mail/items` | Danh sách, lọc theo trạng thái/quá hạn/phòng ban |
| `GET` | `/mail/reports` | Báo cáo tổng hợp theo kỳ |

---

## 12. Phân quyền

> ✅ **Chốt 16/09/2026: đúng hai vai trò.** Bỏ vai trò `Quản lý` — nhân
> viên HC đã đóng luôn vai trò đó.

| Vai trò | Mã | Quyền |
|---|---|---|
| Nhân viên HC | `hc` | Tải file, soát, gửi thông báo, xem màn hình kiện quá hạn, xem toàn bộ báo cáo |
| Nhân viên | `employee` | Xem kiện của chính mình, tự xác nhận đã nhận |

Link xác nhận gửi qua email cần token có thời hạn, dùng một lần, để tránh người khác xác nhận hộ.

---

## 13. Ước lượng công sức

| Hạng mục | Ngày công |
|---|---|
| Đọc file, ánh xạ cột, khử trùng lặp | 1.0 |
| Quy tắc khớp người nhận | 0.5 |
| Màn hình soát | 1.0 |
| Gửi thông báo gộp theo người | 0.5 |
| QR xác nhận + màn hình quầy | 1.0 |
| Cấu hình SLA, nhắc tự động | 0.5 |
| Báo cáo + màn hình quá hạn | 1.0 |
| **Tổng** | **~5.5 ngày** |

Vừa với **Tuần 2**, với điều kiện lõi chung (dữ liệu nhân sự, notification, workflow engine) đã xong ở Tuần 1.

---

## 14. Rủi ro

| Rủi ro | Mức | Giảm thiểu |
|---|---|---|
| ~~Danh mục nhân sự chưa có số điện thoại~~ | ~~Cao~~ | ✅ Đã gỡ 16/09/2026 — HR xác nhận có đầy đủ |
| ~~Số điện thoại trùng giữa hai nhân sự~~ | ~~Thấp~~ | ✅ Đã gỡ 16/09/2026 — mỗi người một số, ràng buộc `UNIQUE` ở DB |
| Lễ tân đổi định dạng file giữa chừng | Trung bình | Thiết kế ánh xạ cột cấu hình được thay vì hard-code |
| Gửi nhầm người | Trung bình | Màn hình soát bắt buộc; ưu tiên khớp theo số điện thoại |
| Gửi trùng do file chồng lấn | Trung bình | Khử trùng theo `tracking_code` |
| Người nhận thấy thông báo phiền | Thấp | Gộp theo người ở cả thông báo lần đầu và nhắc lại |
| Xác nhận không phản ánh thực tế | Thấp | QR tại quầy làm đường chính thay vì để người nhận tự bấm |

---

## 15. Câu hỏi còn mở

| # | Câu hỏi | Ảnh hưởng | Người trả lời |
|---|---|---|---|
| 1 | **Cấu trúc file cụ thể:** tên cột chính xác, có dòng tiêu đề không, một hay nhiều sheet, định dạng ngày giờ. **Cần một file mẫu thật.** | Quyết định 0.5–1 ngày công phần đọc file | Lễ tân / chị Duyên |
| 2 | Trường "đơn vị" trong file có khớp được với danh mục phòng ban không, hay là tên tự do? | Nếu khớp được thì là tín hiệu phụ tốt khi tên trùng | Lễ tân |
| 3 | Quy định hiện tại về thư tồn đọng: sau bao lâu thì trả lại hoặc xử lý thế nào? | Cần số thật để đặt SLA | Phòng HC |
| 4 | Lễ tân gửi file mấy lần một ngày? Một file gộp nhiều kiện hay tách? | Ảnh hưởng thiết kế `mail_batch` và thời điểm gửi thông báo | Lễ tân |
| 5 | Quầy có thiết bị quét QR không, hay dùng điện thoại cá nhân của nhân viên trực? | Ảnh hưởng thiết kế màn hình quầy | Phòng HC |
| 6 | Lưu lượng thực tế: mỗi ngày bao nhiêu kiện? | Kiểm chứng ước lượng và lựa chọn hạ tầng | Lễ tân |

---

## 16. Khác biệt so với wireframe

Wireframe artboard `1d` (`docs/wireframe/`) được dựng sớm hơn tài liệu này và có một số chỗ không khớp. **Chốt ngày 16/09/2026: implement theo tài liệu này, không theo wireframe.**

| # | Wireframe `1d` | Tài liệu này | Chốt |
|---|---|---|---|
| 1 | Panel "AI · Nhận diện vận đơn" đọc ảnh tem, độ chính xác 93% | [1.3](#13-ghi-chú-về-ai): phân hệ **không có thành phần AI** | **Bỏ panel AI.** Dữ liệu vào đã có cấu trúc, không có gì để OCR |
| 2 | Nút "+ Ghi nhận thư mới" — nhập tay từng kiện | [3.1](#31-cách-nhận-file): HC **tải file** `.xlsx`/`.csv` | **Theo tài liệu.** Nhập tay chỉ là lối thoát cho kiện lẻ, không phải luồng chính |
| 3 | Không có màn hình soát trước khi gửi | [5](#5-màn-hình-soát-trước-khi-gửi): **bắt buộc**, là chốt chặn quan trọng nhất | **Phải có.** Wireframe thiếu màn hình quan trọng nhất của phân hệ |
| 4 | Không có màn hình quét QR tại quầy | [7.2](#72-phương-án-chọn): QR tại quầy là đường chính | **Phải có** |
| 5 | Có tab "Gửi đi 42" | [1.2](#12-phạm-vi-phân-hệ): phạm vi chỉ có thư **đến** | **Bỏ khỏi pilot.** Cùng nhóm vấn đề với README B1 (công văn đi) |
| 6 | "Nhắc lại sau 24h", "quá 3 ngày chưa nhận" | [8.3](#83-sla-đề-xuất)–[8.4](#84-hai-lưu-ý-khi-tính-giờ): 24 **giờ làm việc**; tồn đọng sau **7 ngày** | **Theo tài liệu**, và con số phải cấu hình được, không hard-code |
| 7 | Hiển thị "Quá hạn nhận" như một trạng thái | [8.2](#82-quá-hạn-không-phải-trạng-thái): quá hạn là thuộc tính **suy ra** | Không mâu thuẫn — wireframe nói cách **hiển thị**, tài liệu nói cách **lưu trữ**. Giữ cả hai |

Wireframe vẫn dùng được cho phần nó làm tốt: bảng màu, quy ước trạng thái, bố cục danh sách và thanh KPI.

---

*Tài liệu ở trạng thái Draft. Cần file mẫu từ lễ tân trước khi chốt phần đọc file và bắt đầu implement.*
