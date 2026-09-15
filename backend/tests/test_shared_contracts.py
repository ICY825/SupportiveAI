import pytest
from app.shared.contracts import (
    DomainEvent,
    DomainEventEnum,
    EmployeeCreate,
    EmployeeRead,
    FloorLayoutResponse,
    NotificationChannelEnum,
    ResourceStatusEnum,
    ResourceTypeEnum,
    SeatCreate,
    WorkflowInstanceCreate,
    WorkflowStateEnum,
)


def test_shared_contracts_validation():
    """Verify that shared contracts validate types and schemas strictly."""
    # Employee contract
    emp_in = EmployeeCreate(
        employee_code="EMP_TEST",
        full_name="Tester Name",
        email="test@vinsmart.vn",
        title="Admin",
    )
    assert emp_in.employee_code == "EMP_TEST"

    # Workflow contract
    wf_in = WorkflowInstanceCreate(
        entity_type="seat",
        entity_id=10,
        current_state=WorkflowStateEnum.CREATED,
    )
    assert wf_in.current_state == WorkflowStateEnum.CREATED

    # Event contract
    event = DomainEvent(
        event_name=DomainEventEnum.SEAT_CHANGED,
        entity_type="seat",
        entity_id=10,
        payload={"seat_code": "S19-A01"},
    )
    assert event.event_name == DomainEventEnum.SEAT_CHANGED
