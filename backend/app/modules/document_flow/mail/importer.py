"""Đọc file danh sách của lễ tân thành `MailRow`.

Cấu trúc chốt theo file mẫu thật `docs/architecture/mau.xlsx` (CR-001 §1):

| Cột | Header      | Kiểu ô          | Ví dụ           |
|-----|-------------|-----------------|-----------------|
| A   | `stt`       | số              | 1, 2, 3         |
| B   | `người gửi` | chuỗi           | "cty nam hải"   |
| C   | `ngày nhận` | datetime thật   | 17/09/2026      |
| D   | `số lượng`  | số              | 1, 2            |
| E   | `nội dung`  | chuỗi           | "phong bì"      |
| F   | `người nhận`| chuỗi           | "Lương hiền"    |

Một sheet duy nhất, header ở **dòng 1**, không có dòng thừa phía trên.

File **không có** mã vận đơn, số điện thoại hay phòng ban — đó là lý do
tồn tại của cả CR-001. Đừng thêm cột lại vào đây cho "đủ bộ"; chúng không
có nguồn dữ liệu.

Ranh giới: importer chỉ dựng ra `list[MailRow]`. Mọi thứ phía sau
(`service.import_rows`) không phụ thuộc định dạng file.
"""

from __future__ import annotations

import csv
import io
import re
import unicodedata
from dataclasses import dataclass, field
from datetime import date, datetime

from app.core.exceptions import ValidationError
from app.modules.document_flow.mail.schemas import MailRow

# Tên cột chuẩn hóa → tên trường. Nhận cả vài cách viết hay gặp để lễ tân
# đổi hoa/thường hay thêm dấu hai chấm cũng không làm gãy việc đọc file.
COLUMN_ALIASES: dict[str, str] = {
    "stt": "row_index",
    "so tt": "row_index",
    "nguoi gui": "sender",
    "ben gui": "sender",
    "ngay nhan": "received_on",
    "ngay": "received_on",
    "so luong": "quantity",
    "sl": "quantity",
    "noi dung": "content_type",
    "nguoi nhan": "recipient_name",
    "ten nguoi nhan": "recipient_name",
    # D7 — chưa có trong file hiện tại, nhưng nhận sẵn để khi lễ tân thêm
    # cột thì chỉ phải bật `MAIL_MATCH_BY_PHONE`, không phải sửa importer.
    "so dien thoai": "recipient_phone",
    "sdt": "recipient_phone",
    "dien thoai": "recipient_phone",
}

REQUIRED_FIELDS = ("recipient_name", "received_on")

_MULTI_SPACE = re.compile(r"\s+")
_DATE_SEPARATORS = re.compile(r"[/\-.]")


@dataclass
class ImportReport:
    """Kết quả đọc file, kèm những gì HC cần biết trước khi soát."""

    rows: list[MailRow] = field(default_factory=list)
    sheet_name: str | None = None
    # CR-001 §3.4: chuỗi ngày mơ hồ thì **không đoán** — đánh dấu để màn
    # hình soát bắt HC xác nhận.
    ambiguous_date: bool = False
    warnings: list[str] = field(default_factory=list)


def _normalize_header(raw: object) -> str:
    """Bỏ dấu, gộp khoảng trắng, bỏ dấu hai chấm cuối — để so tên cột."""
    text = str(raw or "").strip().rstrip(":").casefold()
    decomposed = unicodedata.normalize("NFD", text)
    stripped = "".join(c for c in decomposed if unicodedata.category(c) != "Mn")
    return _MULTI_SPACE.sub(" ", stripped.replace("đ", "d")).strip()


