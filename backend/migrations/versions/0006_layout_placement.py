"""Đề 1 — bảng vị trí bàn do người dùng đặt lại.

Một bảng, giữ *phần chênh* so với bản vẽ chứ không giữ bản vẽ: dataset sinh
từ trích xuất (Issue #2 mục 2) vẫn quyết định tầng có những bàn nào, bảng này
chỉ nhớ bàn nào đã bị kéo đi đâu.

`entity_id` **không có khóa ngoại** vì thứ nó trỏ tới là một file JSON chứ
không phải một bảng — cùng lý do với `seat_assignment.workstation_id`. Bù lại
có `layout_version` (sha256 của PDF nguồn lúc lưu), để
`GET /api/layouts/floors/{id}/reconcile` chỉ ra được bản ghi nào đặt theo bản
vẽ cũ sau khi ai đó chạy lại bộ trích xuất.

Chỉ giữ trạng thái hiện tại: chỉ mục duy nhất trên `(floor_id, entity_id)`
biến mỗi lần ghi thành upsert. Cần lịch sử bố trí thì đó là quyết định khác.

`chair` để JSON vì hình dạng ghế đổi theo loại bàn, và chỉ frontend hiểu nó.
Postgres dùng JSONB, SQLite dùng JSON — giống `audit_log.data`.

Revision ID: 0006
Revises: 0005
Create Date: 2026-09-19
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = '0006'
down_revision = '0005'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'layout_placement',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('floor_id', sa.String(length=32), nullable=False),
        sa.Column('entity_id', sa.String(length=64), nullable=False),
        sa.Column('layout_version', sa.String(length=64), nullable=False),
        sa.Column('x', sa.Float(), nullable=False),
        sa.Column('y', sa.Float(), nullable=False),
        sa.Column('width', sa.Float(), nullable=False),
        sa.Column('depth', sa.Float(), nullable=False),
        sa.Column('rotation', sa.Float(), nullable=False),
        sa.Column('chair', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=True),
        sa.Column('seated_side', sa.String(length=8), nullable=True),
        sa.Column('updated_by', sa.String(length=36), nullable=True),
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
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(
        'uq_layout_placement_entity',
        'layout_placement',
        ['floor_id', 'entity_id'],
        unique=True,
    )


def downgrade() -> None:
    op.drop_index('uq_layout_placement_entity', table_name='layout_placement')
    op.drop_table('layout_placement')
