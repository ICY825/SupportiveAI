"""Băm mật khẩu, phát/kiểm JWT, và token dùng cho link xác nhận.

Thuần kỹ thuật — không biết gì về nhân sự, thư hay công văn.
"""

from __future__ import annotations

from datetime import timedelta
from typing import Any

import bcrypt
import jwt

from app.core.config import settings
from app.core.database import utcnow
from app.core.exceptions import AuthenticationError

ALGORITHM = "HS256"

# Phân biệt mục đích token để token đăng nhập không dùng thay được token xác nhận.
TOKEN_TYPE_ACCESS = "access"
TOKEN_TYPE_CONFIRM = "confirm"


# --- Mật khẩu ---

def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except ValueError:
        return False


# --- JWT ---

def _encode(payload: dict[str, Any], ttl: timedelta, token_type: str) -> str:
    now = utcnow()
    body = {**payload, "iat": now, "exp": now + ttl, "typ": token_type}
    return jwt.encode(body, settings.secret_key, algorithm=ALGORITHM)


def _decode(token: str, expected_type: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError as exc:
        raise AuthenticationError("Token đã hết hạn") from exc
    except jwt.InvalidTokenError as exc:
        raise AuthenticationError("Token không hợp lệ") from exc
    if payload.get("typ") != expected_type:
        raise AuthenticationError("Token sai mục đích sử dụng")
    return payload


def create_access_token(subject: str, *, roles: list[str] | None = None) -> str:
    return _encode(
        {"sub": subject, "roles": roles or []},
        timedelta(minutes=settings.access_token_ttl_minutes),
        TOKEN_TYPE_ACCESS,
    )


def decode_access_token(token: str) -> dict[str, Any]:
    return _decode(token, TOKEN_TYPE_ACCESS)


def create_confirm_token(entity_type: str, entity_id: str, *, jti: str) -> str:
    """Token cho link xác nhận gửi qua thông báo.

    `jti` là mã duy nhất của lần phát token. Việc đảm bảo **dùng một lần**
    cần một nơi lưu jti đã dùng — xem ghi chú ở cuối file.
    """
    return _encode(
        {"sub": f"{entity_type}:{entity_id}", "ent": entity_type, "eid": entity_id, "jti": jti},
        timedelta(hours=settings.confirm_token_ttl_hours),
        TOKEN_TYPE_CONFIRM,
    )


def decode_confirm_token(token: str) -> dict[str, Any]:
    return _decode(token, TOKEN_TYPE_CONFIRM)


# ⚠️ CHƯA HOÀN CHỈNH — cần quyết định kiến trúc.
#
# mail-tracking.md §12 yêu cầu link xác nhận "có thời hạn, dùng một lần".
# Phần "có thời hạn" đã xong bằng `exp` ở trên. Phần "dùng một lần" cần lưu
# lại các `jti` đã tiêu, mà README §5.4 mô tả xác nhận là cơ chế dùng chung
# cho cả 4 phân hệ — trong khi repository-structure.md §3 lại không có gói
# `platform/confirmation/`. Chưa tự thêm gói mới; xem báo cáo cuối Tuần 1.
