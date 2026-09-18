"""Danh mục chỗ ngồi có thật, đọc từ dataset mặt bằng.

Issue #2 mục 3: **backend không bao giờ tự tạo chỗ ngồi.** Một mã không có
trong dataset thì coi như không tồn tại, và gán vào đó là lỗi chứ không phải
lệnh tạo mới. Muốn thi hành được điều đó thì backend phải biết danh sách mã
hợp lệ, nên nó đọc thẳng `data/floors/<floor-id>/*.workstations.json` — cùng
một file mà frontend nạp (data/README.md).

Khóa là `id` của workstation (`ws-16-001`), không phải mã hiển thị
(`F16-D-367`). Mã hiển thị suy ra từ thứ tự khu vực, tức là đổi theo cách sắp
xếp chứ không theo hiện trường; chính tài liệu bàn giao chỗ ngồi §8 đã đề
nghị xem lại nó. `id` thì do bộ trích xuất sinh, tất định, và đi kèm hash của
bản vẽ nguồn.

Đọc rồi nhớ trong tiến trình: dataset là file tĩnh, chỉ đổi khi ai đó chạy
lại bộ trích xuất và commit. Đổi rồi thì khởi động lại — rẻ hơn nhiều so với
đọc 3 MB JSON mỗi lần gán một chỗ ngồi.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import cache
from pathlib import Path

from app.core.config import settings
from app.core.exceptions import NotFoundError, ValidationError


@dataclass(frozen=True)
class FloorCatalog:
    """Những gì backend cần biết về một tầng. Không có hình học."""

    floor_id: str
    #: `id` của mọi workstation trong bản vẽ.
    workstation_ids: frozenset[str]
    #: Nhận dạng của bản dataset đang dùng — sha256 của PDF nguồn.
    layout_version: str

    def has(self, workstation_id: str) -> bool:
        return workstation_id in self.workstation_ids


def floor_data_root() -> Path:
    """Thư mục dataset. Mặc định là `data/floors` ở gốc repo."""
    if settings.floor_data_dir:
        return Path(settings.floor_data_dir)
    # backend/app/modules/resource_allocation/seat/catalog.py -> gốc repo
    return Path(__file__).resolve().parents[5] / "data" / "floors"


def _workstations_file(floor_id: str) -> Path:
    directory = floor_data_root() / floor_id
    # Tên file mang số tầng (`floor16.workstations.json`) chứ không phải id
    # thư mục (`floor-16`), nên dò theo hậu tố thay vì ghép chuỗi.
    matches = sorted(directory.glob("*.workstations.json"))
    if not matches:
        raise NotFoundError(f"Chưa có dataset cho tầng {floor_id!r}")
    if len(matches) > 1:
        raise ValidationError(
            f"Tầng {floor_id!r} có {len(matches)} file workstations — dataset hỏng"
        )
    return matches[0]


@cache
def load_catalog(floor_id: str) -> FloorCatalog:
    """Đọc danh mục một tầng. Kết quả nhớ lại cho các lần sau."""
    path = _workstations_file(floor_id)
    payload = json.loads(path.read_text(encoding="utf-8"))

    workstations = payload.get("workstations")
    if not isinstance(workstations, list) or not workstations:
        raise ValidationError(f"{path.name} không có workstation nào")

    ids: set[str] = set()
    for entry in workstations:
        identifier = entry.get("id")
        if not identifier:
            raise ValidationError(f"{path.name} có workstation thiếu `id`")
        ids.add(identifier)

    layout_version = payload.get("sourcePdfSha256")
    if not layout_version:
        raise ValidationError(
            f"{path.name} thiếu `sourcePdfSha256` — không xác định được phiên bản bố trí"
        )

    return FloorCatalog(
        floor_id=floor_id,
        workstation_ids=frozenset(ids),
        layout_version=layout_version,
    )


def reset_cache() -> None:
    """Quên danh mục đã đọc. Dùng trong test, và sau khi chạy lại trích xuất."""
    load_catalog.cache_clear()
