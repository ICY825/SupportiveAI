from datetime import date
from typing import List, Optional
from sqlalchemy import Date, ForeignKey, Integer, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database import Base
from app.shared.contracts.enums import DocumentPriorityEnum, DocumentTypeEnum, WorkflowStateEnum
from app.shared.models.base import TimestampMixin


class Document(Base, TimestampMixin):
    __tablename__ = "documents"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    document_number: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    sender: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    recipient_employee_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("employees.id"), nullable=True)
    target_department_id: Mapped[Optional[int]] = mapped_column(Integer, ForeignKey("departments.id"), nullable=True)
    document_type: Mapped[str] = mapped_column(String(50), default=DocumentTypeEnum.INCOMING.value, nullable=False)
    priority: Mapped[str] = mapped_column(String(50), default=DocumentPriorityEnum.NORMAL.value, nullable=False)
    issue_date: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    deadline: Mapped[Optional[date]] = mapped_column(Date, nullable=True)
    tracking_code: Mapped[Optional[str]] = mapped_column(String(100), index=True, nullable=True)
    carrier: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    current_state: Mapped[str] = mapped_column(String(50), default=WorkflowStateEnum.CREATED.value, nullable=False)

    recipient: Mapped[Optional["Employee"]] = relationship("Employee")
    target_department: Mapped[Optional["Department"]] = relationship("Department")
    attachments: Mapped[List["DocumentAttachment"]] = relationship("DocumentAttachment", back_populates="document")


class DocumentAttachment(Base, TimestampMixin):
    __tablename__ = "document_attachments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True, autoincrement=True)
    document_id: Mapped[int] = mapped_column(Integer, ForeignKey("documents.id"), nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    file_size_bytes: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    mime_type: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)

    document: Mapped["Document"] = relationship("Document", back_populates="attachments")
