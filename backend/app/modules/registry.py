"""Đăng ký và bật/tắt module.

Mục tiêu pilot là đánh giá từng đề bài, nên phải tắt được một module mà
không ảnh hưởng phần còn lại (repository-structure.md §7):

    ENABLED_MODULES=seat,locker,mail,document

Mỗi module expose một `router` và một hàm `register()`; `main.py` chỉ nạp
module có tên trong danh sách.
"""

from __future__ import annotations

import importlib
import logging
from collections.abc import Callable
from dataclasses import dataclass

from fastapi import APIRouter

from app.core.config import settings

logger = logging.getLogger(__name__)

# Bốn đề bài và nơi chúng nằm. Tên ở vế trái là thứ điền vào ENABLED_MODULES.
MODULE_PACKAGES: dict[str, str] = {
    "seat": "app.modules.resource_allocation.seat",
    "locker": "app.modules.resource_allocation.locker",
    "mail": "app.modules.document_flow.mail",
    "document": "app.modules.document_flow.document",
}


@dataclass(frozen=True)
class ModuleSpec:
    """Những gì một module cung cấp cho khung ứng dụng."""

    name: str
    router: APIRouter | None = None
    register: Callable[[], None] | None = None


class ModuleRegistry:
    def __init__(self) -> None:
        self._specs: dict[str, ModuleSpec] = {}

    def add(self, spec: ModuleSpec) -> None:
        if spec.name in self._specs:
            raise ValueError(f"Module {spec.name!r} đã đăng ký")
        self._specs[spec.name] = spec

    def get(self, name: str) -> ModuleSpec | None:
        return self._specs.get(name)

    def loaded(self) -> tuple[ModuleSpec, ...]:
        return tuple(self._specs.values())

    def clear(self) -> None:
        self._specs.clear()


registry = ModuleRegistry()


def enabled_module_names() -> list[str]:
    """Tên các module được bật, đã bỏ tên lạ."""
    names: list[str] = []
    for name in settings.enabled_modules:
        if name not in MODULE_PACKAGES:
            logger.warning(
                "ENABLED_MODULES có tên lạ %r — bỏ qua. Tên hợp lệ: %s",
                name, ", ".join(sorted(MODULE_PACKAGES)),
            )
            continue
        names.append(name)
    return names


def load_enabled_modules() -> list[ModuleSpec]:
    """Import và đăng ký các module đang bật.

    Module chưa viết xong (gói rỗng, chưa có `MODULE`) được bỏ qua kèm
    cảnh báo, để lõi chung vẫn chạy được trong lúc 4 đề bài còn đang làm.
    """
    # Nạp lại từ đầu: create_app() có thể chạy nhiều lần trong một tiến trình.
    registry.clear()
    specs: list[ModuleSpec] = []
    for name in enabled_module_names():
        package = MODULE_PACKAGES[name]
        try:
            module = importlib.import_module(package)
        except ImportError:
            logger.warning("Module %r (%s) chưa import được — bỏ qua", name, package)
            continue

        spec = getattr(module, "MODULE", None)
        if not isinstance(spec, ModuleSpec):
            logger.warning("Module %r chưa khai báo MODULE: ModuleSpec — bỏ qua", name)
            continue

        registry.add(spec)
        if spec.register is not None:
            spec.register()
        specs.append(spec)
        logger.info("Đã nạp module %r", name)
    return specs
