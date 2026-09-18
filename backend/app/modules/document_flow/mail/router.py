"""API của phân hệ chuyển phát nhanh (mail-tracking.md §11, CR-001 §6)."""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, File, Header, Query, Response, UploadFile

from app.core.config import settings
from app.core.exceptions import NotFoundError, PermissionDeniedError
from app.modules.document_flow.mail import importer
from app.modules.document_flow.mail.models import HandoverMethod, MailItem, MailStatus
from app.modules.document_flow.mail.permissions import (
    PERM_MANAGE,
    PERM_REPORT,
    PERM_VIEW_OWN,
)
from app.modules.document_flow.mail.repository import MailRepository
from app.modules.document_flow.mail.schemas import (
    AssignRecipient,
    BatchSummary,
    CollectRequest,
    ConfirmLinkCollect,
    ConfirmLinkLookup,
    ConfirmLinkView,
    ConfirmReview,
    DuplicateReference,
    ImportResult,
    KeepDuplicate,
    MailBatchDetail,
    MailBatchRead,
    MailItemRead,
    MailItemReview,
    MailRow,
    MatchCandidateRead,
    PendingMatchItem,
    SameDateBatch,
    SendResult,
    StationItem,
    StationLookup,
    StationSign,
)
from app.modules.document_flow.mail.service import MailService
from app.shared.employee.dependencies import CurrentEmployee, CurrentPrincipal, DbSession, requires

router = APIRouter(prefix="/mail", tags=["mail"])

HcPrincipal = Annotated[CurrentPrincipal, Depends(requires(PERM_MANAGE))]
ReportPrincipal = Annotated[CurrentPrincipal, Depends(requires(PERM_REPORT))]
OwnPrincipal = Annotated[CurrentPrincipal, Depends(requires(PERM_VIEW_OWN))]


# ----------------------------------------------------------------------
# Khu để đơn — KHÔNG yêu cầu đăng nhập
# ----------------------------------------------------------------------
#
# Phần lớn CBNV không có tài khoản, mà người nhận phải xác nhận được ngay
# tại chỗ để đơn (§7.2). Nên hai endpoint dưới đây là công khai.
#
# ⚠️ CHƯA CHỐT — cách chặn lạm dụng. Hiện yêu cầu một `station token` nhúng
#    sẵn trong mã QR dán tại khu để đơn: nó không định danh ai, chỉ chứng
#    minh "người gọi đã nhìn thấy tấm biển". Không có nó thì bất kỳ ai
#    trong mạng nội bộ cũng gõ được 4 số bất kỳ rồi bấm xác nhận hộ người
#    khác — kiện biến khỏi màn hình quá hạn của HC còn người thật thì không
#    bao giờ được nhắc nữa.
#
#    Để trống `MAIL_STATION_TOKEN` thì bỏ qua kiểm tra (tiện chạy thử).


def verify_station_token(
    x_station_token: Annotated[str | None, Header(alias="X-Station-Token")] = None,
) -> None:
    expected = settings.mail_station_token
    if not expected:
        return
    if x_station_token != expected:
        raise PermissionDeniedError("Thiếu hoặc sai mã trạm — hãy quét lại mã QR tại khu để đơn")


StationGuard = Depends(verify_station_token)


@router.post("/station/lookup", response_model=list[StationItem], dependencies=[StationGuard])
def station_lookup(payload: StationLookup, db: DbSession) -> list[StationItem]:
    """Người nhận gõ 4 số cuối điện thoại để tìm kiện của mình.

    Bốn số lấy từ `employee.phone_last4` (nguồn HR), không lấy từ file lễ
    tân — CR-001 §9 xác nhận màn hình này không đổi.
    """
    return MailService(db).lookup_station(payload.phone_last4)


@router.post("/station/collect/{item_id}", response_model=MailItemRead, dependencies=[StationGuard])
def station_collect(item_id: str, db: DbSession) -> MailItemRead:
    """Xác nhận đã nhận, quét tại khu để đơn — đường chính (§7.2)."""
    item = MailService(db).confirm_collect(
        item_id, handover_method=HandoverMethod.SELF_QR_STATION
    )
    return MailItemRead.model_validate(item)


# ----------------------------------------------------------------------
# Link trong email — KHÔNG yêu cầu đăng nhập, xác thực bằng token
# ----------------------------------------------------------------------
#
# Token ký bằng SECRET_KEY, mang người nhận + đúng các kiện trong email đó,
# hạn `CONFIRM_TOKEN_TTL_HOURS`. Không cần mã trạm: người có link đã chứng
# minh được mình đọc được email.


