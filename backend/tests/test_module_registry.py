"""Test cơ chế bật/tắt module (repository-structure.md §7).

Bốn module thật chưa viết, nên ở đây dựng module giả để kiểm chính cơ
chế nạp — thứ quyết định việc "dừng một đề bài chỉ là sửa một biến môi
trường, không phải refactor".
"""

from __future__ import annotations

import sys
import types

import pytest
from fastapi import APIRouter

from app.modules import registry as registry_module
from app.modules.registry import ModuleSpec, enabled_module_names, load_enabled_modules, registry


def _fake_module(name: str, *, with_spec: bool = True) -> types.ModuleType:
    module = types.ModuleType(f"fake_{name}")
    if with_spec:
        called: list[str] = []
        router = APIRouter(prefix=f"/{name}")
        module.MODULE = ModuleSpec(  # type: ignore[attr-defined]
            name=name, router=router, register=lambda: called.append(name)
        )
        module.called = called  # type: ignore[attr-defined]
    return module


@pytest.fixture(autouse=True)
def clean_registry():
    registry.clear()
    yield
    registry.clear()


@pytest.fixture
def install_fake(monkeypatch):
    """Cài module giả vào sys.modules và trỏ MODULE_PACKAGES tới nó."""
    installed: list[str] = []

    def install(name: str, *, with_spec: bool = True) -> types.ModuleType:
        module = _fake_module(name, with_spec=with_spec)
        dotted = f"fake_{name}"
        monkeypatch.setitem(sys.modules, dotted, module)
        monkeypatch.setitem(registry_module.MODULE_PACKAGES, name, dotted)
        installed.append(name)
        return module

    return install


class TestEnabledModuleNames:
    def test_chi_lay_ten_hop_le(self, monkeypatch):
        monkeypatch.setattr(registry_module.settings, "enabled_modules", ["mail", "khong-co-that"])
        assert enabled_module_names() == ["mail"]

    def test_giu_dung_thu_tu_khai_bao(self, monkeypatch):
        monkeypatch.setattr(registry_module.settings, "enabled_modules", ["document", "mail"])
        assert enabled_module_names() == ["document", "mail"]


class TestLoadEnabledModules:
    def test_nap_module_dang_bat(self, monkeypatch, install_fake):
        mail = install_fake("mail")
        monkeypatch.setattr(registry_module.settings, "enabled_modules", ["mail"])

        specs = load_enabled_modules()

        assert [s.name for s in specs] == ["mail"]
        assert mail.called == ["mail"], "phải gọi register() của module"
        assert registry.get("mail") is not None

    def test_khong_nap_module_dang_tat(self, monkeypatch, install_fake):
        install_fake("mail")
        locker = install_fake("locker")
        monkeypatch.setattr(registry_module.settings, "enabled_modules", ["mail"])

        specs = load_enabled_modules()

        assert [s.name for s in specs] == ["mail"]
        assert locker.called == [], "module tắt thì không được chạy register()"
        assert registry.get("locker") is None

    def test_module_chua_khai_bao_spec_thi_bo_qua(self, monkeypatch, install_fake):
        install_fake("mail", with_spec=False)
        monkeypatch.setattr(registry_module.settings, "enabled_modules", ["mail"])

        # Không ném lỗi — lõi chung vẫn chạy khi 4 đề bài còn đang làm dở.
        assert load_enabled_modules() == []

    def test_mot_module_hong_khong_keo_do_module_khac(self, monkeypatch, install_fake):
        install_fake("mail", with_spec=False)  # chưa xong
        install_fake("locker")  # đã xong
        monkeypatch.setattr(registry_module.settings, "enabled_modules", ["mail", "locker"])

        specs = load_enabled_modules()

        assert [s.name for s in specs] == ["locker"]

    def test_nap_lai_khong_bao_loi_trung(self, monkeypatch, install_fake):
        install_fake("mail")
        monkeypatch.setattr(registry_module.settings, "enabled_modules", ["mail"])

        load_enabled_modules()
        # create_app() có thể chạy nhiều lần trong một tiến trình.
        assert [s.name for s in load_enabled_modules()] == ["mail"]

    def test_tat_het_thi_khong_nap_gi(self, monkeypatch, install_fake):
        install_fake("mail")
        monkeypatch.setattr(registry_module.settings, "enabled_modules", [])

        assert load_enabled_modules() == []
