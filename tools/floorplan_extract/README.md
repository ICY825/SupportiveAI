# floorplan_extract

Offline tool: CAD-exported floor plan PDF → structured floor dataset for the
Floor Planning web map. Runs once per drawing revision; the web app never parses PDFs.

```bash
python3 -m venv .venv && .venv/bin/pip install -r tools/floorplan_extract/requirements.txt
.venv/bin/python tools/floorplan_extract/extract_floor.py floor16
```

Writes to `frontend/src/features/floor-planning/data/floors/<floor-id>/` and
`frontend/public/floor-sources/<floor-id>.webp`. Generated files must not be edited by hand.

## How it works

| Step | Source in the PDF | Output |
|---|---|---|
| Base geometry | vector paths grouped by optional-content layer (CAD layer name) | `layout.json` → `layers[]` (one SVG path per render group) |
| Scale & grid | `A-GRID` lines + grid bubble text + dimension chain totals | `mmPerPt`, `grid` |
| Zones, rooms | Acrobat markup annotations (Polygon / Highlight + FreeText label) | `zones.json` |
| Workstations | desk outline of the `1200x600` size that contains a `1200x600` label, plus exactly one chair symbol on a long edge | `workstations.json` |
| Clusters | connected components of touching desks | `workstations.json` → `clusters[]` |
| Facilities | CAD text labels (`MÁY IN`, `Tủ rack`, …) + smallest enclosing shape | `objects.json` |
| Report | counts, rules, hidden annotations, skipped layers | `extraction.json` |

All coordinates are PDF points with a top-left origin, i.e. the same space as the source raster.

## Stable IDs

`ws-<level>-NNN`, `cluster-<level>-NN`: numbered in reading order on first run. On re-runs
the previous `workstations.json` is read and an ID is reused when a desk/cluster centre is
within 1 pt (~10 cm) of its old position, so a revised drawing only adds or retires IDs.
Workstation IDs deliberately do **not** contain the zone: zones are department allocations
that change, physical desks do not.

## Adding a floor

1. Copy `floors/floor16.py` to `floors/floor17.py`; set the PDF path, grid spans, layer map,
   and the annotation IDs of its zones (list them with PyMuPDF `page.annots()`).
2. Run `extract_floor.py floor17` and review `floor17.extraction.json` plus the map in debug mode.
3. Add `frontend/src/features/floor-planning/data/floors/floor-17/index.ts` (copy floor-16) and
   register it in `data/registry.ts`.

Other drawings may use different layer names, desk sizes or no markup; the config is where
that is expressed. Check the rule output visually before trusting counts.
