from typing import Dict, List


class LayoutParser:
    """Segments raw OCR text into semantic layout sections."""

    def parse_sections(self, text: str) -> Dict[str, str]:
        lines = [line.strip() for line in text.split("\n") if line.strip()]
        header_lines: List[str] = []
        subject_lines: List[str] = []
        body_lines: List[str] = []
        footer_lines: List[str] = []

        mode = "header"
        for line in lines:
            line_lower = line.lower()
            if "v/v:" in line_lower or "trích yếu:" in line_lower or "về việc" in line_lower:
                mode = "subject"
            elif "nơi nhận:" in line_lower or "kính gửi:" in line_lower:
                mode = "footer"
            elif mode == "subject" and not ("v/v:" in line_lower or "về việc" in line_lower):
                mode = "body"

            if mode == "header":
                header_lines.append(line)
            elif mode == "subject":
                subject_lines.append(line)
            elif mode == "body":
                body_lines.append(line)
            elif mode == "footer":
                footer_lines.append(line)

        return {
            "header": "\n".join(header_lines),
            "subject": "\n".join(subject_lines),
            "body": "\n".join(body_lines),
            "footer": "\n".join(footer_lines),
        }
