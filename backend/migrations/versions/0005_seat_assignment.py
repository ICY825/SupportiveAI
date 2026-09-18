"""Đề 1 — bảng gán chỗ ngồi.

Một bảng duy nhất, không giữ hình học: bàn, phòng và vật cản nằm trong dataset
sinh từ bản vẽ (Issue #2 mục 2), DB chỉ giữ ai ngồi đâu từ bao giờ.

`workstation_id` **không có khóa ngoại** vì thứ nó trỏ tới là một file JSON
chứ không phải một bảng. Bù lại có `layout_version` — sha256 của PDF nguồn
lúc gán — để lệnh đối chiếu (`GET /api/seats/floors/{id}/reconcile`) chỉ ra
được bản ghi nào còn trỏ đúng sau khi ai đó chạy lại bộ trích xuất. Đây là
điều kiện @CongDuc02 nêu khi đồng ý mục 2.

Hai chỉ mục duy nhất **từng phần** (`WHERE released_at IS NULL`) ép quy tắc
một chỗ một người và một người một chỗ, mà vẫn cho lịch sử trùng bao nhiêu
lần tùy ý. Postgres và SQLite đều hiểu cú pháp này; nếu sau có backend khác
thì phải đổi sang ràng buộc ở tầng ứng dụng.

Revision ID: 0005
Revises: 0004
Create Date: 2026-09-18
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0005'
down_revision = '0004'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'seat_assignment',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('floor_id', sa.String(length=32), nullable=False),
        sa.Column('workstation_id', sa.String(length=64), nullable=False),
        sa.Column('layout_version', sa.String(length=64), nullable=False),
        sa.Column('employee_id', sa.String(length=36), nullable=False),
        sa.Column('assigned_at', sa.DateTime(timezone=True), nullable=False),
        sa.Column('released_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('assigned_by', sa.String(length=36), nullable=True),
        sa.Column('decision', sa.String(length=16), nullable=False),
        sa.Column('note', sa.String(length=500), nullable=True),
        sa.Column(
            'created_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.Column(
            'updated_at',
            sa.DateTime(timezone=True),
            server_default=sa.text('now()'),
            nullable=False,
        ),
        sa.ForeignKeyConstraint(['employee_id'], ['employee.id'], ondelete='RESTRICT'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'ix_seat_assignment_workstation', 'seat_assignment', ['floor_id', 'workstation_id']
    )
    op.create_index('ix_seat_assignment_employee', 'seat_assignment', ['employee_id'])
    op.create_index(
        'uq_seat_assignment_active_seat',
        'seat_assignment',
        ['floor_id', 'workstation_id'],
        unique=True,
        sqlite_where=sa.text('released_at IS NULL'),
        postgresql_where=sa.text('released_at IS NULL'),
    )
    op.create_index(
        'uq_seat_assignment_active_employee',
        'seat_assignment',
        ['employee_id'],
        unique=True,
        sqlite_where=sa.text('released_at IS NULL'),
        postgresql_where=sa.text('released_at IS NULL'),
    )


def downgrade() -> None:
    op.drop_index('uq_seat_assignment_active_employee', table_name='seat_assignment')
    op.drop_index('uq_seat_assignment_active_seat', table_name='seat_assignment')
    op.drop_index('ix_seat_assignment_employee', table_name='seat_assignment')
    op.drop_index('ix_seat_assignment_workstation', table_name='seat_assignment')
    op.drop_table('seat_assignment')
