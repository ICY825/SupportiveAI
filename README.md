# SupportiveAI

> Nền tảng ứng dụng AI cho nghiệp vụ Hành chính — gom 4 bài toán vào một hệ thống dùng chung.

**Trạng thái:** `Draft` — đang trong giai đoạn thiết kế, chưa bắt đầu implement.
**Phiên bản tài liệu:** 0.1
**Cập nhật:** 15/09/2026

---

## Mục lục

- [1. Bối cảnh](#1-bối-cảnh)
- [2. Mục tiêu](#2-mục-tiêu)
- [3. Ý tưởng kiến trúc](#3-ý-tưởng-kiến-trúc)
- [4. Các phân hệ chức năng](#4-các-phân-hệ-chức-năng)
- [5. Nền tảng dùng chung](#5-nền-tảng-dùng-chung)
- [6. Lớp AI](#6-lớp-ai)
- [7. Mô hình dữ liệu](#7-mô-hình-dữ-liệu)
- [8. Công nghệ dự kiến](#8-công-nghệ-dự-kiến)
- [9. Cấu trúc mã nguồn](#9-cấu-trúc-mã-nguồn)
- [10. Lộ trình pilot](#10-lộ-trình-pilot)
- [11. KPI và cách đo](#11-kpi-và-cách-đo)
- [12. Vấn đề chưa chốt](#12-vấn-đề-chưa-chốt)
- [13. Quy ước làm việc](#13-quy-ước-làm-việc)

---

## Ký hiệu dùng trong tài liệu

| Ký hiệu | Ý nghĩa |
|---|---|
| ✅ | Đã chốt |
| 🚧 | Đang thiết kế / cần làm rõ thêm |
| ❓ | Chưa có quyết định — cần người chịu trách nhiệm trả lời |
| ⏭ | Ngoài phạm vi pilot, để pha sau |

---

## 1. Bối cảnh

Phòng Hành chính triển khai thử nghiệm **4 đề bài ứng dụng AI** trong 6 tuần, nhằm đẩy mạnh ứng dụng AI vào nghiệp vụ hành chính, giảm thao tác thủ công và đánh giá hiệu quả thực tế của từng giải pháp.

| # | Đề bài | Đầu mối nghiệp vụ | Hiện trạng |
|---|---|---|---|
| 1 | Quy hoạch văn phòng | Nguyễn Thị Thu Hương | Khó theo dõi tình trạng sử dụng chỗ ngồi thực tế; mất nhiều thời gian khi có nhân sự mới hoặc thay đổi cơ cấu |
| 2 | Quản lý tủ locker | Lưu Hải Nam | Cấp phát/thu hồi thực hiện thủ công, khó theo dõi tình trạng sử dụng |
| 3 | Chuyển phát nhanh | Phạm Thị Duyên | Việc thông báo nhận thư/chuyển phát và xác nhận đã nhận còn thủ công |
| 4 | Quản lý công văn đến/đi | Vũ Phương Thảo | Công văn tần suất lớn; đọc, nhập liệu, xử lý còn nhiều thao tác thủ công |

Nhận xét cốt lõi: **4 đề bài này không độc lập.** Cả 4 đều cần cùng một danh mục nhân sự/phòng ban, cùng một cơ chế thông báo và nhắc hạn, cùng một cách theo dõi trạng thái và báo cáo. Nếu làm 4 hệ thống rời, Phòng Hành chính phải đồng bộ danh sách nhân sự ở 4 nơi và dùng 4 giao diện khác nhau.

---

## 2. Mục tiêu

### Mục tiêu của pilot

1. Chứng minh (bằng số liệu) rằng AI giảm được thao tác thủ công trong 4 nghiệp vụ trên.
2. Xác định đề bài nào đáng đầu tư tiếp, đề bài nào nên dừng.
3. Xây được phần lõi dùng chung để các nghiệp vụ hành chính khác tái sử dụng sau này.

### Không phải mục tiêu của pilot

- Không nhằm thay thế hoàn toàn quy trình thủ công. Trong suốt pilot, **quy trình cũ vẫn chạy song song** làm lưới an toàn và làm cơ sở đối chiếu.
- Không nhằm ra sản phẩm production-ready trong 6 tuần.
- Không tự động hóa 100%. Mọi kết quả AI đều có bước người xác nhận (human-in-the-loop).

---

## 3. Ý tưởng kiến trúc

### 3.1. Bốn đề bài, hai nhóm nghiệp vụ

Phân tích kỹ thì 4 đề bài gom được thành 2 mô hình dữ liệu:

**Nhóm A — Cấp phát tài nguyên (Đề 1 + Đề 2)**
Chỗ ngồi và tủ locker về bản chất là cùng một thực thể: *một tài nguyên vật lý, gắn với một vị trí, được cấp cho một nhân sự, có trạng thái và có lịch sử*. Đề 1 chỉ khác ở phần tối ưu và trực quan hóa sơ đồ mặt bằng.

**Nhóm B — Xử lý luồng đến/đi (Đề 3 + Đề 4)**
Thư chuyển phát và công văn đến đi theo cùng một vòng đời: *nhận → nhận diện thông tin → xác định người nhận → thông báo → theo dõi xác nhận → nhắc quá hạn → báo cáo*. Đề 4 có thêm luồng công văn đi và mức trích xuất AI sâu hơn.

### 3.2. Sơ đồ tầng

```
┌──────────────────────────────────────────────────────────┐
│  Đề 1        Đề 2        Đề 3           Đề 4             │
│  Quy hoạch   Locker      Chuyển phát    Công văn         │
├──────────────────────────────────────────────────────────┤
│  Phân hệ cấp phát        │  Phân hệ luồng đến/đi         │
│  (chỗ ngồi, locker)      │  (thư, công văn)              │
├──────────────────────────────────────────────────────────┤
│  LÕI NỀN TẢNG DÙNG CHUNG                                 │
│  Dữ liệu nền  │  Workflow &  │  Thông báo  │  Báo cáo    │
│  nhân sự      │  trạng thái  │  & nhắc hạn │  & KPI      │
├──────────────────────────────────────────────────────────┤
│  LỚP AI                                                  │
│  OCR / Trích xuất / Phân loại  │  Tối ưu xếp chỗ ⏭      │
├──────────────────────────────────────────────────────────┤
│  HẠ TẦNG                                                 │
│  PostgreSQL  │  File storage  │  Scheduler  │  Audit log │
└──────────────────────────────────────────────────────────┘
```

### 3.3. Nguyên tắc kiến trúc

| Quyết định | Lý do | Trạng thái |
|---|---|---|
| **Modular monolith** — một codebase, một database, các phân hệ tách biệt | Team nhỏ, dữ liệu chia sẻ nhiều, 6 tuần không đủ cho microservices | ✅ |
| **Lõi chung là thư viện, không phải ràng buộc** | Phải dừng/giữ được từng đề bài độc lập để đánh giá | ✅ |
| **Workflow engine cấu hình được** | 4 nghiệp vụ có state machine khác nhau; engine không được ép về một luồng cứng | ✅ |
| **AI tách thành lớp dịch vụ riêng** | Tái sử dụng được, và thay được nhà cung cấp mà không đụng nghiệp vụ | ✅ |
| **Human-in-the-loop bắt buộc** | AI không tự quyết; mọi kết quả đều qua người xác nhận | ✅ |
| **Ghi log mọi lần người sửa kết quả AI** | Đây là mẫu số duy nhất để tính "độ chính xác" và "tỷ lệ tự động hóa" | ✅ |

---

## 4. Các phân hệ chức năng

### 4.1. Đề 1 — Quy hoạch văn phòng

**Mục tiêu:** Quản lý và tối ưu việc sử dụng chỗ ngồi văn phòng.

**Chức năng trong pilot (Phase 1)**

- Tải lên và hiển thị sơ đồ mặt bằng theo tầng/khối.
- Trình chỉnh sửa trực quan: gán nhân sự vào chỗ ngồi, kéo thả để đổi chỗ.
- Hiển thị trạng thái theo màu: đầy / trống / thiếu (đang cân nhắc quy ước màu — cam cho bổ sung chỗ, xanh cho trống).
- Các khối/bộ phận tự cập nhật số lượng chỗ ngồi thực tế của mình.
- Thống kê chỗ trống/thừa/thiếu theo khu vực.
- Gợi ý vị trí ngồi cho nhân sự mới (dựa trên phòng ban + chỗ trống gần nhất).

**Ngoài phạm vi pilot** ⏭

- Thuật toán tối ưu xếp chỗ theo ràng buộc phức tạp.
- Mô phỏng và so sánh nhiều phương án layout.
- Đề xuất phương án điều chuyển khi thay đổi cơ cấu.

> Lý do tách: phần tối ưu + mô phỏng tự nó đã là một sản phẩm độc lập. Cố làm trong 6 tuần sẽ ra kết quả không ai dám dùng. Tuy nhiên schema Phase 1 vẫn thiết kế sẵn `layout_version` để Phase 2 không phải migrate.

**Dữ liệu đầu vào:** Sơ đồ mặt bằng, danh sách nhân sự, phòng ban, vị trí, số lượng chỗ ngồi.

**KPI:** Thời gian lập phương án; tỷ lệ tự động hóa; độ chính xác phương án.

---

### 4.2. Đề 2 — Quản lý tủ locker

**Mục tiêu:** Quản lý tập trung, tự động hóa cấp phát/thu hồi locker.

**Chức năng**

- Danh mục locker: dãy, mã tủ, vị trí, tình trạng (trống / đang dùng / hỏng / chờ thu hồi).
- Cấp phát locker cho nhân sự; nhân sự xác nhận qua thông báo hoặc quét QR.
- Thu hồi locker: tự động phát hiện trường hợp cần thu hồi (nhân sự nghỉ việc, chuyển bộ phận) và gửi nhắc.
- Theo dõi tủ đang sử dụng / còn trống / hỏng.
- Cảnh báo trường hợp cần thu hồi hoặc cập nhật thông tin.
- Lịch sử cấp phát đầy đủ cho từng tủ và từng nhân sự.

**Dữ liệu đầu vào:** Danh sách tủ, vị trí, nhân sự, trạng thái cấp phát/thu hồi.

**KPI:** Thời gian tra cứu/cập nhật; số thao tác thủ công giảm; độ chính xác dữ liệu.

> Đây là phân hệ đơn giản nhất nhưng chạy qua *toàn bộ* lõi chung — nên được làm trước để kiểm chứng lõi có đúng không.

---

### 4.3. Đề 3 — Chuyển phát nhanh

**Mục tiêu:** Tự động hóa thông báo và theo dõi tình trạng nhận thư/chuyển phát.

**Chức năng**

- Ghi nhận thư/kiện đến: mã vận đơn, đơn vị vận chuyển, người nhận, thời gian đến.
- Nhận diện người nhận (quét mã vận đơn / OCR nhãn / nhập tay) và khớp với danh mục nhân sự.
- Tự động gửi thông báo tới người nhận khi có thư.
- Người nhận xác nhận đã nhận (qua link, QR hoặc ký điện tử).
- Ghi nhận trạng thái: chưa nhận / đã nhận / quá hạn.
- Tự động nhắc lại các trường hợp chưa nhận sau ngưỡng SLA.
- Báo cáo tổng hợp tình trạng nhận thư theo kỳ.

**Dữ liệu đầu vào:** Thông tin người nhận, đơn vị, mã vận đơn, thời gian nhận.

**KPI:** Thời gian xử lý; tỷ lệ thông báo tự động; tỷ lệ thư chưa nhận.

**Chưa rõ** ❓ Nguồn dữ liệu vận đơn đến từ đâu: API hãng vận chuyển, email tự động, hay nhập tay/quét mã? Quyết định này ảnh hưởng lớn tới khối lượng công việc.

---

### 4.4. Đề 4 — Quản lý công văn đến/đi

**Mục tiêu:** Tự động hóa việc tiếp nhận, phân loại và theo dõi công văn.

**Chức năng — công văn đến**

- Tiếp nhận từ file scan hoặc email.
- AI đọc và trích xuất tự động các trường:
  - Loại công văn (đến / đi)
  - Số/ký hiệu, ngày công văn
  - Chủ đề / tên công văn
  - Đơn vị, cá nhân xử lý
  - Deadline phản hồi
  - Trạng thái xử lý
  - Mức độ ưu tiên
- Người phụ trách xác nhận hoặc sửa kết quả AI (bắt buộc).
- Tự động định tuyến tới đơn vị/cá nhân xử lý.
- Theo dõi tiến độ, nhắc hạn, cảnh báo quá hạn.
- Tự động cập nhật file/hệ thống theo dõi.

**Chức năng — công văn đi** 🚧

Đề bài gốc là "đến/**đi**" nhưng luồng outbound hiện chưa được thiết kế. Cần bổ sung hoặc thống nhất đưa ra ngoài phạm vi pilot. Xem [mục 12](#12-vấn-đề-chưa-chốt).

**Dữ liệu đầu vào:** File scan, PDF, email và dữ liệu công văn thực tế.

**KPI:** Thời gian xử lý; độ chính xác nhận diện; tỷ lệ tự động hóa; tỷ lệ bỏ sót thông tin/deadline.

> Đây là phân hệ nặng AI nhất và rủi ro cao nhất. Xem [mục 6](#6-lớp-ai) và [mục 12](#12-vấn-đề-chưa-chốt).

---

## 5. Nền tảng dùng chung

Ước tính khoảng **50–60% khối lượng công việc** nằm ở lớp này. Đây là lý do chính đáng nhất để gộp 4 đề bài.

### 5.1. Dữ liệu nền

- Danh mục nhân sự (mã nhân viên duy nhất, email, trạng thái làm việc).
- Phòng ban, khối, chức danh.
- Vị trí vật lý: toà nhà, tầng, khu vực.
- Đồng bộ với hệ thống HR ❓ (chưa xác định nguồn và tần suất).

> **Điều kiện tiên quyết.** Nếu chưa có danh sách nhân sự sạch với mã duy nhất thì cả 4 phân hệ đều gãy ở cùng một chỗ. Đây là việc phải xong trước khi code bất cứ thứ gì.

### 5.2. Workflow & trạng thái

Engine state machine **cấu hình được**, không cứng. Mỗi loại thực thể (locker, chỗ ngồi, thư, công văn) khai báo riêng:

- Tập trạng thái và các chuyển đổi hợp lệ.
- SLA cho từng trạng thái.
- Quy tắc nhắc hạn và leo thang.
- Ai được phép thực hiện chuyển đổi nào.

Ví dụ hai luồng khác nhau cùng dùng một engine:

```
Locker:    Trống → Đã cấp → Đang dùng → Chờ thu hồi → Trống
Công văn:  Tiếp nhận → Đã phân → Đang xử lý → Hoàn tất
                          ↓
                       Quá hạn (nhắc mỗi 24h)
```

### 5.3. Thông báo & nhắc hạn

- Một cơ chế duy nhất, các phân hệ chỉ phát sự kiện.
- Kênh: email, và ❓ (Teams hay Zalo OA — chưa chốt).
- Nhắc tự động theo SLA, leo thang khi quá hạn.
- Sự kiện mẫu: `MAIL_RECEIVED`, `DOCUMENT_OVERDUE`, `LOCKER_ASSIGNED`, `SEAT_CHANGED`.

### 5.4. Xác nhận

Một cơ chế dùng chung cho cả 4 phân hệ: link xác nhận, quét QR, hoặc ký điện tử. Dùng cho nhận thư, nhận công văn, nhận locker, xác nhận đổi chỗ ngồi.

### 5.5. Audit log

Mọi chuyển đổi trạng thái đều ghi lại: người thực hiện, thời điểm, trạng thái cũ, trạng thái mới, dữ liệu kèm theo. Phục vụ cả truy vết lẫn tính KPI.

### 5.6. Báo cáo & dashboard

- Thời gian xử lý trung bình theo từng nghiệp vụ.
- Tỷ lệ đạt SLA / quá hạn.
- Độ chính xác AI (tính từ số lần người sửa kết quả).
- Tỷ lệ tự động hóa.
- So sánh với baseline thủ công.

---

## 6. Lớp AI

### 6.1. Pipeline xử lý tài liệu

```
Ảnh/PDF → Tiền xử lý → OCR → Trích xuất trường → Kiểm tra quy tắc
                                                        ↓
                          Đủ tin cậy? → Có → Đề xuất sẵn cho người duyệt
                                       → Không → Người nhập tay
                                                        ↓
                                              Ghi lại kết quả người sửa
                                              (dữ liệu để đo và cải thiện)
```

### 6.2. Nguyên tắc

- **Không tự động xử lý mà không có người xác nhận.** Trong pilot, AI chỉ *đề xuất*, người quyết.
- **Kiểm tra bằng quy tắc là trụ chính, confidence của mô hình chỉ là tín hiệu phụ.** Số công văn có đúng định dạng không? Ngày có hợp lệ không? Phòng ban có trong danh mục không? Người nhận có khớp nhân sự đang làm việc không? Đây là những tín hiệu kiểm chứng được. Confidence do LLM tự báo cáo không phải xác suất đã hiệu chỉnh — không nên dùng làm cơ sở duy nhất.
- **Đánh giá độ tin cậy theo từng trường, không theo cả tài liệu.** Số công văn có thể đọc rất chắc trong khi deadline lại mơ hồ; một điểm số chung sẽ che mất chỗ sai.
- **Ngưỡng cụ thể phải hiệu chỉnh từ dữ liệu thật**, không chốt trước trong tài liệu thiết kế.

### 6.3. Điểm rủi ro kỹ thuật lớn nhất

OCR tiếng Việt với công văn hành chính: dấu thanh, dấu đỏ chồng lên chữ, chữ ký, bảng biểu ở phần header, chất lượng scan không đều. Pipeline `OCR → text → LLM` thường vỡ layout ở đúng những trường cần lấy (số/ký hiệu, ngày, nơi nhận).

**Việc cần làm sớm:** spike 2 ngày so sánh trên ~30 file scan thật giữa các phương án OCR và phương án đọc trực tiếp bằng mô hình vision. Chọn theo số đo, không theo mặc định.

---

## 7. Mô hình dữ liệu

### 7.1. Các bảng chính (dự kiến)

**Dữ liệu nền**
`employee` · `department` · `location`

**Cấp phát tài nguyên**
`resource` (bảng chung: id, type, location_id, status)
`seat` (chi tiết: toạ độ x/y, tầng, hướng, layout_version)
`locker` (chi tiết: dãy, mã tủ)
`resource_assignment` (lịch sử cấp phát)

**Luồng đến/đi**
`mail_item` (thư/kiện: mã vận đơn, đơn vị vận chuyển, người nhận)
`document` (công văn: số/ký hiệu, loại, chủ đề, deadline)
`document_attachment`

**Lõi chung**
`workflow_instance` · `workflow_history` · `notification` · `audit_log`

**Đo lường AI**
`ai_prediction` (kết quả AI đề xuất)
`ai_feedback` (người sửa gì, sửa trường nào)

### 7.2. Hai quyết định thiết kế quan trọng

**`workflow_instance` phải polymorphic.** Cần `entity_type` + `entity_id` để dùng chung được cho cả locker, chỗ ngồi, thư và công văn. Nếu chỉ nối với `document` thì engine không còn là generic.

**Tách `resource` chung và bảng chi tiết riêng.** Chỗ ngồi và locker chung phần lớn thuộc tính, nhưng chỗ ngồi có toạ độ không gian còn locker thì không. Không nên nhồi tất cả vào một bảng, cũng không nên tách hoàn toàn.

---

## 8. Công nghệ dự kiến

> ⚠️ Toàn bộ mục này **chưa chốt**. Nhiều lựa chọn phụ thuộc vào quy mô tải thực tế mà hiện chưa có số liệu (xem [mục 12](#12-vấn-đề-chưa-chốt)).

| Lớp | Dự kiến | Ghi chú |
|---|---|---|
| Backend | Python + FastAPI | 🚧 |
| Database | PostgreSQL | 🚧 |
| Frontend | ❓ | Chưa chọn |
| Lưu trữ file | Filesystem + backup | Đủ cho pilot; bọc sẵn lớp abstraction để đổi sang S3/MinIO sau |
| Scheduler | APScheduler | Đủ nếu tải chỉ vài chục job/ngày |
| Queue | ⏭ | Chỉ thêm khi có bằng chứng cần |
| OCR | ❓ | Quyết định bằng spike, không chốt trước |
| LLM | ❓ | Phụ thuộc chính sách dữ liệu — xem mục 12 |
| Agent framework | ⏭ | Luồng hiện tại là pipeline tuyến tính, chưa cần |
| Vector DB | ⏭ | Pilot không có nghiệp vụ nào cần |

**Nguyên tắc chọn:** mỗi thành phần thêm vào đều tốn ngày setup và debug. Trong 6 tuần, thời gian đó lấy từ đúng phần quan trọng nhất là vận hành thật. Chỉ thêm khi có lý do cụ thể, không thêm theo thói quen.

---

## 9. Cấu trúc mã nguồn

```text
backend/
├── app/
│   ├── api/                    # REST endpoints
│   ├── core/                   # config, auth, db session
│   ├── shared/                 # employee, department, location
│   ├── modules/
│   │   ├── resource_allocation/    # Đề 1 + Đề 2
│   │   └── document_flow/          # Đề 3 + Đề 4
│   ├── ai/
│   │   ├── ocr/
│   │   ├── extraction/
│   │   └── validation/         # kiểm tra quy tắc
│   ├── workflow/               # state machine engine
│   ├── notification/
│   └── scheduler/
└── tests/

frontend/                       # ❓ chưa chọn công nghệ

docs/
├── architecture/
├── decisions/                  # ADR
└── kpi/                        # baseline + ground truth
```

---

## 10. Lộ trình pilot

### Nguyên tắc

Pilot có **6 tuần**, không phải 6 tuần để build. Mục tiêu là đánh giá hiệu quả thực tế — mà muốn có số liệu thì hệ thống phải *chạy thật* một thời gian đủ dài.

```
Tuần 0     │ Chuẩn bị (làm ngay, trước khi code)
Tuần 1–3.5 │ Build
Tuần 3.5–5.5 │ Vận hành thật, song song quy trình cũ
Tuần 5.5–6 │ Tổng kết, báo cáo
```

### Tuần 0 — Chuẩn bị (bắt buộc xong trước khi code)

- [ ] Chốt danh sách nhân sự chuẩn, mã nhân viên duy nhất.
- [ ] Xin mẫu dữ liệu thật: ảnh scan công văn, log email vận đơn, danh sách locker, sơ đồ mặt bằng.
- [ ] **Đo baseline thủ công**: bấm giờ quy trình hiện tại cho từng nghiệp vụ.
- [ ] **Bắt đầu gom ground truth**: ~150–200 công văn scan đã gán nhãn tay 7 trường metadata.
- [ ] Chốt team, vai trò, ai chịu trách nhiệm phân hệ nào.
- [ ] Spike OCR 2 ngày.

### Tuần 1 — Lõi chung

Dữ liệu nền, phân quyền, workflow engine, notification, khung báo cáo và log KPI.
Chỉ 1–2 người làm; những người còn lại tiếp tục chuẩn bị dữ liệu và làm rõ nghiệp vụ.

### Tuần 2–3 — Đề 2 và Đề 3

Locker và chuyển phát. Đơn giản nhất nhưng chạy qua toàn bộ lõi chung — đây là bài kiểm tra xem lõi có đúng không, đồng thời cho kết quả sớm để lấy niềm tin.

### Tuần 3–5 — Đề 4

Công văn đến. Bắt đầu song song từ tuần 3 với pipeline OCR + trích xuất, tái dùng workflow engine đã chạy ổn ở Đề 3.

### Song song — Đề 1

Làm như một prototype riêng, chỉ chia sẻ dữ liệu nhân sự và sơ đồ chỗ ngồi. Phạm vi giới hạn ở Phase 1 (xem [4.1](#41-đề-1--quy-hoạch-văn-phòng)).

### Tuần 3.5–5.5 — Vận hành thật

Chạy song song quy trình cũ. Giai đoạn này vừa là lưới an toàn, vừa là cách tự nhiên nhất để thu thêm ground truth và số liệu so sánh.

### Tuần 5.5–6 — Tổng kết

Đối chiếu KPI với baseline, đề xuất giữ/dừng từng phân hệ.

---

## 11. KPI và cách đo

### Nguyên tắc đo

Mọi KPI trong đề bài đều là **so sánh** ("giảm bao nhiêu", "nhanh hơn bao nhiêu"). Không có baseline thì không chứng minh được gì. Vì vậy:

1. Baseline thủ công phải đo ở Tuần 0, trước khi hệ thống chạy.
2. Hệ thống phải ghi log **mỗi lần người dùng sửa kết quả AI đề xuất** — đó chính là mẫu số để tính độ chính xác và tỷ lệ tự động hóa.
3. Thiết kế log này phải có từ Tuần 1. Nếu để đến cuối mới nghĩ tới thì không có số để báo cáo.

### Bảng KPI

| Đề | KPI | Cách đo |
|---|---|---|
| 1 | Thời gian lập phương án | So thời gian từ lúc nhận yêu cầu tới lúc chốt sơ đồ, trước/sau |
| 1 | Độ chính xác phương án | Tỷ lệ gợi ý chỗ ngồi được chấp nhận không sửa |
| 2 | Thời gian tra cứu/cập nhật | Bấm giờ thao tác mẫu, trước/sau |
| 2 | Số thao tác thủ công | Đếm số bước trong quy trình, trước/sau |
| 3 | Tỷ lệ thông báo tự động | Số thư được thông báo tự động / tổng số thư |
| 3 | Tỷ lệ thư chưa nhận | Số thư quá SLA chưa xác nhận / tổng số thư |
| 4 | Độ chính xác nhận diện | Đối chiếu kết quả AI với ground truth, tính theo **từng trường** |
| 4 | Tỷ lệ tự động hóa | Số công văn người duyệt không sửa gì / tổng số |
| 4 | Tỷ lệ bỏ sót deadline | Số công văn quá hạn không được nhắc / tổng số |

---

## 12. Vấn đề chưa chốt

Đây là phần quan trọng nhất của tài liệu ở giai đoạn này. Mỗi mục cần một người trả lời trước khi bắt đầu build.

### Nhóm A — Chặn tiến độ (phải trả lời trong Tuần 0)

| # | Câu hỏi | Ảnh hưởng nếu không trả lời |
|---|---|---|
| A1 | **Team có bao nhiêu người, ai làm gì?** 4 đầu mối trong đề bài là người nghiệp vụ, không phải dev. | Toàn bộ lộ trình là phỏng đoán |
| A2 | **Quy mô thực tế**: bao nhiêu nhân sự, công văn/ngày, locker, thư/tuần? | Mọi lựa chọn hạ tầng đều không có căn cứ |
| A3 | **Dữ liệu công văn có được gửi ra dịch vụ AI bên ngoài không?** Có phân loại độ mật không? Có cần che thông tin nhạy cảm trước khi gửi không? | Không trả lời được thì không chọn được LLM, và có rủi ro pháp lý/nội bộ |
| A4 | **Danh sách nhân sự chuẩn đã có chưa?** Mã nhân viên có duy nhất không? | Cả 4 phân hệ gãy ở cùng một chỗ |
| A5 | **Có mẫu dữ liệu thật chưa?** Scan công văn, log vận đơn, danh sách locker, sơ đồ mặt bằng. | Không spike được, không đo được |

### Nhóm B — Ảnh hưởng phạm vi

| # | Câu hỏi |
|---|---|
| B1 | **Công văn đi** có nằm trong phạm vi pilot không? Đề bài ghi "đến/đi" nhưng thiết kế hiện chỉ có luồng đến. |
| B2 | Nguồn dữ liệu vận đơn của Đề 3: API hãng vận chuyển, email, hay nhập tay? |
| B3 | Kênh thông báo: email, Teams, hay Zalo OA? |
| B4 | Hệ thống HR hiện tại là gì, có API không, đồng bộ tần suất nào? |
| B5 | Dữ liệu locker và chỗ ngồi hiện đang nằm ở đâu (Excel, giấy)? Migration ra sao? |
| B6 | Email server là Exchange hay Google? |

### Nhóm C — Thiết kế cần làm rõ

| # | Câu hỏi |
|---|---|
| C1 | **Phân quyền công văn** cần theo phòng ban và độ mật, tức là row-level chứ không chỉ role-level. Mô hình cụ thể ra sao? |
| C2 | Ngưỡng tin cậy để AI tự đề xuất vs bắt nhập tay — hiệu chỉnh từ ground truth ở tuần nào? |
| C3 | Công nghệ frontend. |
| C4 | Quy ước màu và ký hiệu trên sơ đồ chỗ ngồi (Đề 1). |
| C5 | Chính sách lưu trữ và xoá file scan công văn. |
| C6 | Kế hoạch UAT: ai test, test cái gì, tiêu chí nghiệm thu. |

---

## 13. Quy ước làm việc

### Tài liệu

- Mọi quyết định kiến trúc có ảnh hưởng lâu dài đều ghi thành ADR trong `docs/decisions/`.
- README này là tài liệu sống. Khi một mục trong [phần 12](#12-vấn-đề-chưa-chốt) được trả lời, chuyển nội dung lên phần tương ứng và xoá khỏi danh sách chưa chốt.
- Không đánh dấu tài liệu là "ready for implementation" khi còn câu hỏi nhóm A.

### Mã nguồn

- Domain-first: nghiệp vụ không phụ thuộc vào framework.
- Repository pattern cho truy cập dữ liệu, service layer cho logic nghiệp vụ.
- Các phân hệ giao tiếp qua sự kiện, không gọi trực tiếp lẫn nhau.
- DTO tách riêng khỏi model ở lớp API.
- Mỗi phân hệ phải chạy/tắt được độc lập.

---

## Liên hệ

| Vai trò | Người phụ trách |
|---|---|
| Đề 1 — Quy hoạch VP | Nguyễn Thị Thu Hương |
| Đề 2 — Quản lý tủ locker | Lưu Hải Nam |
| Đề 3 — Chuyển phát nhanh | Phạm Thị Duyên |
| Đề 4 — Công văn đến/đi | Vũ Phương Thảo |
| Kiến trúc / Dev lead | ❓ |

---

*Tài liệu ở trạng thái Draft. Các mục đánh dấu ❓ cần được quyết định trước khi bắt đầu implement.*
