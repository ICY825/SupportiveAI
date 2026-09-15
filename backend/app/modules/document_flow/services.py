import os
from datetime import datetime
from typing import Any, Dict, List, Optional
from fastapi import UploadFile
from sqlalchemy import and_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.ai.agent.orchestrator import AIAgentOrchestrator
from app.core.config import settings
from app.core.exceptions import EntityNotFoundError
from app.shared.contracts.ai import AIExtractionResult
from app.shared.contracts.document import DocumentConfirmRequest, DocumentCreate
from app.shared.contracts.enums import (
    DocumentPriorityEnum,
    DocumentTypeEnum,
    DomainEventEnum,
    WorkflowStateEnum,
)
from app.shared.contracts.event import DomainEvent
from app.shared.events.dispatcher import event_dispatcher
from app.shared.models.ai import AIFeedback, AIPrediction
from app.shared.models.document import Document, DocumentAttachment
from app.workflow.engine import WorkflowEngine


class DocumentFlowService:
    """Service handling Document processing, AI extraction, and Mail tracking."""

    def __init__(self, session: AsyncSession):
        self.session = session
        self.workflow_engine = WorkflowEngine(session)
        self.ai_orchestrator = AIAgentOrchestrator()

    async def list_documents(
        self,
        doc_type: Optional[DocumentTypeEnum] = None,
        recipient_id: Optional[int] = None,
        department_id: Optional[int] = None,
        state: Optional[WorkflowStateEnum] = None,
    ) -> List[Document]:
        stmt = select(Document).options(selectinload(Document.attachments))
        if doc_type:
            stmt = stmt.where(Document.document_type == doc_type.value)
        if recipient_id:
            stmt = stmt.where(Document.recipient_employee_id == recipient_id)
        if department_id:
            stmt = stmt.where(Document.target_department_id == department_id)
        if state:
            stmt = stmt.where(Document.current_state == state.value)

        stmt = stmt.order_by(Document.id.desc())
        res = await self.session.execute(stmt)
        return list(res.scalars().all())

    async def get_document_by_id(self, document_id: int) -> Optional[Document]:
        stmt = (
            select(Document)
            .where(Document.id == document_id)
            .options(selectinload(Document.attachments))
        )
        res = await self.session.execute(stmt)
        return res.scalar_one_or_none()

    async def create_document(self, data: DocumentCreate, actor_id: Optional[int] = None) -> Document:
        doc = Document(
            title=data.title,
            document_number=data.document_number,
            sender=data.sender,
            recipient_employee_id=data.recipient_employee_id,
            target_department_id=data.target_department_id,
            document_type=data.document_type.value,
            priority=data.priority.value,
            issue_date=data.issue_date,
            deadline=data.deadline,
            tracking_code=data.tracking_code,
            carrier=data.carrier,
            current_state=WorkflowStateEnum.CREATED.value,
        )
        self.session.add(doc)
        await self.session.flush()

        # Initialize workflow instance
        await self.workflow_engine.create_instance(
            entity_type="document",
            entity_id=doc.id,
            initial_state=WorkflowStateEnum.CREATED,
            actor_id=actor_id,
            metadata={"title": doc.title, "document_number": doc.document_number},
        )

        return doc

    async def upload_and_process(
        self,
        file: UploadFile,
        title: Optional[str] = None,
        actor_id: Optional[int] = None,
    ) -> Dict[str, Any]:
        """Upload file, save attachment, trigger AI extraction, and create initial task."""
        file_bytes = await file.read()
        file_name = file.filename or "uploaded_document.pdf"

        # Storage directory
        os.makedirs(settings.STORAGE_LOCAL_DIR, exist_ok=True)
        storage_path = os.path.join(settings.STORAGE_LOCAL_DIR, f"{int(datetime.utcnow().timestamp())}_{file_name}")
        with open(storage_path, "wb") as f:
            f.write(file_bytes)

        # Create document
        doc_title = title or f"Document: {file_name}"
        doc = Document(
            title=doc_title,
            document_type=DocumentTypeEnum.INCOMING.value,
            priority=DocumentPriorityEnum.NORMAL.value,
            current_state=WorkflowStateEnum.CREATED.value,
        )
        self.session.add(doc)
        await self.session.flush()

        # Save attachment
        attachment = DocumentAttachment(
            document_id=doc.id,
            file_name=file_name,
            file_path=storage_path,
            file_size_bytes=len(file_bytes),
            mime_type=file.content_type,
        )
        self.session.add(attachment)
        await self.session.flush()

        # Run AI Pipeline
        ai_result: AIExtractionResult = await self.ai_orchestrator.process_document(
            file_bytes=file_bytes,
            file_name=file_name,
            document_id=doc.id,
            session=self.session,
        )

        # Apply extracted fields if confident
        if ai_result.document_number:
            doc.document_number = ai_result.document_number
        if ai_result.sender:
            doc.sender = ai_result.sender
        if ai_result.recipient_id:
            doc.recipient_employee_id = ai_result.recipient_id
        if ai_result.department_id:
            doc.target_department_id = ai_result.department_id

        # Workflow init
        wf = await self.workflow_engine.create_instance(
            entity_type="document",
            entity_id=doc.id,
            initial_state=WorkflowStateEnum.CREATED,
            actor_id=actor_id,
            metadata={
                "ai_confidence": ai_result.confidence_score,
                "ai_decision": ai_result.decision.value,
            },
        )

        # Transition workflow to Assigned/Pending based on confidence
        if ai_result.decision.value == "auto_process":
            await self.workflow_engine.transition(
                instance_id=wf.id,
                target_state=WorkflowStateEnum.ASSIGNED,
                actor_id=actor_id,
                comment="Auto-assigned by AI pipeline (confidence >= 95%)",
            )
            doc.current_state = WorkflowStateEnum.ASSIGNED.value

        # Emit domain event
        event = DomainEvent(
            event_name=DomainEventEnum.DOCUMENT_RECEIVED,
            entity_type="document",
            entity_id=doc.id,
            actor_id=actor_id,
            payload={
                "document_id": doc.id,
                "title": doc.title,
                "recipient_id": doc.recipient_employee_id,
                "department_id": doc.target_department_id,
                "confidence": ai_result.confidence_score,
            },
        )
        await event_dispatcher.publish(event)

        return {
            "document": doc,
            "ai_result": ai_result,
        }

    async def confirm_document(
        self,
        document_id: int,
        request: DocumentConfirmRequest,
    ) -> Document:
        """Human approval step: records feedback on corrections and advances workflow."""
        doc = await self.get_document_by_id(document_id)
        if not doc:
            raise EntityNotFoundError("Document", document_id)

        # Check for previous AI prediction to compute corrections (ground truth)
        stmt = (
            select(AIPrediction)
            .where(
                and_(
                    AIPrediction.entity_type == "document",
                    AIPrediction.entity_id == document_id,
                )
            )
            .order_by(AIPrediction.id.desc())
        )
        pred_res = await self.session.execute(stmt)
        prediction = pred_res.scalars().first()

        if request.corrected_metadata:
            meta = request.corrected_metadata
            # Compare and record corrections
            if meta.document_number and meta.document_number != doc.document_number:
                if prediction:
                    fb = AIFeedback(
                        prediction_id=prediction.id,
                        user_id=request.confirmed_by_id,
                        field_name="document_number",
                        original_value=doc.document_number,
                        corrected_value=meta.document_number,
                        comment=request.comments,
                    )
                    self.session.add(fb)
                doc.document_number = meta.document_number

            if meta.recipient_employee_id and meta.recipient_employee_id != doc.recipient_employee_id:
                if prediction:
                    fb = AIFeedback(
                        prediction_id=prediction.id,
                        user_id=request.confirmed_by_id,
                        field_name="recipient_employee_id",
                        original_value=str(doc.recipient_employee_id),
                        corrected_value=str(meta.recipient_employee_id),
                        comment=request.comments,
                    )
                    self.session.add(fb)
                doc.recipient_employee_id = meta.recipient_employee_id

            if meta.target_department_id:
                doc.target_department_id = meta.target_department_id
            if meta.deadline:
                doc.deadline = meta.deadline

        # Transition workflow to PROCESSING
        wf = await self.workflow_engine.get_instance_by_entity("document", doc.id)
        if wf:
            target_state = WorkflowStateEnum.PROCESSING
            if wf.current_state == WorkflowStateEnum.CREATED.value:
                # If currently Created, move through Assigned to Processing
                await self.workflow_engine.transition(
                    instance_id=wf.id,
                    target_state=WorkflowStateEnum.ASSIGNED,
                    actor_id=request.confirmed_by_id,
                    comment="Human confirmed assignment",
                )
            await self.workflow_engine.transition(
                instance_id=wf.id,
                target_state=target_state,
                actor_id=request.confirmed_by_id,
                comment=request.comments or "Document confirmed by reviewer.",
            )
            doc.current_state = target_state.value

        return doc
