"""Logic nghiệp vụ của danh mục nhân sự."""

from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.exceptions import AuthenticationError, ConflictError, NotFoundError
from app.core.permissions import Principal
from app.core.security import hash_password, verify_password
from app.platform.events import Dispatcher
from app.platform.events import dispatcher as default_dispatcher
from app.shared.employee.events import EmployeeDeactivated
from app.shared.employee.models import EmailSource, Employee, EmployeeRole, EmployeeStatus
from app.shared.employee.normalization import normalize_name, normalize_phone, phone_last4
from app.shared.employee.repository import EmployeeRepository
from app.shared.employee.schemas import EmployeeCreate, EmployeeUpdate


def looks_like_upn(email: str | None) -> bool:
    """Email có đang mang tên miền của tài khoản AD không? (CR-001 §3.5)

    Đây là lỗi im lặng nguy hiểm nhất trong cả phân hệ: nhập nhầm cột tài
    khoản AD sang cột hộp thư thì thư không tới ai, nhưng SMTP vẫn nhận và
    hệ thống vẫn báo gửi thành công. Đồng hồ SLA chạy, kiện chuyển tồn
    đọng, còn người nhận thì không bao giờ biết mình có hàng.

    Để trống `UPN_DOMAIN_HINT` thì không kiểm tra gì — chưa biết tên miền
    AD thì đoán bừa còn tệ hơn.
    """
    hint = (settings.upn_domain_hint or "").strip().lower().lstrip("@")
    if not hint or not email:
        return False
    return email.strip().lower().endswith("@" + hint)


UPN_WARNING = (
    "Email {email} trùng tên miền tài khoản AD ({hint}) — gần như chắc chắn đây là "
    "cột UPN, không phải hộp thư nhận mail. Kiểm tra lại trước khi lưu; nếu đúng là "
    "tài khoản AD thì điền vào ô UPN."
)


class EmployeeService:
    def __init__(self, db: Session, *, dispatcher: Dispatcher | None = None) -> None:
        self.db = db
        self.repo = EmployeeRepository(db)
        self.dispatcher = dispatcher or default_dispatcher

    # --- Đọc ---

    def get(self, employee_id: str) -> Employee:
        employee = self.repo.get(employee_id)
        if employee is None:
            raise NotFoundError(f"Không có nhân sự {employee_id}")
        return employee

    def principal_of(self, employee: Employee) -> Principal:
        return Principal(
            employee_id=employee.id,
            roles=employee.role_names,
            department_id=employee.department_id,
        )

    # --- Ghi ---

    def create(self, payload: EmployeeCreate) -> Employee:
        if self.repo.get_by_code(payload.employee_code):
            raise ConflictError(f"Mã nhân viên {payload.employee_code} đã tồn tại")

        employee = Employee(
            employee_code=payload.employee_code.strip(),
            full_name=payload.full_name.strip(),
            email=(payload.email or "").strip() or None,
            upn=(payload.upn or "").strip() or None,
            email_source=payload.email_source or EmailSource.CONFIRMED,
            department_id=payload.department_id,
            job_title=payload.job_title,
            status=EmployeeStatus.ACTIVE,
        )
        self._apply_normalization(employee, full_name=payload.full_name, phone=payload.phone)
        employee.roles = [EmployeeRole(role=role) for role in dict.fromkeys(payload.roles)]

        try:
            return self.repo.add(employee)
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError(
                "Trùng dữ liệu duy nhất (mã nhân viên, email hoặc số điện thoại)",
                details={"error": str(exc.orig)},
            ) from exc

    def update(self, employee_id: str, payload: EmployeeUpdate) -> Employee:
        employee = self.get(employee_id)
        previously_active = employee.is_active

        if payload.full_name is not None:
            employee.full_name = payload.full_name.strip()
        if payload.email is not None:
            employee.email = payload.email.strip() or None
        if payload.upn is not None:
            employee.upn = payload.upn.strip() or None
        if payload.email_source is not None:
            employee.email_source = payload.email_source
        if payload.department_id is not None:
            employee.department_id = payload.department_id
        if payload.job_title is not None:
            employee.job_title = payload.job_title
        if payload.status is not None:
            employee.status = payload.status
        if payload.roles is not None:
            employee.roles = [EmployeeRole(role=role) for role in dict.fromkeys(payload.roles)]

        self._apply_normalization(
            employee,
            full_name=payload.full_name if payload.full_name is not None else employee.full_name,
            phone=payload.phone if payload.phone is not None else employee.phone,
        )

        try:
            self.db.flush()
        except IntegrityError as exc:
            self.db.rollback()
            raise ConflictError(
                "Trùng dữ liệu duy nhất (email hoặc số điện thoại)",
                details={"error": str(exc.orig)},
            ) from exc

        if previously_active and not employee.is_active:
            self._publish_deactivated(employee)
        return employee

    def deactivate(self, employee_id: str, *, actor_id: str | None = None) -> Employee:
        """Ngừng hoạt động một nhân sự và báo cho các module quan tâm."""
        employee = self.get(employee_id)
        if not employee.is_active:
            return employee
        employee.status = EmployeeStatus.INACTIVE
        self.db.flush()
        self._publish_deactivated(employee, actor_id=actor_id)
        return employee

    def set_password(self, employee_id: str, raw_password: str) -> Employee:
        employee = self.get(employee_id)
        employee.password_hash = hash_password(raw_password)
        self.db.flush()
        return employee

    # --- Đăng nhập ---

    def authenticate(self, employee_code: str, raw_password: str) -> Employee:
        employee = self.repo.get_by_code(employee_code)
        # So sánh mật khẩu kể cả khi không tìm thấy người dùng thì mới
        # tránh lộ "mã này có tồn tại hay không" qua thời gian phản hồi.
        stored = employee.password_hash if employee else None
        matched = verify_password(raw_password, stored) if stored else False
        if employee is None or not matched or not employee.is_active:
            raise AuthenticationError("Mã nhân viên hoặc mật khẩu không đúng")
        return employee

    # --- Chất lượng dữ liệu danh mục (CR-001 §3.5) ---

    @staticmethod
    def data_warnings(employee: Employee) -> list[str]:
        """Cảnh báo hiện ở màn hình nhập danh mục. Không chặn việc ghi."""
        warnings: list[str] = []
        if looks_like_upn(employee.email):
            warnings.append(
                UPN_WARNING.format(
                    email=employee.email,
                    hint=settings.upn_domain_hint.strip().lstrip("@"),
                )
            )
        if not employee.email:
            warnings.append(
                "Nhân sự chưa có email — mọi thông báo gửi cho người này sẽ không tới nơi."
            )
        return warnings

    # --- Nội bộ ---

    @staticmethod
    def _apply_normalization(employee: Employee, *, full_name: str | None, phone: str | None) -> None:
        if full_name is not None:
            employee.full_name_normalized = normalize_name(full_name)
        employee.phone = (phone or "").strip() or None
        employee.phone_normalized = normalize_phone(phone)
        employee.phone_last4 = phone_last4(phone)

    def _publish_deactivated(self, employee: Employee, *, actor_id: str | None = None) -> None:
        self.dispatcher.publish(
            EmployeeDeactivated(
                actor_id=actor_id,
                entity_id=employee.id,
                employee_code=employee.employee_code,
                department_id=employee.department_id,
            )
        )
