"""Kiểm tra quy tắc phụ thuộc giữa các tầng.

repository-structure.md §5.2: ép bằng test, không bằng lời nhắc.
"Tốn nửa ngày, nhưng là thứ giữ cho kiến trúc còn đúng ở tuần 6."

Chiều import được phép:

    modules  →  platform  →  core
    modules  →  shared    →  core
    modules  →  ai        →  core

    modules  ✗  modules      (KHÔNG BAO GIỜ)
    platform ✗  modules
    shared   ✗  modules
    core     ✗  mọi thứ khác
"""

from __future__ import annotations

import ast
from pathlib import Path

import pytest

APP_ROOT = Path(__file__).resolve().parents[1] / "app"

# Bốn đề bài. Import chéo giữa các gói này là thứ phải chặn.
LEAF_MODULES = {
    "app.modules.resource_allocation.seat": "seat",
    "app.modules.resource_allocation.locker": "locker",
    "app.modules.document_flow.mail": "mail",
    "app.modules.document_flow.document": "document",
}


def _python_files(*relative: str) -> list[Path]:
    root = APP_ROOT.joinpath(*relative)
    if not root.exists():
        return []
    return sorted(p for p in root.rglob("*.py"))


def _module_name(path: Path) -> str:
    relative = path.relative_to(APP_ROOT.parent).with_suffix("")
    parts = list(relative.parts)
    if parts[-1] == "__init__":
        parts.pop()
    return ".".join(parts)


def _imports(path: Path) -> set[str]:
    """Tên module được import trong file, chỉ lấy phần thuộc `app.`."""
    tree = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    found: set[str] = set()
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                if alias.name.startswith("app."):
                    found.add(alias.name)
        elif isinstance(node, ast.ImportFrom):
            if node.level:
                # Import tương đối: dựng lại thành tên tuyệt đối.
                base = _module_name(path).split(".")
                base = base[: len(base) - node.level + 1]
                prefix = ".".join(base)
                target = f"{prefix}.{node.module}" if node.module else prefix
            else:
                target = node.module or ""
            if target.startswith("app."):
                found.add(target)
    return found


def _leaf_of(dotted: str) -> str | None:
    for package, name in LEAF_MODULES.items():
        if dotted == package or dotted.startswith(package + "."):
            return name
    return None


def test_modules_khong_import_lan_nhau():
    """seat không được import locker, mail không được import document...

    Đây là ranh giới duy nhất giữ cho modular monolith không biến thành
    mớ rối, và là thứ bảo đảm mục tiêu "giữ/dừng từng đề bài độc lập".
    """
    offenders: list[str] = []
    for path in _python_files("modules"):
        source_leaf = _leaf_of(_module_name(path))
        if source_leaf is None:
            continue
        for imported in _imports(path):
            target_leaf = _leaf_of(imported)
            if target_leaf is not None and target_leaf != source_leaf:
                offenders.append(f"{_module_name(path)} → {imported}")

    assert not offenders, "Module import chéo nhau:\n  " + "\n  ".join(offenders)


@pytest.mark.parametrize("layer", ["platform", "shared", "ai"])
def test_tang_duoi_khong_import_modules(layer):
    """platform / shared / ai không được biết tới module nghiệp vụ nào."""
    offenders: list[str] = []
    for path in _python_files(layer):
        for imported in _imports(path):
            if imported.startswith("app.modules"):
                offenders.append(f"{_module_name(path)} → {imported}")

    assert not offenders, f"{layer} import ngược lên modules:\n  " + "\n  ".join(offenders)


def test_core_khong_import_tang_nao_khac():
    """`core` phải thuần kỹ thuật.

    repository-structure.md §12: "Nhét logic nghiệp vụ vào core" làm mất
    khả năng tách sau này.
    """
    allowed_prefix = "app.core"
    offenders: list[str] = []
    for path in _python_files("core"):
        for imported in _imports(path):
            if not imported.startswith(allowed_prefix):
                offenders.append(f"{_module_name(path)} → {imported}")

    assert not offenders, "core import ra ngoài:\n  " + "\n  ".join(offenders)


def test_platform_khong_import_shared():
    """`platform` giữ độc lập với dữ liệu nền.

    Bảng chiều phụ thuộc ở §5 không liệt kê `platform → shared`, nên ở
    đây coi là không được phép: notification nhận `Recipient` đã phân
    giải sẵn thay vì tự tra bảng nhân sự. Nhờ vậy engine thông báo dùng
    được cho cả người nhận không phải nhân sự nội bộ.
    """
    offenders: list[str] = []
    for path in _python_files("platform"):
        for imported in _imports(path):
            if imported.startswith("app.shared"):
                offenders.append(f"{_module_name(path)} → {imported}")

    assert not offenders, "platform import xuống shared:\n  " + "\n  ".join(offenders)


def test_khong_co_thu_muc_utils_hoac_helpers():
    """repository-structure.md §12: `utils/` chung thành bãi rác trong 2 tuần."""
    junk = [
        str(p.relative_to(APP_ROOT.parent))
        for p in APP_ROOT.rglob("*")
        if p.is_dir() and p.name in {"utils", "helpers", "common_utils", "misc"}
    ]
    assert not junk, "Có thư mục dễ thành bãi rác:\n  " + "\n  ".join(junk)


def test_moi_de_bai_deu_co_thu_muc_rieng():
    """Nhìn cây thư mục phải thấy ngay 4 đề bài (§1.3)."""
    missing = [
        package
        for package in LEAF_MODULES
        if not APP_ROOT.joinpath(*package.split(".")[1:]).is_dir()
    ]
    assert not missing, "Thiếu thư mục cho đề bài:\n  " + "\n  ".join(missing)
