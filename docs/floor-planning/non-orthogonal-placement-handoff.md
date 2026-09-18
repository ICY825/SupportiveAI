# Handoff: oriented placement and the Floor 16 render budget

Prepared 18 September 2026 for the `lystiger/dev` branch, after Luna's placement, display-area and performance-measurement work landed.

Read [`non-orthogonal-desks-and-render-budget.md`](non-orthogonal-desks-and-render-budget.md) first. It carries the evidence; this document carries the instructions. Read [`handoffs.md`](handoffs.md) for the placement work that precedes this slice — its non-goals still apply, in particular the ban on unconstrained nearest-valid search.

## 1. Starting state

The tree is clean as of the commit that precedes this handoff. Verification gates were run and passed on that commit:

```text
cd frontend
npx vitest run     41 files, 394 tests passed
npx tsc -b         clean
npx oxlint .       warnings only (pre-existing react/set-state-in-effect)
npx vite build     succeeded; main chunk 3,463.50 kB raw / 862.52 kB gzip
cd ..
git diff --check   clean
```

The build warning about chunk size is not incidental. It is slice B's subject.

## 2. Outcomes

Deliver in this order:

1. A user can place and turn a desk against the angled facade, and every validation, preview and persisted record agrees on where that desk is.
2. Floor 16's first meaningful paint no longer waits on the 2.9 MB layout artifact.
3. Performance claims come from a re-run of the existing measurement, not from impressions.

## 3. Slice A — oriented placement

### 3.1 Already closed — do not redo it

`applyPlacements` used to compose the editor's quarter turn onto the drawing's angle with `normalizeRotation`, so a desk measured at 45° and turned once reported 180°. That is fixed: `wrapRotation` in `domain/placement.ts` wraps without snapping, and `placement.test.ts` asserts both the 45 → 135 case and that all 364 orthogonal desks are unchanged.

It was first reported as irreversible data loss. It was not — `applyPlacements` builds a derived render scene, `LayoutStore` persists `SpatialPlacement` records that carry no `rotationDeg`, and the dataset was never written back to. The defect was a wrong derived value with no current reader. It is closed because it would have become live under slice A, not because anything durable was at risk.

Start slice A at 3.2.

### 3.2 Required behaviour

1. `SpatialPlacement.rotation` holds a real angle in degrees. `QUARTER_ROTATIONS` remains the rotate-button cycle so the 364 orthogonal desks behave exactly as they do today.
2. Free rotation is available behind a modifier, snapping to 15° increments, with an "align to wall" action that reads the nearest wall segment angle from `layout.layers`.
3. Collision uses an oriented bounding box. Add `placementCorners`, test two rectangles with the separating-axis theorem, and keep `bboxesTouch` as the broad-phase reject so the orthogonal path stays as fast as it is.
4. Containment tests the four oriented corners with the existing `pointInPolygon`, plus an edge-crossing test. `boundaryTolerance` semantics are unchanged — hand-drawn zone edges still need the slack documented in `PlacementContext`.
5. `placementFromWorkstation` derives width and depth from the polygon's own edge lengths, with `source.nominalSizeMm` as the documented fallback. It must stop deriving them from `ws.bbox`, which for a diagonal desk is the inflated axis-aligned box.
6. Grid snapping projects the leading corner into the placement's local frame, snaps, and projects back. `gridForEntity` already anchors per entity; do not introduce a global lattice.
7. `getChairBounds` derives the seated direction from a unit vector built from `rotation` and `seatedSide`, not a four-way switch. The chair footprint becomes oriented too.
8. `placementOutline` and `rotateHandleAnchor` draw the oriented corners, so selection box, drag footprint, invalid hatch and pending preview frame the real desk.

### 3.3 Constraints

Keep `rotateQuarter` in `domain/geometry.ts`. It stays the fast path for the orthogonal majority; add a general `rotatePoint` beside it rather than replacing it.

Do not weaken boundary, obstacle, door-clearance, desk-overlap or chair-overlap validation to make diagonal desks validate. If a diagonal desk is genuinely in conflict, say so.

Do not touch generated files under `data/floors/floor-16/` by hand. If the extractor needs to emit more, change `tools/floorplan_extract/` and re-run it.

Preview, validation, committed authored entity, reload and subsequent editing must all use one geometry. A placement that validates with one footprint and persists another is the defect this slice exists to remove.

### 3.4 Acceptable fallback

If slice A does not fit the milestone, mark the eighteen non-quarter desks non-editable: render source geometry, exclude them from placement validation, explain in the UI why they cannot be moved. One commit, no data loss, no false conflicts. It does not satisfy outcome 1 — say so plainly rather than reporting the slice as done.

### 3.5 Tests

