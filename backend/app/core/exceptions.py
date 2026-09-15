from typing import Any, Optional


class SupportiveAIException(Exception):
    """Base application exception."""
    def __init__(self, message: str, status_code: int = 400, details: Optional[Any] = None):
        self.message = message
        self.status_code = status_code
        self.details = details
        super().__init__(message)


class EntityNotFoundError(SupportiveAIException):
    """Raised when an entity is not found in the database."""
    def __init__(self, entity_name: str, entity_id: Any):
        super().__init__(
            message=f"{entity_name} with id '{entity_id}' was not found.",
            status_code=404,
            details={"entity": entity_name, "id": entity_id},
        )


class WorkflowTransitionError(SupportiveAIException):
    """Raised when an invalid state machine transition is attempted."""
    def __init__(self, current_state: str, requested_state: str, reason: Optional[str] = None):
        msg = f"Invalid workflow transition from '{current_state}' to '{requested_state}'."
        if reason:
            msg += f" Reason: {reason}"
        super().__init__(
            message=msg,
            status_code=422,
            details={"current_state": current_state, "requested_state": requested_state},
        )


class ResourceConflictError(SupportiveAIException):
    """Raised when a resource is already assigned or unavailable."""
    def __init__(self, message: str):
        super().__init__(message=message, status_code=409)
