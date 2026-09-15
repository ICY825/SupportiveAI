import pytest
from httpx import AsyncClient
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from app.shared.models.employee import Employee
from app.shared.models.resource import Resource


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Test that health check returns online and reports system info."""
    response = await client.get("/api/v1/health")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "online"
    assert data["app"] == "SupportiveAI"


@pytest.mark.asyncio
async def test_get_floor_19_layout(client: AsyncClient):
    """Test retrieving complete Floor 19 layout for visual seat editor."""
    response = await client.get("/api/v1/layout/floor-19")
    assert response.status_code == 200
    data = response.json()

    assert data["floor"] == "19"
    assert data["total_seats"] > 0
    assert data["occupied_seats"] > 0
    assert data["available_seats"] > 0
    assert "Zone A" in data["zones"]
    assert "Zone B" in data["zones"]
    assert len(data["seats"]) == data["total_seats"]

    # Verify a seat has coordinate and status data
    first_seat = data["seats"][0]
    assert "x" in first_seat
    assert "y" in first_seat
    assert "status" in first_seat
    assert "code" in first_seat


@pytest.mark.asyncio
async def test_update_seat_position(client: AsyncClient):
    """Test drag and drop position update for seat editor."""
    # First get a seat
    seats_resp = await client.get("/api/v1/seats")
    assert seats_resp.status_code == 200
    seats = seats_resp.json()
    assert len(seats) > 0
    seat_id = seats[0]["id"]

    # Update position
    new_pos = {"x": 550.0, "y": 620.0, "zone": "Zone A"}
    update_resp = await client.put(f"/api/v1/seats/{seat_id}/position", json=new_pos)
    assert update_resp.status_code == 200

    # Verify layout reflects new position
    layout_resp = await client.get("/api/v1/layout/floor-19")
    updated_seat = next(s for s in layout_resp.json()["seats"] if s["id"] == seat_id)
    assert updated_seat["x"] == 550.0
    assert updated_seat["y"] == 620.0


@pytest.mark.asyncio
async def test_seat_assignment_and_release_flow(client: AsyncClient, db_session: AsyncSession):
    """Test assigning an available seat to an employee and then releasing it."""
    # Find an available seat
    layout_resp = await client.get("/api/v1/layout/floor-19")
    available_seats = [s for s in layout_resp.json()["seats"] if s["status"] == "Available"]
    assert len(available_seats) > 0
    target_seat = available_seats[0]

    # Find an employee
    emp_stmt = select(Employee).limit(1)
    emp = (await db_session.execute(emp_stmt)).scalars().first()
    assert emp is not None

    # Assign seat
    assign_payload = {"employee_id": emp.id, "notes": "New seat assignment for test"}
    assign_resp = await client.post(f"/api/v1/seats/{target_seat['id']}/assign", json=assign_payload)
    assert assign_resp.status_code == 201
    assign_data = assign_resp.json()
    assert assign_data["resource_id"] == target_seat["id"]
    assert assign_data["employee_id"] == emp.id

    # Check layout shows seat is now Assigned
    updated_layout = (await client.get("/api/v1/layout/floor-19")).json()
    checked_seat = next(s for s in updated_layout["seats"] if s["id"] == target_seat["id"])
    assert checked_seat["status"] == "Assigned"
    assert checked_seat["assigned_employee"]["id"] == emp.id

    # Now release the seat
    release_resp = await client.post(f"/api/v1/seats/{target_seat['id']}/release")
    assert release_resp.status_code == 200
    assert release_resp.json()["status"] == "Available"

    # Verify layout shows seat available again
    final_layout = (await client.get("/api/v1/layout/floor-19")).json()
    final_seat = next(s for s in final_layout["seats"] if s["id"] == target_seat["id"])
    assert final_seat["status"] == "Available"


@pytest.mark.asyncio
async def test_ai_seat_recommendation(client: AsyncClient, db_session: AsyncSession):
    """Test AI seat recommendation for employee cluster."""
    emp_stmt = select(Employee).where(Employee.employee_code == "EMP005")  # IT employee
    emp = (await db_session.execute(emp_stmt)).scalars().first()
    assert emp is not None

    rec_resp = await client.post("/api/v1/seats/recommend", json={"employee_id": emp.id})
    assert rec_resp.status_code == 200
    rec_data = rec_resp.json()

    assert "recommended_seat_id" in rec_data
    assert "confidence" in rec_data
    assert rec_data["confidence"] > 0.7
    assert "reason" in rec_data


@pytest.mark.asyncio
async def test_resource_stats(client: AsyncClient):
    """Test vacancy and occupancy statistics endpoint."""
    resp = await client.get("/api/v1/resources/stats")
    assert resp.status_code == 200
    data = resp.json()
    assert "seat" in data
    assert data["seat"]["total"] > 0
    assert data["seat"]["available"] >= 0
