"""Nghiệp vụ gán chỗ ngồi.

Bốn quy tắc ở đầu `service.py`, mỗi quy tắc ít nhất một test, cộng phần đối
chiếu với dataset.
"""

from __future__ import annotations

import json

import pytest

from app.core.exceptions import ConflictError, NotFoundError, ValidationError
from app.modules.resource_allocation.seat import catalog
from app.modules.resource_allocation.seat.models import SeatDecision
from app.modules.resource_allocation.seat.service import SeatService
from app.platform.audit.models import AuditLog
from app.shared.employee.models import Employee, EmployeeStatus

FLOOR = "floor-test"
LAYOUT = "a" * 64


@pytest.fixture
def dataset(tmp_path, monkeypatch):
    """Một dataset nhỏ, đúng hình dạng file thật của bộ trích xuất."""
    directory = tmp_path / FLOOR
    directory.mkdir()
    (directory / "floortest.workstations.json").write_text(
        json.dumps(
            {
                "generator": "test",
                "sourcePdf": "test.pdf",
                "sourcePdfSha256": LAYOUT,
                "workstations": [
                    {"id": "ws-t-001"},
                    {"id": "ws-t-002"},
                    {"id": "ws-t-003"},
                ],
            }
        ),
        encoding="utf-8",
    )
    monkeypatch.setattr(catalog, "floor_data_root", lambda: tmp_path)
    catalog.reset_cache()
    yield tmp_path
    catalog.reset_cache()


@pytest.fixture
def employees(db):
    people = [
        Employee(employee_code="VSF001", full_name="Nguyễn Thị Thu Hương"),
        Employee(employee_code="VSF002", full_name="Lưu Hải Nam"),
        Employee(
            employee_code="VSF003",
            full_name="Phạm Thị Duyên",
            status=EmployeeStatus.INACTIVE,
        ),
    ]
    db.add_all(people)
    db.flush()
    return {p.employee_code: p for p in people}


@pytest.fixture
def service(db, dataset):
    return SeatService(db)


def test_gan_cho_ngoi_ghi_dung_phien_ban_bo_tri(service, employees):
    assignment = service.assign(
        floor_id=FLOOR,
        workstation_id="ws-t-001",
        employee_id=employees["VSF001"].id,
        decision=SeatDecision.ACCEPT,
    )

    assert assignment.is_active
    assert assignment.layout_version == LAYOUT
    assert assignment.decision == SeatDecision.ACCEPT


def test_ma_cho_ngoi_khong_co_trong_ban_ve_thi_bao_loi(service, employees):
    """Issue #2 mục 3: backend không tự tạo chỗ ngồi."""
    with pytest.raises(NotFoundError) as err:
        service.assign(
            floor_id=FLOOR,
            workstation_id="ws-t-999",
            employee_id=employees["VSF001"].id,
        )
    assert "không tự tạo" in str(err.value)


def test_hai_nguoi_khong_ngoi_cung_mot_cho(service, employees):
    service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
    )
    with pytest.raises(ConflictError) as err:
        service.assign(
            floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF002"].id
        )
    assert "Thu Hương" in str(err.value)


def test_mot_nguoi_khong_giu_hai_cho(service, employees):
    service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
    )
    with pytest.raises(ConflictError):
        service.assign(
            floor_id=FLOOR, workstation_id="ws-t-002", employee_id=employees["VSF001"].id
        )


def test_nhan_su_da_nghi_thi_khong_cap_cho(service, employees):
    with pytest.raises(ConflictError) as err:
        service.assign(
            floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF003"].id
        )
    assert "ngừng hoạt động" in str(err.value)


def test_quyet_dinh_la_khong_hop_le_thi_tu_choi(service, employees):
    with pytest.raises(ValidationError):
        service.assign(
            floor_id=FLOOR,
            workstation_id="ws-t-001",
            employee_id=employees["VSF001"].id,
            decision="approved",
        )


def test_thu_hoi_roi_thi_cap_lai_duoc_cho_nguoi_khac(service, employees):
    first = service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
    )
    service.release(first.id)

    second = service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF002"].id
    )
    assert second.is_active
    assert not first.is_active


def test_khong_thu_hoi_hai_lan(service, employees):
    assignment = service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
    )
    service.release(assignment.id)
    with pytest.raises(ConflictError):
        service.release(assignment.id)


