# Floor planning documentation

Two kinds of document live in this folder, and they are read differently.

**Reference — kept true.** These describe how the module works now. If the code
changes and one of these becomes wrong, the document is the defect. Edit it in
place; do not append a dated section to it.

| Document | Answers |
| --- | --- |
| [`engine-architecture.md`](engine-architecture.md) | How a PDF becomes a rendered, editable floor: the pipeline, the layers, and the invariants each one holds. |
| [`persistence.md`](persistence.md) | What survives a page reload, what does not, and which store owns each kind of edit. |
| [`adding-a-floor.md`](adding-a-floor.md) | The checklist for extracting and registering a new floor. |

**History — frozen.** Handoffs, inspection records and measurements, each
written on a date against a branch. They are evidence of what was true and why
a decision was taken. They are not maintained, and a later one does not amend
an earlier one. Never treat a handoff as a description of current behaviour;
check the reference documents or the code.

| Document | Date | Subject |
| --- | --- | --- |
| [`workspace-spatial-spike.md`](workspace-spatial-spike.md) | 16 Sep 2026 | Read-only visual prototype, 19 workstations. |
| [`data-driven-floor-generation.md`](data-driven-floor-generation.md) | 16 Sep 2026 | Assessment of the extraction pipeline against a full floor. |
| [`floor-16-extraction.md`](floor-16-extraction.md) | — | Findings from extracting Floor 16 from its PDF. |
| [`luna-seating-usability-handoff.md`](luna-seating-usability-handoff.md) | 17 Sep 2026 | Seating view walkthrough as a non-technical user. |
| [`luna-assign-employee-handoff.md`](luna-assign-employee-handoff.md) | 17 Sep 2026 | Assigning an employee to a seat. |
| [`luna-six-area-editor-handoff.md`](luna-six-area-editor-handoff.md) | 17 Sep 2026 | Six-area workspace editor with spatial context. |
| [`luna-six-area-fix-and-minimap.md`](luna-six-area-fix-and-minimap.md) | 17 Sep 2026 | Six-area defects and the area locator map. |
| [`luna-authored-entities-handoff.md`](luna-authored-entities-handoff.md) | 17 Sep 2026 | Adding and removing desks and rooms. |
| [`luna-live-data-honesty-handoff.md`](luna-live-data-honesty-handoff.md) | 18 Sep 2026 | Telling the truth when the view is talking to the server. |
| [`handoffs.md`](handoffs.md) | 18 Sep 2026 | Authored-desk placement, display-area data, floor-density readiness. |
| [`floor16-performance.md`](floor16-performance.md) | 18 Sep 2026 | Measured loading evidence for Floor 16. |
| [`non-orthogonal-desks-and-render-budget.md`](non-orthogonal-desks-and-render-budget.md) | 18 Sep 2026 | Why diagonal desks were mishandled, and where the lag actually is. |
| [`non-orthogonal-placement-handoff.md`](non-orthogonal-placement-handoff.md) | 18 Sep 2026 | Instructions for oriented placement and the payload split. |

## Where the code is

| Area | Path |
| --- | --- |
| Extraction (Python) | `tools/floorplan_extract/` |
| Generated artifacts | `data/floors/<floor-id>/` |
| Web module | `frontend/src/features/floor-planning/` |
| Seat assignments (API) | `backend/app/modules/resource_allocation/seat/` |
