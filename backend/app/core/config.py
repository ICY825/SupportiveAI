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

    # --- Đề 3: chuyển phát nhanh ---
    # ⚠️ Ghi rõ tầng và vị trí khi chốt. Chuỗi này in thẳng vào email nên
    #    mơ hồ là người nhận đi tìm nhầm chỗ.
    mail_pickup_location: str = "Khu vực chuyển phát nhanh"
    # Mã nhúng trong QR dán tại khu để đơn. Để trống thì bỏ qua kiểm tra
    # — xem ghi chú ⚠️ ở đầu mail/router.py.
    mail_station_token: str = ""
    # Chu kỳ quét mốc nhắc hạn / tồn đọng. Mốc "sau 2 ngày" trên thực tế
    # là "lần quét đầu tiên sau khi quá 2 ngày", nên chu kỳ càng ngắn thì
    # càng sát. Mỗi ngày chỉ vài chục kiện nên quét mỗi giờ là thoải mái.
    mail_job_interval_minutes: int = 60
    # D7 — bậc khớp theo số điện thoại. File lễ tân hiện **không có** cột
    # này, nhưng nhánh khớp vẫn nằm trong mã: khi nào lễ tân thêm cột thì
    # bật lên bằng biến môi trường, không phải sửa code (CR-001 §4.2 bậc 0).
    mail_match_by_phone: bool = False
    # Ngưỡng "tên gần đúng" ở bậc fuzzy (CR-001 §4.2 bậc 4-5).
    # ⚠️ TẠM ĐẶT — hiệu chỉnh sau vài lô thật, dựa vào bảng phản hồi ở §8.1.
    mail_name_fuzzy_threshold: float = 0.85
    # Dòng nằm ở `Chờ khớp` quá ngần này ngày thì đẩy lên đầu màn hình và
    # cảnh báo trên bảng điều khiển HC (CR-001 §6.3). Không tự chuyển trạng thái.
    mail_pending_match_alert_days: int = 2

    # --- Danh mục nhân sự ---
    # Tên miền của **tài khoản AD** (UPN), ví dụ "vingroup.net". Nếu cột
    # `email` nhập vào trùng tên miền này thì gần như chắc chắn HR lấy nhầm
    # cột tài khoản sang cột hộp thư (CR-001 §3.5, D8). Đây là lỗi im lặng
    # nguy hiểm nhất: thư không tới ai nhưng hệ thống vẫn báo gửi thành công.
    # Để trống thì bỏ qua kiểm tra.
    upn_domain_hint: str = ""

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
