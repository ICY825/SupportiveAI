"""Nghiệp vụ gán chỗ ngồi.

Bốn quy tắc, tất cả đều thi hành ở đây chứ không ở router:

1. **Chỗ ngồi phải có thật trong bản vẽ.** Issue #2 mục 3. Mã lạ là lỗi, không
   phải lệnh tạo mới — xem `common/floor_catalog.py`.
2. **Một chỗ một người, một người một chỗ.** Muốn đổi thì thu hồi trước, để
   lịch sử còn đọc được.
3. **Mọi thay đổi đều ghi audit** với `entity_type='seat_assignment'` và
   `action` là accept / override / manual (Issue #2 mục 5). Đây là mẫu số của
   KPI "tỷ lệ gợi ý được chấp nhận không sửa" ở Tuần 6.
4. **Nhân sự phải đang hoạt động.** Người đã nghỉ thì không cấp chỗ mới.
"""

from __future__ import annotations

from collections.abc import Sequence

from sqlalchemy.orm import Session

from app.core.database import utcnow
from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.resource_allocation.common.assignment import (
    ensure_employee_free,
    ensure_resource_free,
)
from app.modules.resource_allocation.common.floor_catalog import load_catalog
from app.modules.resource_allocation.seat.models import SeatAssignment, SeatDecision
from app.modules.resource_allocation.seat.repository import SeatRepository
from app.modules.resource_allocation.seat.schemas import (
    FloorOccupancy,
    ReconcileReport,
    StaleAssignment,
)
from app.platform.audit import AuditService

ENTITY_TYPE = "seat_assignment"


