from enum import Enum


class WorkflowStateEnum(str, Enum):
    """Generic workflow states per ADD v2 Section 13."""
    CREATED = "Created"
    ASSIGNED = "Assigned"
    PENDING = "Pending"
    PROCESSING = "Processing"
    COMPLETED = "Completed"
    OVERDUE = "Overdue"
    ARCHIVED = "Archived"


class ResourceTypeEnum(str, Enum):
    """Resource types per ADD v2 Section 8-10."""
    SEAT = "seat"
    LOCKER = "locker"


class ResourceStatusEnum(str, Enum):
    """Resource states per ADD v2 Section 8."""
    AVAILABLE = "Available"
    ASSIGNED = "Assigned"
    ACTIVE = "Active"
    RETURN_PENDING = "ReturnPending"
    MAINTENANCE = "Maintenance"


class DocumentTypeEnum(str, Enum):
    """Document classification types."""
    INCOMING = "incoming"
    OUTGOING = "outgoing"
    MAIL = "mail"


class DocumentPriorityEnum(str, Enum):
    """Document priority levels."""
    LOW = "low"
    NORMAL = "normal"
    HIGH = "high"
    URGENT = "urgent"


class DomainEventEnum(str, Enum):
    """Domain events for the Event Bus per ADD v2 Section 14."""
    DOCUMENT_RECEIVED = "DOCUMENT_RECEIVED"
    DOCUMENT_OVERDUE = "DOCUMENT_OVERDUE"
    LOCKER_ASSIGNED = "LOCKER_ASSIGNED"
    LOCKER_RETURNED = "LOCKER_RETURNED"
    SEAT_CHANGED = "SEAT_CHANGED"
    WORKFLOW_TRANSITIONED = "WORKFLOW_TRANSITIONED"
    AI_PREDICTION_READY = "AI_PREDICTION_READY"
    AI_FEEDBACK_RECORDED = "AI_FEEDBACK_RECORDED"


class NotificationChannelEnum(str, Enum):
    """Notification channels per ADD v2 Section 14."""
    EMAIL = "email"
    TEAMS = "teams"
    DASHBOARD = "dashboard"
    QR = "qr"


class AIProcessingDecisionEnum(str, Enum):
    """AI confidence-based decisions per ADD v2 Section 16."""
    AUTO_PROCESS = "auto_process"      # >= 95%
    HUMAN_VERIFY = "human_verify"      # 80-95%
    MANUAL_INPUT = "manual_input"      # < 80%
