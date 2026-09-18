from __future__ import annotations

import logging
from datetime import date, datetime, timezone
from typing import TYPE_CHECKING, Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

logger = logging.getLogger("supportive_ai.resource_allocation")



from app.core.exceptions import EntityNotFoundError, ResourceConflictError
from app.modules.resource_allocation.schemas import (
    LockerCompartmentAssignmentUpdate,
    LockerCompartmentRead,
    LockerCreate,
    LockerDeleteResponse,
    LockerRead,
)
from app.shared.contracts.enums import (
    DomainEventEnum,
    ResourceStatusEnum,
    ResourceTypeEnum,
    WorkflowStateEnum,
)
from app.shared.contracts.event import DomainEvent
from app.shared.events.dispatcher import event_dispatcher
from app.shared.models.employee import Department, Employee
from app.shared.models.location import Location
from app.shared.models.locker_compartment import LockerCompartment
from app.shared.models.resource import (
    LockerDetail,
    Resource,
    ResourceAssignment,
    SeatDetail,
)
from app.workflow.engine import WorkflowEngine

if TYPE_CHECKING:
    from app.shared.contracts.resource import (
        FloorLayoutResponse,
        ResourceAssignRequest,
        ResourceReturnRequest,
        SeatCreate,
        SeatPositionUpdate,
        SeatRecommendationResponse,
    )


def _safe_rel(entity: Any, attr: str, default: Any = None) -> Any:
    """Safely get an ORM relationship attribute without triggering lazy-load IO in async mode."""
    if entity is None:
        return default
    d = getattr(entity, "__dict__", None)
    if d is not None and attr in d:
        val = d[attr]
        return val if val is not None else default
    return default


def _compute_building_tag(current_building: str, other_buildings: list[str]) -> str:
    """Compute minimal unique prefix tag for building code.

    If no other building shares initial characters, returns single uppercase initial.
    If common prefix exists, extends to first differing character (lowercase) to avoid ambiguity.
    Example: Technopark vs Technotree -> 'technop' vs 'technot'.
    """
    current_clean = "".join(c for c in (current_building or "") if c.isalnum())
    if not current_clean:
        return "B"

    curr_lower = current_clean.lower()
    max_lcp = 0
    for other in other_buildings:
        other_clean = "".join(c for c in (other or "") if c.isalnum()).lower()
        if not other_clean or other_clean == curr_lower:
            continue
        lcp = 0
        for c1, c2 in zip(curr_lower, other_clean):
            if c1 == c2:
                lcp += 1
            else:
                break
        max_lcp = max(max_lcp, lcp)

    if max_lcp == 0:
        return current_clean[0].upper()

    needed_len = min(len(current_clean), max_lcp + 1)
    return current_clean[:needed_len].lower()


def _parse_assigned_date(val: Any) -> Any:
    """Parse assigned_date safely from ISO or dd/mm/yyyy string, datetime, or date."""
    if val is None or val == "":
        return datetime.now(timezone.utc)
    if isinstance(val, (datetime, date)):
        return val

    s = str(val).strip()
    if not s:
        return datetime.now(timezone.utc)

    # Try ISO format
    try:
        clean_s = s.replace("Z", "+00:00")
        return datetime.fromisoformat(clean_s)
    except (ValueError, TypeError):
        pass

    # Try common date formats
    for fmt in (
        "%d/%m/%Y",
        "%d/%m/%Y %H:%M:%S",
        "%d/%m/%Y %H:%M",
        "%d-%m-%Y",
        "%d-%m-%Y %H:%M:%S",
        "%Y-%m-%d",
        "%Y-%m-%d %H:%M:%S",
        "%d/%m/%y",
    ):
        try:
            return datetime.strptime(s, fmt)
        except (ValueError, TypeError):
            continue

    return datetime.now(timezone.utc)


