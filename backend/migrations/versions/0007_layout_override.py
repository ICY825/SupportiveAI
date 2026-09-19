"""Record explicit human overrides of extracted geometry.

Revision ID: 0007
Revises: 0006
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision = '0007'
down_revision = '0006'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('layout_placement', sa.Column('override_reason', sa.String(length=1000), nullable=True))
    op.add_column('layout_placement', sa.Column('override_conflicts', sa.JSON().with_variant(JSONB(), 'postgresql'), nullable=True))


def downgrade() -> None:
    op.drop_column('layout_placement', 'override_conflicts')
    op.drop_column('layout_placement', 'override_reason')
