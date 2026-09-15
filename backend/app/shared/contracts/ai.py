from datetime import datetime
from typing import Any, Dict, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.shared.contracts.enums import AIProcessingDecisionEnum


class AIExtractionResult(BaseModel):
    document_number: Optional[str] = None
    sender: Optional[str] = None
    recipient_candidate: Optional[str] = None
    recipient_id: Optional[int] = None
    department_candidate: Optional[str] = None
    department_id: Optional[int] = None
    date_str: Optional[str] = None
    deadline_str: Optional[str] = None
    summary: Optional[str] = None
    confidence_score: float = Field(..., ge=0.0, le=1.0)
    decision: AIProcessingDecisionEnum
    field_confidences: Dict[str, float] = Field(default_factory=dict)
    raw_ocr_text: Optional[str] = None


class AIPredictionCreate(BaseModel):
    entity_type: str
    entity_id: int
    task_type: str  # e.g. "document_extraction", "recipient_routing", "seat_recommendation"
    confidence_score: float
    decision: AIProcessingDecisionEnum
    prediction_data: Dict[str, Any] = Field(default_factory=dict)


class AIPredictionRead(AIPredictionCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class AIFeedbackCreate(BaseModel):
    prediction_id: int
    user_id: int
    field_name: str
    original_value: Optional[str] = None
    corrected_value: str
    comment: Optional[str] = None


class AIFeedbackRead(AIFeedbackCreate):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