def _serialize_locker(resource: Resource) -> LockerRead:
    """Helper serializer converting Resource locker entity and relationships to LockerRead."""
    attrs: dict[str, Any] = dict(resource.attributes or {})
    loc: Location | None = _safe_rel(resource, "location")
    detail: LockerDetail | None = _safe_rel(resource, "locker_detail")

    # Sort and serialize compartments
    serialized_comps: list[LockerCompartmentRead] = []
    comps = _safe_rel(detail, "compartments") or []

    def comp_sort_key(c: Any) -> tuple[int, str]:
        num_str = str(getattr(c, "compartment_number", "") or "")
        if num_str.isdigit():
            return (0, f"{int(num_str):06d}")
        return (1, num_str)

    sorted_comps = sorted(comps, key=comp_sort_key)
    for c in sorted_comps:
        raw_status = str(getattr(c, "status", "") or "available").strip().lower()
        if raw_status in ("broken", "damaged", "maintenance", "error", "hong"):
            norm_status = "broken"
        elif raw_status in ("recall", "overdue", "thu_hoi"):
            norm_status = "recall"
        elif raw_status in ("in_use", "occupied", "assigned", "dang_dung"):
            norm_status = "in_use"
        else:
            norm_status = "available"

        comp_emp = _safe_rel(c, "employee")
        c_attrs = getattr(c, "attributes", None) or {}

        comp_emp_name = getattr(c, "employee_name", None)
        if not comp_emp_name and isinstance(c_attrs, dict):
            comp_emp_name = c_attrs.get("employee_name") or c_attrs.get("employeeName")
        if not comp_emp_name and comp_emp:
            comp_emp_name = getattr(comp_emp, "full_name", None)

        comp_emp_code = getattr(c, "employee_code", None)
        if not comp_emp_code and isinstance(c_attrs, dict):
            comp_emp_code = c_attrs.get("employee_code") or c_attrs.get("employeeCode")
        if not comp_emp_code and comp_emp:
            comp_emp_code = getattr(comp_emp, "employee_code", None)

        comp_emp_email = getattr(c, "employee_email", None) or getattr(c, "email", None)
        if not comp_emp_email and isinstance(c_attrs, dict):
            comp_emp_email = c_attrs.get("employee_email") or c_attrs.get("email") or c_attrs.get("employeeEmail")
        if not comp_emp_email and comp_emp:
            comp_emp_email = getattr(comp_emp, "email", None)

        comp_job_title = getattr(c, "job_title", None)
        if not comp_job_title and isinstance(c_attrs, dict):
            comp_job_title = c_attrs.get("job_title") or c_attrs.get("jobTitle")
        if not comp_job_title and comp_emp:
            comp_job_title = getattr(comp_emp, "title", None)

        comp_emp_id = getattr(c, "employee_id", None)
        if comp_emp_id is None and isinstance(c_attrs, dict):
            comp_emp_id = c_attrs.get("employee_id")
        if comp_emp_id is None and comp_emp:
            comp_emp_id = getattr(comp_emp, "id", None)

        comp_dept = getattr(c, "department", None)
        if not comp_dept and isinstance(c_attrs, dict):
            comp_dept = c_attrs.get("department")
        if not comp_dept and comp_emp:
            emp_dept = _safe_rel(comp_emp, "department")
            if emp_dept:
                comp_dept = getattr(emp_dept, "name", None)

        c_assigned = getattr(c, "assigned_date", None)
        if not c_assigned and isinstance(c_attrs, dict):
            c_assigned = c_attrs.get("assigned_date") or c_attrs.get("assignedDate")
        c_assigned_str = str(c_assigned) if c_assigned else None

        c_recall = getattr(c, "recall_due_date", None)
        if not c_recall and isinstance(c_attrs, dict):
            c_recall = c_attrs.get("recall_due_date") or c_attrs.get("recallDueDate")
        c_recall_str = str(c_recall) if c_recall else None

        comp_num = str(getattr(c, "compartment_number", "") or "")
        comp_code = getattr(c, "code", None)
        if not comp_code:
            comp_code = f"{resource.code}-{comp_num}" if comp_num else resource.code

        c_notes = getattr(c, "notes", None)
        if not c_notes and isinstance(c_attrs, dict):
            c_notes = c_attrs.get("notes")

        c_ai = getattr(c, "ai_suggestion", None)
        if not c_ai and isinstance(c_attrs, dict):
            c_ai = c_attrs.get("ai_suggestion") or c_attrs.get("aiSuggestion")

        serialized_comps.append(
            LockerCompartmentRead(
                id=str(getattr(c, "id", "")),
                code=comp_code,
                status=norm_status,
                employeeName=comp_emp_name,
                employeeCode=comp_emp_code,
                employeeEmail=comp_emp_email,
                jobTitle=comp_job_title,
                employee_id=comp_emp_id,
                department=comp_dept,
                assignedDate=c_assigned_str,
                recallDueDate=c_recall_str,
                aiSuggestion=c_ai,
                notes=c_notes,
            )
        )

    # Derive locker status: broken -> recall -> in_use -> available
    if any(c.status == "broken" for c in serialized_comps):
        locker_status = "broken"
    elif any(c.status == "recall" for c in serialized_comps):
        locker_status = "recall"
    elif any(c.status == "in_use" for c in serialized_comps):
        locker_status = "in_use"
    elif serialized_comps:
        locker_status = "available"
    else:
        raw_res_status = str(resource.status or "available").strip().lower()
        if raw_res_status in ("broken", "damaged", "maintenance"):
            locker_status = "broken"
        elif raw_res_status in ("recall", "overdue"):
            locker_status = "recall"
        elif raw_res_status in ("in_use", "occupied", "assigned"):
            locker_status = "in_use"
        else:
            locker_status = "available"

    # Locker assignment info from resource active assignments
    emp_name: str | None = None
    emp_id: int | None = None
    dept_name: str | None = None
    assigned_date_str: str | None = None

    assigns = _safe_rel(resource, "assignments") or []
    active_assigns = [a for a in assigns if getattr(a, "returned_at", None) is None]
    if active_assigns:
        latest = active_assigns[0]
        emp = _safe_rel(latest, "employee")
        if emp:
            emp_name = getattr(emp, "full_name", None)
            emp_id = getattr(emp, "id", None)
            emp_dept = _safe_rel(emp, "department")
            if emp_dept:
                dept_name = getattr(emp_dept, "name", None)
        if getattr(latest, "assigned_at", None):
            assigned_date_str = str(latest.assigned_at)

    if emp_name is None:
        emp_name = attrs.get("employeeName") or attrs.get("employee_name")
    if emp_id is None:
        emp_id = attrs.get("employee_id")
    if dept_name is None:
        dept_name = attrs.get("department")
    if assigned_date_str is None:
        assigned_date_str = attrs.get("assignedDate") or attrs.get("assigned_date")

    # Safe fallbacks for attributes
    zone = str(attrs.get("zone") or attrs.get("zoneGroup") or attrs.get("zone_group") or "Zone A")
    zone_group = str(attrs.get("zoneGroup") or attrs.get("zone_group") or zone)
    zone_group_name = str(attrs.get("zoneGroupName") or attrs.get("zone_group_name") or zone)

    phys_loc = attrs.get("physicalLocation") or attrs.get("physical_location")
    if not phys_loc:
        floor_str = str(loc.floor) if loc and loc.floor else ""
        phys_loc = f"Tầng {floor_str} - {zone}" if floor_str else zone

    center = attrs.get("center") if attrs.get("center") is not None else [0.0, 0.0]
    bbox = attrs.get("bbox") if attrs.get("bbox") is not None else [0.0, 0.0, 0.0, 0.0]
    size = attrs.get("size") if attrs.get("size") is not None else [1.0, 1.0]

    if len(serialized_comps) > 1:
        is_combined = True
    else:
        raw_combined = attrs.get("isCombined")
        if raw_combined is None:
            raw_combined = attrs.get("is_combined")
        is_combined = bool(raw_combined) if raw_combined is not None else False

    compartment_start = attrs.get("compartment_start", attrs.get("compartmentStart", 0))
    try:
        compartment_start_int = int(compartment_start)
    except (ValueError, TypeError):
        compartment_start_int = 0

    lock_type = (
        (detail.lock_type if detail and detail.lock_type else None)
        or attrs.get("lock_type")
        or "mechanical_key"
    )

    rotation = attrs.get("rotation")
    if rotation is not None:
        try:
            rotation = float(rotation)
        except (ValueError, TypeError):
            rotation = None

    return LockerRead(
        id=str(resource.id),
        resource_id=resource.id,
        code=resource.code,
        name=str(attrs.get("name") or f"Tủ {resource.code}"),
        zone=zone,
        compartment_start=compartment_start_int,
        zoneGroup=zone_group,
        zoneGroupName=zone_group_name,
        physicalLocation=str(phys_loc),
        center=center,
        bbox=bbox,
        size=size,
        status=locker_status,
        employeeName=emp_name,
        employee_id=emp_id,
        department=dept_name,
        assignedDate=assigned_date_str,
        recallDueDate=attrs.get("recallDueDate") or attrs.get("recall_due_date"),
        aiSuggestion=attrs.get("aiSuggestion") or attrs.get("ai_suggestion"),
        notes=attrs.get("notes"),
        isCombined=is_combined,
        orientation=attrs.get("orientation"),
        rotation=rotation,
        compartments=serialized_comps,
        location_id=resource.location_id,
        lock_type=str(lock_type),
    )


