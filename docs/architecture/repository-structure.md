# Repository Structure — SupportiveAI

> Cấu trúc mã nguồn và nguyên tắc phân chia module

**Trạng thái:** `Draft` — backend, frontend và ranh giới giữa 4 phân hệ đã chốt (ADR 0002)
**Phiên bản:** 0.2
**Cập nhật:** 18/09/2026

---

## Mục lục

- [1. Nguyên tắc](#1-nguyên-tắc)
- [2. Cấu trúc tổng thể](#2-cấu-trúc-tổng-thể)
- [3. Backend](#3-backend)
- [4. Bên trong một module](#4-bên-trong-một-module)
- [5. Quy tắc phụ thuộc](#5-quy-tắc-phụ-thuộc)
- [6. Giao tiếp giữa các module](#6-giao-tiếp-giữa-các-module)
- [7. Bật/tắt module](#7-bậttắt-module)
- [8. Database migration](#8-database-migration)
- [9. Frontend](#9-frontend)
- [10. Tài liệu](#10-tài-liệu)
- [11. Kiểm thử](#11-kiểm-thử)
- [12. Những lỗi cần tránh](#12-những-lỗi-cần-tránh)

---

## 1. Nguyên tắc

### 1.1. Monorepo

Backend, frontend và tài liệu nằm chung một repo. Team nhỏ, 6 tuần, API thay đổi liên tục — tách repo chỉ tạo thêm chi phí đồng bộ.

### 1.2. Chia dọc theo nghiệp vụ, không chia ngang theo tầng kỹ thuật

Đây là quyết định quan trọng nhất.

**Cách thường gặp (chia ngang):**

```
models/      seat.py, locker.py, mail.py, document.py
services/    seat.py, locker.py, mail.py, document.py
routers/     seat.py, locker.py, mail.py, document.py
```

Một nghiệp vụ nằm rải ở 4 thư mục. Muốn biết "đề 3 gồm những gì" phải đi tìm khắp nơi. Muốn bỏ đề 3 phải xóa ở 4 chỗ.

**Cách chọn (chia dọc):**

```
modules/document_flow/mail/    router, models, service, schemas... đủ cả
```

Mỗi nghiệp vụ là một thư mục hoàn chỉnh. Điều này phục vụ trực tiếp mục tiêu pilot: **phải giữ/dừng được từng đề bài độc lập** để đánh giá.

### 1.3. Cấu trúc thư mục phản ánh 4 đề bài

Một người mới vào repo phải nhìn cây thư mục là thấy ngay 4 đề bài ở đâu. Nếu không thấy thì cấu trúc sai.

---

## 2. Cấu trúc tổng thể

```text
supportive-ai/
├── backend/
├── frontend/
├── docs/
├── scripts/
├── docker-compose.yml          # postgres cho môi trường dev
├── .env.example
└── README.md
```

---

## 3. Backend

```text
backend/
├── app/
│   ├── main.py                 # khởi tạo FastAPI, đăng ký router
│   │
│   ├── core/                   # TẦNG KỸ THUẬT — không chứa logic nghiệp vụ
│   │   ├── config.py           # đọc biến môi trường
│   │   ├── database.py         # session, base model
│   │   ├── security.py         # auth, JWT, hash
│   │   ├── permissions.py      # RBAC primitives
│   │   └── exceptions.py
│   │
│   ├── shared/                 # DỮ LIỆU NỀN — cả 4 đề bài đều dùng
│   │   ├── employee/
│   │   ├── department/
│   │   └── location/
│   │
│   ├── platform/               # DỊCH VỤ DÙNG CHUNG
│   │   ├── workflow/           # state machine engine, SLA
│   │   ├── notification/       # gửi thông báo, gộp theo người
│   │   ├── events/             # event dispatcher
│   │   ├── audit/              # audit log
│   │   ├── scheduler/          # job định kỳ, nhắc hạn
│   │   └── storage/            # lưu file, bọc sẵn để đổi sang S3 sau
│   │
│   ├── modules/                # NGHIỆP VỤ — 4 đề bài nằm ở đây
│   │   ├── registry.py         # đăng ký và bật/tắt module
│   │   │
│   │   ├── resource_allocation/
│   │   │   ├── common/         # resource, resource_assignment (bảng chung)
│   │   │   ├── seat/           # ← Đề 1
│   │   │   └── locker/         # ← Đề 2
│   │   │
│   │   └── document_flow/
│   │       ├── common/         # phần chung của hai luồng đến/đi
│   │       ├── mail/           # ← Đề 3
│   │       └── document/       # ← Đề 4
│   │
│   └── ai/                     # LỚP AI — độc lập với nghiệp vụ
│       ├── ocr/                # bọc engine OCR, thay được
│       ├── extraction/         # trích xuất trường từ văn bản
│       ├── validation/         # kiểm tra bằng quy tắc
│       └── feedback/           # ghi lại người sửa gì (dữ liệu đo KPI)
│
├── migrations/                 # alembic
├── tests/
├── pyproject.toml
└── .env.example
```

### 3.1. Vì sao tách `core`, `shared`, `platform`

Ba thứ này hay bị gộp làm một thành `common/` hoặc `utils/`, rồi biến thành bãi rác.

| Thư mục | Chứa gì | Có logic nghiệp vụ không |
|---|---|---|
| `core/` | Kết nối DB, auth, config, exception | **Không** — thuần kỹ thuật |
| `shared/` | Nhân sự, phòng ban, vị trí | Có, nhưng là dữ liệu nền mọi module dùng |
| `platform/` | Workflow, notification, audit, scheduler | Có, nhưng là dịch vụ tổng quát không gắn nghiệp vụ cụ thể |

Phép thử: **nếu bỏ hết 4 đề bài đi mà đoạn code vẫn có nghĩa thì nó thuộc `core` hoặc `platform`; nếu không thì nó thuộc `modules`.**

### 3.2. Vì sao `ai/` tách riêng

- Thay được nhà cung cấp mà không đụng nghiệp vụ. Pilot chưa chốt OCR và LLM nào, nên lớp bọc này là bắt buộc.
- Đề 3 không dùng `ai/` chút nào — chứng minh việc tách là đúng.
- `ai/feedback/` là chỗ ghi lại mỗi lần người dùng sửa kết quả AI. Đây là **mẫu số duy nhất để tính độ chính xác và tỷ lệ tự động hóa**, phải có từ Tuần 1.

---

## 4. Bên trong một module

Ví dụ `modules/document_flow/mail/` (Đề 3):

```text
mail/
├── __init__.py
├── router.py           # API endpoints
├── models.py           # bảng mail_batch, mail_item
├── schemas.py          # DTO vào/ra, tách khỏi models
├── service.py          # logic nghiệp vụ
├── repository.py       # truy vấn DB
├── importer.py         # đọc file danh sách từ lễ tân
├── matcher.py          # quy tắc khớp người nhận
├── workflow.py         # khai báo state machine + SLA
├── events.py           # sự kiện module này phát ra
└── tests/
```

Module nhỏ thì bớt file, module lớn thì tách thêm. Không ép mọi module phải có đủ 10 file.

### 4.1. Mỗi module tự khai báo workflow của mình

```python
# modules/document_flow/mail/workflow.py

MAIL_WORKFLOW = WorkflowDefinition(
    entity_type="mail_item",
    states=["pending_match", "notified", "collected", "abandoned"],
    transitions=[...],
    sla=[
        SLA(state="notified", after_hours=24, action="remind"),
        SLA(state="notified", after_hours=48, action="remind_with_manager"),
        SLA(state="notified", after_days=7, action="mark_abandoned"),
    ],
)
```

Engine nằm ở `platform/workflow/`, **cấu hình nằm ở module**. Đây là cách giữ cho engine thực sự generic — nếu engine phải biết "mail_item có trạng thái gì" thì nó đã hỏng.

---

## 5. Quy tắc phụ thuộc

Chiều import được phép:

```
modules  →  platform  →  core
modules  →  shared    →  core
modules  →  ai        →  core

modules  ✗  modules      (KHÔNG BAO GIỜ)
platform ✗  modules
shared   ✗  modules
core     ✗  mọi thứ khác
```

### 5.1. Vì sao cấm module import lẫn nhau

Đây là ranh giới duy nhất giữ cho modular monolith không biến thành mớ rối. Cho phép một lần "chỉ import tạm thôi" là đến tuần 4 sẽ không gỡ ra được, và mục tiêu "giữ/dừng từng đề bài độc lập" mất luôn.

### 5.2. Ép bằng test, không bằng lời nhắc

Thêm một test đơn giản quét import, chạy trong CI:

```python
# tests/test_architecture.py
def test_modules_do_not_import_each_other():
    """seat không được import locker, mail không được import document..."""
```

Tốn nửa ngày, nhưng là thứ giữ cho kiến trúc còn đúng ở tuần 6. Có thể dùng `import-linter` nếu muốn nhanh hơn.

---

## 6. Giao tiếp giữa các module

Qua **sự kiện**, không gọi trực tiếp.

```python
# modules/document_flow/mail/service.py
events.publish(MailReceived(item_id=..., employee_id=...))
```

`platform/notification/` lắng nghe và gửi thông báo. `platform/audit/` lắng nghe và ghi log. Module phát sự kiện không cần biết ai nghe.

**Sự kiện hiện có:**

| Sự kiện | Module phát |
|---|---|
| `MAIL_RECEIVED` | mail |
| `MAIL_OVERDUE` | mail |
| `DOCUMENT_RECEIVED` | document |
| `DOCUMENT_OVERDUE` | document |
| `LOCKER_ASSIGNED` | locker |
| `LOCKER_RETURN_DUE` | locker |
| `SEAT_CHANGED` | seat |
| `EMPLOYEE_DEACTIVATED` | shared/employee |

> `EMPLOYEE_DEACTIVATED` là ví dụ tốt cho cơ chế này: khi nhân sự nghỉ việc, cả locker và seat đều cần phản ứng (thu hồi tủ, giải phóng chỗ ngồi). Không có event thì `shared/employee` phải biết về hai module — sai chiều phụ thuộc.

Trong pilot, dispatcher chạy **đồng bộ trong process**, không cần message queue. Interface giữ nguyên nên sau này đổi sang bất đồng bộ không phải sửa module.

---

## 7. Bật/tắt module

Mục tiêu pilot là đánh giá từng giải pháp, nên phải tắt được một module mà không ảnh hưởng phần còn lại.

```python
# app/modules/registry.py
ENABLED_MODULES = settings.enabled_modules   # từ biến môi trường
```

```bash
# .env
ENABLED_MODULES=seat,locker,mail,document
```

Mỗi module expose một `router` và một hàm `register()`. `main.py` chỉ nạp module có trong danh sách.

Lợi ích thực tế:

- Demo riêng từng đề bài cho từng đầu mối nghiệp vụ.
- Một module lỗi không kéo sập cả hệ thống đang chạy pilot.
- Cuối pilot, quyết định dừng một đề bài chỉ là sửa một biến môi trường, không phải refactor.

---

## 8. Database migration

Một database dùng chung, **một thư mục `migrations/` duy nhất** (alembic không hỗ trợ tốt việc chia nhiều nhánh migration trên cùng một DB).

Quy ước đặt tên file để biết migration thuộc module nào:

```text
migrations/versions/
├── 0001_core_employee_department.py
├── 0002_platform_workflow_audit.py
├── 0003_resource_common_tables.py
├── 0004_locker_tables.py
├── 0005_mail_tables.py
└── 0006_document_tables.py
```

Quy ước đặt tên bảng: `mail_item`, `mail_batch`, `locker`, `seat`, `document`, `resource_assignment`. Tiền tố theo module giúp nhìn danh sách bảng là biết thuộc đề nào.

---

## 9. Frontend

> ✅ **Chốt: React 19 + TypeScript + Vite**, một ứng dụng duy nhất cho cả bốn phân hệ
> ([ADR 0001](../decisions/0001-floor-planning-web-stack-and-floor-data.md) 15/09/2026,
> [ADR 0002](../decisions/0002-shared-core-and-module-boundaries.md) 18/09/2026).
>
> Màn hình Đề 3 từng dựng trên Next.js 14 App Router ngày 17/09 và đã chuyển sang Vite.

```text
frontend/
├── index.html              # Vite nạp từ đây; thẻ <link> tải font Inter
├── vite.config.ts          # alias `@` và `@data`, proxy /api, cấu hình vitest
├── src/
│   ├── main.tsx
│   ├── app/                # vỏ ứng dụng
│   │   ├── App.tsx         # HashRouter + bảng route
│   │   ├── AppNav.tsx      # thanh điều hướng 4 phân hệ
│   │   ├── RequireSession.tsx
│   │   └── LoginPage.tsx
│   ├── api/                # client gọi backend + DTO chép từ schemas.py
│   ├── components/         # ui.tsx, EmployeePicker dùng chung
│   ├── features/           # ← chia dọc giống backend
│   │   ├── floor-planning/ # Đề 1
│   │   ├── lockers/        # Đề 2
│   │   ├── mail/           # Đề 3
│   │   └── document/       # Đề 4 (chưa có)
│   ├── shared/             # auth, format, nhãn tiếng Việt
│   └── styles/             # token và nền chung
└── package.json
```

Nguyên tắc giống backend: **`features/` phản ánh đúng 4 đề bài**, và các feature không import lẫn
nhau. Thứ gì hai feature cùng dùng thì đẩy lên `shared/` hoặc `components/`.

### 9.1. Định tuyến bằng hash

`HashRouter`, không phải `BrowserRouter`. Sơ đồ mặt bằng đã phát hành deep link dạng
`#/floor-planning?floor=…&view=…&select=…`, và thanh điều hướng đã dùng `href="#/…"` — hash router
giữ nguyên tất cả. Máy chủ vì thế chỉ thấy đúng một đường dẫn `/`, nên phục vụ bản build không cần
luật rewrite nào cho SPA.

Phần query của sơ đồ nằm **trong cùng cái hash** mà router đọc. Hai thứ sống chung được, và ai sửa
router phải giữ cho điều đó còn đúng — có test trong `app/__tests__/routing.test.tsx`.

### 9.2. Chắn đăng nhập

Mọi route nằm trong `RequireSession`, **trừ hai**:

| Route | Vì sao ngoài chắn |
|---|---|
| `/station` | Trang quét QR tại khu để đơn. Phần lớn CBNV không có tài khoản mà vẫn phải xác nhận ngay tại chỗ (mail-tracking.md §7.2). |
| `/login` | Không thể bắt đăng nhập để vào trang đăng nhập. |

Bọc sai thì hỏng theo hai chiều ngược nhau, và cả hai đều **không lộ ra khi bấm thử lúc đang đăng
nhập**. Vì vậy cả hai ca đều có test riêng.

Chắn này chỉ để đỡ hiện màn hình trống. Chốt chặn thật ở backend: mọi endpoint tự kiểm quyền.

### 9.3. Ranh giới với backend

`src/api/*.ts` chép tay DTO từ `schemas.py`, chưa sinh tự động từ OpenAPI. Sửa một bên thì phải sửa
bên kia. Chấp nhận được lúc này, nhưng đến phân hệ thứ ba thì nên sinh tự động.

**Không bật CORS ở backend.** Lúc phát triển, `server.proxy` trong `vite.config.ts` đẩy `/api/*`
sang FastAPI. Lúc chạy thật, đặt `FRONTEND_DIST` để backend phục vụ luôn `dist/`. Cả hai cách đều
cho trình duyệt chỉ thấy một origin.

### 9.4. Dataset mặt bằng

Dataset **không** nằm trong `src/`. Nó ở `data/floors/` tại gốc repo, vì backend đọc cùng file đó để
biết mã chỗ ngồi nào có thật ([ADR 0002](../decisions/0002-shared-core-and-module-boundaries.md) §5).
Frontend đọc qua alias `@data`, khai ở `vite.config.ts` và `tsconfig.app.json`. Xem `data/README.md`.

---

## 10. Tài liệu

```text
docs/
├── architecture/
│   ├── overview.md
│   ├── repository-structure.md      # tài liệu này
│   ├── workflow-engine.md
│   ├── seat-planning.md             # Đề 1
│   ├── locker.md                    # Đề 2
│   ├── mail-tracking.md             # Đề 3 ✅ đã có
│   └── document-flow.md             # Đề 4
│
├── decisions/                       # ADR
│   ├── 0001-floor-planning-web-stack-and-floor-data.md
│   ├── 0002-shared-core-and-module-boundaries.md
│   └── ...
│
└── kpi/
    ├── baseline.md                  # đo ở Tuần 0
    └── ground-truth/                # ~150–200 công văn gán nhãn tay
```

**Phân công nội dung:**

- README ở gốc trả lời *"hệ thống này là gì, làm được gì"*.
- `docs/architecture/<module>.md` trả lời *"làm thế nào"*.
- `docs/decisions/` ghi lại *"vì sao chọn vậy"* — quan trọng khi 3 tháng sau có người hỏi lại.

Không nhồi chi tiết thiết kế vào README. Chi tiết càng nhiều thì càng nhanh lạc hậu, và README lỗi thời thì không ai còn tin.

---

## 11. Kiểm thử

```text
backend/
├── app/modules/document_flow/mail/tests/    # unit test nằm cạnh code
└── tests/
    ├── integration/                         # test xuyên module
    ├── fixtures/                            # dữ liệu mẫu
    └── test_architecture.py                 # kiểm tra quy tắc phụ thuộc
```

Unit test đặt cạnh module để khi xóa module thì test đi theo luôn.

**Ưu tiên trong 6 tuần** — không đủ thời gian phủ hết, nên tập trung vào chỗ sai thì đau:

1. Quy tắc khớp người nhận (`matcher.py`) — sai là gửi nhầm người.
2. Tính SLA theo giờ làm việc — dễ sai và khó phát hiện.
3. Khử trùng lặp — sai là spam người dùng.
4. Chuyển trạng thái workflow.
5. Quy tắc phụ thuộc giữa module.

---

## 12. Những lỗi cần tránh

| Lỗi | Hậu quả |
|---|---|
| Tạo `utils/` hoặc `helpers/` chung | Thành bãi rác trong 2 tuần. Đặt hàm vào đúng module dùng nó; chỉ đẩy lên `platform/` khi có module thứ hai thực sự cần |
| Module import trực tiếp module khác | Mất khả năng dừng riêng từng đề bài — hỏng mục tiêu pilot |
| Nhét logic nghiệp vụ vào `core/` | `core` phải thuần kỹ thuật; lẫn nghiệp vụ vào là không tách được nữa |
| Workflow engine biết tên trạng thái cụ thể | Engine hết generic, đề bài thứ 5 sẽ phải sửa engine |
| Tổng quát hóa sớm bảng `resource` | Đừng nhồi seat và locker vào một bảng duy nhất. Bảng `resource` chung + bảng chi tiết riêng |
| Để `ai/` gọi thẳng vào model của module | AI chỉ nhận input và trả kết quả; module tự quyết làm gì với kết quả đó |
| Quên `ai/feedback/` từ đầu | Đến tuần 6 không có số liệu để tính KPI độ chính xác |

---

## Thứ tự dựng repo

| Thứ tự | Việc | Thời điểm |
|---|---|---|
| 1 | `core/` + `shared/employee` + auth | Tuần 1, ngày 1–2 |
| 2 | `platform/workflow` + `platform/events` + `platform/notification` | Tuần 1, ngày 3–5 |
| 3 | `modules/document_flow/mail` (Đề 3) | Tuần 2 |
| 4 | `modules/resource_allocation/locker` (Đề 2) | Tuần 2–3 |
| 5 | `ai/` + `modules/document_flow/document` (Đề 4) | Tuần 3–5 |
| 6 | `modules/resource_allocation/seat` (Đề 1) | Song song, prototype riêng |

Đề 3 làm đầu tiên vì nó chạy qua toàn bộ `platform/` mà không có rủi ro AI — là phép thử tốt nhất cho lõi chung trước khi bước vào phần khó.

---

*Tài liệu ở trạng thái Draft. Phần frontend đã cập nhật theo bản dựng thật của Đề 3 (17/09/2026).*
