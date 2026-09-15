from abc import ABC, abstractmethod
from typing import Optional


class BaseOCREngine(ABC):
    """Abstract interface for OCR implementations (PaddleOCR / Tesseract)."""

    @abstractmethod
    async def extract_text(self, file_bytes: bytes, file_name: str) -> str:
        """Extract text from file bytes."""
        pass


class MockOCREngine(BaseOCREngine):
    """Lightweight development OCR engine simulating extraction from scans."""

    async def extract_text(self, file_bytes: bytes, file_name: str) -> str:
        # Default mock response for testing/development
        return (
            "CỘNG HÒA XÃ HỘI CHỦ NGHĨA VIỆT NAM\n"
            "Độc lập - Tự do - Hạnh phúc\n\n"
            "Số: 142/CV-BXD\n"
            "Hà Nội, ngày 12 tháng 09 năm 2026\n\n"
            "Kính gửi: Công ty Cổ phần Nghiên cứu và Sản xuất Vinsmart\n"
            "V/v: Báo cáo quy hoạch văn phòng và hiện trạng sử dụng diện tích sàn\n\n"
            "Hạn xử lý: 25/09/2026.\n"
            "Nơi nhận: Ban Giám đốc, Phòng Hành chính (để phối hợp)."
        )
