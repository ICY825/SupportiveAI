#!/usr/bin/env python
"""Nhập danh mục phòng ban từ chính bản vẽ đã trích xuất.

**Vì sao đọc từ bản vẽ:** mỗi khu vực trong `data/floors/<tầng>/*.zones.json`
mang `departmentCode` và tên phòng ban do người duyệt ghi trên bản vẽ. Gõ lại
danh sách ấy vào một file thứ hai là tạo thêm một chỗ để sai; đọc thẳng từ
dataset thì bản vẽ và cơ sở dữ liệu không thể lệch nhau.

Hai khu vực dùng chung một mã là **một phòng ban ngồi hai chỗ**, không phải hai
phòng ban — Mô hình & Nền tảng AI bị lõi thang máy chia đôi. Script gộp theo mã.

Dùng:

    cd backend
    python ../scripts/seed_departments.py                # mọi tầng đã trích xuất
    python ../scripts/seed_departments.py --floor floor-16
    python ../scripts/seed_departments.py --dry-run      # chỉ in ra, không ghi

Chạy lại được nhiều lần: mã đã có thì bỏ qua, chỉ báo tên trên bản vẽ đã đổi
hay chưa. Script **không bao giờ sửa tên** đang có — đổi tên một phòng ban là
quyết định của tổ chức, không phải hệ quả phụ của việc chạy lại trích xuất.

Nhớ trỏ đúng cơ sở dữ liệu: script đọc `DATABASE_URL` giống hệt ứng dụng.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parents[1]
BACKEND = REPO / "backend"
if str(BACKEND) not in sys.path:
    sys.path.insert(0, str(BACKEND))

FLOORS = REPO / "data" / "floors"


def departments_in(floor_dir: Path) -> dict[str, str]:
    """Mã -> tên, đọc từ các khu vực của một tầng."""
    files = sorted(floor_dir.glob("*.zones.json"))
    if not files:
        return {}
    payload = json.loads(files[0].read_text(encoding="utf-8"))
    found: dict[str, str] = {}
    for zone in payload.get("zones", []):
        code, name = zone.get("departmentCode"), zone.get("name")
        if not code or not name:
            continue
        if code in found and found[code] != name:
            print(
                f"  ! mã {code!r} mang hai tên khác nhau trong cùng một tầng: "
                f"{found[code]!r} và {name!r} — lấy tên đầu",
                file=sys.stderr,
            )
            continue
        found[code] = name
    return found


def main() -> int:
    parser = argparse.ArgumentParser(description="Nhập phòng ban từ dataset mặt bằng.")
    parser.add_argument("--floor", help="Chỉ một tầng, ví dụ floor-16. Mặc định: mọi tầng.")
    parser.add_argument("--dry-run", action="store_true", help="In ra, không ghi vào DB")
    args = parser.parse_args()

    directories = [FLOORS / args.floor] if args.floor else sorted(p for p in FLOORS.iterdir() if p.is_dir())
    missing = [d for d in directories if not d.is_dir()]
    if missing:
        print(f"LỖI: không có thư mục {missing[0]}", file=sys.stderr)
        return 1

    wanted: dict[str, str] = {}
    for directory in directories:
        found = departments_in(directory)
        print(f"{directory.name}: {len(found)} phòng ban trên bản vẽ")
        for code, name in found.items():
            print(f"  {code:10} {name}")
        wanted.update(found)

    if not wanted:
        print("Không có phòng ban nào để nhập.", file=sys.stderr)
        return 1

    if args.dry_run:
        print(f"\n--dry-run: không ghi gì. Tổng cộng {len(wanted)} mã.")
        return 0

    from app.core.config import settings
    from app.core.database import SessionLocal
    from app.shared.department.repository import DepartmentRepository
    from app.shared.department.schemas import DepartmentCreate
    from app.shared.department.service import DepartmentService

    print(f"\nCơ sở dữ liệu: {settings.database_url.split('@')[-1]}")
    db = SessionLocal()
    try:
        repo, service = DepartmentRepository(db), DepartmentService(db)
        created = skipped = 0
        for code, name in sorted(wanted.items()):
            existing = repo.get_by_code(code)
            if existing is not None:
                skipped += 1
                if existing.name != name:
                    print(
                        f"  = {code:10} đã có tên {existing.name!r}; bản vẽ ghi {name!r}. "
                        "Không tự sửa — đổi tên phòng ban là quyết định của tổ chức."
                    )
                continue
            service.create(DepartmentCreate(code=code, name=name))
            created += 1
            print(f"  + {code:10} {name}")
        db.commit()
        print(f"\nTạo mới {created}, đã có sẵn {skipped}.")
    finally:
        db.close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
