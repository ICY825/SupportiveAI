# SupportiveAI — Backend Service

Modular Monolith backend implementation based on **SupportiveAI Architecture v2.0**.

## Modules
- `app/api/`: REST API Routing (v1)
- `app/core/`: Configuration, DB sessions, Security
- `app/shared/`: Shared domain objects, contracts, DTOs, events, DB models, base repositories
- `app/modules/resource_allocation/`: Office Seat Planning & Locker Management
- `app/modules/document_flow/`: Mail Tracking & Official Document Management
- `app/ai/`: OCR, Layout Parser, Extraction, Classifier, AI Agent orchestration
- `app/workflow/`: Shared Workflow State Machine Engine with SLA tracking
- `app/notification/`: Event-driven notification service
- `app/scheduler/`: Background task scheduler
