#!/usr/bin/env python
"""Tạo tài khoản đăng nhập cho hệ thống.

**Vì sao cần script này:** hệ thống cố tình **không có trang tự đăng ký**.
Phần lớn CBNV không bao giờ đăng nhập — họ chỉ nhận thư và quét QR tại khu
để đơn ([mail-tracking.md §7.2](../docs/architecture/mail-tracking.md#72-phương-án-chọn)).
Chỉ nhân viên HC mới cần tài khoản, và số đó đếm trên đầu ngón tay.

Nhưng hệ quả là **tài khoản đầu tiên không tạo được từ trong sản phẩm** —
phải có một lối vào từ dòng lệnh, và đây là nó.

Dùng:

    cd backend
    python ../scripts/create_user.py --code HC001 --name "Phạm Thị Duyên" \\
        --email duyen@congty.vn --phone 0911111111

Mật khẩu hỏi riêng, **không nhận qua tham số** — tham số dòng lệnh nằm lại
trong lịch sử shell và trong danh sách tiến trình của cả máy.

Đổi mật khẩu cho người đã có:

    python ../scripts/create_user.py --code HC001 --set-password

Chạy trong script tự động thì đưa mật khẩu qua stdin (giống `docker login`):

    echo "$MAT_KHAU" | python ../scripts/create_user.py --code HC001 \\
        --name "Phạm Thị Duyên" --password-stdin

Nhớ trỏ đúng cơ sở dữ liệu: script đọc `DATABASE_URL` giống hệt ứng dụng,
nên chạy nhầm một phát là tạo tài khoản vào DB khác.
"""

from __future__ import annotations

import argparse
import getpass
import sys
from pathlib import Path

# Cho phép chạy từ bất kỳ đâu: thêm `backend/` vào đường dẫn import.
BACKEND = Path(__file__).resolve().parents[1] / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

MIN_PASSWORD = 12


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Tạo hoặc cập nhật tài khoản đăng nhập.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
    )
    parser.add_argument("--code", required=True, help="Mã nhân viên, dùng để đăng nhập")
    parser.add_argument("--name", help="Họ tên đầy đủ (bắt buộc khi tạo mới)")
    parser.add_argument("--email", help="Hộp thư THẬT nhận mail, không phải tài khoản AD")
    parser.add_argument("--upn", help="Tài khoản AD, nếu có")
    parser.add_argument("--phone", help="Số điện thoại — cần cho trang quét QR")
    parser.add_argument(
        "--role",
        action="append",
        default=None,
        help="Vai trò, lặp lại được. Mặc định `hc`. Xem mail/permissions.py",
    )
    parser.add_argument(
        "--set-password",
        action="store_true",
        help="Chỉ đổi mật khẩu cho người đã có, không tạo mới",
    )
    parser.add_argument(
        "--password-stdin",
        action="store_true",
        help="Đọc mật khẩu từ stdin thay vì hỏi — dùng khi chạy trong script tự động",
    )
    args = parser.parse_args()

    # Import sau khi đã chỉnh sys.path, và sau khi argparse đã xử lý `--help`
    # — nạp cả ứng dụng chỉ để in trợ giúp thì chậm vô ích.
    import app.main  # noqa: F401  — nạp mapper của SQLAlchemy
    from app.core.config import settings
    from app.core.database import SessionLocal
    from app.shared.employee.schemas import EmployeeCreate
    from app.shared.employee.service import EmployeeService

    print(f"Cơ sở dữ liệu: {_hide_password(settings.database_url)}")

    db = SessionLocal()
    service = EmployeeService(db)
    try:
        existing = service.repo.get_by_code(args.code)

        if args.set_password:
            if existing is None:
                print(f"LỖI: không có nhân sự nào mã {args.code!r}.", file=sys.stderr)
                return 1
            service.set_password(existing.id, _read_password(args.password_stdin))
            db.commit()
            print(f"Đã đổi mật khẩu cho {existing.full_name} ({args.code}).")
            return 0

        if existing is not None:
            print(
                f"LỖI: mã {args.code!r} đã tồn tại ({existing.full_name}).\n"
                f"      Muốn đổi mật khẩu thì thêm --set-password.",
                file=sys.stderr,
            )
            return 1

        if not args.name:
            print("LỖI: tạo mới thì phải có --name.", file=sys.stderr)
            return 1

        employee = service.create(
            EmployeeCreate(
                employee_code=args.code,
                full_name=args.name,
                email=args.email,
                upn=args.upn,
                phone=args.phone,
                roles=args.role or ["hc"],
            )
        )

        # Cảnh báo chất lượng dữ liệu — không chặn, nhưng phải hiện ra.
        # Lấy nhầm cột tài khoản AD sang cột email là lỗi im lặng nguy hiểm
        # nhất trong cả hệ thống (CR-001 §3.5).
        for warning in service.data_warnings(employee):
            print(f"  ⚠ {warning}")

        service.set_password(employee.id, _read_password(args.password_stdin))
        db.commit()
        print(
            f"Đã tạo {employee.full_name} — đăng nhập bằng mã {args.code}, "
            f"vai trò: {', '.join(sorted(employee.role_names))}."
        )
        return 0
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()


def _read_password(from_stdin: bool) -> str:
    """Lấy mật khẩu: hỏi trên màn hình, hoặc đọc stdin khi chạy tự động.

    `getpass` đọc thẳng từ console chứ không qua stdin, nên không có nhánh
    `--password-stdin` thì script treo khi chạy trong CI hoặc trong một
    script khác.
    """
    if from_stdin:
        password = sys.stdin.readline().strip()
        if len(password) < MIN_PASSWORD:
            raise SystemExit(f"Mật khẩu phải từ {MIN_PASSWORD} ký tự trở lên.")
        return password

    while True:
        first = getpass.getpass("Mật khẩu: ")
        if len(first) < MIN_PASSWORD:
            print(f"  Mật khẩu phải từ {MIN_PASSWORD} ký tự trở lên.")
            continue
        if first != getpass.getpass("Nhập lại: "):
            print("  Hai lần nhập không khớp.")
            continue
        return first


def _hide_password(url: str) -> str:
    """Che mật khẩu trong chuỗi kết nối trước khi in ra màn hình."""
    if "://" not in url or "@" not in url:
        return url
    scheme, rest = url.split("://", 1)
    credentials, host = rest.rsplit("@", 1)
    user = credentials.split(":", 1)[0]
    return f"{scheme}://{user}:***@{host}"


if __name__ == "__main__":
    raise SystemExit(main())
