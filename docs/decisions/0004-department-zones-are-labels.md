# ADR 0004: department zones label ownership, walls constrain placement

Status: accepted
Date: 2026-09-19

## Decision

Department zones remain source annotations that identify ownership, but they no
longer constrain furniture placement. The editor validates physical placement
against the floor plate, room geometry, extracted obstacles, and straight runs
from the `walls` and `partitions` layers. Facade and structure remain outside
wall collision validation; facade geometry continues to support alignment hints.

Wall and partition conflicts are overridable because those runs are extracted
geometry and may omit openings or contain drafting artifacts. Desk and chair
overlap, floor-plate escape, and non-positive dimensions remain hard failures.

## Rationale

A department annotation answers who owns a desk, not whether a table can stand
there. The previous rule made real desks beside the angled facade impossible to
represent even when they crossed no physical wall. Physical wall geometry is a
more meaningful constraint, while extracted wall conflicts retain the override
path established by ADR 0003.

## Consequences

- A desk outside its department polygon can be valid with no warning when it
  crosses no physical wall.
- Walls and partitions are tested as zero-width segments; flush contact is
  valid, and doorway gaps remain open when the source path contains a gap.
- `facade` and `structure` are not collision layers in this decision.