1. A desk with `rotationDeg` 45 round-trips through place, rotate, reload and compare without its angle changing.
2. A 1200 × 600 desk at 45° reports a footprint area within tolerance of 0.72 m², not of its 1273 mm square bounding box.
3. Two diagonal desks flush along a facade do not report mutual overlap.
4. A diagonal desk clear of a column does not report an obstacle collision.
5. A diagonal desk snapped to the grid and moved one cell and back compares equal to its starting placement.
6. The chair footprint of a diagonal desk sits on the desk's own seated edge, not on an axis-aligned face.
7. The selection outline and the validated footprint are the same four points.
8. The 364 orthogonal desks produce byte-identical placements before and after the change. Assert this; it is the regression that matters most.
9. `44.5`, `45.0` and `45.5` in one row all resolve to the same facing, rather than splitting across perpendicular quarters.

The existing `wrapRotation` cases in `placement.test.ts` already cover the compose defect from 3.1. Extend that describe block rather than starting a new one.

## 4. Slice B — payload split

### 4.1 What is proven

`floor16.layout` is absent from the recorded floor-specific assets while the other six Floor 16 artifacts split out correctly, and the main chunk is 3,463.50 kB raw. The 2,907,237-byte layout artifact is in the entry chunk. `frontend/vite.config.ts` has no `build` section and no manual chunking.

### 4.2 What to build

Generate a lightweight overview artifact per floor at extraction time: floor bounds, display-area definitions, department polygons, and desks reduced to id, centre, bounding box and rotation. Load it first so the workspace can become interactive. Fetch full layer paths, obstacle detail and extraction metadata per display area on entry.

The slicing rule already exists at runtime in `workspace/scene.ts` — `buildWorkspaceScene` filters by `contextBounds` and `clipSourcePathToBBox` culls layer subpaths. Move that rule to build time in `tools/floorplan_extract/`; do not invent a second one.

Add explicit chunking to `vite.config.ts` so the layout artifact cannot be folded back into the entry chunk by a future dependency edge.

### 4.3 Constraints

The overview artifact is derived data. It does not become a new source of truth, and it does not acquire `Zone` semantics — the same rule `handoffs.md` section 6.2 sets for display areas.

Do not start a streaming, tiling or renderer rewrite under this handoff.

### 4.4 Tests

1. The overview artifact contains every display area and every department workstation exactly once.
2. The overview artifact and the full dataset agree on desk centres and bounds.
3. A missing or stale per-area artifact degrades visibly, not silently.
4. A build assertion fails if the layout artifact re-enters the entry chunk.

## 5. Slice C — re-measure

Re-run the existing Playwright measurement that produced `output/playwright/floor16-performance.json`, unchanged, under the same 1440 × 900 viewport and the same 150 ms / 200 KiB/s profile. Compare first paint, first contentful paint, workstation interactivity, long-task count and total, and SVG node counts by zoom tier.

Report the numbers against the recorded baseline: first paint 676 ms, first contentful paint 4,804 ms, workstation interactivity 6,234 ms, four long tasks totalling 701 ms with a 240 ms maximum, 4,043 overview SVG descendants.

Only after that comparison, decide whether the render-budget work — flattening far-tier desks into per-status paths, freezing context furniture, culling against the visible camera rectangle — is justified. It may not be.

## 6. Files to inspect first

- `frontend/src/features/floor-planning/domain/placement.ts`
- `frontend/src/features/floor-planning/domain/geometry.ts`
- `frontend/src/features/floor-planning/workspace/layoutDraft.ts`
- `frontend/src/features/floor-planning/workspace/editGeometry.ts`
- `frontend/src/features/floor-planning/workspace/EditLayer.tsx`
- `frontend/src/features/floor-planning/workspace/scene.ts`
- `frontend/src/features/floor-planning/workspace/SpatialWorkspace.tsx`
- `frontend/vite.config.ts`
- `tools/floorplan_extract/extract_floor.py`
- `tools/floorplan_extract/floors/floor16.py`
- placement, layout-editor, workspace-scene and authored-entity tests under `frontend/src/features/floor-planning/__tests__/`

## 7. Verification gates

Run the narrow regression tests for the slice first. Before handing work back:

```text
cd frontend
npx vitest run
npx tsc -b
npx oxlint .
npx vite build
cd ..
git diff --check
```

Report the exact commands and results. For slice A, unit tests are not sufficient on their own: open the authored-desk flow in a browser at a representative desktop viewport and exercise one of the diagonal desks — `ws-16-195` through `ws-16-200` sit on the angled facade run.

## 8. Definition of done

- Placement footprint, collision, containment, grid snap, chair geometry, preview and selection outline all use the same oriented geometry.
- The 364 orthogonal desks are bit-identical to their current placements.
- A desk can be turned to face the angled facade, and the UI explains any rejection truthfully.
- Floor 16's layout artifact is out of the entry chunk and cannot silently return.
- Performance claims cite a fresh run of the existing measurement against the recorded baseline.
- All verification gates pass and the exact results are reported.

Do not combine slice A and slice B in one commit.