def _confirm_view(employee, items: list[MailItem]) -> ConfirmLinkView:
    return ConfirmLinkView(
        recipient_name=employee.full_name,
        items=[
            StationItem(
                item_id=i.id,
                sender=i.sender_raw,
                content_type=i.content_type,
                quantity=i.quantity,
                recipient_name=employee.full_name,
                received_at=i.received_at,
                status=i.status,
            )
            for i in items
        ],
    )


@router.post("/confirm/lookup", response_model=ConfirmLinkView)
def confirm_link_lookup(payload: ConfirmLinkLookup, db: DbSession) -> ConfirmLinkView:
    """Người nhận mở link trong email: hiện các kiện của email đó."""
    employee, items = MailService(db).confirm_link_items(payload.token)
    return _confirm_view(employee, items)


@router.post("/confirm/collect", response_model=ConfirmLinkView)
def confirm_link_collect(payload: ConfirmLinkCollect, db: DbSession) -> ConfirmLinkView:
    """Xác nhận đã nhận các kiện được chọn, rồi trả lại trạng thái mới."""
    service = MailService(db)
    service.confirm_by_link(payload.token, payload.item_ids)
    employee, items = service.confirm_link_items(payload.token)
    return _confirm_view(employee, items)


# ----------------------------------------------------------------------
# Nhân viên HC
# ----------------------------------------------------------------------


@router.get("/station/sign", response_model=StationSign)
def station_sign(principal: HcPrincipal) -> StationSign:
    """Mã QR để in dán tại khu để đơn. Chỉ HC — URL chứa mã trạm."""
    return StationSign(**MailService.station_sign())


def _import_result(db, batch, warnings: list[str] | None = None) -> ImportResult:
    repo = MailRepository(db)
    return ImportResult(
        batch_id=batch.id,
        row_count=batch.row_count,
        matched_count=batch.matched_count,
        summary=BatchSummary(**repo.review_summary(batch.id)),
        same_date_batches=[
            SameDateBatch(
                batch_id=b.id,
                source_filename=b.source_filename,
                uploaded_at=b.uploaded_at,
                row_count=b.row_count,
            )
            for b in repo.batches_on_date(batch.receipt_date, exclude_batch_id=batch.id)
        ],
        warnings=warnings or [],
    )


@router.post("/batches/upload", response_model=ImportResult)
def upload_batch(
    db: DbSession,
    principal: HcPrincipal,
    file: Annotated[UploadFile, File()],
) -> ImportResult:
    """Tải file danh sách của lễ tân (`.xlsx` khuyến nghị, `.csv` cũng nhận).

    Cấu trúc 6 cột theo file mẫu thật — xem `importer.py`. Ngày trong file
    mơ hồ thì importer **không đoán**: lô được đánh dấu `ambiguous_date` và
    màn hình soát bắt HC xác nhận (CR-001 §3.4).
    """
    content = file.file.read()
    report = importer.read_file(file.filename or "", content)
    batch = MailService(db).import_rows(
        report.rows,
        source_filename=file.filename or "khong-ro-ten-file",
        uploaded_by=principal.employee_id,
        ambiguous_date=report.ambiguous_date,
    )
    return _import_result(db, batch, report.warnings)


@router.post("/batches", response_model=ImportResult)
def create_batch(
    rows: list[MailRow],
    db: DbSession,
    principal: HcPrincipal,
    source_filename: str = Query(default="nhap-tay"),
) -> ImportResult:
    """Nạp danh sách kiện từ các dòng đã đọc sẵn.

    Lối vào cho kiện lẻ nhập tay và cho test. Luồng chính là
    `POST /mail/batches/upload`.
    """
    batch = MailService(db).import_rows(
        rows, source_filename=source_filename, uploaded_by=principal.employee_id
    )
    return _import_result(db, batch)


@router.get("/batches", response_model=list[MailBatchRead])
def list_batches(db: DbSession, principal: HcPrincipal) -> list[MailBatchRead]:
    return [MailBatchRead.model_validate(b) for b in MailRepository(db).list_batches()]


