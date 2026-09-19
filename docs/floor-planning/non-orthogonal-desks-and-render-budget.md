# Floor 16: non-orthogonal desks, and where the lag actually is

> **Historical record.** Written on the date below and not maintained since.
> For how the module works now, read [`engine-architecture.md`](engine-architecture.md)
> and [`persistence.md`](persistence.md); [`README.md`](README.md) explains the split.

Written 18 September 2026 against `lystiger/dev`, after Floor 16 reached complete extraction. Two defects were reported together — desks that cannot face a wall at an angle, and a workspace that feels slow. They are unrelated, and this document keeps them apart so neither fix absorbs the other.

This is an inspection record and a design recommendation. One defect found during the inspection was small enough to close immediately and is marked as fixed in 1.4; everything else here is recommendation, not change.

## 1. Non-orthogonal desks

### 1.1 The data already has angles; the domain discards them

The extractor measures a real angle. `tools/floorplan_extract/extract_floor.py:552` computes the desk's axis as `math.degrees(math.atan2(u[1], u[0])) % 180`, and `:663` writes it as `rotationDeg` rounded to one decimal.

Floor 16 holds 382 workstations. Their recorded angles:

```text
  0°  202 desks
 44°    3 desks
 45°   12 desks
 46°    3 desks
 90°  162 desks
```

Eighteen desks are genuinely diagonal — `ws-16-195` through `ws-16-200`, `ws-16-266` through `ws-16-271`, `ws-16-281` through `ws-16-283`, and three more. They are the desks that follow the angled facade.

The placement domain cannot represent them. `frontend/src/features/floor-planning/domain/placement.ts:33` declares:

```ts
export type QuarterRotation = 0 | 90 | 180 | 270
```

and `:139` collapses any measured angle into it:

```ts
export function normalizeRotation(deg: number): QuarterRotation {
  const turns = Math.round(deg / 90)
  return ((((turns % 4) + 4) % 4) * 90) as QuarterRotation
}
```

`Math.round(45.0 / 90)` is `Math.round(0.5)`, which JavaScript rounds up to `1`, giving 90°. `Math.round(44.5 / 90)` is `Math.round(0.494)`, giving `0`, which is 0°. `45.5` gives 90° again.

So a single diagonal row whose desks were measured at 44.5°, 45.0° and 45.5° — the same physical row, differing only by drafting noise — is split across two perpendicular quarters by the rounding itself. That is not a tolerance problem that a smaller epsilon fixes. The type has no value that can hold 45.

### 1.2 The footprint is also wrong, independently

`workspace/layoutDraft.ts:98` derives the editable footprint from the stored bounding box:

```ts
const [x0, y0, x1, y1] = ws.bbox
const rotation = determineWorkstationRotation(ws)
const turned = rotation % 180 !== 0
return {
  ...
  width: turned ? y1 - y0 : x1 - x0,
  depth: turned ? x1 - x0 : y1 - y0,
  ...
}
```

`ws.bbox` is the axis-aligned bounding box of the drawn polygon. For an axis-aligned desk it equals the desk. For a desk at 45° it does not: a 1200 × 600 mm desk turned 45° has an axis-aligned box of about 1273 × 1273 mm. The editor therefore believes those eighteen desks are 1273 mm squares occupying roughly 2.25 times their true floor area.

This is a separate defect from the rotation type. Fixing one without the other leaves the bug in place.

### 1.3 What the two defects break downstream

