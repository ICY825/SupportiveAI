"""Nơi các module đăng ký workflow của mình."""

from __future__ import annotations

from app.core.exceptions import WorkflowError
from app.platform.workflow.definition import WorkflowDefinition


class WorkflowRegistry:
    def __init__(self) -> None:
        self._definitions: dict[str, WorkflowDefinition] = {}

    def register(self, definition: WorkflowDefinition) -> None:
        existing = self._definitions.get(definition.entity_type)
        if existing is not None and existing is not definition:
            raise WorkflowError(
                f"Workflow cho '{definition.entity_type}' đã được đăng ký bởi module khác"
            )
        self._definitions[definition.entity_type] = definition

    def get(self, entity_type: str) -> WorkflowDefinition:
        try:
            return self._definitions[entity_type]
        except KeyError:
            raise WorkflowError(f"Chưa đăng ký workflow cho '{entity_type}'") from None

    def entity_types(self) -> tuple[str, ...]:
        return tuple(self._definitions)

    def clear(self) -> None:
        self._definitions.clear()


registry = WorkflowRegistry()
