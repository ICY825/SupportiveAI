from typing import Any

from pydantic import BaseModel, ConfigDict, Field, model_validator


class LockerCompartmentCreate(BaseModel):
    compartment_number: str = Field(..., min_length=1, max_length=50)
    status: str | None = "available"
    employee_id: int | None = None
    employee_name: str | None = None
    department: str | None = None
    assigned_date: str | None = None
    recall_due_date: str | None = None
    ai_suggestion: str | None = None
    notes: str | None = None


class LockerCompartmentRead(BaseModel):
    id: str
    code: str
    status: str
    employeeName: str | None = None
    employee_id: int | None = None
    department: str | None = None
    assignedDate: str | None = None
    recallDueDate: str | None = None
    aiSuggestion: str | None = None
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True)


class LockerCreate(BaseModel):
    site: str = Field(..., min_length=1, max_length=50)
    zone: str = Field(..., min_length=1, max_length=100)
    compartment_count: int = Field(..., ge=1, le=50)
    compartment_start: int = Field(default=0, ge=0)

    location_id: int = 1
    row: str | None = None
    lock_type: str | None = "mechanical_key"
    status: str | None = "available"

    # Positioning & display attributes for Đề 2 map & list views
    zone_group: str | None = None
    zone_group_name: str | None = None
    physical_location: str | None = None
    center: list[float] | None = None
    bbox: list[float] | None = None
    size: list[float] | None = None
    is_combined: bool | None = None
    orientation: str | None = None
    rotation: float | None = Field(
        default=None, ge=0.0, le=360.0, description="Rotation angle in degrees (0-360)"
    )
    recall_due_date: str | None = None
    ai_suggestion: str | None = None
    notes: str | None = None

    @model_validator(mode="before")
    @classmethod
    def check_disallowed_assignment_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            disallowed = ["employee_id", "employee_name", "department", "assigned_date"]
            present = [f for f in disallowed if f in data and data[f] is not None]
            if present:
                raise ValueError(
                    "Creating a locker cannot self-assign to users; disallowed fields: "
                    + ", ".join(present)
                )
        return data

    @model_validator(mode="after")
    def validate_compartments(self) -> "LockerCreate":
        if self.compartment_count is None or self.compartment_count < 1 or self.compartment_count > 50:
            raise ValueError("compartment_count must be between 1 and 50")
        if self.compartment_start is None or self.compartment_start < 0:
            raise ValueError("compartment_start must be at least 0")

        start_comp = self.compartment_start
        end_comp = self.compartment_start + self.compartment_count - 1
        if start_comp > end_comp:
            raise ValueError(
                f"Invalid compartment range: start ({start_comp}) cannot exceed end ({end_comp})"
            )
        return self

    @property
    def compartment_range(self) -> list[int]:
        return list(range(self.compartment_start, self.compartment_start + self.compartment_count))


class LockerRead(BaseModel):
    id: str
    resource_id: int
    code: str
    name: str
    zone: str = "Zone A"
    compartment_start: int = 0
    zoneGroup: str
    zoneGroupName: str
    physicalLocation: str
    center: list[float]
    bbox: list[float]
    size: list[float]
    status: str
    employeeName: str | None = None
    employee_id: int | None = None
    department: str | None = None
    assignedDate: str | None = None
    recallDueDate: str | None = None
    aiSuggestion: str | None = None
    notes: str | None = None
    isCombined: bool = False
    orientation: str | None = None
    rotation: float | None = Field(
        default=None, ge=0.0, le=360.0, description="Rotation angle in degrees (0-360)"
    )
    compartments: list[LockerCompartmentRead] | None = None
    location_id: int
    lock_type: str = "mechanical_key"

    model_config = ConfigDict(from_attributes=True, extra="ignore")

    @model_validator(mode="before")
    @classmethod
    def populate_zone_defaults(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("zone") and (data.get("zoneGroup") or data.get("zone_group")):
                data["zone"] = str(data.get("zoneGroup") or data.get("zone_group"))
            if "compartment_start" not in data and "compartmentStart" in data:
                data["compartment_start"] = data["compartmentStart"]
        return data


class LockerDeleteResponse(BaseModel):
    success: bool
    deleted_code: str
    deleted_resource_id: int
    compartments_deleted_count: int
    message: str


class LockerLocationRead(BaseModel):
    id: int
    building: str
    floor: str
    zone: str | None = None
    name: str

    model_config = ConfigDict(from_attributes=True)
