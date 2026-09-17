"""Chuẩn hóa số điện thoại và tên trước khi so sánh.

Quy tắc lấy nguyên từ mail-tracking.md §4.1. Đặt ở `shared/employee` chứ
không ở `modules/document_flow/mail` vì chính bảng nhân sự phải lưu dạng
đã chuẩn hóa — nếu hai bên chuẩn hóa khác nhau thì khớp bậc 1 sai ngay.
"""

from __future__ import annotations

import re
import unicodedata

# Ký tự phân tách hay gặp khi người ta gõ số điện thoại bằng tay.
_PHONE_NOISE = re.compile(r"[\s.\-()]+")
_NON_DIGIT = re.compile(r"\D")
_MULTI_SPACE = re.compile(r"\s+")


def normalize_phone(raw: str | None) -> str | None:
    """Đưa số điện thoại về dạng bắt đầu bằng `0`.

    Bỏ khoảng trắng, dấu chấm, gạch ngang, ngoặc; đổi tiền tố `+84`/`84`
    thành `0`. Trả `None` nếu không còn chữ số nào.

    >>> normalize_phone("+84 912.345-678")
    '0912345678'
    >>> normalize_phone("0912 345 678")
    '0912345678'
    """
    if raw is None:
        return None
    cleaned = _PHONE_NOISE.sub("", raw.strip())
    if not cleaned:
        return None

    plus_prefixed = cleaned.startswith("+")
    digits = _NON_DIGIT.sub("", cleaned)
    if not digits:
        return None

    if plus_prefixed and digits.startswith("84"):
        return "0" + digits[2:]
    if digits.startswith("0084"):
        return "0" + digits[4:]
    if digits.startswith("84") and not digits.startswith("840"):
        # "84…" chỉ coi là mã quốc gia khi phần còn lại không tự bắt đầu bằng 0.
        return "0" + digits[2:]
    if digits.startswith("0"):
        return digits
    return "0" + digits


def phone_last4(raw: str | None) -> str | None:
    """4 số cuối, dùng cho khớp bậc 2 (mail-tracking.md §4.2)."""
    normalized = normalize_phone(raw)
    if not normalized or len(normalized) < 4:
        return None
    return normalized[-4:]


def normalize_name(raw: str | None) -> str | None:
    """Chuẩn hóa Unicode, bỏ khoảng trắng thừa, chuyển chữ thường.

    Giữ nguyên dấu tiếng Việt — bỏ dấu sẽ làm "Hà" và "Hạ" trùng nhau.

    >>> normalize_name("  Nguyễn   Văn  A ")
    'nguyễn văn a'
    """
    if raw is None:
        return None
    text = unicodedata.normalize("NFC", raw).strip()
    text = _MULTI_SPACE.sub(" ", text)
    return text.casefold() or None


def strip_accents(raw: str | None) -> str | None:
    """Bản bỏ dấu của tên, dùng cho bậc khớp gần đúng (CR-001 §4.1).

    Bản chính vẫn **giữ nguyên dấu** — bỏ dấu làm "Hà" và "Hạ" trùng nhau,
    nên chỉ dùng ở bậc fuzzy, sau khi bậc khớp chính xác đã trượt.

    >>> strip_accents("Nguyễn Thị Thu")
    'nguyen thi thu'
    """
    normalized = normalize_name(raw)
    if not normalized:
        return None
    # NFD tách dấu thành ký tự tổ hợp riêng, Mn là nhóm dấu đó.
    decomposed = unicodedata.normalize("NFD", normalized)
    without_marks = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    # đ/Đ không phải nguyên âm có dấu nên NFD không tách được.
    return without_marks.replace("đ", "d").replace("Đ", "D") or None


def normalize_sender(raw: str | None) -> str | None:
    """Chuẩn hóa tên người gửi — cùng quy tắc với tên người nhận.

    Dùng cho khóa khử trùng lặp (CR-001 §5.1) và xếp hạng ứng viên theo
    lịch sử (§4.3). Tách thành hàm riêng để sau này đổi quy tắc cho người
    gửi (ví dụ bỏ tiền tố "cty") mà không đụng tới tên nhân sự.
    """
    return normalize_name(raw)