def _map_columns(header_cells: list[object]) -> dict[str, int]:
    """Ánh xạ tên cột → chỉ số cột. Cột lạ bị bỏ qua, không báo lỗi."""
    mapping: dict[str, int] = {}
    for index, cell in enumerate(header_cells):
        field_name = COLUMN_ALIASES.get(_normalize_header(cell))
        if field_name and field_name not in mapping:
            mapping[field_name] = index
    missing = [f for f in REQUIRED_FIELDS if f not in mapping]
    if missing:
        readable = {"recipient_name": "người nhận", "received_on": "ngày nhận"}
        raise ValidationError(
            "File thiếu cột bắt buộc: " + ", ".join(readable[f] for f in missing),
            details={"missing": missing, "found": sorted(mapping)},
        )
    return mapping


def _text(value: object) -> str | None:
    if value is None:
        return None
    text = _MULTI_SPACE.sub(" ", str(value).strip())
    return text or None


def _quantity(value: object) -> int:
    """`số lượng` để trống thì mặc định 1 (CR-001 §11).

    Một dòng bao giờ cũng ứng với ít nhất một kiện — ô trống nghĩa là lễ
    tân không buồn ghi "1", không phải là không có kiện nào.
    """
    if value is None or str(value).strip() == "":
        return 1
    try:
        parsed = int(float(str(value).strip().replace(",", ".")))
    except ValueError as exc:
        raise ValidationError(f"Số lượng không đọc được: {value!r}") from exc
    if parsed < 1:
        raise ValidationError(f"Số lượng phải từ 1 trở lên, đọc được {parsed}")
    return parsed


@dataclass(frozen=True)
class ParsedDate:
    value: date
    ambiguous: bool


def parse_receipt_date(value: object) -> ParsedDate:
    """Đọc ô `ngày nhận` theo thứ tự ưu tiên của CR-001 §3.4.

    1. Ô là datetime (trường hợp `.xlsx`) → dùng trực tiếp, không parse chuỗi.
    2. Ô là chuỗi → `dd/mm/yyyy` trước, theo quy ước Việt Nam.
    3. Chuỗi mơ hồ (cả hai cách đọc đều hợp lệ và cho kết quả khác nhau)
       → **không đoán**, đánh dấu để HC xác nhận.

    Bước 3 quan trọng vì file mẫu đang để format `mm-dd-yy`: xuất sang
    `.csv` là `09/17/26` với `17/09/26` lẫn vào nhau không phân biệt được.
    """
    if isinstance(value, datetime):
        return ParsedDate(value.date(), ambiguous=False)
    if isinstance(value, date):
        return ParsedDate(value, ambiguous=False)

    text = _text(value)
    if not text:
        raise ValidationError("Thiếu ngày nhận")

    parts = [p for p in _DATE_SEPARATORS.split(text.split(" ")[0]) if p]
    if len(parts) != 3 or not all(p.isdigit() for p in parts):
        raise ValidationError(f"Ngày nhận không đọc được: {text!r}")

    first, second, year_part = (int(p) for p in parts)
    year = _expand_year(year_part)

    day_first = _safe_date(year, second, first)    # dd/mm — quy ước Việt Nam
    month_first = _safe_date(year, first, second)  # mm/dd — quy ước file mẫu

    if day_first is None and month_first is None:
        raise ValidationError(f"Ngày nhận không hợp lệ: {text!r}")
    if day_first is None:
        return ParsedDate(month_first, ambiguous=False)
    if month_first is None or month_first == day_first:
        return ParsedDate(day_first, ambiguous=False)
    # Cả hai cách đọc đều hợp lệ và cho hai ngày khác nhau.
    return ParsedDate(day_first, ambiguous=True)


def _expand_year(value: int) -> int:
    """`26` → 2026. Hai chữ số luôn hiểu là thế kỷ này."""
    return value if value >= 100 else 2000 + value


def _safe_date(year: int, month: int, day: int) -> date | None:
    try:
        return date(year, month, day)
    except ValueError:
        return None


