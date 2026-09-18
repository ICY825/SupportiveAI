from typing import Any, Dict, Optional
from sqlalchemy import Float, ForeignKey, Integer, JSON, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.models.base import TimestampMixin


class AIPrediction(Base, TimestampMixin):
    __tablename__ = "ai_predictions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    entity_type: Mapped[str] = mapped_column(String(50), nullable=False)
    entity_id: Mapped[int] = mapped_column(Integer, nullable=False)
    task_type: Mapped[str] = mapped_column(String(100), nullable=False)
    confidence_score: Mapped[float] = mapped_column(Float, nullable=False)
    decision: Mapped[str] = mapped_column(String(50), nullable=False)  # auto_process, human_verify, manual_input
    prediction_data: Mapped[Dict[str, Any]] = mapped_column(JSON, default=dict, nullable=False)

    feedbacks: Mapped[list["AIFeedback"]] = relationship(
        "AIFeedback",
        back_populates="prediction",
        cascade="all, delete-orphan",
    )


class AIFeedback(Base, TimestampMixin):
    __tablename__ = "ai_feedbacks"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    prediction_id: Mapped[int] = mapped_column(Integer, ForeignKey("ai_predictions.id"), nullable=False)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("employees.id"), nullable=False)
    field_name: Mapped[str] = mapped_column(String(100), nullable=False)
    original_value: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    corrected_value: Mapped[str] = mapped_column(Text, nullable=False)
    comment: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)

    prediction: Mapped["AIPrediction"] = relationship("AIPrediction", back_populates="feedbacks")
    user: Mapped["Employee"] = relationship("Employee")
