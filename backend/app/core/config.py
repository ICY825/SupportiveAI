"""Cấu hình đọc từ biến môi trường.

Mọi hằng số có thể đổi theo môi trường đều nằm ở đây; module nghiệp vụ
không đọc `os.environ` trực tiếp.
"""

from __future__ import annotations

from datetime import time
from functools import lru_cache
from typing import Annotated

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    # --- Ứng dụng ---
    app_name: str = "SupportiveAI"
    debug: bool = False
    api_prefix: str = "/api"

    # --- Database ---
    # Cổng 5433 khớp docker-compose.yml — xem ghi chú ở đó.
    database_url: str = "postgresql+psycopg://supportive:supportive@localhost:5433/supportive_ai"
    db_echo: bool = False

    # --- Bảo mật ---
    # Tối thiểu 32 byte cho HS256. Môi trường thật phải đặt SECRET_KEY riêng.
    secret_key: str = "dev-only-change-me-32-bytes-minimum!!"
    access_token_ttl_minutes: int = 8 * 60
    # Link xác nhận gửi qua email (mail-tracking.md §12)
    confirm_token_ttl_hours: int = 72

    # --- Bật/tắt module (repository-structure.md §7) ---
    # `NoDecode` để pydantic-settings đừng cố đọc giá trị env bằng JSON;
    # nhờ vậy khai báo dạng `seat,locker,mail,document` mới dùng được.
    enabled_modules: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: ["seat", "locker", "mail", "document"]
    )

    # --- Lịch làm việc, dùng để tính SLA theo giờ làm việc ---
    # ⚠️ Giá trị mặc định là TẠM ĐẶT, chưa lấy từ quy định thật của công ty.
    #    Xem docs/architecture/mail-tracking.md §8.4.
    business_days: Annotated[list[int], NoDecode] = Field(
        default_factory=lambda: [0, 1, 2, 3, 4]  # 0 = Thứ Hai
    )
    business_start: time = time(8, 0)
    business_end: time = time(17, 0)
    business_break_start: time | None = time(12, 0)
    business_break_end: time | None = time(13, 0)
    timezone: str = "Asia/Ho_Chi_Minh"

    # --- Gửi email (README B2/B5) ---
    # Để trống smtp_host thì hệ thống dùng OutboxChannel: vẫn lưu đầy đủ
    # vào bảng notification nhưng không gửi đi đâu. Nhờ vậy chạy thử được
    # toàn bộ luồng trước khi có thông số SMTP thật.
    smtp_host: str = ""
    smtp_port: int = 587
    smtp_use_starttls: bool = True      # cổng 587
    smtp_use_ssl: bool = False          # cổng 465, loại trừ với starttls
    smtp_username: str = ""
    smtp_password: str = ""
    smtp_timeout_seconds: int = 20
    # Nên là hộp thư dùng chung của Phòng HC, không phải email cá nhân.
    mail_from: str = ""
    mail_from_name: str = "Phòng Hành chính"

    # --- Lưu trữ file ---
    storage_root: str = "./var/storage"

    @field_validator("enabled_modules", "business_days", mode="before")
    @classmethod
    def _split_csv(cls, v):
        """Cho phép khai báo dạng `seat,locker,mail` trong .env."""
        if isinstance(v, str):
            return [part.strip() for part in v.split(",") if part.strip()]
        return v

    @field_validator("business_days", mode="after")
    @classmethod
    def _coerce_days(cls, v: list) -> list[int]:
        days = [int(d) for d in v]
        if not days:
            raise ValueError("business_days không được rỗng")
        if any(d < 0 or d > 6 for d in days):
            raise ValueError("business_days phải nằm trong 0..6 (0 = Thứ Hai)")
        return sorted(set(days))


@lru_cache
def get_settings() -> Settings:
    return Settings()


settings = get_settings()
