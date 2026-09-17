"""Khớp người nhận từ dữ liệu thô trong file lễ tân.

Bảy bậc ưu tiên theo CR-001 §4.2. Chuẩn hóa tên dùng chung với danh mục
nhân sự (`shared/employee/normalization.py`) — nếu hai bên chuẩn hóa khác
nhau thì bậc khớp chính xác sai ngay.

**Vì sao thiết kế đổi (CR-001 D3):** file mẫu thật không có số điện thoại,
nên khóa khớp bậc 1 cũ không còn nguồn dữ liệu. Tên trên phong bì lại viết
không chuẩn — thiếu họ, viết tắt, hoa thường lẫn lộn — nên không quy tắc
nào khớp được lần đầu. Cái khớp được là **trí nhớ về lần HC đã chọn**:
bảng `matching_alias` trở thành cơ chế khớp chính, không phải tính năng phụ.

Hệ quả: tỷ lệ khớp tự động thấp ở tuần đầu rồi tăng dần. Đó là hành vi
đúng của thiết kế này, không phải lỗi — xem ghi chú về báo cáo theo tuần ở
CR-001 §8.2.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from difflib import SequenceMatcher

from sqlalchemy.orm import Session

from app.core.config import settings
from app.modules.document_flow.mail.models import MatchMethod, MatchTier
from app.modules.document_flow.mail.repository import MailRepository
from app.shared.employee.models import Employee
from app.shared.employee.normalization import normalize_name, normalize_sender, strip_accents
from app.shared.employee.repository import EmployeeRepository

# Quy ước điểm tin cậy, để báo cáo so sánh được giữa các bậc.
CONFIDENCE_PHONE = 1.0
CONFIDENCE_ALIAS = 1.0
CONFIDENCE_NAME_EXACT = 0.8
CONFIDENCE_AMBIGUOUS = 0.3
CONFIDENCE_NONE = 0.0


def name_similarity(a: str | None, b: str | None) -> float:
    """Độ giống nhau của hai tên **có dấu**, trong khoảng 0–1.

    Giữ nguyên dấu có chủ đích: "Nguyễn Văn An" và "Nguyễn Văn Ân" là hai
    người khác nhau, và hàm này phải phân biệt được — nó còn dùng để xếp
    hạng ứng viên, chỗ mà gộp hai người lại là hỏng.

    Việc bỏ dấu là chuyện riêng của bậc fuzzy, xem `name_similarity_plain`.
    """
    left, right = normalize_name(a), normalize_name(b)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    return SequenceMatcher(None, left, right).ratio()


def name_similarity_plain(a: str | None, b: str | None) -> float:
    """Như trên nhưng **bỏ dấu** — chỉ dùng ở bậc khớp gần đúng.

    "nguyen thi thu" gõ không dấu và "Nguyễn Thị Thu" trong hồ sơ là cùng
    một người, nhưng so chuỗi có dấu thì điểm tụt hẳn vì mỗi nguyên âm là
    một ký tự khác.

    Đánh đổi đã biết: bỏ dấu làm "An" và "Ân" trùng nhau. Chấp nhận được vì
    bậc này ra nhiều ứng viên thì kết quả là `choose` — HC chọn, máy không
    tự quyết (CR-001 §4.2 bậc 5).
    """
    left, right = strip_accents(a), strip_accents(b)
    if not left or not right:
        return 0.0
    if left == right:
        return 1.0
    return SequenceMatcher(None, left, right).ratio()


def name_contains(a: str | None, b: str | None) -> bool:
    """Tên này có nằm trọn trong tên kia không, sau khi bỏ dấu.

    Bắt kiểu viết phổ biến nhất trên phong bì: thiếu họ. "Lương hiền" so
    với "Nguyễn Thị Lương Hiền" trong hồ sơ nhân sự.

    Chặn hai chỗ dễ khớp bừa:

    * chuỗi ngắn phải có **ít nhất hai từ** — nếu không thì "An" khớp với
      mọi cái tên có chữ "an" trong đó;
    * phải khớp ở **ranh giới từ**, để "hien" không khớp vào "thiện".
    """
    left, right = strip_accents(a), strip_accents(b)
    if not left or not right:
        return False
    shorter, longer = sorted((left, right), key=len)
    if " " not in shorter:
        return False
    return f" {shorter} " in f" {longer} "


@dataclass(frozen=True)
class MatchCandidate:
    """Một ứng viên để HC chọn ở màn hình soát."""

    employee_id: str
    employee_code: str
    full_name: str
    department_id: str | None
    score: float
    sender_history: int = 0

    @classmethod
    def of(cls, employee: Employee, score: float, *, sender_history: int = 0) -> MatchCandidate:
        return cls(
            employee_id=employee.id,
            employee_code=employee.employee_code,
            full_name=employee.full_name,
            department_id=employee.department_id,
            score=round(score, 2),
            sender_history=sender_history,
        )


@dataclass(frozen=True)
class MatchResult:
    method: str
    tier: str
    employee_id: str | None = None
    confidence: float = CONFIDENCE_NONE
    candidates: tuple[MatchCandidate, ...] = field(default_factory=tuple)

    @property
    def matched(self) -> bool:
        return self.employee_id is not None

    @property
    def needs_review(self) -> bool:
        """Chỉ `confirmed` mới được gửi thẳng (CR-001 §4.2)."""
        return self.tier != MatchTier.CONFIRMED


class RecipientMatcher:
    """Chạy các bậc khớp theo thứ tự, dừng ở bậc đầu tiên cho kết quả."""

    def __init__(
        self,
        db: Session,
        *,
        fuzzy_threshold: float | None = None,
        match_by_phone: bool | None = None,
        active_only: bool = True,
    ) -> None:
        self.db = db
        self.employees = EmployeeRepository(db)
        self.mail = MailRepository(db)
        self.fuzzy_threshold = (
            settings.mail_name_fuzzy_threshold if fuzzy_threshold is None else fuzzy_threshold
        )
        # D7 — file hiện tại không có cột số điện thoại, nên mặc định tắt.
        # Bật bằng cấu hình khi lễ tân thêm cột; không phải sửa code.
        self.match_by_phone = (
            settings.mail_match_by_phone if match_by_phone is None else match_by_phone
        )
        self.active_only = active_only

    def match(
        self,
        *,
        name_raw: str | None,
        sender_raw: str | None = None,
        phone_raw: str | None = None,
    ) -> MatchResult:
        sender_normalized = normalize_sender(sender_raw)

        by_phone = self._tier0_phone(phone_raw)
        if by_phone is not None:
            return by_phone

        by_alias = self._tier1_alias(name_raw)
        if by_alias is not None:
            return by_alias

        by_exact = self._tier23_name_exact(name_raw, sender_normalized)
        if by_exact is not None:
            return by_exact

        by_fuzzy = self._tier45_name_fuzzy(name_raw, sender_normalized)
        if by_fuzzy is not None:
            return by_fuzzy

        # Bậc 6 — không ra ứng viên nào. `choose`, không phải `review`:
        # không có gì để soát, HC phải tự tìm người.
        return MatchResult(method=MatchMethod.NONE, tier=MatchTier.CHOOSE)

    # --- Bậc 0: số điện thoại trùng khớp chính xác (D7) ---

    def _tier0_phone(self, phone_raw: str | None) -> MatchResult | None:
        if not self.match_by_phone:
            return None
        employee = self.employees.find_by_phone(phone_raw, active_only=self.active_only)
        if employee is None:
            return None
        # `phone_normalized` có ràng buộc UNIQUE nên tới đây chắc chắn chỉ
        # có một người — không cần khử nhập nhằng.
        return MatchResult(
            method=MatchMethod.PHONE,
            tier=MatchTier.CONFIRMED,
            employee_id=employee.id,
            confidence=CONFIDENCE_PHONE,
            candidates=(MatchCandidate.of(employee, CONFIDENCE_PHONE),),
        )

    # --- Bậc 1: alias đã học từ lần HC chọn ---

    def _tier1_alias(self, name_raw: str | None) -> MatchResult | None:
        alias = self.mail.find_alias(normalize_name(name_raw))
        if alias is None:
            return None
        employee = self.employees.get(alias.employee_id)
        if employee is None or (self.active_only and not employee.is_active):
            # Người đã nghỉ việc hoặc bị xóa — alias cũ không dùng được nữa,
            # rơi xuống bậc sau thay vì khớp vào một người không còn tồn tại.
            return None
        return MatchResult(
            method=MatchMethod.ALIAS,
            tier=MatchTier.CONFIRMED,
            employee_id=employee.id,
            confidence=CONFIDENCE_ALIAS,
            candidates=(MatchCandidate.of(employee, CONFIDENCE_ALIAS),),
        )

    # --- Bậc 2/3: tên chuẩn hóa khớp chính xác ---

    def _tier23_name_exact(
        self, name_raw: str | None, sender_normalized: str | None
    ) -> MatchResult | None:
        pool = self.employees.find_by_name(name_raw, active_only=self.active_only)
        if not pool:
            return None

        ranked = self._rank([(e, 1.0) for e in pool], sender_normalized)
        if len(ranked) == 1:
            return MatchResult(
                method=MatchMethod.NAME_EXACT,
                tier=MatchTier.CONFIRMED,
                employee_id=ranked[0].employee_id,
                confidence=CONFIDENCE_NAME_EXACT,
                candidates=ranked,
            )
        # Trùng tên — không đoán. Danh sách đã xếp hạng, HC chọn.
        return MatchResult(
            method=MatchMethod.NAME_EXACT,
            tier=MatchTier.CHOOSE,
            confidence=CONFIDENCE_AMBIGUOUS,
            candidates=ranked,
        )

    # --- Bậc 4/5: khớp gần đúng ---

    def _tier45_name_fuzzy(
        self, name_raw: str | None, sender_normalized: str | None
    ) -> MatchResult | None:
        normalized = normalize_name(name_raw)
        if not normalized:
            return None

        scored: list[tuple[Employee, float]] = []
        for employee in self.employees.list_all(active_only=self.active_only):
            passed, score = self._fuzzy_score(name_raw, employee)
            if passed:
                scored.append((employee, score))
        if not scored:
            return None

        ranked = self._rank(scored, sender_normalized)
        if len(ranked) == 1:
            # Điền sẵn nhưng **đánh dấu**: khớp gần đúng đủ tốt để đề xuất,
            # không đủ tin để gửi mà không ai nhìn.
            return MatchResult(
                method=MatchMethod.NAME_FUZZY,
                tier=MatchTier.REVIEW,
                employee_id=ranked[0].employee_id,
                confidence=ranked[0].score,
                candidates=ranked,
            )
        return MatchResult(
            method=MatchMethod.NAME_FUZZY,
            tier=MatchTier.CHOOSE,
            confidence=CONFIDENCE_AMBIGUOUS,
            candidates=ranked,
        )

    def _fuzzy_score(self, name_raw: str | None, employee: Employee) -> tuple[bool, float]:
        """`(có lọt bậc fuzzy không, điểm để xếp hạng)`.

        CR-001 §4.2 bậc 4 nêu **hai** điều kiện độc lập: "bỏ dấu, **hoặc**
        chứa nhau". Nên chúng là hai cửa vào riêng, không phải một điểm số
        chung — tên thiếu họ ("Lương hiền" so với "Nguyễn Thị Lương Hiền")
        có tỷ lệ giống nhau rất thấp nhưng vẫn là ứng viên đúng.

        Điểm trả về vẫn là độ giống nhau, chỉ dùng để xếp thứ tự và ghi vào
        `match_confidence`.
        """
        plain = name_similarity_plain(name_raw, employee.full_name)
        if plain >= self.fuzzy_threshold:
            return True, plain
        if name_contains(name_raw, employee.full_name):
            return True, plain
        return False, plain

    # --- Xếp hạng ứng viên (CR-001 §4.3) ---

    def _rank(
        self, scored: list[tuple[Employee, float]], sender_normalized: str | None
    ) -> tuple[MatchCandidate, ...]:
        """Xếp: lịch sử cùng người gửi → độ giống tên → bảng chữ cái.

        Tín hiệu đầu thay cho tín hiệu "đơn vị" cũ (D4): file không còn cột
        phòng ban, nhưng ai từng nhận hàng từ "cty nam hải" thì lần sau
        nhiều khả năng vẫn là họ. Lịch sử lấy từ chính bảng `mail_item`,
        không tạo bảng mới.
        """
        history = self.mail.sender_history(sender_normalized) if sender_normalized else {}
        ordered = sorted(
            scored,
            key=lambda pair: (
                -history.get(pair[0].id, 0),
                -pair[1],
                pair[0].full_name.casefold(),
            ),
        )
        return tuple(
            MatchCandidate.of(employee, score, sender_history=history.get(employee.id, 0))
            for employee, score in ordered
        )
