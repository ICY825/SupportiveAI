"""Phần chung của hai bài toán cấp phát: chỗ ngồi (Đề 1) và tủ locker (Đề 2).

Issue #2 mục 6, cả hai bên cùng bỏ phiếu **tách bảng**: ghế sinh lại được từ
bản vẽ và không có trạng thái riêng, còn tủ locker là vật thể thật có trạng
thái riêng (hỏng, mất chìa, bảo trì). Gộp vào một bảng `resource` thì quá nửa
số cột luôn NULL cho một trong hai bên.

Nhưng hai bảng vẫn chung **hình dạng** và chung **quy tắc kỳ hạn**, nên chỗ
này giữ đúng hai thứ đó — dạng hàm thuần, không phải lớp cha, không phải bảng:

- cột: `<tài nguyên>`, `employee_id`, `assigned_at`, `released_at`;
- ngữ nghĩa: `released_at IS NULL` nghĩa là **đang hiệu lực**;
- quy tắc: không được có hai kỳ hạn hiệu lực chồng nhau trên cùng tài nguyên,
  cũng như trên cùng một người.

Sau này muốn nhìn hai loại như một thì đó là câu `UNION`, không phải migration.
"""

from __future__ import annotations

from datetime import datetime

from app.core.exceptions import ConflictError


def overlaps(
    *,
    assigned_at: datetime,
    released_at: datetime | None,
    other_assigned_at: datetime,
    other_released_at: datetime | None,
) -> bool:
    """Hai kỳ hạn có giao nhau không.

    Kỳ hạn là nửa khoảng `[assigned_at, released_at)`: thu hồi lúc 9:00 rồi
    cấp lại cho người khác đúng 9:00 là hợp lệ, không phải chồng lấn.
    `released_at = None` nghĩa là còn mở, tức kéo dài vô hạn về phía trước.
    """
    starts_after_other_ends = other_released_at is not None and assigned_at >= other_released_at
    ends_before_other_starts = released_at is not None and released_at <= other_assigned_at
    return not (starts_after_other_ends or ends_before_other_starts)


def ensure_resource_free(*, resource_label: str, holder_name: str | None) -> None:
    """Chặn khi tài nguyên đang có người giữ.

    `holder_name` là người đang giữ, hoặc None nếu đang trống.
    """
    if holder_name is None:
        return
    raise ConflictError(f"{resource_label} đang được cấp cho {holder_name}")


def ensure_employee_free(*, employee_name: str, current_resource: str | None) -> None:
    """Chặn khi người đó đang giữ một tài nguyên khác cùng loại.

    Một người một chỗ ngồi, một người một tủ. Muốn đổi thì thu hồi cái cũ
    trước — làm vậy để lịch sử còn đọc được, thay vì im lặng dời chỗ.
    """
    if current_resource is None:
        return
    raise ConflictError(f"{employee_name} đang được cấp {current_resource}")