@router.get("/batches/{batch_id}", response_model=MailBatchDetail)
def get_batch(batch_id: str, db: DbSession, principal: HcPrincipal) -> MailBatchDetail:
    """Màn hình soát trước khi gửi (§5, CR-001 §7).

    Trả về **toàn bộ** dòng, kèm mức chắc chắn (`match_tier`) để màn hình
    phân ba nhóm: khớp chắc / cần soát / phải chọn. Dòng chưa chắc chắn kèm
    danh sách ứng viên đã xếp hạng theo lịch sử người gửi (§4.3).
    """
    repo = MailRepository(db)
    batch = repo.get_batch(batch_id)
    if batch is None:
        raise NotFoundError(f"Không có lô {batch_id}")

    service = MailService(db)
    thieu_email = repo.employees_without_email(batch_id)
    items = []
    for item in repo.items_of_batch(batch_id):
        review = MailItemReview.model_validate(
            {
                **MailItemRead.model_validate(item).model_dump(),
                "needs_review": item.needs_review,
                "ready_to_send": item.ready_to_send,
                "missing_email": item.id in thieu_email,
            }
        )
        if item.duplicate_of is not None:
            previous = item.duplicate_of
            review.duplicate_of = DuplicateReference(
                item_id=previous.id,
                batch_id=previous.batch_id,
                receipt_date=previous.receipt_date,
                quantity=previous.quantity,
                sent_at=previous.notified_at,
            )
        if item.needs_review:
            review.candidates = [
                MatchCandidateRead(**vars(c)) for c in service.candidates_for(item)
            ]
        items.append(review)

    return MailBatchDetail(
        **MailBatchRead.model_validate(batch).model_dump(),
        summary=BatchSummary(**repo.review_summary(batch_id)),
        items=items,
        same_date_batches=[
            SameDateBatch(
                batch_id=b.id,
                source_filename=b.source_filename,
                uploaded_at=b.uploaded_at,
                row_count=b.row_count,
            )
            for b in repo.batches_on_date(batch.receipt_date, exclude_batch_id=batch.id)
        ],
    )


@router.delete("/batches/{batch_id}", status_code=204)
def delete_batch(batch_id: str, db: DbSession, principal: HcPrincipal) -> Response:
    """Xóa lô tải nhầm file. Chỉ được khi chưa dòng nào gửi thông báo (409 nếu đã gửi)."""
    MailService(db).delete_batch(batch_id, actor_id=principal.employee_id)
    return Response(status_code=204)


@router.patch("/items/{item_id}", response_model=MailItemRead)
def assign_recipient(
    item_id: str, payload: AssignRecipient, db: DbSession, principal: HcPrincipal
) -> MailItemRead:
    """HC chọn hoặc sửa người nhận của một dòng.

    Kèm theo: học alias cho lần sau (§3.3), ghi lại can thiệp để tính KPI
    (§8.1), và áp cho mọi dòng cùng tên trong lô (§4.4).
    """
    item = MailService(db).assign_recipient(
        item_id,
        payload.employee_id,
        note=payload.note,
        apply_to_batch=payload.apply_to_batch,
        actor_id=principal.employee_id,
    )
    return MailItemRead.model_validate(item)


@router.post("/items/{item_id}/confirm", response_model=MailItemRead)
def confirm_review(
    item_id: str, payload: ConfirmReview, db: DbSession, principal: HcPrincipal
) -> MailItemRead:
    """Xác nhận nhanh một dòng ở mức `review` (CR-001 §7.2)."""
    item = MailService(db).confirm_review(item_id, confirmed=payload.confirmed)
    return MailItemRead.model_validate(item)


@router.post("/items/{item_id}/keep-duplicate", response_model=MailItemRead)
def keep_duplicate(
    item_id: str, payload: KeepDuplicate, db: DbSession, principal: HcPrincipal
) -> MailItemRead:
    """Giữ lại một dòng bị nghi trùng (CR-001 §5.2).

    Mặc định dòng nghi trùng không gửi, nhưng HC phải bấm giữ lại được —
    âm thầm nuốt dữ liệu là kiểu hỏng tệ nhất.
    """
    item = MailService(db).keep_duplicate(item_id, keep=payload.keep)
    return MailItemRead.model_validate(item)


@router.post("/items/{item_id}/send", response_model=MailItemRead)
def send_item(item_id: str, db: DbSession, principal: HcPrincipal) -> MailItemRead:
    """Gửi ngay một dòng vừa gán người nhận ở màn hình "Chờ khớp" (§6.2).

    Mốc SLA của dòng này tính từ đây, không phải từ lần lô được gửi đầu tiên.
    """
    item = MailService(db).send_item(item_id, actor_id=principal.employee_id)
    return MailItemRead.model_validate(item)


@router.post("/batches/{batch_id}/send", response_model=SendResult)
def send_batch(batch_id: str, db: DbSession, principal: HcPrincipal) -> SendResult:
    """HC bấm gửi. Thông báo đi hàng loạt, gộp theo người (§6.1).

    **Gọi lại được nhiều lần** (CR-001 D5): mỗi lần gửi những dòng đã sẵn
    sàng và bỏ qua những dòng đã gửi ở đợt trước. Dòng chưa khớp được không
    chặn phần còn lại của lô.
    """
    return SendResult(**MailService(db).send_batch(batch_id, actor_id=principal.employee_id))