def test_chuyen_cho_de_lai_hai_ban_ghi(service, employees, db):
    """Lịch sử phải trả lời được 'trước hôm đó người này ngồi đâu'."""
    first = service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
    )
    second = service.move(assignment_id=first.id, workstation_id="ws-t-002")

    assert second.id != first.id
    assert second.workstation_id == "ws-t-002"
    assert not first.is_active

    history = service.history(FLOOR, "ws-t-001")
    assert [h.id for h in history] == [first.id]


def test_chuyen_sang_dung_cho_dang_ngoi_thi_tu_choi(service, employees):
    first = service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
    )
    with pytest.raises(ValidationError):
        service.move(assignment_id=first.id, workstation_id="ws-t-001")


def test_moi_lan_gan_deu_ghi_audit_voi_ba_gia_tri_action(service, employees, db):
    """Mẫu số của KPI Tuần 6 (Issue #2 mục 5)."""
    service.assign(
        floor_id=FLOOR,
        workstation_id="ws-t-001",
        employee_id=employees["VSF001"].id,
        decision=SeatDecision.OVERRIDE,
        actor_id="actor-1",
    )
    db.flush()

    entry = db.query(AuditLog).filter(AuditLog.entity_type == "seat_assignment").one()
    assert entry.action == SeatDecision.OVERRIDE
    assert entry.actor_id == "actor-1"
    assert entry.data["workstation_id"] == "ws-t-001"
    assert entry.data["layout_version"] == LAYOUT


def test_tinh_trang_dung_cho_dem_theo_dataset(service, employees):
    service.assign(
        floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
    )
    occupancy = service.occupancy(FLOOR)

    assert occupancy.seats == 3
    assert occupancy.occupied == 1
    assert occupancy.free == 2
    assert occupancy.layout_version == LAYOUT


def test_tang_chua_co_dataset_thi_bao_loi(service):
    with pytest.raises(NotFoundError):
        service.list_active("floor-99")


class TestDoiChieuVoiDataset:
    """Điều kiện @CongDuc02 nêu khi đồng ý mục 2: `workstation_id` không có
    khóa ngoại, nên phải có cái báo khi bản vẽ đổi."""

    def test_moi_thu_khop_thi_khong_bao_gi(self, service, employees):
        service.assign(
            floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
        )
        report = service.reconcile(FLOOR)
        assert report.checked == 1
        assert report.stale == []

    def test_cho_ngoi_bien_mat_khoi_ban_ve_moi(self, service, employees, dataset, db):
        service.assign(
            floor_id=FLOOR, workstation_id="ws-t-003", employee_id=employees["VSF001"].id
        )

        # Bản vẽ mới: mất ws-t-003, hash đổi.
        (dataset / FLOOR / "floortest.workstations.json").write_text(
            json.dumps(
                {
                    "sourcePdfSha256": "b" * 64,
                    "workstations": [{"id": "ws-t-001"}, {"id": "ws-t-002"}],
                }
            ),
            encoding="utf-8",
        )
        catalog.reset_cache()

        report = service.reconcile(FLOOR)
        assert len(report.stale) == 1
        assert report.stale[0].reason == "missing-seat"
        assert report.stale[0].employee_code == "VSF001"

    def test_con_cho_nhung_gan_tu_thoi_ban_ve_khac(self, service, employees, dataset):
        service.assign(
            floor_id=FLOOR, workstation_id="ws-t-001", employee_id=employees["VSF001"].id
        )

        (dataset / FLOOR / "floortest.workstations.json").write_text(
            json.dumps(
                {
                    "sourcePdfSha256": "c" * 64,
                    "workstations": [{"id": "ws-t-001"}, {"id": "ws-t-002"}],
                }
            ),
            encoding="utf-8",
        )
        catalog.reset_cache()

        report = service.reconcile(FLOOR)
        assert [s.reason for s in report.stale] == ["old-layout"]

    def test_doi_chieu_khong_tu_thu_hoi_cua_ai(self, service, employees, dataset):
        assignment = service.assign(
            floor_id=FLOOR, workstation_id="ws-t-003", employee_id=employees["VSF001"].id
        )
        (dataset / FLOOR / "floortest.workstations.json").write_text(
            json.dumps({"sourcePdfSha256": "d" * 64, "workstations": [{"id": "ws-t-001"}]}),
            encoding="utf-8",
        )
        catalog.reset_cache()

        service.reconcile(FLOOR)
        assert assignment.is_active
