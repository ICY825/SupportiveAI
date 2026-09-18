from typing import Any

from pydantic import AliasChoices, BaseModel, ConfigDict, Field, field_validator, model_validator


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


class LockerCompartmentAssignmentUpdate(BaseModel):
    employee_name: str = Field(..., min_length=1)
    employee_code: str | None = None
    email: str | None = None
    job_title: str | None = None
    department: str | None = None
    assigned_date: str | None = None
    notes: str | None = None

    model_config = ConfigDict(populate_by_name=True, extra="ignore")

    @property
    def employee_email(self) -> str | None:
        return self.email

    @field_validator("employee_name")
    @classmethod
    def validate_employee_name_not_empty(cls, v: str) -> str:
        if not v or not v.strip():
            raise ValueError("Employee name cannot be empty")
        return v.strip()

    @model_validator(mode="before")
    @classmethod
    def normalize_fields(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if "employee_name" not in data and "employeeName" in data:
                data["employee_name"] = data["employeeName"]
            if "employee_code" not in data and "employeeCode" in data:
                data["employee_code"] = data["employeeCode"]
            if "email" not in data and ("employee_email" in data or "employeeEmail" in data):
                data["email"] = data.get("employee_email") or data.get("employeeEmail")
            if "job_title" not in data and "jobTitle" in data:
                data["job_title"] = data["jobTitle"]
            if "assigned_date" not in data and "assignedDate" in data:
                data["assigned_date"] = data["assignedDate"]
        return data


class LockerCompartmentRead(BaseModel):
    id: str
    code: str
    status: str
    employeeName: str | None = Field(
        default=None,
        validation_alias=AliasChoices("employeeName", "employee_name"),
    )
    employeeCode: str | None = None
    employeeEmail: str | None = None
    jobTitle: str | None = None
    employee_id: int | None = None
    department: str | None = None
    assignedDate: str | None = Field(
        default=None,
        validation_alias=AliasChoices("assignedDate", "assigned_date"),
    )
    recallDueDate: str | None = Field(
        default=None,
        validation_alias=AliasChoices("recallDueDate", "recall_due_date"),
    )
    aiSuggestion: str | None = Field(
        default=None,
        validation_alias=AliasChoices("aiSuggestion", "ai_suggestion"),
    )
    notes: str | None = None

    model_config = ConfigDict(from_attributes=True, extra="ignore", populate_by_name=True)

    @property
    def employee_name(self) -> str | None:
        return self.employeeName

    @property
    def employee_code(self) -> str | None:
        return self.employeeCode

    @property
    def employee_email(self) -> str | None:
        return self.employeeEmail

    @property
    def job_title(self) -> str | None:
        return self.jobTitle

    @property
    def assigned_date(self) -> str | None:
        return self.assignedDate

    @property
    def recall_due_date(self) -> str | None:
        return self.recallDueDate

    @model_validator(mode="before")
    @classmethod
    def populate_aliases(cls, data: Any) -> Any:
        if isinstance(data, dict):
            if not data.get("employeeCode") and data.get("employee_code"):
                data["employeeCode"] = data["employee_code"]
            if not data.get("employeeEmail") and (data.get("employee_email") or data.get("email")):
                data["employeeEmail"] = data.get("employee_email") or data.get("email")
            if not data.get("jobTitle") and (data.get("job_title") or data.get("title")):
                data["jobTitle"] = data.get("job_title") or data.get("title")
            if not data.get("employeeName") and data.get("employee_name"):
                data["employeeName"] = data["employee_name"]
            if not data.get("assignedDate") and data.get("assigned_date"):
                data["assignedDate"] = data["assigned_date"]
        return data


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