| Location | Consequence |
| --- | --- |
| `placement.ts` `validatePlacement`, overlap section | Desk-to-desk collision compares axis-aligned boxes. An inflated box reports overlaps against neighbours that do not touch. |
| `placement.ts` `obstacleIntersects` | Takes `candidateBounds: BBox`. Inflated box reports collisions with columns and door clearances the desk clears in reality. |
| `placement.ts` `snapPlacementToGrid` | Snaps the inflated box's corner, so the desk translates on its first drag and cannot be returned to where it started. |
| `placement.ts` `getChairBounds` | Chooses the seated side with `switch (placement.rotation)` over four quarters only. A diagonal desk gets a chair on a face it does not have. |
| `workspace/editGeometry.ts` `placementOutline` | Selection box, drag footprint, invalid hatch and pending preview are all drawn from `placementBounds`, so a diagonal desk is framed by an oversized square. |
| `workspace/layoutDraft.ts:406` `applyPlacements` | Wrote `normalizeRotation(ws.rotationDeg + (to.rotation - from.rotation))`. For a 45° desk rotated once this described the desk as turned to 180°, a facing it has never had. **Fixed** — see 1.4. |
| `workspace/layoutDraft.ts:71` `determineWorkstationRotation` | Infers facing from `Math.abs(dx) > Math.abs(dy)` on the chair offset. At 45° the two are approximately equal, so the facing is decided by float noise. |

### 1.4 The rotation compose defect, and why it was not data loss

The last row of that table was fixed on 18 September 2026. It is recorded here because it was first reported as irreversible data loss, and it is not.

`applyPlacements` produces a derived render scene. It does not write back to the dataset, and `LayoutStore` persists `SpatialPlacement` records, which carry a `QuarterRotation` and no `rotationDeg` at all. `commitPendingDesk` builds an authored workstation from the placement, not from a scene workstation. So the dataset's measured 45° was re-read intact on every render and nothing durable was ever corrupted.

What was wrong was the derived value: a diagonal desk turned one quarter reported `rotationDeg` 180 instead of 135. No current consumer reads `rotationDeg` off a scene workstation — `determineWorkstationRotation` is the only reader, and it prefers the chair, which `applyPlacements` carries through the same rigid transform. The defect was therefore latent, and would have become live the moment oriented placement (1.6) landed.

The fix composes the real angle with `wrapRotation`, the non-snapping counterpart to `normalizeRotation` added beside it in `domain/placement.ts`. For every orthogonal desk both spellings agree exactly, which `placement.test.ts` asserts across all 364 of them.

### 1.5 Why it was not caught earlier

`WorkspaceScene` renders `Workstation.polygon` — the geometry the extractor actually produced — so diagonal desks look correct in view mode. Only the editing path reads `placementBounds`. The defect is invisible until someone selects one of those eighteen desks.

### 1.6 Recommended fix: oriented placement

Generalise rotation to a real angle and replace axis-aligned collision with oriented collision.

1. **Widen the type.** `SpatialPlacement.rotation` becomes `number` in degrees. `QUARTER_ROTATIONS` survives as the rotate-button cycle, so existing keyboard and handle behaviour is unchanged for the 364 orthogonal desks. Add free rotation behind a modifier with a 15° snap increment, plus an "align to wall" action that reads the nearest wall segment's angle from `layout.layers`.

2. **Oriented bounding box.** Add `placementCorners(placement): Point[]` returning the four rotated corners. Collision between two placements becomes the separating-axis test on two rectangles — about twenty lines, exact, no dependency. Keep the existing `bboxesTouch` axis-aligned check as a broad-phase reject so the common case stays as fast as it is today.

3. **Containment.** Replace `polygonContainsBBox` for oriented placements with a corner-containment test using the existing `pointInPolygon`, plus an edge-crossing test against the boundary polygon. The existing `boundaryTolerance` semantics carry over unchanged; hand-drawn zone edges still need it.

4. **Stop reading size from the bounding box.** `placementFromWorkstation` should take width and depth from the polygon's own edge lengths, falling back to `source.nominalSizeMm` — which `EntitySource` already carries and which `authoredTemplatePlacement` already prefers for authored desks.

5. **Grid snapping.** Project the leading corner into the placement's local frame, snap there, and project back. `gridForEntity` already anchors the lattice per entity, so this needs no global-origin change.

6. **Chair geometry.** Derive the seated direction from a unit vector built from `rotation` and `seatedSide` rather than a four-way switch. The chair footprint becomes an oriented box like the desk.

7. **Persistence.** `applyPlacements` composes real angles. No `normalizeRotation` on the write path.

Files affected: `domain/placement.ts`, `domain/geometry.ts` (add a general `rotatePoint` alongside `rotateQuarter`, which stays as the fast path), `workspace/layoutDraft.ts`, `workspace/editGeometry.ts`, and the rotation tests under `__tests__/`.