class SeatService:
    def __init__(self, db: Session) -> None:
        self.db = db
        self.repo = SeatRepository(db)
        self.audit = AuditService(db)

    # ------------------------------------------------------------------
    # Đọc
    # ------------------------------------------------------------------

    def list_active(self, floor_id: str) -> Sequence[SeatAssignment]:
        load_catalog(floor_id)  # tầng không có dataset thì báo ngay, khỏi trả rỗng
        return self.repo.list_active(floor_id)

    def occupancy(self, floor_id: str) -> FloorOccupancy:
        catalog = load_catalog(floor_id)
        occupied = len(self.repo.list_active(floor_id))
        seats = len(catalog.workstation_ids)
        return FloorOccupancy(
            floor_id=floor_id,
            layout_version=catalog.layout_version,
            seats=seats,
            occupied=occupied,
            free=seats - occupied,
        )

    def history(self, floor_id: str, workstation_id: str) -> Sequence[SeatAssignment]:
        self._require_seat(floor_id, workstation_id)
        return self.repo.history_of_seat(floor_id, workstation_id)

    # ------------------------------------------------------------------
    # Ghi
    # ------------------------------------------------------------------

    def assign(
        self,
        *,
        floor_id: str,
        workstation_id: str,
        employee_id: str,
        decision: str = SeatDecision.MANUAL,
        note: str | None = None,
        actor_id: str | None = None,
    ) -> SeatAssignment:
        if decision not in SeatDecision.ALL:
            raise ValidationError(
                f"`decision` phải là một trong {', '.join(SeatDecision.ALL)} — nhận {decision!r}"
            )

        catalog = self._require_seat(floor_id, workstation_id)

        employee = self.repo.employee(employee_id)
        if employee is None:
            raise NotFoundError(f"Không có nhân sự {employee_id!r}")
        if not employee.is_active:
            raise ConflictError(f"{employee.full_name} đã ngừng hoạt động, không cấp chỗ mới")

        occupant = self.repo.active_on_seat(floor_id, workstation_id)
        ensure_resource_free(
            resource_label=f"Chỗ ngồi {workstation_id}",
            holder_name=occupant.employee.full_name if occupant else None,
        )

        elsewhere = self.repo.active_of_employee(employee_id)
        ensure_employee_free(
            employee_name=employee.full_name,
            current_resource=f"chỗ ngồi {elsewhere.workstation_id}" if elsewhere else None,
        )

        assignment = self.repo.add(
            SeatAssignment(
                floor_id=floor_id,
                workstation_id=workstation_id,
                layout_version=catalog.layout_version,
                employee_id=employee_id,
                assigned_at=utcnow(),
                assigned_by=actor_id,
                decision=decision,
                note=note,
            )
        )

        self.audit.record(
            entity_type=ENTITY_TYPE,
            entity_id=assignment.id,
            action=decision,
            actor_id=actor_id,
            to_state="occupied",
            note=note,
            data={
                "floor_id": floor_id,
                "workstation_id": workstation_id,
                "employee_id": employee_id,
                "employee_code": employee.employee_code,
                "layout_version": catalog.layout_version,
            },
        )
        return assignment

    def release(
        self, assignment_id: str, *, note: str | None = None, actor_id: str | None = None
    ) -> SeatAssignment:
        assignment = self.repo.get(assignment_id)
        if assignment is None:
            raise NotFoundError(f"Không có bản ghi gán {assignment_id!r}")
        if not assignment.is_active:
            raise ConflictError("Kỳ hạn này đã thu hồi rồi")

        assignment.released_at = utcnow()
        if note:
            assignment.note = note
        # Ghi xuống ngay: session của ứng dụng để `autoflush=False`, nên nếu
        # không flush thì truy vấn "chỗ này còn trống không" ngay sau đây vẫn
        # thấy kỳ hạn vừa thu hồi — cấp lại chỗ vừa trả sẽ bị chính mình chặn.
        self.db.flush()

        self.audit.record(
            entity_type=ENTITY_TYPE,
            entity_id=assignment.id,
            action="release",
            actor_id=actor_id,
            from_state="occupied",
            to_state="free",
            note=note,
            data={
                "floor_id": assignment.floor_id,
                "workstation_id": assignment.workstation_id,
                "employee_id": assignment.employee_id,
            },
        )
        return assignment

    def move(
        self,
        *,
        assignment_id: str,
        workstation_id: str,
        decision: str = SeatDecision.MANUAL,
        note: str | None = None,
        actor_id: str | None = None,
    ) -> SeatAssignment:
        """Chuyển một người sang chỗ khác: thu hồi rồi cấp lại, hai bản ghi.

        Không sửa `workstation_id` tại chỗ. Sửa tại chỗ thì lịch sử mất một
        đoạn — không ai trả lời được "trước hôm đó người này ngồi đâu".
        """
        current = self.repo.get(assignment_id)
        if current is None:
            raise NotFoundError(f"Không có bản ghi gán {assignment_id!r}")
        if not current.is_active:
            raise ConflictError("Kỳ hạn này đã thu hồi rồi")
        if current.workstation_id == workstation_id:
            raise ValidationError("Chỗ ngồi mới trùng chỗ đang ngồi")

        employee_id = current.employee_id
        floor_id = current.floor_id
        # Thu hồi xong mới gán, để ràng buộc "một người một chỗ" không tự chặn.
        self.release(assignment_id, note=note, actor_id=actor_id)
        return self.assign(
            floor_id=floor_id,
            workstation_id=workstation_id,
            employee_id=employee_id,
            decision=decision,
            note=note,
            actor_id=actor_id,
        )

    # ------------------------------------------------------------------
    # Đối chiếu với dataset
    # ------------------------------------------------------------------

    def reconcile(self, floor_id: str) -> ReconcileReport:
        """So các bản ghi đang hiệu lực với dataset hiện tại.

        Điều kiện @CongDuc02 nêu ở Issue #2 mục 2: `workstation_id` không có
        khóa ngoại, nên chạy lại bộ trích xuất với bản vẽ mới là có thể có bản
        ghi trỏ vào hư không mà **không gì báo**. Hàm này là cái báo đó. Nó
        chỉ đọc và kể, không tự thu hồi của ai — đó là quyết định của người,
        không phải của một job.
        """
        catalog = load_catalog(floor_id)
        active = self.repo.list_active(floor_id)
        stale: list[StaleAssignment] = []

        for assignment in active:
            if not catalog.has(assignment.workstation_id):
                reason = "missing-seat"
            elif assignment.layout_version != catalog.layout_version:
                reason = "old-layout"
            else:
                continue
            stale.append(
                StaleAssignment(
                    assignment_id=assignment.id,
                    floor_id=assignment.floor_id,
                    workstation_id=assignment.workstation_id,
                    employee_code=assignment.employee.employee_code,
                    reason=reason,
                    assigned_layout_version=assignment.layout_version,
                    current_layout_version=catalog.layout_version,
                )
            )

        return ReconcileReport(
            floor_id=floor_id,
            current_layout_version=catalog.layout_version,
            checked=len(active),
            stale=stale,
        )

    # ------------------------------------------------------------------

    def _require_seat(self, floor_id: str, workstation_id: str):
        catalog = load_catalog(floor_id)
        if not catalog.has(workstation_id):
            raise NotFoundError(
                f"Bản vẽ tầng {floor_id} không có chỗ ngồi {workstation_id!r}. "
                "Chỗ ngồi chỉ đến từ bộ trích xuất, hệ thống không tự tạo."
            )
        return catalog
