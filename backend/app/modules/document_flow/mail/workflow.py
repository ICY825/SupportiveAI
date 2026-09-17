"""Khai báo workflow của phân hệ chuyển phát nhanh.

Engine nằm ở `platform/workflow`, **cấu hình nằm ở đây**
(repository-structure.md §4.1). Engine không biết "notified" nghĩa là gì.

Quy tắc chốt 16/09/2026 (mail-tracking.md §8.3, §8.5):

    T+0   HC bấm gửi       → thông báo lần đầu
    T+2   vẫn chưa nhận    → nhắc lại một lần, không cc ai
    T+5   vẫn chưa nhận    → chuyển `Tồn đọng`

SLA gắn với **trạng thái**, không phải đồng hồ hẹn giờ: kiện đã xác nhận
rời khỏi `notified` nên không lọt vào bất kỳ mốc nào phía sau.
"""

from __future__ import annotations

from app.modules.document_flow.mail.models import MailStatus
from app.platform.workflow import SLA, Transition, WorkflowDefinition

ENTITY_TYPE = "mail_item"

# Tên hành động SLA. Scheduler đọc tên này để biết phải làm gì;
# engine chỉ chuyển tên đi, không hiểu nội dung.
ACTION_REMIND = "remind"
ACTION_ABANDON = "abandon"

# Trigger chuyển trạng thái.
TRIGGER_NOTIFY = "notify"
TRIGGER_COLLECT = "collect"
TRIGGER_ABANDON = "abandon"

# Số ngày, tính theo giờ đồng hồ (§8.4 — Đề 3 không dùng giờ làm việc).
REMIND_AFTER_DAYS = 2
ABANDON_AFTER_DAYS = 5

MAIL_WORKFLOW = WorkflowDefinition(
    entity_type=ENTITY_TYPE,
    states=MailStatus.ALL,
    initial_state=MailStatus.PENDING_MATCH,
    terminal_states=(MailStatus.COLLECTED,),
    transitions=(
        Transition(
            trigger=TRIGGER_NOTIFY,
            source=(MailStatus.PENDING_MATCH,),
            target=MailStatus.NOTIFIED,
        ),
        # Nhận được cả sau khi đã chuyển tồn đọng: người ta vẫn có thể
        # xuống lấy muộn và việc đó phải ghi nhận được, nếu không kiện sẽ
        # mắc kẹt ở `Tồn đọng` vĩnh viễn dù thực tế đã có người lấy.
        Transition(
            trigger=TRIGGER_COLLECT,
            source=(MailStatus.NOTIFIED, MailStatus.ABANDONED),
            target=MailStatus.COLLECTED,
        ),
        Transition(
            trigger=TRIGGER_ABANDON,
            source=(MailStatus.NOTIFIED,),
            target=MailStatus.ABANDONED,
        ),
    ),
    sla=(
        SLA(
            state=MailStatus.NOTIFIED,
            action=ACTION_REMIND,
            after_days=REMIND_AFTER_DAYS,
            business_time=False,
        ),
        SLA(
            state=MailStatus.NOTIFIED,
            action=ACTION_ABANDON,
            after_days=ABANDON_AFTER_DAYS,
            business_time=False,
        ),
    ),
)