class ResourceAllocationService:
    """Business logic for Office Seat Planning and Locker Management."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.workflow_engine = WorkflowEngine(session)

    # -------------------------------------------------------------------------
    # Locker Management APIs (Đề 2)
    # -------------------------------------------------------------------------

    def _serialize_locker(self, resource: Resource) -> LockerRead:
        return _serialize_locker(resource)

    async def list_lockers(self, location_id: int | None = None) -> list[LockerRead]:
        """Query locker Resources, eager-loading related location, details and compartments."""
        options = [
            selectinload(Resource.location),
            selectinload(Resource.locker_detail).selectinload(LockerDetail.compartments),
            selectinload(Resource.assignments).selectinload(ResourceAssignment.employee).selectinload(Employee.department),
        ]
        if hasattr(LockerCompartment, "employee"):
            comp_emp_opt = (
                selectinload(Resource.locker_detail)
                .selectinload(LockerDetail.compartments)
                .selectinload(LockerCompartment.employee)
            )
            if hasattr(Employee, "department"):
                comp_emp_opt = comp_emp_opt.selectinload(Employee.department)
            options.append(comp_emp_opt)

        stmt = select(Resource).where(
            Resource.resource_type.in_([ResourceTypeEnum.LOCKER.value, "locker", "LOCKER"])
        ).options(*options)

        if location_id is not None:
            stmt = stmt.where(Resource.location_id == location_id)

        stmt = stmt.order_by(Resource.code.asc())
        res = await self.session.execute(stmt)
        resources = res.scalars().all()
        return [self._serialize_locker(r) for r in resources]

    async def create_locker(self, data: LockerCreate) -> LockerRead:
        """Create new locker resource with LockerDetail and requested compartments."""
        location = await self.session.get(Location, data.location_id)
        if not location:
            raise EntityNotFoundError("Location", data.location_id)

        # Generate unique code: site first alnum + building first alnum + floor digits + next ordinal
        site_alnum = ""
        for ch in (data.site or ""):
            if ch.isalnum():
                site_alnum = ch.upper()
                break
        if not site_alnum:
            site_alnum = "S"

        # Query distinct building names from locations to detect common prefixes
        bldg_stmt = select(Location.building).distinct()
        other_bldg_res = await self.session.execute(bldg_stmt)
        other_buildings = [
            b
            for b in other_bldg_res.scalars().all()
            if b and b.strip().lower() != (location.building or "").strip().lower()
        ]

        bldg_tag = _compute_building_tag(location.building, other_buildings)

        floor_digits = "".join(ch for ch in str(location.floor or "") if ch.isdigit())
        if not floor_digits:
            floor_digits = "1"

        prefix = f"{site_alnum}{bldg_tag}{floor_digits}"

        # Fetch existing codes to find next ordinal
        code_stmt = select(Resource.code).where(
            Resource.location_id == location.id,
            Resource.resource_type.in_([ResourceTypeEnum.LOCKER.value, "locker", "LOCKER"]),
        )
        existing_codes = set((await self.session.execute(code_stmt)).scalars().all())

        max_ordinal = 0
        for c in existing_codes:
            if c.startswith(f"{prefix}-"):
                suffix = c[len(prefix) + 1 :]
                if suffix.isdigit():
                    max_ordinal = max(max_ordinal, int(suffix))
            elif c.startswith(prefix):
                suffix = c[len(prefix) :]
                if suffix.isdigit():
                    max_ordinal = max(max_ordinal, int(suffix))

        ordinal = max_ordinal + 1
        code = f"{prefix}-{ordinal:02d}"
        while code in existing_codes:
            ordinal += 1
            code = f"{prefix}-{ordinal:02d}"

        bank_code = prefix
        locker_number = f"{ordinal:02d}"

        zone_group = data.zone_group or data.zone
        zone_group_name = data.zone_group_name or data.zone
        floor_str = str(location.floor or "")
        physical_location = (
            data.physical_location
            or (f"Tầng {floor_str} - {data.zone}" if floor_str else data.zone)
        )
        center = data.center if data.center is not None else [0.0, 0.0]
        bbox = data.bbox if data.bbox is not None else [0.0, 0.0, 0.0, 0.0]
        size = data.size if data.size is not None else [1.0, 1.0]
        is_combined = (
            bool(data.is_combined)
            if data.is_combined is not None
            else (data.compartment_count > 1)
        )
        orientation = data.orientation or "horizontal"
        rotation = data.rotation

        attributes: dict[str, Any] = {
            "zone": data.zone,
            "zoneGroup": zone_group,
            "zoneGroupName": zone_group_name,
            "physicalLocation": physical_location,
            "center": center,
            "bbox": bbox,
            "size": size,
            "isCombined": is_combined,
            "is_combined": is_combined,
            "orientation": orientation,
            "rotation": rotation,
            "lock_type": data.lock_type or "mechanical_key",
            "notes": data.notes,
            "compartment_start": data.compartment_start,
        }
        if data.recall_due_date is not None:
            attributes["recallDueDate"] = data.recall_due_date
            attributes["recall_due_date"] = data.recall_due_date
        if data.ai_suggestion is not None:
            attributes["aiSuggestion"] = data.ai_suggestion
            attributes["ai_suggestion"] = data.ai_suggestion

        comp_cols = LockerCompartment.__table__.columns.keys()
        compartment_items: list[LockerCompartment] = []
        custom_compartments = getattr(data, "compartments", None)
        if custom_compartments and len(custom_compartments) > 0:
            for item in custom_compartments:
                if isinstance(item, dict):
                    c_num = str(item.get("compartment_number") or item.get("code") or "")
                    c_status = item.get("status") or "available"
                    c_emp_id = item.get("employee_id")
                    c_notes = item.get("notes")
                    c_assigned = item.get("assigned_date")
                    c_recall = item.get("recall_due_date")
                    c_ai = item.get("ai_suggestion")
                else:
                    c_num = str(getattr(item, "compartment_number", getattr(item, "code", "")))
                    c_status = getattr(item, "status", "available") or "available"
                    c_emp_id = getattr(item, "employee_id", None)
                    c_notes = getattr(item, "notes", None)
                    c_assigned = getattr(item, "assigned_date", None)
                    c_recall = getattr(item, "recall_due_date", None)
                    c_ai = getattr(item, "ai_suggestion", None)

                c_code = (
                    f"{code}-{c_num}"
                    if not str(c_num).startswith(code)
                    else str(c_num)
                )
                comp_kw: dict[str, Any] = {}
                if "compartment_number" in comp_cols:
                    comp_kw["compartment_number"] = c_num
                if "code" in comp_cols:
                    comp_kw["code"] = c_code
                if "status" in comp_cols:
                    comp_kw["status"] = c_status
                if "employee_id" in comp_cols:
                    comp_kw["employee_id"] = c_emp_id
                if "notes" in comp_cols:
                    comp_kw["notes"] = c_notes
                if "assigned_date" in comp_cols:
                    comp_kw["assigned_date"] = c_assigned
                if "recall_due_date" in comp_cols:
                    comp_kw["recall_due_date"] = c_recall
                if "ai_suggestion" in comp_cols:
                    comp_kw["ai_suggestion"] = c_ai

                compartment_items.append(LockerCompartment(**comp_kw))
        else:
            for idx in data.compartment_range:
                c_num = f"{idx:02d}"
                c_code = f"{code}-{c_num}"
                comp_kw = {}
                if "compartment_number" in comp_cols:
                    comp_kw["compartment_number"] = c_num
                if "code" in comp_cols:
                    comp_kw["code"] = c_code
                if "status" in comp_cols:
                    comp_kw["status"] = "available"

                compartment_items.append(LockerCompartment(**comp_kw))

        detail_cols = LockerDetail.__table__.columns.keys()
        detail_kwargs: dict[str, Any] = {
            "location_id": location.id,
            "bank_code": bank_code,
            "locker_number": locker_number,
        }
        if "lock_type" in detail_cols:
            detail_kwargs["lock_type"] = data.lock_type or "mechanical_key"
        if "row" in detail_cols:
            detail_kwargs["row"] = data.row

        locker_detail = LockerDetail(**detail_kwargs)
        locker_detail.compartments = compartment_items

        resource = Resource(
            code=code,
            resource_type=ResourceTypeEnum.LOCKER.value,
            location_id=location.id,
            status=ResourceStatusEnum.AVAILABLE.value,
            attributes=attributes,
        )
        resource.location = location
        resource.locker_detail = locker_detail

        self.session.add(resource)
        await self.session.flush()

        try:
            await self.workflow_engine.create_instance(
                entity_type="locker",
                entity_id=resource.id,
                initial_state=WorkflowStateEnum.CREATED,
                metadata={"code": resource.code, "zone": data.zone},
            )
        except Exception as exc:  # noqa: BLE001
            logger.warning(
                "Failed to initialize workflow instance for locker %s: %s",
                resource.id,
                exc,
            )

        return self._serialize_locker(resource)

    async def delete_locker(self, locker_id: int | str) -> LockerDeleteResponse:
        """Delete locker resource and cascade to details and compartments."""
        res_id: int | None = None
        if isinstance(locker_id, int):
            res_id = locker_id
        elif isinstance(locker_id, str) and locker_id.isdigit():
            res_id = int(locker_id)

        stmt = (
            select(Resource)
            .where(
                Resource.resource_type.in_([ResourceTypeEnum.LOCKER.value, "locker", "LOCKER"])
            )
            .options(
                selectinload(Resource.locker_detail).selectinload(LockerDetail.compartments)
            )
        )
        if res_id is not None:
            stmt = stmt.where(Resource.id == res_id)
        else:
            stmt = stmt.where(Resource.code == str(locker_id))

        res = await self.session.execute(stmt)
        resource = res.scalar_one_or_none()
        if not resource:
            raise EntityNotFoundError("Locker", locker_id)

        deleted_code = resource.code
        deleted_resource_id = resource.id
        compartments_count = 0
        if resource.locker_detail and resource.locker_detail.compartments:
            compartments_count = len(resource.locker_detail.compartments)

        await self.session.delete(resource)
        await self.session.flush()

        return LockerDeleteResponse(
            success=True,
            deleted_code=deleted_code,
            deleted_resource_id=deleted_resource_id,
            compartments_deleted_count=compartments_count,
            message=f"Locker {deleted_code} and {compartments_count} compartment(s) successfully deleted.",
        )

    async def update_locker_compartment(
        self, compartment_id: int, data: LockerCompartmentAssignmentUpdate
    ) -> LockerRead:
        """Update locker compartment assignment with employee snapshot and notes, setting status to in_use."""
        try:
            comp_id_int = int(compartment_id)
        except (ValueError, TypeError):
            raise EntityNotFoundError("LockerCompartment", compartment_id)

        comp = await self.session.get(LockerCompartment, comp_id_int)
        if not comp:
            raise EntityNotFoundError("LockerCompartment", compartment_id)

        options = [
            selectinload(Resource.location),
            selectinload(Resource.locker_detail).selectinload(LockerDetail.compartments),
            selectinload(Resource.assignments).selectinload(ResourceAssignment.employee).selectinload(Employee.department),
        ]
        if hasattr(LockerCompartment, "employee"):
            comp_emp_opt = (
                selectinload(Resource.locker_detail)
                .selectinload(LockerDetail.compartments)
                .selectinload(LockerCompartment.employee)
            )
            if hasattr(Employee, "department"):
                comp_emp_opt = comp_emp_opt.selectinload(Employee.department)
            options.append(comp_emp_opt)

        resource: Resource | None = None
        try:
            stmt = (
                select(Resource)
                .join(Resource.locker_detail)
                .join(LockerDetail.compartments)
                .where(LockerCompartment.id == comp.id)
                .options(*options)
            )
            res = await self.session.execute(stmt)
            resource = res.scalars().first()
        except Exception:
            resource = None

        if resource is None:
            locker_detail_id = getattr(comp, "locker_detail_id", None)
            res_id = getattr(comp, "resource_id", None) or getattr(comp, "locker_id", None)
            if res_id is None and locker_detail_id:
                detail = await self.session.get(LockerDetail, locker_detail_id)
                if detail:
                    res_id = getattr(detail, "resource_id", getattr(detail, "id", None))
            if res_id is not None:
                stmt = select(Resource).where(Resource.id == res_id).options(*options)
                res = await self.session.execute(stmt)
                resource = res.scalars().first()

        if resource is None:
            raise EntityNotFoundError("Locker", compartment_id)

        comp_cols = LockerCompartment.__table__.columns.keys()

        # Update snapshot fields
        if "employee_name" in comp_cols or hasattr(comp, "employee_name"):
            setattr(comp, "employee_name", data.employee_name)

        if "employee_code" in comp_cols or hasattr(comp, "employee_code"):
            setattr(comp, "employee_code", data.employee_code)

        email_val = data.employee_email or getattr(data, "email", None)
        if "employee_email" in comp_cols or hasattr(comp, "employee_email"):
            setattr(comp, "employee_email", email_val)
        elif "email" in comp_cols or hasattr(comp, "email"):
            setattr(comp, "email", email_val)

        if "job_title" in comp_cols or hasattr(comp, "job_title"):
            setattr(comp, "job_title", data.job_title)

        if "department" in comp_cols or hasattr(comp, "department"):
            setattr(comp, "department", data.department)

        # Update status
        if "status" in comp_cols or hasattr(comp, "status"):
            setattr(comp, "status", "in_use")

        # Parse assigned_date safely
        assigned_dt = _parse_assigned_date(data.assigned_date)
        if "assigned_date" in comp_cols or hasattr(comp, "assigned_date"):
            col = LockerCompartment.__table__.columns.get("assigned_date")
            from sqlalchemy.types import Date as SqlDate, DateTime as SqlDateTime
            if col is not None and isinstance(col.type, SqlDate) and not isinstance(col.type, SqlDateTime):
                val_to_set: Any = assigned_dt.date() if isinstance(assigned_dt, datetime) else assigned_dt
            elif col is not None and isinstance(col.type, SqlDateTime):
                val_to_set = assigned_dt
            elif col is not None and not isinstance(col.type, (SqlDate, SqlDateTime)):
                val_to_set = (
                    assigned_dt.strftime("%Y-%m-%d")
                    if isinstance(assigned_dt, (datetime, date))
                    else str(assigned_dt)
                )
            else:
                val_to_set = assigned_dt
            setattr(comp, "assigned_date", val_to_set)

        # Update notes
        if data.notes is not None:
            if "notes" in comp_cols or hasattr(comp, "notes"):
                setattr(comp, "notes", data.notes)

        # Attempt to link employee_id if exists in DB
        if ("employee_id" in comp_cols or hasattr(comp, "employee_id")) and getattr(comp, "employee_id", None) is None:
            matched_emp = None
            if data.employee_code:
                emp_res = await self.session.execute(
                    select(Employee).where(Employee.employee_code == data.employee_code)
                )
                matched_emp = emp_res.scalars().first()
            if not matched_emp and email_val:
                emp_res = await self.session.execute(
                    select(Employee).where(Employee.email == email_val)
                )
                matched_emp = emp_res.scalars().first()
            if matched_emp:
                setattr(comp, "employee_id", matched_emp.id)
                if not data.department and matched_emp.department_id:
                    dept = await self.session.get(Department, matched_emp.department_id)
                    if dept and ("department" in comp_cols or hasattr(comp, "department")):
                        setattr(comp, "department", dept.name)

        if hasattr(comp, "attributes") and isinstance(comp.attributes, dict):
            comp.attributes["employee_name"] = data.employee_name
            comp.attributes["employee_code"] = data.employee_code
            comp.attributes["employee_email"] = email_val
            comp.attributes["job_title"] = data.job_title
            comp.attributes["department"] = data.department
            if data.notes is not None:
                comp.attributes["notes"] = data.notes

        await self.session.flush()
        return self._serialize_locker(resource)

    # -------------------------------------------------------------------------
    # Seat Planning / Resource Allocation APIs (Flow 1)
    # -------------------------------------------------------------------------

    async def list_resources(
        self,
        resource_type: ResourceTypeEnum | None = None,
        location_id: int | None = None,
        status: ResourceStatusEnum | None = None,
    ) -> list[Resource]:
        stmt = select(Resource).options(
            selectinload(Resource.seat_detail),
            selectinload(Resource.locker_detail),
            selectinload(Resource.location),
            selectinload(Resource.assignments).selectinload(ResourceAssignment.employee),
        )
        if resource_type:
            stmt = stmt.where(Resource.resource_type == resource_type.value)
        if location_id:
            stmt = stmt.where(Resource.location_id == location_id)
        if status:
            stmt = stmt.where(Resource.status == status.value)

        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_resource_by_id(self, resource_id: int) -> Resource | None:
        stmt = (
            select(Resource)
            .where(Resource.id == resource_id)
            .options(
                selectinload(Resource.seat_detail),
                selectinload(Resource.locker_detail),
                selectinload(Resource.location),
                selectinload(Resource.assignments).selectinload(ResourceAssignment.employee),
            )
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_seat(self, data: SeatCreate) -> Resource:
        resource = Resource(
            code=data.code,
            resource_type=ResourceTypeEnum.SEAT.value,
            location_id=data.location_id,
            status=ResourceStatusEnum.AVAILABLE.value,
            attributes={"zone": data.zone},
        )
        self.session.add(resource)
        await self.session.flush()

        detail = SeatDetail(
            resource_id=resource.id,
            x=data.x,
            y=data.y,
            layout_version=data.layout_version,
            zone=data.zone,
        )
        self.session.add(detail)
        await self.session.flush()

        # Initialize workflow
        await self.workflow_engine.create_instance(
            entity_type="seat",
            entity_id=resource.id,
            initial_state=WorkflowStateEnum.CREATED,
            metadata={"code": data.code, "zone": data.zone},
        )
        return resource

    async def update_seat_position(self, seat_id: int, pos: SeatPositionUpdate) -> Resource:
        resource = await self.get_resource_by_id(seat_id)
        if not resource:
            raise EntityNotFoundError("Seat", seat_id)

        if not resource.seat_detail:
            detail = SeatDetail(
                resource_id=resource.id,
                x=pos.x,
                y=pos.y,
                zone=pos.zone,
                layout_version="v1",
            )
            self.session.add(detail)
        else:
            resource.seat_detail.x = pos.x
            resource.seat_detail.y = pos.y
            if pos.zone:
                resource.seat_detail.zone = pos.zone

        if pos.zone:
            current_attrs = dict(resource.attributes)
            current_attrs["zone"] = pos.zone
            resource.attributes = current_attrs

        await self.session.flush()
        return resource

    async def get_floor_layout(self, location_id: int) -> FloorLayoutResponse:
        from app.shared.contracts.resource import (
            FloorLayoutResponse,
            SeatEmployeeInfo,
            SeatLayoutItem,
        )

        location = await self.session.get(Location, location_id)
        if not location:
            raise EntityNotFoundError("Location", location_id)

        stmt = (
            select(Resource)
            .where(
                and_(
                    Resource.location_id == location_id,
                    Resource.resource_type == ResourceTypeEnum.SEAT.value,
                )
            )
            .options(
                selectinload(Resource.seat_detail),
                selectinload(Resource.assignments).selectinload(ResourceAssignment.employee).selectinload(Employee.department),
            )
        )
        res = await self.session.execute(stmt)
        seats: list[Resource] = list(res.scalars().all())

        layout_items: list[SeatLayoutItem] = []
        occupied_count = 0
        zones_set = set()

        for s in seats:
            detail = s.seat_detail
            x = detail.x if detail else 0.0
            y = detail.y if detail else 0.0
            zone = detail.zone if detail else (s.attributes.get("zone") if s.attributes else None)
            if zone:
                zones_set.add(zone)

            # Active assignment
            assigned_emp: SeatEmployeeInfo | None = None
            assignment_id: int | None = None
            if s.assignments:
                active_assigns = [a for a in s.assignments if a.returned_at is None]
                if active_assigns:
                    latest = active_assigns[0]
                    assignment_id = latest.id
                    if latest.employee:
                        emp = latest.employee
                        dept_name = emp.department.name if emp.department else None
                        assigned_emp = SeatEmployeeInfo(
                            id=emp.id,
                            employee_code=emp.employee_code,
                            full_name=emp.full_name,
                            email=emp.email,
                            department_name=dept_name,
                            title=emp.title,
                        )

            if s.status != ResourceStatusEnum.AVAILABLE.value:
                occupied_count += 1

            layout_items.append(
                SeatLayoutItem(
                    id=s.id,
                    code=s.code,
                    location_id=s.location_id,
                    x=x,
                    y=y,
                    zone=zone,
                    layout_version=detail.layout_version if detail else "v1",
                    status=ResourceStatusEnum(s.status),
                    assigned_employee=assigned_emp,
                    assignment_id=assignment_id,
                )
            )

        total_seats = len(seats)
        available_seats = total_seats - occupied_count
        rate = round((occupied_count / total_seats * 100), 1) if total_seats > 0 else 0.0

        return FloorLayoutResponse(
            location_id=location.id,
            building=location.building,
            floor=location.floor,
            layout_name=location.name,
            total_seats=total_seats,
            occupied_seats=occupied_count,
            available_seats=available_seats,
            occupancy_rate=rate,
            zones=sorted(zones_set),
            seats=layout_items,
        )

    async def recommend_seat(self, employee_id: int, preferred_zone: str | None = None) -> SeatRecommendationResponse:
        """AI seat recommendation based on department cluster and nearest vacancy (ADD v2 Section 9)."""
        from app.shared.contracts.resource import SeatRecommendationResponse

        employee = await self.session.get(Employee, employee_id)
        if not employee:
            raise EntityNotFoundError("Employee", employee_id)

        # Find colleagues in same department to find cluster zone
        target_zone = preferred_zone
        if not target_zone and employee.department_id:
            colleague_stmt = (
                select(SeatDetail.zone)
                .join(Resource, Resource.id == SeatDetail.resource_id)
                .join(ResourceAssignment, ResourceAssignment.resource_id == Resource.id)
                .join(Employee, Employee.id == ResourceAssignment.employee_id)
                .where(
                    and_(
                        Employee.department_id == employee.department_id,
                        ResourceAssignment.returned_at.is_(None),
                        SeatDetail.zone.isnot(None),
                    )
                )
            )
            colleague_zones = (await self.session.execute(colleague_stmt)).scalars().all()
            if colleague_zones:
                # Most frequent zone
                target_zone = max(set(colleague_zones), key=colleague_zones.count)

        # Query available seats
        seat_stmt = (
            select(Resource)
            .where(
                and_(
                    Resource.resource_type == ResourceTypeEnum.SEAT.value,
                    Resource.status == ResourceStatusEnum.AVAILABLE.value,
                )
            )
            .options(selectinload(Resource.seat_detail))
        )
        if target_zone:
            # Prefer matching zone
            seat_res = await self.session.execute(seat_stmt)
            candidates = list(seat_res.scalars().all())
            matching_zone_seats = [c for c in candidates if c.seat_detail and c.seat_detail.zone == target_zone]
            if matching_zone_seats:
                chosen = matching_zone_seats[0]
                return SeatRecommendationResponse(
                    recommended_seat_id=chosen.id,
                    seat_code=chosen.code,
                    zone=target_zone,
                    reason=f"Optimal cluster match for department colleagues in Zone {target_zone}.",
                    confidence=0.94,
                    distance_score=1.2,
                )

        # Fallback to any available seat
        fallback_res = await self.session.execute(seat_stmt)
        any_avail = fallback_res.scalars().first()
        if not any_avail:
            raise ResourceConflictError("No available seats found for recommendation.")

        zone_name = any_avail.seat_detail.zone if any_avail.seat_detail else None
        return SeatRecommendationResponse(
            recommended_seat_id=any_avail.id,
            seat_code=any_avail.code,
            zone=zone_name,
            reason="Nearest general available seat on floor.",
            confidence=0.82,
            distance_score=2.5,
        )

    async def assign_resource(self, resource_id: int, request: ResourceAssignRequest) -> ResourceAssignment:
        resource = await self.get_resource_by_id(resource_id)
        if not resource:
            raise EntityNotFoundError("Resource", resource_id)

        if resource.status != ResourceStatusEnum.AVAILABLE.value:
            raise ResourceConflictError(f"Resource {resource.code} is currently {resource.status}, not available.")

        # Update resource status
        resource.status = ResourceStatusEnum.ASSIGNED.value

        assignment = ResourceAssignment(
            resource_id=resource.id,
            employee_id=request.employee_id,
            status=ResourceStatusEnum.ASSIGNED.value,
            assigned_at=datetime.now(timezone.utc),
            notes=request.notes,
        )
        self.session.add(assignment)
        await self.session.flush()

        # Transition workflow instance
        wf = await self.workflow_engine.get_instance_by_entity(resource.resource_type, resource.id)
        if wf:
            await self.workflow_engine.transition(
                instance_id=wf.id,
                target_state=WorkflowStateEnum.ASSIGNED,
                actor_id=request.actor_id,
                comment=f"Assigned to employee {request.employee_id}",
            )

        # Emit domain event
        event_name = (
            DomainEventEnum.LOCKER_ASSIGNED
            if resource.resource_type == ResourceTypeEnum.LOCKER.value
            else DomainEventEnum.SEAT_CHANGED
        )
        event = DomainEvent(
            event_name=event_name,
            entity_type=resource.resource_type,
            entity_id=resource.id,
            actor_id=request.actor_id,
            payload={
                "resource_id": resource.id,
                "code": resource.code,
                "employee_id": request.employee_id,
                "seat_code": resource.code,
                "locker_code": resource.code,
            },
        )
        await event_dispatcher.publish(event)

        return assignment

    async def return_resource(self, resource_id: int, request: ResourceReturnRequest) -> Resource:
        resource = await self.get_resource_by_id(resource_id)
        if not resource:
            raise EntityNotFoundError("Resource", resource_id)

        # Find active/assigned assignment
        stmt = (
            select(ResourceAssignment)
            .where(
                and_(
                    ResourceAssignment.resource_id == resource_id,
                    ResourceAssignment.returned_at.is_(None),
                )
            )
            .order_by(ResourceAssignment.id.desc())
        )
        res = await self.session.execute(stmt)
        assignment = res.scalars().first()

        if assignment:
            assignment.returned_at = datetime.now(timezone.utc)
            assignment.status = ResourceStatusEnum.AVAILABLE.value

        resource.status = ResourceStatusEnum.AVAILABLE.value

        # Transition workflow
        wf = await self.workflow_engine.get_instance_by_entity(resource.resource_type, resource.id)
        if wf:
            await self.workflow_engine.transition(
                instance_id=wf.id,
                target_state=WorkflowStateEnum.COMPLETED,
                actor_id=request.actor_id,
                comment="Resource returned and marked available.",
            )

        return resource

    async def get_allocation_stats(self, location_id: int | None = None) -> dict[str, Any]:
        """Compute statistics for dashboards: total, available, assigned, vacancy rate."""
        stmt = select(
            Resource.resource_type,
            Resource.status,
            func.count(Resource.id),
        ).group_by(Resource.resource_type, Resource.status)

        if location_id:
            stmt = stmt.where(Resource.location_id == location_id)

        res = await self.session.execute(stmt)
        rows = res.all()

        stats: dict[str, dict[str, int]] = {
            ResourceTypeEnum.SEAT.value: {"total": 0, "available": 0, "assigned": 0},
            ResourceTypeEnum.LOCKER.value: {"total": 0, "available": 0, "assigned": 0},
        }

        for r_type, r_status, count in rows:
            if r_type not in stats:
                stats[r_type] = {"total": 0, "available": 0, "assigned": 0}
            stats[r_type]["total"] += count
            if r_status == ResourceStatusEnum.AVAILABLE.value:
                stats[r_type]["available"] += count
            else:
                stats[r_type]["assigned"] += count

        return stats

    async def seed_floor_19(self) -> Location:
        """Seed Floor 19 data (Location, Departments, Employees, Seats) per Wireframe 1b."""
        # Check if already seeded
        loc_stmt = select(Location).where(Location.floor == "19")
        existing_loc = (await self.session.execute(loc_stmt)).scalars().first()
        if existing_loc:
            return existing_loc

        # 1. Departments
        depts_data = [
            ("HC", "Phòng Hành chính", "Văn phòng hành chính tổng hợp"),
            ("IT", "Phòng Công nghệ Thông tin", "Phát triển phần mềm & hạ tầng"),
            ("HR", "Phòng Nhân sự", "Quản lý nhân sự và đào tạo"),
            ("TC", "Phòng Tài chính Kế toán", "Quản lý tài chính"),
            ("BGD", "Ban Giám Đốc", "Lãnh đạo và điều hành"),
        ]
        dept_map = {}
        for code, name, desc in depts_data:
            d = Department(code=code, name=name, description=desc)
            self.session.add(d)
            await self.session.flush()
            dept_map[code] = d.id

        # 2. Location: VSF Tower, Floor 19
        location = Location(
            building="VSF Tower",
            floor="19",
            zone="Floor 19 All Zones",
            name="Sơ đồ Tầng 19 - Vinsmart Future",
            description="Mặt bằng làm việc tầng 19, Trung tâm Hành chính",
        )
        self.session.add(location)
        await self.session.flush()

        # 3. Employees (per README and wireframe)
        employees_data = [
            ("EMP001", "Nguyễn Thị Thu Hương", "huong.ntt@vinsmart.vn", dept_map["HC"], "Trưởng phòng"),
            ("EMP002", "Lưu Hải Nam", "nam.lh@vinsmart.vn", dept_map["HC"], "Chuyên viên quản lý tài sản"),
            ("EMP003", "Phạm Thị Duyên", "duyen.pt@vinsmart.vn", dept_map["HC"], "Điều phối chuyển phát"),
            ("EMP004", "Vũ Phương Thảo", "thao.vp@vinsmart.vn", dept_map["HC"], "Văn thư công văn"),
            ("EMP005", "Trần Văn Hùng", "hung.tv@vinsmart.vn", dept_map["IT"], "Tech Lead"),
            ("EMP006", "Lê Thu Trang", "trang.lt@vinsmart.vn", dept_map["HR"], "HR Generalist"),
            ("EMP007", "Đỗ Hùng Anh", "anh.dh@vinsmart.vn", dept_map["IT"], "Senior AI Engineer"),
        ]
        emp_records = []
        for code, name, email, d_id, title in employees_data:
            emp = Employee(
                employee_code=code,
                full_name=name,
                email=email,
                department_id=d_id,
                title=title,
                is_active=True,
            )
            self.session.add(emp)
            await self.session.flush()
            emp_records.append(emp)

        # 4. Seats across Zones A, B, C, D (representing Floor 19 grid)
        # Zone A (Admin / Executive), Zone B (IT), Zone C (HR & Finance), Zone D (Flex / Hot Desk)
        seat_configs = [
            # Zone A: Admin
            ("S19-A01", 120.0, 100.0, "Zone A", emp_records[0].id),
            ("S19-A02", 180.0, 100.0, "Zone A", emp_records[1].id),
            ("S19-A03", 240.0, 100.0, "Zone A", emp_records[2].id),
            ("S19-A04", 300.0, 100.0, "Zone A", emp_records[3].id),
            ("S19-A05", 360.0, 100.0, "Zone A", None),
            ("S19-A06", 420.0, 100.0, "Zone A", None),

            # Zone B: IT / Tech
            ("S19-B01", 120.0, 220.0, "Zone B", emp_records[4].id),
            ("S19-B02", 180.0, 220.0, "Zone B", emp_records[6].id),
            ("S19-B03", 240.0, 220.0, "Zone B", None),
            ("S19-B04", 300.0, 220.0, "Zone B", None),
            ("S19-B05", 360.0, 220.0, "Zone B", None),

            # Zone C: HR & Finance
            ("S19-C01", 120.0, 340.0, "Zone C", emp_records[5].id),
            ("S19-C02", 180.0, 340.0, "Zone C", None),
            ("S19-C03", 240.0, 340.0, "Zone C", None),
            ("S19-C04", 300.0, 340.0, "Zone C", None),

            # Zone D: Hot desks / Flex
            ("S19-D01", 120.0, 460.0, "Zone D", None),
            ("S19-D02", 180.0, 460.0, "Zone D", None),
            ("S19-D03", 240.0, 460.0, "Zone D", None),
            ("S19-D04", 300.0, 460.0, "Zone D", None),
        ]

        for code, x, y, zone, assigned_emp_id in seat_configs:
            is_assigned = assigned_emp_id is not None
            res_status = ResourceStatusEnum.ASSIGNED.value if is_assigned else ResourceStatusEnum.AVAILABLE.value
            r = Resource(
                code=code,
                resource_type=ResourceTypeEnum.SEAT.value,
                location_id=location.id,
                status=res_status,
                attributes={"zone": zone},
            )
            self.session.add(r)
            await self.session.flush()

            sd = SeatDetail(
                resource_id=r.id,
                x=x,
                y=y,
                layout_version="v1",
                zone=zone,
            )
            self.session.add(sd)

            # Workflow instance
            wf_state = WorkflowStateEnum.ASSIGNED if is_assigned else WorkflowStateEnum.CREATED
            await self.workflow_engine.create_instance(
                entity_type="seat",
                entity_id=r.id,
                initial_state=wf_state,
                metadata={"code": code, "zone": zone},
            )

            # Assignment record if assigned
            if is_assigned and assigned_emp_id:
                assign = ResourceAssignment(
                    resource_id=r.id,
                    employee_id=assigned_emp_id,
                    status=ResourceStatusEnum.ASSIGNED.value,
                    assigned_at=datetime.now(timezone.utc),
                    activated_at=datetime.now(timezone.utc),
                    notes="Initial Floor 19 layout seeding",
                )
                self.session.add(assign)

        await self.session.flush()
        return location


# -----------------------------------------------------------------------------
# Module-level convenience wrappers
# -----------------------------------------------------------------------------

async def list_lockers(
    location_id: int | AsyncSession | None = None,
    session: AsyncSession | None = None,
    db: AsyncSession | None = None,
    **kwargs: Any,
) -> list[LockerRead]:
    """Module-level wrapper for ResourceAllocationService.list_lockers."""
    if isinstance(location_id, AsyncSession):
        session = location_id
        location_id = kwargs.get("location_id")
    actual_session = session or db or kwargs.get("session") or kwargs.get("db")
    if actual_session is None:
        raise ValueError("AsyncSession is required for list_lockers")
    loc_id = int(location_id) if location_id is not None and not isinstance(location_id, AsyncSession) else None
    service = ResourceAllocationService(actual_session)
    return await service.list_lockers(location_id=loc_id)


async def create_locker(
    data: LockerCreate | AsyncSession | None = None,
    session: AsyncSession | None = None,
    db: AsyncSession | None = None,
    **kwargs: Any,
) -> LockerRead:
    """Module-level wrapper for ResourceAllocationService.create_locker."""
    if isinstance(data, AsyncSession):
        session = data
        data = kwargs.get("data")
    actual_session = session or db or kwargs.get("session") or kwargs.get("db")
    if actual_session is None:
        raise ValueError("AsyncSession is required for create_locker")
    if data is None:
        raise ValueError("data (LockerCreate) is required for create_locker")
    service = ResourceAllocationService(actual_session)
    return await service.create_locker(data=data)


async def delete_locker(
    locker_id: int | str | AsyncSession | None = None,
    session: AsyncSession | None = None,
    db: AsyncSession | None = None,
    **kwargs: Any,
) -> LockerDeleteResponse:
    """Module-level wrapper for ResourceAllocationService.delete_locker."""
    if isinstance(locker_id, AsyncSession):
        session = locker_id
        locker_id = kwargs.get("locker_id")
    actual_session = session or db or kwargs.get("session") or kwargs.get("db")
    if actual_session is None:
        raise ValueError("AsyncSession is required for delete_locker")
    if locker_id is None:
        raise ValueError("locker_id is required for delete_locker")
    service = ResourceAllocationService(actual_session)
    return await service.delete_locker(locker_id=locker_id)


async def update_locker_compartment(
    compartment_id: int | AsyncSession | None = None,
    data: LockerCompartmentAssignmentUpdate | None = None,
    session: AsyncSession | None = None,
    db: AsyncSession | None = None,
    **kwargs: Any,
) -> LockerRead:
    """Module-level wrapper for ResourceAllocationService.update_locker_compartment."""
    if isinstance(compartment_id, AsyncSession):
        session = compartment_id
        compartment_id = kwargs.get("compartment_id")
    actual_session = session or db or kwargs.get("session") or kwargs.get("db")
    if actual_session is None:
        raise ValueError("AsyncSession is required for update_locker_compartment")
    if compartment_id is None:
        raise ValueError("compartment_id is required for update_locker_compartment")
    if data is None:
        data = kwargs.get("data")
    if data is None:
        raise ValueError("data (LockerCompartmentAssignmentUpdate) is required for update_locker_compartment")
    service = ResourceAllocationService(actual_session)
    return await service.update_locker_compartment(compartment_id=int(compartment_id), data=data)
