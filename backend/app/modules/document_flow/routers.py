from typing import Any, Dict, List, Optional
from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db_session
from app.core.exceptions import EntityNotFoundError
from app.core.security import CurrentUser, get_current_user
from app.modules.document_flow.services import DocumentFlowService
from app.shared.contracts.ai import AIExtractionResult
from app.shared.contracts.document import (
    DocumentAttachmentRead,
    DocumentConfirmRequest,
    DocumentCreate,
    DocumentRead,
)
from app.shared.contracts.enums import DocumentPriorityEnum, DocumentTypeEnum, WorkflowStateEnum
from app.shared.models.document import Document

router = APIRouter(tags=["Document Flow"])


def _to_doc_read(doc: Document) -> DocumentRead:
    attachments = [DocumentAttachmentRead.model_validate(a) for a in doc.attachments] if doc.attachments else []
    return DocumentRead(
        id=doc.id,
        title=doc.title,
        document_number=doc.document_number,
        sender=doc.sender,
        recipient_employee_id=doc.recipient_employee_id,
        target_department_id=doc.target_department_id,
        document_type=DocumentTypeEnum(doc.document_type),
        priority=DocumentPriorityEnum(doc.priority),
        issue_date=doc.issue_date,
        deadline=doc.deadline,
        tracking_code=doc.tracking_code,
        carrier=doc.carrier,
        current_state=WorkflowStateEnum(doc.current_state),
        attachments=attachments,
        created_at=doc.created_at,
        updated_at=doc.updated_at,
    )


@router.get("/documents", response_model=List[DocumentRead])
async def list_documents(
    doc_type: Optional[DocumentTypeEnum] = None,
    recipient_id: Optional[int] = None,
    department_id: Optional[int] = None,
    state: Optional[WorkflowStateEnum] = None,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """List documents with filtering."""
    svc = DocumentFlowService(db)
    docs = await svc.list_documents(
        doc_type=doc_type,
        recipient_id=recipient_id,
        department_id=department_id,
        state=state,
    )
    return [_to_doc_read(d) for d in docs]


@router.get("/documents/{id}", response_model=DocumentRead)
async def get_document(
    id: int,
    db: AsyncSession = Depends(get_db_session),
    _: CurrentUser = Depends(get_current_user),
):
    """Get document details by ID."""
    svc = DocumentFlowService(db)
    doc = await svc.get_document_by_id(id)
    if not doc:
        raise EntityNotFoundError("Document", id)
    return _to_doc_read(doc)


@router.post("/documents", response_model=DocumentRead, status_code=status.HTTP_201_CREATED)
async def create_document(
    data: DocumentCreate,
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Manually create an official document or incoming mail record."""
    svc = DocumentFlowService(db)
    doc = await svc.create_document(data, actor_id=current_user.user_id)
    return _to_doc_read(doc)


@router.post("/documents/upload", status_code=status.HTTP_201_CREATED)
async def upload_document(
    file: UploadFile = File(...),
    title: Optional[str] = Form(None),
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Upload a scanned PDF/image, trigger OCR, extraction, routing, and task creation."""
    svc = DocumentFlowService(db)
    result = await svc.upload_and_process(file=file, title=title, actor_id=current_user.user_id)
    return {
        "document": _to_doc_read(result["document"]),
        "ai_result": result["ai_result"],
    }


@router.post("/documents/{id}/confirm", response_model=DocumentRead)
async def confirm_document(
    id: int,
    request: DocumentConfirmRequest,
    db: AsyncSession = Depends(get_db_session),
    current_user: CurrentUser = Depends(get_current_user),
):
    """Human-in-the-loop review: confirm or correct AI-extracted metadata."""
    svc = DocumentFlowService(db)
    req = request.model_copy(update={"confirmed_by_id": current_user.user_id})
    doc = await svc.confirm_document(document_id=id, request=req)
    return _to_doc_read(doc)