def _build_row(
    values: list[object], mapping: dict[str, int], *, line_no: int, report: ImportReport
) -> MailRow:
    def cell(name: str) -> object:
        index = mapping.get(name)
        if index is None or index >= len(values):
            return None
        return values[index]

    try:
        parsed_date = parse_receipt_date(cell("received_on"))
    except ValidationError as exc:
        raise ValidationError(f"Dòng {line_no}: {exc.message}", details=exc.details) from exc
    if parsed_date.ambiguous:
        report.ambiguous_date = True

    raw_index = _text(cell("row_index"))
    try:
        row_index = int(float(raw_index)) if raw_index else None
    except ValueError:
        row_index = None

    try:
        quantity = _quantity(cell("quantity"))
    except ValidationError as exc:
        raise ValidationError(f"Dòng {line_no}: {exc.message}") from exc

    return MailRow(
        row_index=row_index,
        sender=_text(cell("sender")),
        recipient_name=_text(cell("recipient_name")),
        recipient_phone=_text(cell("recipient_phone")),
        quantity=quantity,
        content_type=_text(cell("content_type")),
        received_on=parsed_date.value,
    )


def _is_blank(values: list[object]) -> bool:
    return all(v is None or str(v).strip() == "" for v in values)


def read_xlsx(content: bytes) -> ImportReport:
    """Đọc `.xlsx`. Ô ngày là datetime thật nên không phải parse chuỗi."""
    try:
        import openpyxl
    except ImportError as exc:  # pragma: no cover - phụ thuộc đã khai trong pyproject
        raise ValidationError(
            "Thiếu thư viện openpyxl — cài `pip install -e .` rồi thử lại"
        ) from exc

    workbook = openpyxl.load_workbook(io.BytesIO(content), data_only=True, read_only=True)
    try:
        sheet = workbook.worksheets[0]
        report = ImportReport(sheet_name=sheet.title)
        rows = sheet.iter_rows(values_only=True)
        try:
            header = list(next(rows))
        except StopIteration as exc:
            raise ValidationError("File rỗng, không có dòng tiêu đề") from exc

        mapping = _map_columns(header)
        if len(workbook.worksheets) > 1:
            report.warnings.append(
                f"File có {len(workbook.worksheets)} sheet, chỉ đọc sheet đầu "
                f"({sheet.title!r}). Kiểm tra lại nếu lễ tân tách dữ liệu ra nhiều sheet."
            )

        for offset, raw in enumerate(rows, start=2):
            values = list(raw)
            if _is_blank(values):
                continue
            report.rows.append(_build_row(values, mapping, line_no=offset, report=report))
        return report
    finally:
        workbook.close()


def read_csv(content: bytes, *, encoding: str = "utf-8-sig") -> ImportReport:
    """Đọc `.csv`.

    ⚠️ Kém tin cậy hơn `.xlsx`: ô ngày mất kiểu datetime, còn định dạng
    hiện tại của lễ tân là `mm-dd-yy` nên `09/17/26` và `17/09/26` lẫn vào
    nhau. Xem khuyến nghị ở CR-001 §3.4 — nên xin file `.xlsx`.
    """
    try:
        text = content.decode(encoding)
    except UnicodeDecodeError:
        text = content.decode("utf-8", errors="replace")

    reader = csv.reader(io.StringIO(text, newline=""))
    report = ImportReport()
    try:
        header = next(reader)
    except StopIteration as exc:
        raise ValidationError("File rỗng, không có dòng tiêu đề") from exc

    mapping = _map_columns(header)
    for offset, raw in enumerate(reader, start=2):
        values: list[object] = list(raw)
        if _is_blank(values):
            continue
        report.rows.append(_build_row(values, mapping, line_no=offset, report=report))
    return report


def read_file(filename: str, content: bytes) -> ImportReport:
    """Chọn bộ đọc theo đuôi file."""
    lowered = (filename or "").lower()
    if lowered.endswith(".csv"):
        return read_csv(content)
    if lowered.endswith((".xlsx", ".xlsm")):
        return read_xlsx(content)
    raise ValidationError(
        f"Định dạng không hỗ trợ: {filename!r}. Nhận `.xlsx` (khuyến nghị) hoặc `.csv`."
    )
