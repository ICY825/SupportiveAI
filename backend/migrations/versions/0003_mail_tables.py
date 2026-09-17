"""Đề 3 — chuyển phát nhanh: bảng mail_batch và mail_item.

Revision ID: 0003
Revises: 0002
Create Date: 2026-09-16 16:01:47.374440
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
import sqlalchemy as sa

revision = '0003'
down_revision = '0002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table('mail_batch',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('source_filename', sa.String(length=512), nullable=False),
    sa.Column('uploaded_by', sa.String(length=36), nullable=False),
    sa.Column('uploaded_at', sa.DateTime(timezone=True), nullable=False),
    sa.Column('row_count', sa.Integer(), nullable=False),
    sa.Column('matched_count', sa.Integer(), nullable=False),
    sa.Column('skipped_duplicate', sa.Integer(), nullable=False),
    sa.Column('status', sa.String(length=16), nullable=False),
    sa.Column('sent_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['uploaded_by'], ['employee.id'], ondelete='RESTRICT'),
    sa.PrimaryKeyConstraint('id')
    )
    op.create_table('mail_item',
    sa.Column('id', sa.String(length=36), nullable=False),
    sa.Column('batch_id', sa.String(length=36), nullable=False),
    sa.Column('tracking_code', sa.String(length=64), nullable=True),
    sa.Column('carrier', sa.String(length=128), nullable=True),
    sa.Column('recipient_name_raw', sa.String(length=255), nullable=True),
    sa.Column('recipient_phone_raw', sa.String(length=64), nullable=True),
    sa.Column('recipient_unit_raw', sa.String(length=255), nullable=True),
    sa.Column('employee_id', sa.String(length=36), nullable=True),
    sa.Column('match_method', sa.String(length=16), nullable=False),
    sa.Column('match_confidence', sa.Numeric(precision=3, scale=2), nullable=True),
    sa.Column('received_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('notified_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('collected_at', sa.DateTime(timezone=True), nullable=True),
    sa.Column('collected_by', sa.String(length=36), nullable=True),
    sa.Column('handover_method', sa.String(length=20), nullable=True),
    sa.Column('status', sa.String(length=20), nullable=False),
    sa.Column('note', sa.Text(), nullable=True),
    sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=False),
    sa.ForeignKeyConstraint(['batch_id'], ['mail_batch.id'], ondelete='CASCADE'),
    sa.ForeignKeyConstraint(['collected_by'], ['employee.id'], ondelete='SET NULL'),
    sa.ForeignKeyConstraint(['employee_id'], ['employee.id'], ondelete='SET NULL'),
    sa.PrimaryKeyConstraint('id'),
    # Khóa khử trùng lặp (mail-tracking.md §3.3). Để nullable vì file
    # thiếu mã vận đơn vẫn phải nhận vào rồi đánh dấu cần kiểm tay;
    # Postgres không coi nhiều NULL là trùng nhau nên ràng buộc vẫn đúng.
    sa.UniqueConstraint('tracking_code', name='uq_mail_item_tracking_code')
    )
    op.create_index('ix_mail_item_batch', 'mail_item', ['batch_id'], unique=False)
    op.create_index('ix_mail_item_employee', 'mail_item', ['employee_id'], unique=False)
    op.create_index('ix_mail_item_status', 'mail_item', ['status'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_mail_item_status', table_name='mail_item')
    op.drop_index('ix_mail_item_employee', table_name='mail_item')
    op.drop_index('ix_mail_item_batch', table_name='mail_item')
    op.drop_table('mail_item')
    op.drop_table('mail_batch')
