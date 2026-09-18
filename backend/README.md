# Backend — SupportiveAI

Lõi chung (Tuần 1). Bốn phân hệ nghiệp vụ chưa viết.

## Chạy

```bash
cd backend
python -m venv .venv
.venv/Scripts/python -m pip install -e ".[dev]"    # Linux/macOS: .venv/bin/python

cp .env.example .env                                # rồi sửa SECRET_KEY
docker compose -f ../docker-compose.yml up -d       # Postgres
.venv/Scripts/python -m alembic upgrade head
.venv/Scripts/python -m uvicorn app.main:app --reload
```

`http://localhost:8000/docs` — API. `http://localhost:8000/health` — trạng thái và danh sách module đang bật.

## Test

```bash
.venv/Scripts/python -m pytest
```

Test chạy trên SQLite in-memory, không cần Postgres. Migration được kiểm riêng:

```bash
.venv/Scripts/python -m alembic upgrade head --sql    # render DDL, không cần DB sống
```

## Bật/tắt từng đề bài

```bash
# .env
ENABLED_MODULES=mail            # chỉ chạy Đề 3
```

Module không có trong danh sách thì router không nạp, `register()` không chạy. Xem `app/modules/registry.py`.

## Cấu trúc

Theo [`../docs/architecture/repository-structure.md`](../docs/architecture/repository-structure.md). Bốn chỗ hay nhầm:

| Thư mục | Chứa gì | Có logic nghiệp vụ |
|---|---|---|
| `app/core/` | config, DB session, JWT, RBAC primitives, exception | **Không** — thuần kỹ thuật |
| `app/shared/` | nhân sự, phòng ban, vị trí | Có, nhưng là dữ liệu nền mọi module dùng |
| `app/platform/` | workflow, notification, events, audit, scheduler, storage | Có, nhưng không gắn nghiệp vụ cụ thể |
| `app/modules/` | 4 đề bài | Toàn bộ nghiệp vụ nằm ở đây |

Chiều import được phép và cách ép bằng test: `tests/test_architecture.py`.

## Những chỗ còn để ngỏ

Đọc trước khi viết tiếp — đều có ghi chú `⚠️` tại chỗ trong mã nguồn:

| Chỗ | Vấn đề | Chờ ai |
|---|---|---|
| `core/config.py`, `platform/workflow/calendar.py` | Giờ làm việc T2–T6 08:00–17:00 là **tạm đặt**; chưa có nguồn dữ liệu ngày lễ | Phòng HC |
| `core/permissions.py` | Danh sách vai trò còn lệch giữa hai tài liệu; registry đang để rỗng | Cần chốt |
| `core/permissions.py` | Phân quyền theo dòng (README C1) chưa thiết kế | Cần chốt |
| `core/security.py` | Link xác nhận mới có hạn, chưa có phần "dùng một lần" | Cần chốt chỗ đặt |
| `platform/notification/channels.py` | Kênh thật chưa chốt; đang dùng `OutboxChannel` chỉ ghi lại, không gửi | README B2, B5 |
