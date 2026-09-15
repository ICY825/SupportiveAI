
# Administrative AI Platform Architecture
## SupportiveAI

> Solution Architecture Design for 4 Administrative AI Pilot Modules

---

# 1. Executive Summary

This document proposes a unified architecture for the four administrative AI pilot topics as **one platform with four independent business modules** implemented using a **Modular Monolith** architecture.

## Pilot Scope (6 weeks)

| Module | Business Domain |
|--------|-----------------|
| F1 | Office Seat Planning |
| F2 | Locker Allocation |
| F3 | Incoming Mail Tracking |
| F4 | Official Document Management |

**Architecture Principle**

> One Platform + Four Modules + Shared AI Layer + Shared Workflow Engine.

---

# 2. Business Domain Analysis

## Bounded Context

```mermaid
flowchart LR
    A[Office Seat Planning]
    B[Locker Allocation]
    C[Mail Tracking]
    D[Official Documents]

    subgraph Resource Allocation
        A
        B
    end

    subgraph Document Flow
        C
        D
    end

    Resource Allocation --- Shared[(Shared Platform)]
    Document Flow --- Shared
```

Two business domains share employee, department, workflow, notification and KPI services.

---

# 3. Overall Platform Architecture

```mermaid
flowchart TB

UI[Admin Portal / Dashboard]

subgraph Platform
API[Backend API Gateway]

subgraph Shared Services
EMP[Employee & Department]
WF[Workflow Engine]
NOTI[Notification Service]
AUDIT[Audit Log]
RBAC[RBAC Permission]
end

subgraph Business Modules
SEAT[Seat Planning]
LOCKER[Locker Management]
MAIL[Mail Tracking]
DOC[Official Documents]
end

subgraph AI Layer
OCR[OCR Service]
PARSER[Document Parser]
CLASSIFIER[Classification]
EXTRACT[Field Extraction]
AGENT[AI Agent Orchestrator]
end
end

DB[(PostgreSQL)]
OBJ[(Object Storage)]
REDIS[(Redis Queue)]

UI --> API

API --> SEAT
API --> LOCKER
API --> MAIL
API --> DOC

SEAT --> EMP
LOCKER --> EMP
MAIL --> EMP
DOC --> EMP

MAIL --> OCR
DOC --> OCR
OCR --> PARSER --> EXTRACT --> CLASSIFIER --> AGENT

WF --> NOTI

API --> DB
OCR --> OBJ
WF --> REDIS
AUDIT --> DB
```

---

# 4. Layered Architecture

```mermaid
flowchart TB

P[Presentation Layer]

A[Application Layer]

D1[Resource Allocation Module]
D2[Document Flow Module]

AI[AI Service Layer]

INFRA[(Infrastructure)]

P --> A
A --> D1
A --> D2
D1 --> AI
D2 --> AI
AI --> INFRA
D1 --> INFRA
D2 --> INFRA
```

---

# 5. Shared Workflow Engine

Every module is implemented as a configurable state machine.

```mermaid
stateDiagram-v2

[*] --> Created

Created --> Assigned
Assigned --> InProgress
InProgress --> Completed

Assigned --> Overdue
Overdue --> Completed
Completed --> Archived
```

Used by:

- Locker Allocation
- Mail Tracking
- Official Documents
- Seat Assignment Approval

---

# 6. Event-Driven Notification

```mermaid
flowchart LR

Module1[Business Module]
Module2[AI Agent]

EVENT[(Event Bus)]

EMAIL[Email]
TEAMS[Teams]
QR[QR Notification]
DASH[Dashboard]

Module1 --> EVENT
Module2 --> EVENT

EVENT --> EMAIL
EVENT --> TEAMS
EVENT --> QR
EVENT --> DASH
```

---

# 7. Resource Allocation Module

## Entity Relationship

```mermaid
erDiagram

EMPLOYEE ||--o{ RESOURCE_ASSIGNMENT : owns
RESOURCE ||--o{ RESOURCE_ASSIGNMENT : allocated
LOCATION ||--o{ RESOURCE : contains
DEPARTMENT ||--o{ EMPLOYEE : contains

EMPLOYEE {
 uuid employee_id
 string full_name
 string department
}

RESOURCE {
 uuid resource_id
 string resource_type
 string status
}

RESOURCE_ASSIGNMENT {
 uuid assignment_id
 datetime assigned_at
 datetime returned_at
}
```

## Workflow

```mermaid
flowchart LR

NewEmployee --> SuggestSeat
SuggestSeat --> AssignSeat
AssignSeat --> NotifyEmployee
NotifyEmployee --> Confirm
Confirm --> Active
```

---

# 8. Document Flow Module

```mermaid
flowchart TB

Receive[Receive Scan / Email]

OCR --> Extract --> Classify

Classify --> AssignDepartment

AssignDepartment --> NotifyOwner

NotifyOwner --> ConfirmReceive

ConfirmReceive --> Processing

Processing --> Complete
Processing --> Overdue
```

---

# 9. AI Pipeline

## OCR + Extraction Pipeline

```mermaid
flowchart LR

PDF --> OCR

OCR --> Layout

Layout --> Extraction

Extraction --> Classification

Classification --> Validation

Validation --> HumanReview

HumanReview --> Dataset
```

### AI Components

| Component | Purpose |
|----------|---------|
| OCR | Convert image to text |
| Layout Parser | Identify structure |
| Extractor | Metadata extraction |
| Classifier | Document category |
| Validator | Confidence scoring |
| Human Review | Feedback collection |

