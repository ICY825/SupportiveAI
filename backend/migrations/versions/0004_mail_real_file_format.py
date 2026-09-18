"""CR-001 — Đề 3 theo file mẫu thật từ lễ tân.

File thật không có mã vận đơn, số điện thoại hay phòng ban, nên khóa khớp
bậc 1 và khóa khử trùng lặp đều phải thay (CR-001 §0).

Bốn nhóm thay đổi:

* `mail_item` — bỏ `tracking_code`/`carrier`/`recipient_unit_raw`, thêm
  các cột đọc từ 6 cột của file mẫu, thêm `dedup_key` và `match_tier`.
* `mail_batch` — thêm `receipt_date` và các bộ đếm cho luồng gửi một phần.
* `matching_alias`, `mail_match_feedback` — hai bảng mới.
* `employee` — tách `upn` khỏi `email` (D8).

**Không đảo ngược được hoàn toàn:** `downgrade` dựng lại các cột cũ nhưng
dữ liệu trong `tracking_code`/`carrier`/`recipient_unit_raw` đã mất. Chấp
nhận được vì phân hệ chưa chạy thật — nếu đã có dữ liệu thì phải sao lưu
trước khi nâng cấp.

Revision ID: 0004
Revises: 0003
Create Date: 2026-09-17
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = '0004'
down_revision = '0003'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # --- employee: tách hộp thư thật khỏi tài khoản AD (CR-001 §3.5) ---
    op.add_column('employee', sa.Column('upn', sa.String(length=255), nullable=True))
    op.add_column('employee', sa.Column('email_source', sa.String(length=16), nullable=True))
    # Dữ liệu đang có là do HR cung cấp trực tiếp, coi như đã xác nhận.
    op.execute("UPDATE employee SET email_source = 'confirmed' WHERE email IS NOT NULL")

    # --- mail_batch ---
    op.add_column('mail_batch', sa.Column('receipt_date', sa.Date(), nullable=True))
    op.add_column('mail_batch', sa.Column('sent_count', sa.Integer(), nullable=False,
                                          server_default='0'))
    op.add_column('mail_batch', sa.Column('pending_match_count', sa.Integer(), nullable=False,
                                          server_default='0'))
    op.add_column('mail_batch', sa.Column('duplicate_suspect_count', sa.Integer(), nullable=False,
                                          server_default='0'))
    op.add_column('mail_batch', sa.Column('ambiguous_date', sa.Boolean(), nullable=False,
                                          server_default=sa.false()))
    op.execute('UPDATE mail_batch SET duplicate_suspect_count = skipped_duplicate')
    op.drop_column('mail_batch', 'skipped_duplicate')
    op.create_index('ix_mail_batch_receipt_date', 'mail_batch', ['receipt_date'])

    # --- mail_item ---
    op.add_column('mail_item', sa.Column('row_index', sa.Integer(), nullable=True))
    op.add_column('mail_item', sa.Column('sender_raw', sa.String(length=255), nullable=True))
    op.add_column('mail_item', sa.Column('sender_normalized', sa.String(length=255), nullable=True))
    op.add_column('mail_item', sa.Column('recipient_name_normalized', sa.String(length=255),
                                         nullable=True))
    op.add_column('mail_item', sa.Column('quantity', sa.Integer(), nullable=False,
                                         server_default='1'))
    op.add_column('mail_item', sa.Column('content_type', sa.String(length=255), nullable=True))
    op.add_column('mail_item', sa.Column('dedup_key', sa.String(length=64), nullable=True))
    op.add_column('mail_item', sa.Column('match_tier', sa.String(length=16), nullable=False,
                                         server_default='choose'))
    op.add_column('mail_item', sa.Column('review_confirmed', sa.Boolean(), nullable=False,
                                         server_default=sa.false()))
    op.add_column('mail_item', sa.Column('duplicate_suspect', sa.Boolean(), nullable=False,
                                         server_default=sa.false()))
    op.add_column('mail_item', sa.Column('duplicate_of_id', sa.String(length=36), nullable=True))
    op.create_foreign_key('fk_mail_item_duplicate_of', 'mail_item', 'mail_item',
                          ['duplicate_of_id'], ['id'], ondelete='SET NULL')

    # Tập giá trị `match_method` đổi (CR-001 §3.1): `phone4_name` không còn
    # nguồn dữ liệu, `name` tách thành `name_exact`/`name_fuzzy`.
    op.execute("UPDATE mail_item SET match_method = 'name_exact' WHERE match_method = 'name'")
    op.execute("UPDATE mail_item SET match_method = 'none' WHERE match_method = 'phone4_name'")
    op.execute("UPDATE mail_item SET match_tier = 'confirmed' WHERE match_method = 'phone'")

    # `tracking_code` UNIQUE là khóa khử trùng lặp cũ — bỏ hẳn cùng với cột.
    op.drop_constraint('uq_mail_item_tracking_code', 'mail_item', type_='unique')
    op.drop_column('mail_item', 'tracking_code')
    op.drop_column('mail_item', 'carrier')
    op.drop_column('mail_item', 'recipient_unit_raw')

    # Index, **không** UNIQUE: khóa tổ hợp chỉ đủ tin để cảnh báo mềm
    # (CR-001 §5.2). Ràng buộc cứng sẽ âm thầm nuốt kiện thật.
    op.create_index('ix_mail_item_dedup_key', 'mail_item', ['dedup_key'])
    op.create_index('ix_mail_item_sender', 'mail_item', ['sender_normalized'])
    op.create_index('ix_mail_item_recipient_name', 'mail_item', ['recipient_name_normalized'])

    # --- matching_alias: cơ chế khớp chính từ nay (CR-001 §3.3, D3) ---
    op.create_table(
        'matching_alias',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('raw_name_normalized', sa.String(length=255), nullable=False),
        sa.Column('employee_id', sa.String(length=36), nullable=False),
        sa.Column('hit_count', sa.Integer(), nullable=False, server_default='0'),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('last_used_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.ForeignKeyConstraint(['employee_id'], ['employee.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['created_by'], ['employee.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('raw_name_normalized', name='uq_matching_alias_raw_name'),
    )
    op.create_index('ix_matching_alias_employee_id', 'matching_alias', ['employee_id'])

    # --- mail_match_feedback: mẫu số KPI, và căn cứ đi đòi cột SĐT (§8.1) ---
    op.create_table(
        'mail_match_feedback',
        sa.Column('id', sa.String(length=36), nullable=False),
        sa.Column('mail_item_id', sa.String(length=36), nullable=True),
        sa.Column('batch_id', sa.String(length=36), nullable=True),
        sa.Column('suggested_employee_id', sa.String(length=36), nullable=True),
        sa.Column('chosen_employee_id', sa.String(length=36), nullable=True),
        sa.Column('match_method_before', sa.String(length=16), nullable=True),
        sa.Column('match_tier_before', sa.String(length=16), nullable=True),
        sa.Column('raw_name', sa.String(length=255), nullable=True),
        sa.Column('sender_raw', sa.String(length=255), nullable=True),
        sa.Column('created_by', sa.String(length=36), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.Column('updated_at', sa.DateTime(timezone=True), server_default=sa.text('now()'),
                  nullable=False),
        sa.ForeignKeyConstraint(['mail_item_id'], ['mail_item.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['batch_id'], ['mail_batch.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['suggested_employee_id'], ['employee.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['chosen_employee_id'], ['employee.id'], ondelete='SET NULL'),
        sa.ForeignKeyConstraint(['created_by'], ['employee.id'], ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_mail_feedback_batch', 'mail_match_feedback', ['batch_id'])


def downgrade() -> None:
    op.drop_index('ix_mail_feedback_batch', table_name='mail_match_feedback')
    op.drop_table('mail_match_feedback')
    op.drop_index('ix_matching_alias_employee_id', table_name='matching_alias')
    op.drop_table('matching_alias')

    op.drop_index('ix_mail_item_recipient_name', table_name='mail_item')
    op.drop_index('ix_mail_item_sender', table_name='mail_item')
    op.drop_index('ix_mail_item_dedup_key', table_name='mail_item')

    # Dựng lại khung cột cũ; nội dung của chúng thì không lấy lại được.
    op.add_column('mail_item', sa.Column('tracking_code', sa.String(length=64), nullable=True))
    op.add_column('mail_item', sa.Column('carrier', sa.String(length=128), nullable=True))
    op.add_column('mail_item', sa.Column('recipient_unit_raw', sa.String(length=255),
                                         nullable=True))
    op.create_unique_constraint('uq_mail_item_tracking_code', 'mail_item', ['tracking_code'])

    op.execute("UPDATE mail_item SET match_method = 'name' "
               "WHERE match_method IN ('name_exact', 'name_fuzzy', 'alias')")

    op.drop_constraint('fk_mail_item_duplicate_of', 'mail_item', type_='foreignkey')
    for column in ('duplicate_of_id', 'duplicate_suspect', 'review_confirmed', 'match_tier',
                   'dedup_key', 'content_type', 'quantity', 'recipient_name_normalized',
                   'sender_normalized', 'sender_raw', 'row_index'):
        op.drop_column('mail_item', column)

    op.drop_index('ix_mail_batch_receipt_date', table_name='mail_batch')
    op.add_column('mail_batch', sa.Column('skipped_duplicate', sa.Integer(), nullable=False,
                                          server_default='0'))
    op.execute('UPDATE mail_batch SET skipped_duplicate = duplicate_suspect_count')
    for column in ('ambiguous_date', 'duplicate_suspect_count', 'pending_match_count',
                   'sent_count', 'receipt_date'):
        op.drop_column('mail_batch', column)

    op.drop_column('employee', 'email_source')
    op.drop_column('employee', 'upn')
