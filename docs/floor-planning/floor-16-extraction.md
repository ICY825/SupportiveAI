# Floor 16 — extraction findings (V1 POC)

Source: `docs/references/260710_VSF_Layout tang 16.pdf` — "MẶT BẰNG CẢI TẠO TẦNG 16", scale 1/150.
Generated data: `data/floors/floor-16/` (see `floor16.extraction.json`).

## The PDF

- 1 page, A3 landscape, created by ZWCAD, written by PDFlib. **Pure vector: 0 raster images.**
- 458,123 vector path objects, 865 text lines, all inside optional-content groups named after the
  CAD layers (`Xref.TNP.Tang16-doNT$0$A-FURN`, `…tuongxay$0$KT-Tuong`, …). Desk and chair blocks are
  mostly un-layered.
- Department zones are **not CAD geometry**: they are Acrobat markup annotations added by a reviewer
  (5 visible Polygon/Highlight shapes + FreeText labels, 2 room highlights with text boxes,
  5 hidden polygons with opacity 0).
- Scale from the grid: 105.83 mm per PDF point (K→A = 90,500 mm, 7→1 = 56,000 mm; X and Y agree to 0.02 %).
- Every desk block is drawn twice (duplicate outline and duplicate `1200x600` label): 764 labels → 382 desks.

## Extracted

| Item | Count | State | How |
|---|---|---|---|
| Base geometry layers | 10 groups from 24 CAD layers + un-layered blocks | STRUCTURAL / FURNITURE / UNKNOWN per layer | vector paths, de-duplicated, 0.1 pt precision |
| Structural grid | 11 columns (K…A), 8 rows (7…1 incl. 4.1) | — | `A-GRID` lines |
| Labelled zones | 4 | SOURCE_VERIFIED | annotation geometry + label |
| Unlabelled highlighted zone | 1 (grid D-C / 3-2) | UNKNOWN | highlight without any label |
| Rooms "Phòng CBLĐ" | 2 | SOURCE_VERIFIED | highlight + text box |
| Desk clusters | 61 | EXTRACTED | touching desks |
| Workstations | 382 | EXTRACTED | `1200x600` desk + exactly one chair on a long edge |
| Desks with no / shared chair | 0 | — | — |
| Printers (`MÁY IN`) | 8 labelled symbols at 4 locations | EXTRACTED | label + enclosing shape |
| Tủ rack, VRV air-con unit | 1 each | EXTRACTED | label + enclosing shape |
| Tủ điện, Máng cáp ×2 | 3 | UNVERIFIED | label only, outline not identified |
| Objects labelled `2400x400` | 2 | UNKNOWN | dimension label only |

Workstations per zone (point-in-polygon of the desk centre):

| Zone | Workstations found | Figure on source label |
|---|---|---|
| VINFAST-KDO2O | 46 | none |
| KINH DOANH & VẬN HÀNH GSM | 38 | (38) |
| BẤT ĐỘNG SẢN - SMART CITY | 143 | (143) |
| MÔ HÌNH & NỀN TẢNG AI | 116 | (145) |
| Unlabelled zone | 38 | none |
| Outside every zone | 1 (`ws-16-030`, grid J-I / 7-6, room marked "PHÒNG CÁCH ÂM") | — |

Two label figures equal the desk counts; the AI zone does not (116 inside its polygon, 154 if the
adjacent unlabelled area is added). The figure's meaning is **not stated**, so it is shown as a
source label figure, never as capacity.

## Manually traced

Nothing was traced by hand. Manual input is limited to the floor config
(`tools/floorplan_extract/floors/floor16.py`): which annotation is which zone/room, the CAD layer →
render group/classification map, the facility label list, and rule thresholds.

## Deliberately not imported

- Occupant names written in the two "Phòng CBLĐ" text boxes (assignment data → Phase 2 via HR).
- Annotation author names.
- `A-TREE` planting symbols (27k strokes, decorative; still visible in the source overlay).
- Hidden (opacity 0) annotation polygons — listed in `floor16.extraction.json`.

## UNKNOWN / open

1. Purpose/owner of the unlabelled lavender highlight (D-C / 3-2, 38 desks).
2. Meaning of the figures (38), (143), (145) on zone labels; why AI zone ≠ 145.
3. ~~Building name/code (not on the PDF).~~ Resolved: Technopark, confirmed by the team (not stated on the PDF).
4. Private-office desks (L-shaped, no `1200x600` label) in perimeter rooms: not counted as workstations.
5. Enclosed rooms (meeting rooms, offices, pantry, WC) other than the two annotated CBLĐ rooms: drawn
   in base geometry but not modelled as Room entities; names are not on the drawing.
6. Meaning of layers `PHUONG-AN-2`, `KT-Others`, `KT-Kyhieu`, `A-GENM`, `KT-Netthay`.
7. Whether lounge / meeting-table chairs are ever assignable.
8. Note: "PHÒNG CÁCH ÂM" is a CAD acoustic treatment specification, not an enclosed room entity.
9. The hidden annotation polygons: drafts or intended zones?
10. Revision status: file dated 260710, annotations modified 2026-07-15 — is this the current layout?
