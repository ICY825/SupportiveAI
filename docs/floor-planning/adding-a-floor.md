# Adding a floor

Eight floors are declared in `data/registry.ts`; one is extracted. This is the
checklist for the other seven. Kept true against the code — see
[`README.md`](README.md).

The renderer needs no change. What each new floor costs is the extraction
config, and that cost is real: CAD layer names, desk sizes and markup
conventions differ between drawings, so the mapping is decided by reading the
PDF, not by copying the previous floor's answers.

## 1. Write the extraction config

Copy `tools/floorplan_extract/floors/floor16.py` to `floors/floor<N>.py` and
set, by inspecting the drawing:

- `FLOOR` — id, level, building id, name, source title, scale, PDF path.
- `GRID_SPAN_X` / `GRID_SPAN_Y` — two grid references and the dimension in
  millimetres between them. This is what derives millimetres per point; if it
  is wrong, every size on the floor is wrong by the same factor.
- `GRID_COLUMNS` / `GRID_ROWS` — grid labels, left to right and top to bottom.
- `LAYERS` — CAD layer name (the suffix after the last `$`) to render group and
  classification. Layers mapped to `None` are not exported.
- The annotation ids of the zones. List them with PyMuPDF `page.annots()`.

Anything the drawing does not state stays `UNKNOWN`. Do not infer it.

## 2. Run the extractor

```bash
python3 -m venv .venv && .venv/bin/pip install -r tools/floorplan_extract/requirements.txt
.venv/bin/python tools/floorplan_extract/extract_floor.py floor<N>
```

It writes `data/floors/floor-<N>/*.json` and
`frontend/public/floor-sources/floor-<N>.webp`, then prints a summary.

## 3. Check the extraction before trusting it

Read `floor<N>.extraction.json` and the printed summary:

- `unmappedCadLayers` — every entry is geometry the drawing has and the dataset
  does not. Decide each one; an empty list is the goal, a short explained list
  is acceptable.
- `desks` vs `chairSymbolsDetected` — workstation detection needs exactly one
  chair on a long edge. A large gap means the rule did not fit this drawing.
- `workstationsByZone` — a zone with no desks usually means a missed annotation.
- `zoneLabelFigures`, `objects`, `obstacles` — sanity, not precision.

Then look at the floor in the app in debug mode. Counts can be right while the
geometry is wrong.

## 4. Register the floor

In `frontend/src/features/floor-planning/data/registry.ts`, fill in the
declaration's `extraction` field:

```ts
{
  id: 'floor-17',
  level: 17,
  label: 'Tầng 17',
  occupancy: 'full',
  extraction: { building: TECHNOPARK, sourceName: '260714_VSF_Layout tang 17.pdf' },
},
```

That is the whole web-side change. `FLOORS` and `FLOOR_INVENTORY` are both
derived from this list, the artifacts are found by glob, and the loader is
generic. There is no per-floor loader module and no bundler rule to edit.

## 5. Add a dataset test

Copy `__tests__/floor16.dataset.test.ts`. At minimum it should assert that
`validateFloorDataset` reports no errors, that the zones named on the drawing
are present, and that any unlabelled highlighted area is explicitly `UNKNOWN`.

Assertions on exact desk counts are useful but brittle across drawing
revisions — state the revision they were taken from.

Sections need no floor-specific drawing or count. The workspace derives them
from extracted clusters, keeping each cluster whole and every desk reachable.

## 6. Verify

```bash
cd frontend
npx vitest run
npx tsc -b
npx oxlint .
npx vite build
cd ..
git diff --check
```

The build must emit the new floor's artifacts as separate `.json` assets. If
the entry-chunk assertion in `vite.config.ts` fires, something imported a floor
JSON as a module instead of fetching it.

## What does not scale for free

- **Payload.** Floor 16's artifacts are 3.2 MB, 2.9 MB of it layer geometry.
  That is per floor on disk and in the repository. Only the open floor is
  fetched, so the browser cost does not multiply — but the repository size
  does.
- **Render budget.** Roughly twenty-six SVG nodes per desk before chairs. This
  is per open floor, so it does not multiply either, but a floor denser than 16
  will feel it first.
- **The extraction config itself.** It cannot be generalised away. Budget real
  time per drawing.
