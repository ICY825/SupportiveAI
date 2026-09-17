# ADR 0001 — Floor Planning V1: web stack and floor data pipeline

**Status:** Accepted (confirmed for pilot frontend implementation)
**Date:** 2026-09-15

## Context

Floor Planning (Đề 1) needs an interactive floor map built from the CAD-exported layout PDFs in
`docs/references/`. The repository had no application code; README lists the frontend as undecided.

## Decision

1. **Frontend:** React 19 + TypeScript + Vite in `frontend/`, feature folder
   `src/features/floor-planning/`. Chosen because the wireframes (Claude Design) are React based and
   the map is SVG-heavy client-side work. Visual tokens follow `docs/wireframe`.
2. **Map rendering:** one SVG in floor coordinates (PDF points). Base CAD geometry as a few large
   `<path>` elements per layer group; interactive entities (zones, rooms, workstations, objects) as
   individual shapes with `data-entity-id`. No map library.
3. **PDF → data offline:** `tools/floorplan_extract` (Python, PyMuPDF) reads vector paths, CAD layer
   names, text and markup annotations and writes JSON per floor. The browser never parses PDFs.
4. **Workstation ≠ Seat.** Extraction produces physical workstations only. `Seat`, `Employee`,
   `Department`, `Assignment` exist as types in `domain/allocation.ts` with no records.
5. **Verification states** (`SOURCE_VERIFIED`, `EXTRACTED`, `UNVERIFIED`, `UNKNOWN`) replace any
   occupancy colouring until allocation data exists.

## Consequences

- Adding a floor = extractor config + generated dataset + one registry entry; renderer unchanged.
- The per-floor layout JSON is ~2.9 MB (~0.7 MB gzip). Loaded lazily per floor. If floors grow,
  move datasets behind the planned FastAPI backend or pre-simplify furniture geometry.
- Generated data lives in the repo for the POC; when the backend exists it should own floor data
  (README §7 `seat.layout_version`).
