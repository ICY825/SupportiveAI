import pytest
from app.shared.models.employee import Employee
from app.shared.models.location import Location
from app.shared.models.resource import (
    LockerDetail,
    LockerIncident,
    LockerStatusHistory,
)
from sqlalchemy import UniqueConstraint
from sqlalchemy.orm import configure_mappers


def test_locker_detail_no_pin_code():
    """Verify that LockerDetail model and table do NOT contain pin_code column/field."""
    # Check ORM attributes
    assert not hasattr(LockerDetail, "pin_code"), "LockerDetail should not have pin_code attribute"

    # Check Table columns
    column_names = [col.name for col in LockerDetail.__table__.columns]
    assert "pin_code" not in column_names, "LockerDetail table should not have pin_code column"


def test_locker_detail_unique_constraint():
    """Verify unique constraint on (location_id, bank_code, locker_number)."""
    table = LockerDetail.__table__
    expected_cols = {"location_id", "bank_code", "locker_number"}

    matching_constraints = [
        c
        for c in table.constraints
        if isinstance(c, UniqueConstraint) and {col.name for col in c.columns} == expected_cols
    ]

    assert len(matching_constraints) == 1, (
        f"Expected exactly 1 UniqueConstraint covering {expected_cols}, found {len(matching_constraints)}"
    )

    uc = matching_constraints[0]
    assert uc.name == "uq_locker_location_bank_number"


def test_locker_incident_foreign_keys():
    """Verify foreign keys for LockerIncident referencing locker_details and employees."""
    table = LockerIncident.__table__
    fks = {fk.parent.name: fk.target_fullname for fk in table.foreign_keys}

    # locker_detail_id -> locker_details.id
    assert "locker_detail_id" in fks, "LockerIncident must have locker_detail_id foreign key"
    assert fks["locker_detail_id"] == "locker_details.id"

    # reported_by_id -> employees.id
    assert "reported_by_id" in fks, "LockerIncident must have reported_by_id foreign key"
    assert fks["reported_by_id"] == "employees.id"


def test_locker_status_history_foreign_keys():
    """Verify foreign keys for LockerStatusHistory referencing locker_details and employees."""
    table = LockerStatusHistory.__table__
    fks = {fk.parent.name: fk.target_fullname for fk in table.foreign_keys}

    # locker_detail_id -> locker_details.id
    assert "locker_detail_id" in fks, "LockerStatusHistory must have locker_detail_id foreign key"
    assert fks["locker_detail_id"] == "locker_details.id"

    # changed_by_id -> employees.id
    assert "changed_by_id" in fks, "LockerStatusHistory must have changed_by_id foreign key"
    assert fks["changed_by_id"] == "employees.id"


def test_relationships_and_mapper_configuration():
    """Verify configure_mappers succeeds and back_populates match between models."""
    # Ensure mapper configuration succeeds without errors
    configure_mappers()

    # Employee.incidents <-> LockerIncident.reported_by
    emp_incidents_rel = Employee.incidents.property
    assert emp_incidents_rel.back_populates == "reported_by"

    incident_reported_by_rel = LockerIncident.reported_by.property
    assert incident_reported_by_rel.back_populates == "incidents"

    # Location.lockers <-> LockerDetail.location
    loc_lockers_rel = Location.lockers.property
    assert loc_lockers_rel.back_populates == "location"

    locker_location_rel = LockerDetail.location.property
    assert locker_location_rel.back_populates == "lockers"


@pytest.mark.asyncio
async def test_create_and_list_locker_api(client):
    """Verify that creating and listing lockers succeeds asynchronously without MissingGreenlet error."""
    payload = {
        "site": "Bắc",
        "zone": "Khu A",
        "compartment_count": 4,
        "compartment_start": 1,
        "location_id": 1,
        "lock_type": "electronic",
    }
    res = await client.post("/api/v1/lockers", json=payload)
    assert res.status_code == 201
    data = res.json()
    assert data["code"] is not None
    assert len(data["compartments"]) == 4

    # List lockers
    list_res = await client.get("/api/v1/lockers?location_id=1")
    assert list_res.status_code == 200
    lockers = list_res.json()
    assert len(lockers) >= 1
    assert any(lk["id"] == data["id"] for lk in lockers)


def test_compute_building_tag_logic():
    """Verify _compute_building_tag disambiguates common prefixes as requested."""
    from app.modules.resource_allocation.services import _compute_building_tag

    # 1. Standalone / non-conflicting initial -> single uppercase char
    assert _compute_building_tag("Technopark", []) == "T"
    assert _compute_building_tag("Technopark", ["Keangnam", "Landmark"]) == "T"

    # 2. Shared initial prefix (Technopark vs Technotree) -> takes until first differing char
    assert _compute_building_tag("Technopark", ["Technotree"]) == "technop"
    assert _compute_building_tag("Technotree", ["Technopark"]) == "technot"

    # 3. Multiple similar buildings
    others = ["Technotree", "Technozone"]
    assert _compute_building_tag("Technopark", others) == "technop"
    assert _compute_building_tag("Technozone", ["Technopark", "Technotree"]) == "technoz"


@pytest.mark.asyncio
async def test_building_prefix_disambiguation_api(client, db_session):
    """Verify API creates codes like Btechnop16-01 and Btechnot16-01 when buildings have common prefix."""
    from app.shared.models.location import Location

    loc_park = Location(
        building="Technopark",
        floor="16",
        name="Technopark T16",
    )
    loc_tree = Location(
        building="Technotree",
        floor="16",
        name="Technotree T16",
    )
    db_session.add_all([loc_park, loc_tree])
    await db_session.flush()

    # Create locker in Technopark
    res1 = await client.post(
        "/api/v1/lockers",
        json={
            "site": "Bắc",
            "location_id": loc_park.id,
            "zone": "Khu A",
            "compartment_count": 2,
            "compartment_start": 1,
        },
    )
    assert res1.status_code == 201
    code1 = res1.json()["code"]
    assert code1.startswith("Btechnop16-")

    # Create locker in Technotree
    res2 = await client.post(
        "/api/v1/lockers",
        json={
            "site": "Bắc",
            "location_id": loc_tree.id,
            "zone": "Khu B",
            "compartment_count": 2,
            "compartment_start": 1,
        },
    )
    assert res2.status_code == 201
    code2 = res2.json()["code"]
    assert code2.startswith("Btechnot16-")


