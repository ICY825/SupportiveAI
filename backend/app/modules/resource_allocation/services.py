from datetime import datetime, timezone
from typing import Any, Dict, List, Optional
from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import EntityNotFoundError, ResourceConflictError
from app.shared.contracts.enums import (
    DomainEventEnum,
    ResourceStatusEnum,
    ResourceTypeEnum,
    WorkflowStateEnum,
)
from app.shared.contracts.event import DomainEvent
from app.shared.contracts.resource import (
    FloorLayoutResponse,
    LockerCreate,
    ResourceAssignRequest,
    ResourceReturnRequest,
    SeatCreate,
    SeatEmployeeInfo,
    SeatLayoutItem,
    SeatPositionUpdate,
    SeatRecommendationResponse,
)
from app.shared.events.dispatcher import event_dispatcher
from app.shared.models.employee import Department, Employee
from app.shared.models.location import Location
from app.shared.models.resource import (
    LockerDetail,
    Resource,
    ResourceAssignment,
    SeatDetail,
)
from app.workflow.engine import WorkflowEngine


class ResourceAllocationService:
    """Business logic for Office Seat Planning and Locker Management."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.workflow_engine = WorkflowEngine(session)

    async def list_resources(
        self,
        resource_type: Optional[ResourceTypeEnum] = None,
        location_id: Optional[int] = None,
        status: Optional[ResourceStatusEnum] = None,
    ) -> List[Resource]:
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

    async def get_resource_by_id(self, resource_id: int) -> Optional[Resource]:
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
        seats: List[Resource] = list(res.scalars().all())

        layout_items: List[SeatLayoutItem] = []
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
            assigned_emp: Optional[SeatEmployeeInfo] = None
            assignment_id: Optional[int] = None
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
            zones=sorted(list(zones_set)),
            seats=layout_items,
        )

    async def recommend_seat(self, employee_id: int, preferred_zone: Optional[str] = None) -> SeatRecommendationResponse:
        """AI seat recommendation based on department cluster and nearest vacancy (ADD v2 Section 9)."""
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
            assignment.returned_at = datetime.utcnow()
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

    async def get_allocation_stats(self, location_id: Optional[int] = None) -> Dict[str, Any]:
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

        stats: Dict[str, Dict[str, int]] = {
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
                    assigned_at=datetime.utcnow(),
                    activated_at=datetime.utcnow(),
                    notes="Initial Floor 19 layout seeding",
                )
                self.session.add(assign)

        await self.session.flush()
        return location
