from datetime import date, datetime
from typing import Any, Dict, List, Optional
from pydantic import BaseModel, ConfigDict, Field
from app.shared.contracts.enums import DocumentPriorityEnum, DocumentTypeEnum, WorkflowStateEnum


class DocumentMetadata(BaseModel):
    document_number: Optional[str] = None
    sender: Optional[str] = None
    recipient_name: Optional[str] = None
    recipient_employee_id: Optional[int] = None
    target_department_id: Optional[int] = None
    issue_date: Optional[date] = None
    deadline: Optional[date] = None
    priority: DocumentPriorityEnum = DocumentPriorityEnum.NORMAL
    document_type: DocumentTypeEnum = DocumentTypeEnum.INCOMING
    title: Optional[str] = None
    summary: Optional[str] = None
    confidence_score: Optional[float] = None
    extracted_fields: Dict[str, Any] = Field(default_factory=dict)


class DocumentCreate(BaseModel):
    title: str
    document_number: Optional[str] = None
    sender: Optional[str] = None
    recipient_employee_id: Optional[int] = None
    target_department_id: Optional[int] = None
    document_type: DocumentTypeEnum = DocumentTypeEnum.INCOMING
    priority: DocumentPriorityEnum = DocumentPriorityEnum.NORMAL
    issue_date: Optional[date] = None
    deadline: Optional[date] = None
    tracking_code: Optional[str] = None  # for mail
    carrier: Optional[str] = None        # for mail


class DocumentConfirmRequest(BaseModel):
    confirmed_by_id: int
    corrected_metadata: Optional[DocumentMetadata] = None
    comments: Optional[str] = None


class DocumentAttachmentRead(BaseModel):
    id: int
    file_name: str
    file_path: str
    mime_type: Optional[str] = None
    file_size_bytes: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)


class DocumentRead(BaseModel):
    id: int
    title: str
    document_number: Optional[str] = None
    sender: Optional[str] = None
    recipient_employee_id: Optional[int] = None
    target_department_id: Optional[int] = None
    document_type: DocumentTypeEnum
    priority: DocumentPriorityEnum
    issue_date: Optional[date] = None
    deadline: Optional[date] = None
    tracking_code: Optional[str] = None
    carrier: Optional[str] = None
    current_state: WorkflowStateEnum
    attachments: List[DocumentAttachmentRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(from_attributes=True)
