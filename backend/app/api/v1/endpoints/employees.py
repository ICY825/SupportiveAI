from typing import List, Optional
from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.database import get_db_session
from app.core.exceptions import EntityNotFoundError
from app.core.security import CurrentUser, get_current_user
from app.shared.contracts.department import DepartmentCreate, DepartmentRead
from app.shared.contracts.employee import EmployeeCreate, EmployeeRead, EmployeeUpdate
from app.shared.contracts.location import LocationCreate, LocationRead
from app.shared.models.employee import Department, Employee
from app.shared.models.location import Location

router = APIRouter(tags=["Shared Domain - Employees & Org"])


# Employee endpoints per ADD v2 Section 17
@router.get("/employees", response_model=List[EmployeeRead])
async def list_employees(
    department_id: Optional[int] = None,
    is_active: Optional[bool] = None,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """List employees with optional filtering."""
    stmt = select(Employee)
    if department_id:
        stmt = stmt.where(Employee.department_id == department_id)
    if is_active is not None:
        stmt = stmt.where(Employee.is_active == is_active)

    res = await db.execute(stmt)
    return [EmployeeRead.model_validate(e) for e in res.scalars().all()]


@router.get("/employees/{id}", response_model=EmployeeRead)
async def get_employee(
    id: int,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Get single employee by ID."""
    employee = await db.get(Employee, id)
    if not employee:
        raise EntityNotFoundError("Employee", id)
    return EmployeeRead.model_validate(employee)


@router.post("/employees", response_model=EmployeeRead, status_code=status.HTTP_201_CREATED)
async def create_employee(
    data: EmployeeCreate,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Register a new employee into shared platform directory."""
    emp = Employee(
        employee_code=data.employee_code,
        full_name=data.full_name,
        email=data.email,
        department_id=data.department_id,
        title=data.title,
        phone=data.phone,
        is_active=data.is_active,
    )
    db.add(emp)
    await db.flush()
    return EmployeeRead.model_validate(emp)


# Department endpoints
@router.get("/departments", response_model=List[DepartmentRead])
async def list_departments(
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    stmt = select(Department)
    res = await db.execute(stmt)
    return [DepartmentRead.model_validate(d) for d in res.scalars().all()]


@router.post("/departments", response_model=DepartmentRead, status_code=status.HTTP_201_CREATED)
async def create_department(
    data: DepartmentCreate,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    dept = Department(
        code=data.code,
        name=data.name,
        parent_id=data.parent_id,
        description=data.description,
    )
    db.add(dept)
    await db.flush()
    return DepartmentRead.model_validate(dept)


# Location endpoints
@router.get("/locations", response_model=List[LocationRead])
async def list_locations(
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    stmt = select(Location)
    res = await db.execute(stmt)
    return [LocationRead.model_validate(loc) for loc in res.scalars().all()]


@router.post("/locations", response_model=LocationRead, status_code=status.HTTP_201_CREATED)
async def create_location(
    data: LocationCreate,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    loc = Location(
        building=data.building,
        floor=data.floor,
        zone=data.zone,
        name=data.name,
        description=data.description,
    )
    db.add(loc)
    await db.flush()
    return LocationRead.model_validate(loc)
