"""Dữ liệu nền: phòng ban, nhân sự, vai trò, vị trí.

Revision ID: 0001
Revises:
Create Date: 2026-09-16
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "department",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=32), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("name_normalized", sa.String(length=255), nullable=True),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        # FK tới employee thêm ở cuối file: hai bảng tham chiếu vòng nhau
        # nên không đặt inline được.
        sa.Column("manager_employee_id", sa.String(length=36), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["department.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )
    op.create_index("ix_department_name_normalized", "department", ["name_normalized"])

    op.create_table(
        "employee",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("employee_code", sa.String(length=32), nullable=False),
        sa.Column("full_name", sa.String(length=255), nullable=False),
        sa.Column("full_name_normalized", sa.String(length=255), nullable=True),
        sa.Column("email", sa.String(length=255), nullable=True),
        sa.Column("phone", sa.String(length=32), nullable=True),
        sa.Column("phone_normalized", sa.String(length=32), nullable=True),
        sa.Column("phone_last4", sa.String(length=4), nullable=True),
        sa.Column("department_id", sa.String(length=36), nullable=True),
        sa.Column("job_title", sa.String(length=255), nullable=True),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="active"),
        sa.Column("password_hash", sa.String(length=128), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["department_id"], ["department.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_code"),
        sa.UniqueConstraint("email"),
        # mail-tracking.md §4.3: mỗi nhân sự một số điện thoại riêng.
        sa.UniqueConstraint("phone_normalized", name="uq_employee_phone_normalized"),
    )
    op.create_index("ix_employee_department_id", "employee", ["department_id"])
    op.create_index("ix_employee_name_normalized", "employee", ["full_name_normalized"])
    op.create_index("ix_employee_phone_last4", "employee", ["phone_last4"])

    op.create_table(
        "employee_role",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("employee_id", sa.String(length=36), nullable=False),
        sa.Column("role", sa.String(length=64), nullable=False),
        sa.ForeignKeyConstraint(["employee_id"], ["employee.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("employee_id", "role", name="uq_employee_role"),
    )
    op.create_index("ix_employee_role_employee_id", "employee_role", ["employee_id"])

    # Giờ mới gắn được FK quản lý phòng ban.
    op.create_foreign_key(
        "fk_department_manager",
        "department",
        "employee",
        ["manager_employee_id"],
        ["id"],
        ondelete="SET NULL",
    )

    op.create_table(
        "location",
        sa.Column("id", sa.String(length=36), nullable=False),
        sa.Column("code", sa.String(length=64), nullable=False),
        sa.Column("name", sa.String(length=255), nullable=False),
        sa.Column("building", sa.String(length=128), nullable=True),
        sa.Column("floor", sa.String(length=32), nullable=True),
        sa.Column("zone", sa.String(length=128), nullable=True),
        sa.Column("parent_id", sa.String(length=36), nullable=True),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.ForeignKeyConstraint(["parent_id"], ["location.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("code"),
    )


def downgrade() -> None:
    op.drop_table("location")
    op.drop_constraint("fk_department_manager", "department", type_="foreignkey")
    op.drop_index("ix_employee_role_employee_id", table_name="employee_role")
    op.drop_table("employee_role")
    op.drop_index("ix_employee_phone_last4", table_name="employee")
    op.drop_index("ix_employee_name_normalized", table_name="employee")
    op.drop_index("ix_employee_department_id", table_name="employee")
    op.drop_table("employee")
    op.drop_index("ix_department_name_normalized", table_name="department")
    op.drop_table("department")