@router.post("/items/{item_id}/collect", response_model=MailItemRead)
def hc_collect(
    item_id: str, payload: CollectRequest, db: DbSession, principal: HcPrincipal
) -> MailItemRead:
    """HC đối chiếu tờ ký giấy và tick những kiện chưa ai bấm (§7.3)."""
    item = MailService(db).confirm_collect(
        item_id,
        handover_method=payload.handover_method or HandoverMethod.HC_RECONCILED,
        collected_by=principal.employee_id,
    )
    return MailItemRead.model_validate(item)


@router.get("/items/pending-match", response_model=list[PendingMatchItem])
def list_pending_match(db: DbSession, principal: HcPrincipal) -> list[PendingMatchItem]:
    """Màn hình "Chờ khớp" xuyên lô (CR-001 §6.2).

    Mọi dòng chưa xác định được người nhận trên toàn hệ thống, không phân
    biệt lô — kiện của khách, thực tập sinh, người không có trong danh mục.
    Chờ lâu nhất lên đầu.
    """
    service = MailService(db)
    rows = []
    for item, waited, overdue in service.pending_match_items():
        row = PendingMatchItem.model_validate(
            {
                **MailItemRead.model_validate(item).model_dump(),
                "batch_filename": item.batch.source_filename,
                "waiting_days": waited,
                "overdue": overdue,
            }
        )
        row.candidates = [MatchCandidateRead(**vars(c)) for c in service.candidates_for(item)]
        rows.append(row)
    return rows


@router.get("/items", response_model=list[MailItemRead])
def list_items(
    db: DbSession,
    principal: ReportPrincipal,
    status: Annotated[list[str] | None, Query()] = None,
    department_id: str | None = None,
) -> list[MailItemRead]:
    """Màn hình kiện quá hạn của HC (§9.1) — chờ lâu nhất lên đầu.

    `?status=pending_match` trả về các dòng chưa khớp được (CR-001 §6.2);
    bản đầy đủ kèm ứng viên và số ngày chờ nằm ở `/mail/items/pending-match`.
    """
    repo = MailRepository(db)
    if status and list(status) == [MailStatus.PENDING_MATCH]:
        return [MailItemRead.model_validate(i) for i in repo.list_pending_match()]
    items = repo.list_uncollected(department_id=department_id, statuses=status)
    return [MailItemRead.model_validate(i) for i in items]


@router.get("/reports")
def reports(db: DbSession, principal: ReportPrincipal) -> dict:
    """Báo cáo tổng hợp (§9.2, CR-001 §8.2).

    `auto_match_rate_by_week` phải đọc **theo tuần**: cơ chế alias làm tỷ
    lệ khớp tự động tăng dần, nên một con số trung bình cả kỳ sẽ làm hệ
    thống trông tệ hơn thực lực.
    """
    repo = MailRepository(db)
    return {
        "by_status": repo.count_by_status(),
        "by_match_method": repo.count_by_match_method(),
        "by_handover_method": repo.count_by_handover_method(),
        "auto_match_rate_by_week": repo.auto_match_rate_by_week(),
        "hc_interventions": repo.count_feedback(),
    }


# ----------------------------------------------------------------------
# Nhân viên
# ----------------------------------------------------------------------


@router.get("/items/mine", response_model=list[MailItemRead])
def my_items(
    db: DbSession,
    employee: CurrentEmployee,
    principal: OwnPrincipal,
    only_uncollected: bool = False,
) -> list[MailItemRead]:
    items = MailRepository(db).items_of_employee(
        employee.id, only_uncollected=only_uncollected
    )
    return [MailItemRead.model_validate(i) for i in items]


@router.post("/items/{item_id}/collect-mine", response_model=MailItemRead)
def collect_own(
    item_id: str, db: DbSession, employee: CurrentEmployee, principal: OwnPrincipal
) -> MailItemRead:
    """Người nhận bấm link trong email — đường phụ (§7.2)."""
    service = MailService(db)
    item: MailItem = service.repo.get_item(item_id)
    if item is None:
        raise NotFoundError(f"Không có kiện {item_id}")
    if item.employee_id != employee.id:
        # Không tiết lộ kiện này có tồn tại hay không.
        raise NotFoundError(f"Không có kiện {item_id}")

    confirmed = service.confirm_collect(
        item_id, handover_method=HandoverMethod.SELF_LINK, collected_by=employee.id
    )
    return MailItemRead.model_validate(confirmed)


__all__ = ["router", "MailStatus"]