### 1.7 Alternative: lock the diagonals

If the full fix does not fit the current milestone, mark the eighteen non-quarter desks non-editable: render their source geometry, exclude them from placement validation, and show why they cannot be moved. That costs one commit, loses no data, and stops the false conflicts — but the user still cannot angle a desk against the facade, which was the original request. Treat it as a stopgap, not an answer.

## 2. Performance

### 2.1 Two different problems

The measurements in [`floor16-performance.md`](floor16-performance.md) and [`floor16-performance.json`](../../output/playwright/floor16-performance.json) show two independent costs. Conflating them produces the wrong fix.

**Payload.** First contentful paint is 4,804 ms and workstation interactivity 6,234 ms. The Floor 16 layout JSON is 2,907,237 bytes and it is inside the main application chunk, not a floor chunk. The evidence is in the recorded asset list: `floor16.zones`, `floor16.workstations`, `floor16.objects`, `floor16.obstacles`, `floor16.extraction` and `floor16.display-areas` all split out as separate assets, and `floor16.layout` does not appear at all. A production build on 18 September 2026 reports `dist/assets/index-*.js` at 3,463.50 kB raw / 862.52 kB gzip, with Vite's own chunk-size warning. `frontend/vite.config.ts` declares no `build` section and no manual chunking.

**Rendering.** The overview draws 4,043 SVG descendants for 154 desks, rising to 4,937 at 144% zoom. Four long tasks totalling 701 ms, the largest 240 ms. Each desk is a shadow polygon, leg lines, prism faces, a top polygon and a code label — roughly twenty-six nodes before chairs.

The proposal of loading a scene only when the user enters an area addresses the first problem. It does not touch the second, which is what makes panning and zooming feel heavy once the floor is on screen.

### 2.2 Slice 1 — split the payload

This is the larger win and needs no renderer change.

Generate a lightweight overview artifact per floor at extraction time: floor bounds, display-area definitions, department polygons, and desks reduced to id, centre, bounding box and rotation. That is on the order of 50–80 kB and can load immediately. Everything heavy — full layer path data, obstacle detail, extraction metadata — is fetched per display area when the user enters it.

The slicing rule already exists at runtime. `workspace/scene.ts` `buildWorkspaceScene` filters workstations, zones, rooms and obstacles by `contextBounds`, and `clipSourcePathToBBox` already culls layer subpaths to a bounding box. Moving that same rule to build time in `tools/floorplan_extract/` turns a per-frame filter into a per-area artifact.

Add explicit chunking to `vite.config.ts` so the layout artifact cannot be folded back into the entry chunk by a future dependency edge.

### 2.3 Slice 2 — render budget

The detail tier already exists (`WorkspaceDetailTier`, far / medium / close) but the far tier still draws full desk prisms. At `far`, flatten desks into one path per status bucket: 154 desks at twenty-six nodes each becomes roughly six paths. Render the muted context furniture once and hold it — it never changes while the user stays in an area. Add a cull against the visible camera rectangle; today the scene culls by scope bounds, which is a fixed window, not what is on screen.

### 2.4 Slice 3 — only if needed

Move the static architecture layer to canvas and keep SVG for interactive desks. Do not begin here. `floor16-performance.md` already concludes that a renderer rewrite is not justified by the current numbers, and that conclusion stands.

### 2.5 Order

Do slice 1, re-run the same Playwright measurement, compare first contentful paint, workstation interactivity and long-task time, and only then decide whether slice 2 is needed. The existing measurement script makes that comparison cheap; keep using it rather than substituting impressions.

## 3. Recommended sequencing

1. Done: `applyPlacements` composes measured angles instead of rounding them (1.4).
2. Slice 1 of the performance work.
3. Re-measure.
4. Oriented placement in full (1.6), or the stopgap in 1.7 if it does not fit the milestone.
5. Render budget, slice 2, only if the re-measurement still justifies it.

Do not combine 1 and 2 in one commit. They touch different layers and need different evidence.
