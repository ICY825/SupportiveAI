import logging
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession

from app.ai.classifier.router import RoutingClassifier
from app.ai.extraction.extractor import FieldExtractor
from app.ai.ocr.base import BaseOCREngine, MockOCREngine
from app.ai.parser.layout import LayoutParser
from app.core.config import settings
from app.shared.contracts.ai import AIExtractionResult
from app.shared.contracts.enums import AIProcessingDecisionEnum
from app.shared.models.ai import AIPrediction

logger = logging.getLogger("supportive_ai.ai_agent")


class AIAgentOrchestrator:
    """Orchestrates document OCR, extraction, routing, and confidence validation."""

    def __init__(self, ocr_engine: Optional[BaseOCREngine] = None):
        self.ocr_engine = ocr_engine or MockOCREngine()
        self.layout_parser = LayoutParser()
        self.field_extractor = FieldExtractor()
        self.routing_classifier = RoutingClassifier()

    async def process_document(
        self,
        file_bytes: bytes,
        file_name: str,
        document_id: int,
        session: AsyncSession,
    ) -> AIExtractionResult:
        logger.info("Starting AI pipeline for document %s (%s)", document_id, file_name)

        # 1. OCR
        raw_text = await self.ocr_engine.extract_text(file_bytes, file_name)

        # 2. Layout Parsing
        sections = self.layout_parser.parse_sections(raw_text)

        # 3. Field Extraction
        extracted = self.field_extractor.extract_fields(raw_text, sections)

        # 4. Routing Prediction
        routing = await self.routing_classifier.predict_routing(raw_text, session)

        # Combine confidences
        conf_dict = extracted["field_confidences"]
        conf_dict["department"] = routing["department_confidence"]
        conf_dict["recipient"] = routing["recipient_confidence"]

        # Calculate overall weighted confidence
        avg_confidence = round(sum(conf_dict.values()) / max(len(conf_dict), 1), 3)

        # 5. Evaluate Decision Thresholds per ADD v2 Section 16
        if avg_confidence >= settings.CONFIDENCE_AUTO_PROCESS_THRESHOLD:
            decision = AIProcessingDecisionEnum.AUTO_PROCESS
        elif avg_confidence >= settings.CONFIDENCE_HUMAN_VERIFY_THRESHOLD:
            decision = AIProcessingDecisionEnum.HUMAN_VERIFY
        else:
            decision = AIProcessingDecisionEnum.MANUAL_INPUT

        result = AIExtractionResult(
            document_number=extracted.get("document_number"),
            sender=extracted.get("sender"),
            recipient_candidate=routing.get("recipient_candidate"),
            recipient_id=routing.get("recipient_id"),
            department_candidate=routing.get("department_candidate"),
            department_id=routing.get("department_id"),
            date_str=extracted.get("date_str"),
            deadline_str=extracted.get("deadline_str"),
            summary=extracted.get("title"),
            confidence_score=avg_confidence,
            decision=decision,
            field_confidences=conf_dict,
            raw_ocr_text=raw_text,
        )

        # Save AI prediction record for auditing & KPI ground truth
        prediction = AIPrediction(
            entity_type="document",
            entity_id=document_id,
            task_type="official_document_routing",
            confidence_score=avg_confidence,
            decision=decision.value,
            prediction_data=result.model_dump(),
        )
        session.add(prediction)
        await session.flush()

        logger.info(
            "AI pipeline finished for document %s: confidence=%.2f, decision=%s",
            document_id,
            avg_confidence,
            decision.value,
        )
        return result