---

# 10. AI Agent Architecture

```mermaid
flowchart LR

INPUT[User Input / Document]

PLAN[Planner]

TOOLS[Tool Calling]

LLM[Decision]

HUMAN[Human Approval]

OUTPUT[Workflow Action]

INPUT --> PLAN
PLAN --> TOOLS
TOOLS --> LLM
LLM --> HUMAN
HUMAN --> OUTPUT
```

## Tool Calling Examples

| Tool | Used In |
|------|---------|
| OCR Tool | Document |
| Employee Search | Mail / Document |
| Workflow Tool | All modules |
| Notification Tool | All modules |

---

# 11. Core Data Model

```mermaid
erDiagram

EMPLOYEE ||--o{ DOCUMENT : receives
EMPLOYEE ||--o{ RESOURCE_ASSIGNMENT : owns

DOCUMENT ||--o{ WORKFLOW_INSTANCE : has
RESOURCE ||--o{ WORKFLOW_INSTANCE : has

DEPARTMENT ||--o{ EMPLOYEE : contains

WORKFLOW_INSTANCE {
 uuid id
 string state
 datetime due_date
}
```

---

# 12. RBAC Permission Model

| Role | Permission |
|------|------------|
| Admin HC | Full access |
| Employee | View own resources/documents |
| Department Manager | Approve department documents |
| Văn thư | Manage incoming/outgoing documents |

---

# 13. KPI Architecture

```mermaid
flowchart TB

BUSINESS[Business KPI]
AUTO[Automation KPI]
AI[AI KPI]

BUSINESS --> DASH
AUTO --> DASH
AI --> DASH

DASH[Dashboard]
```

## KPI Matrix

| KPI Type | Metric |
|----------|--------|
| Business | Processing Time |
| Business | SLA Completion |
| Automation | Auto-routing Rate |
| Automation | Reminder Automation |
| AI | OCR Accuracy |
| AI | Extraction Accuracy |
| AI | Classification Accuracy |
| AI | Human Correction Rate |

---

# 14. API Boundary

## Resource Allocation APIs

| Method | Endpoint |
|--------|----------|
| GET | /resources |
| POST | /resources/assign |
| POST | /resources/return |
| GET | /resources/history |

## Document APIs

| Method | Endpoint |
|--------|----------|
| POST | /documents/upload |
| GET | /documents |
| POST | /documents/{id}/confirm |
| POST | /documents/{id}/approve |

---

# 15. Deployment Architecture

```mermaid
flowchart LR

Browser --> FastAPI

FastAPI --> PostgreSQL

FastAPI --> Redis

FastAPI --> ObjectStorage

FastAPI --> Worker

Worker --> AI
```

---

# 16. 6-Week Delivery Plan

```mermaid
gantt
title SupportiveAI Administrative AI Pilot

dateFormat YYYY-MM-DD

section Foundation
Core Platform          :2026-09-21,5d

section Resource Allocation
Locker MVP             :2026-09-28,8d
Seat Visualization MVP :2026-10-05,8d

section Document Flow
Mail MVP               :2026-09-28,8d
Official Document MVP  :2026-10-05,10d

section AI
OCR Pipeline           :2026-09-30,10d
AI Agent Routing       :2026-10-08,8d

section Integration
Dashboard & KPI        :2026-10-15,5d
Testing                :2026-10-20,4d
```

---

# 17. Risks

| Risk | Mitigation |
|------|------------|
| Dirty employee data | Standardize employee ID in Week 1 |
| OCR quality | Human review with confidence threshold |
| Scope creep in Seat Planning | Deliver visualization MVP first |
| Integration conflicts | Shared API contract + module ownership |

---

# 18. Architecture Decisions (ADR)

## ADR-001 — Modular Monolith

**Decision**

Use one codebase and one database with isolated modules.

**Reason**

- Small team.
- Six-week pilot.
- Shared workflow and AI services.

---

## ADR-002 — Shared Workflow Engine

Workflow engine is implemented once and configured per module.

---

## ADR-003 — AI Agent Layer

AI orchestration is separated from business logic through tool calling.

---

## ADR-004 — Event-Driven Notification

Business modules publish events instead of directly sending notifications.

---

# 19. Suggested Repository Structure

```text
SupportiveAI/
├── backend/
│   ├── modules/
│   │   ├── resource_allocation/
│   │   ├── document_flow/
│   │   └── shared/
│   ├── ai/
│   │   ├── ocr/
│   │   ├── parser/
│   │   ├── extraction/
│   │   └── agent/
│   ├── workflow/
│   ├── notification/
│   └── auth/
├── docs/
│   └── architecture/
│       └── admin-ai-platform-architecture.md
└── frontend/
```

---

# 20. Implementation Priorities

## Phase 1 (Pilot)

- Shared Platform.
- Locker Allocation.
- Mail Tracking.
- OCR Pipeline.
- Dashboard.

## Phase 2

- Seat Optimization Engine.
- AI Layout Recommendation.
- Official Document Routing Agent.
- Analytics & Recommendation Engine.

---

# Conclusion

The recommended architecture is:

> **Administrative AI Platform = Shared Platform + Four Independent Business Modules + AI Agent Layer**

This design maximizes code reuse, supports independent KPI measurement for each pilot topic, and remains achievable within a six-week implementation timeline.
