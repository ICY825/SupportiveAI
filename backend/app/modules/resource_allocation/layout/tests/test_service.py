"""Test nghiệp vụ bố trí mặt bằng.

Trọng tâm là **ghi gộp**: một lần lưu chỉ phủ khu vực đang sửa, nên bản ghi
của khu vực khác phải còn nguyên sau đó.
"""

from __future__ import annotations

import json

import pytest

from app.core.exceptions import NotFoundError
from app.modules.resource_allocation.common import floor_catalog as catalog
from app.modules.resource_allocation.layout.schemas import PlacementWrite
from app.modules.resource_allocation.layout.service import (
    REASON_MISSING,
    REASON_OLD_LAYOUT,
    LayoutService,
)

FLOOR = "floor-test"
LAYOUT = "a" * 64


def viet_dataset(directory, *, layout_version: str, ids: list[str]) -> None:
    directory.mkdir(exist_ok=True)
    (directory / "floortest.workstations.json").write_text(
        json.dumps(
            {"sourcePdfSha256": layout_version, "workstations": [{"id": i} for i in ids]}
        ),
        encoding="utf-8",
    )


@pytest.fixture(autouse=True)
def dataset(tmp_path, monkeypatch):
    viet_dataset(tmp_path / FLOOR, layout_version=LAYOUT, ids=["ws-t-001", "ws-t-002", "ws-t-003"])
    monkeypatch.setattr(catalog, "floor_data_root", lambda: tmp_path)
    catalog.reset_cache()
    yield tmp_path
    catalog.reset_cache()


def dat(entity_id: str, x: float, y: float, **kwargs) -> PlacementWrite:
    return PlacementWrite(
        entity_id=entity_id, x=x, y=y, width=120.0, depth=60.0, **kwargs
    )


def test_tang_khong_co_dataset_thi_bao_ngay(db):
    with pytest.raises(NotFoundError):
        LayoutService(db).read_floor("floor-khong-co")


def test_chua_luu_gi_thi_tra_rong(db):
    result = LayoutService(db).read_floor(FLOOR)
    assert result.placements == []
    assert result.current_layout_version == LAYOUT
    assert result.stale == 0


def test_luu_roi_doc_lai_dung_nhu_cu(db):
    LayoutService(db).save(
        FLOOR,
        [dat("ws-t-001", 10.5, 20.25, rotation=45.0, seated_side="north")],
        actor_id="nv-1",
    )
    db.flush()

    result = LayoutService(db).read_floor(FLOOR)
    assert len(result.placements) == 1
    saved = result.placements[0]
    assert (saved.x, saved.y) == (10.5, 20.25)
    assert saved.rotation == 45.0
    assert saved.seated_side == "north"
    assert saved.layout_version == LAYOUT
    assert saved.updated_by == "nv-1"


def test_goc_nghieng_khong_bi_lam_tron_ve_boi_so_90(db):
    """18 cái bàn ở tầng 16 vẽ nghiêng ~45°; làm tròn là mất đúng thứ cần lưu."""
    LayoutService(db).save(FLOOR, [dat("ws-t-001", 0.0, 0.0, rotation=44.5)])
    db.flush()

    assert LayoutService(db).read_floor(FLOOR).placements[0].rotation == 44.5


def test_ghi_lan_hai_khong_xoa_lan_mot(db):
    """Đây là lý do API là PATCH chứ không phải PUT."""
    service = LayoutService(db)
    service.save(FLOOR, [dat("ws-t-001", 1.0, 1.0)])
    db.flush()
    service.save(FLOOR, [dat("ws-t-002", 2.0, 2.0)])
    db.flush()

    result = service.read_floor(FLOOR)
    assert {p.entity_id for p in result.placements} == {"ws-t-001", "ws-t-002"}


def test_ghi_de_cung_mot_thuc_the_thi_cap_nhat_chu_khong_them_dong(db):
    service = LayoutService(db)
    service.save(FLOOR, [dat("ws-t-001", 1.0, 1.0)])
    db.flush()
    service.save(FLOOR, [dat("ws-t-001", 9.0, 9.0)])
    db.flush()

    result = service.read_floor(FLOOR)
    assert len(result.placements) == 1
    assert (result.placements[0].x, result.placements[0].y) == (9.0, 9.0)


def test_ghe_di_theo_ban(db):
    """Không lưu ghế thì mở lại thấy bàn đã dịch mà ghế mất."""
    chair = {"bbox": [0.0, 0.0, 6.0, 6.0], "center": [3.0, 3.0], "rotation": 45.0}
    LayoutService(db).save(FLOOR, [dat("ws-t-001", 5.0, 5.0, chair=chair)])
    db.flush()

    assert LayoutService(db).read_floor(FLOOR).placements[0].chair == chair


def test_ban_nguoi_dung_tu_them_van_luu_duoc(db):
    """Khác phần chỗ ngồi: id chưa có trong bản vẽ **không** phải lỗi ở đây."""
    LayoutService(db).save(FLOOR, [dat("ws-t-tu-them", 3.0, 3.0)])
    db.flush()

    report = LayoutService(db).reconcile(FLOOR)
    assert [(s.entity_id, s.reason) for s in report.stale] == [("ws-t-tu-them", REASON_MISSING)]


def test_doi_chieu_chi_ra_ban_ghi_dat_theo_ban_ve_cu(db, dataset):
    LayoutService(db).save(FLOOR, [dat("ws-t-001", 1.0, 1.0)])
    db.flush()

    # Bản vẽ mới: cùng danh sách bàn, khác hash.
    viet_dataset(dataset / FLOOR, layout_version="b" * 64, ids=["ws-t-001", "ws-t-002"])
    catalog.reset_cache()

    report = LayoutService(db).reconcile(FLOOR)
    assert report.checked == 1
    assert [(s.entity_id, s.reason) for s in report.stale] == [("ws-t-001", REASON_OLD_LAYOUT)]
    assert report.stale[0].saved_layout_version == LAYOUT
    assert report.stale[0].current_layout_version == "b" * 64


def test_doi_chieu_khong_sua_gi(db, dataset):
    LayoutService(db).save(FLOOR, [dat("ws-t-001", 1.0, 1.0)])
    db.flush()
    viet_dataset(dataset / FLOOR, layout_version="b" * 64, ids=["ws-t-001"])
    catalog.reset_cache()

    LayoutService(db).reconcile(FLOOR)

    assert LayoutService(db).read_floor(FLOOR).placements[0].layout_version == LAYOUT


def test_bo_vi_tri_thi_ve_lai_dung_ban_ve(db):
    service = LayoutService(db)
    service.save(FLOOR, [dat("ws-t-001", 1.0, 1.0)])
    db.flush()

    assert service.forget(FLOOR, "ws-t-001") is True
    db.flush()
    assert service.read_floor(FLOOR).placements == []


def test_bo_vi_tri_chua_tung_luu_khong_phai_loi(db):
    assert LayoutService(db).forget(FLOOR, "ws-t-003") is False


def test_hai_tang_khong_dam_vao_nhau(db, dataset, monkeypatch):
    viet_dataset(dataset / "floor-khac", layout_version="c" * 64, ids=["ws-t-001"])
    catalog.reset_cache()

    service = LayoutService(db)
    service.save(FLOOR, [dat("ws-t-001", 1.0, 1.0)])
    service.save("floor-khac", [dat("ws-t-001", 7.0, 7.0)])
    db.flush()

    assert service.read_floor(FLOOR).placements[0].x == 1.0
    assert service.read_floor("floor-khac").placements[0].x == 7.0
