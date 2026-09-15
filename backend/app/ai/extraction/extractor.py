import re
from typing import Any, Dict


class FieldExtractor:
    """Extracts official document metadata fields with confidence scoring."""

    def extract_fields(self, text: str, sections: Dict[str, str]) -> Dict[str, Any]:
        results: Dict[str, Any] = {
            "document_number": None,
            "sender": None,
            "title": None,
            "date_str": None,
            "deadline_str": None,
            "field_confidences": {},
        }

        # 1. Document Number (Số: 142/CV-BXD)
        doc_num_match = re.search(r"Số:\s*([0-9A-Za-z\/\-_]+)", text, re.IGNORECASE)
        if doc_num_match:
            results["document_number"] = doc_num_match.group(1).strip()
            results["field_confidences"]["document_number"] = 0.98
        else:
            results["field_confidences"]["document_number"] = 0.40

        # 2. Date (ngày ... tháng ... năm ...)
        date_match = re.search(r"ngày\s+(\d{1,2})\s+tháng\s+(\d{1,2})\s+năm\s+(\d{4})", text, re.IGNORECASE)
        if date_match:
            d, m, y = date_match.groups()
            results["date_str"] = f"{y}-{int(m):02d}-{int(d):02d}"
            results["field_confidences"]["date_str"] = 0.95
        else:
            results["field_confidences"]["date_str"] = 0.30

        # 3. Deadline (Hạn xử lý: dd/mm/yyyy or dd-mm-yyyy)
        deadline_match = re.search(r"Hạn\s+xử\s+lý:\s*(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})", text, re.IGNORECASE)
        if deadline_match:
            d, m, y = deadline_match.groups()
            results["deadline_str"] = f"{y}-{int(m):02d}-{int(d):02d}"
            results["field_confidences"]["deadline_str"] = 0.92
        else:
            results["field_confidences"]["deadline_str"] = 0.50

        # 4. Title / Subject (V/v: ...)
        subject_match = re.search(r"(?:V\/v|Về việc|Trích yếu):\s*([^\n]+)", text, re.IGNORECASE)
        if subject_match:
            results["title"] = subject_match.group(1).strip()
            results["field_confidences"]["title"] = 0.94
        elif sections.get("subject"):
            results["title"] = sections["subject"].replace("V/v:", "").strip()
            results["field_confidences"]["title"] = 0.85
        else:
            results["field_confidences"]["title"] = 0.50

        # 5. Sender
        sender_match = re.search(r"(?:Cơ quan ban hành|Kính gửi|Bộ|UBND|Sở|Công ty)\s*([^\n]+)", text, re.IGNORECASE)
        if sender_match:
            results["sender"] = sender_match.group(0).strip()
            results["field_confidences"]["sender"] = 0.88
        else:
            results["field_confidences"]["sender"] = 0.40

        return results
