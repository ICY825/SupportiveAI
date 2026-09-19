# Luna follow-up: six-area defects and the area locator map

> **Historical record.** Written on the date below and not maintained since.
> For how the module works now, read [`engine-architecture.md`](engine-architecture.md)
> and [`persistence.md`](persistence.md); [`README.md`](README.md) explains the split.

Prepared 17 September 2026 against the current `lystiger` working tree, after reviewing the six-area implementation report. Continue from the current uncommitted state.

This document has three parts:

1. what the implementation report claims versus what the code does;
2. the defects that must be fixed, with the change for each;
3. the locator map (minimap), which is new work.

## 1. Report verification

Gates were re-run independently on the current tree:

```text
vitest run      24 files, 263 tests passed
tsc -b          passed
oxlint          passed
```

So section J of the report is accurate. The earlier session recap saying "no test results were confirmed" is stale; the suite is green.

| Report claim | Verdict | Note |
| --- | --- | --- |
| A — no `SPIKE_CROP` / `SPIKE_CLUSTER_IDS` / `buildSpikeScene` in production code | Confirmed | Remaining hits are in `docs/floor-planning/data-driven-floor-generation.md` and the prior handoff only. |
| B — three-kind `WorkspaceScope` | Confirmed | `workspace/scope.ts:5`. |
| C — 21 clusters, 116 workstations, six areas of 28/21/15/14/22/16 | Confirmed | `workspace/displayAreas.ts:25`; asserted in `FloorPlanningPage.workspace.test.tsx:121`. Dataset counts by zone: `zone-16-ai-platform` 116, `zone-16-unlabeled-01` 38. |
| D — projection uses floor coordinates, nothing projected is persisted | Confirmed | Placements are floor-space; `project()` is render-time only. |
| E — `sceneBounds()` covers target desks, context desks, context rectangle, boundary, rooms and labels | Confirmed | `workspace/scene.ts`, `sceneBounds`. |
| F — "MEDIUM ≥ 1.3x: desk IDs and status markers" | **Misleading** | True on the overview, false in every focused area. See defect 1. |
| G — editing disabled from the overview until an area is selected | Confirmed, but the interaction is a dead end. See defect 8. |
| H — "collision validation … remains connected to canonical workstation records" | **Wrong in one direction** | Collision cannot see the context desks that the focused view draws. See defect 2. |
| I — browser numbers (2,815 SVG descendants, ~38 ms / ~187 ms) | Unverified | No browser was driven during this review. The numbers are plausible; treat them as reported, not as measured by this pass. |
| J — gates | Confirmed, re-run above. |
| K — 145 / 116 / 38 ambiguity untouched | Confirmed. |

Two claims in the report describe intent rather than behaviour, and both matter. They are defects 1 and 2 below.

## 2. Defects

Ordered by user impact. Items 1–3 are correctness; 4–7 are structural; 8–10 are interaction.

### Defect 1 — a focused area opens with no status markers and no desk codes

`SpatialWorkspace.tsx:281`:

```ts
const detailTier = detailTierForZoom(zoom)
```

`zoom` is the user's zoom multiplier, which resets to `1` on every scope change (`reset()` inside `changeScope`). It is not the scale at which desks are actually drawn. After fit-to-view, a 15-desk area fills the same stage that 116 desks filled, so the desks are roughly four times larger on screen — yet the tier is still `far`, and `WorkspaceScene` then draws no desk codes and suppresses every status marker except the selected one.

The result is that the six-area work, whose whole purpose is a readable close-up, ships a close-up with the status layer switched off until the user manually zooms to 1.3x.

The existing test passes because it only exercises the overview (`FloorPlanningPage.workspace.test.tsx:157`).

Fix — make the tier read an area-normalised zoom, so the overview keeps its current thresholds exactly:

```ts
// scene.ts
/**
 * The user's zoom made comparable across scopes. A small area fitted to the
 * stage is already magnified relative to the department overview, even though
 * the zoom control has not moved, so the detail tiers have to see that.
 */
export const effectiveZoom = (zoom: number, referenceWidth: number, frameWidth: number) =>
  frameWidth > 0 ? zoom * (referenceWidth / frameWidth) : zoom
```

```ts
// SpatialWorkspace.tsx
const DEFAULT_STAGE = { width: 1200, height: 800 }

const overviewFrame = useMemo(
  () => fitViewBox(sceneBounds(overviewScene), stage ?? DEFAULT_STAGE, SCENE_PADDING),
  [overviewScene, stage],
)
const detailTier = detailTierForZoom(effectiveZoom(zoom, overviewFrame[2], frame[2]))
```

On the overview `frame === overviewFrame`, the ratio is 1, and every current assertion still holds. In an area the tier starts at `medium` or `close`, which is what the pixels already show.

Leave the zoom readout in the toolbar reporting the user's own zoom. It is a control, not a measurement, and relabelling it would confuse the fit-to-view button next to it.

### Defect 2 — collision is blind to the context desks the focused view draws

`validateDraft` passes `others: draftList(draft)`, and the draft only ever contains the 116 department placements. The focused scene, however, draws every canonical workstation intersecting `contextBBox` — including desks from `zone-16-unlabeled-01`, which sits at `[701.2, 438.7, 811.1, 595.0]`, directly against the department's western edge near areas D and E.

So a user can drag a target desk onto a neighbouring desk that is plainly visible on screen and get `✓ Hợp lệ`. The obstacle set does not cover this: `floor16.obstacles.json` holds 34 columns, 4 walls and 90 door clearances — no desks.

This is the most serious defect, because the context desks were added specifically to make placement judgeable, and they are the one piece of visible geometry the validator ignores.

Fix — carry immovable neighbours into validation, never into the draft:

```ts
// layoutDraft.ts, in EditableArea
  /**
   * Canonical placements that are visible but not editable: neighbouring desks
   * inside the context window. Collision must see them; nothing may move them,
   * and they never reach a save payload.
   */
  contextPlacements?: readonly SpatialPlacement[]
```

```ts
// layoutDraft.ts, in validateDraft
  const contextPlacements = isArea ? (boundaryOrArea.contextPlacements ?? []) : []
  const placements = draftList(draft)
  const others = contextPlacements.length ? [...placements, ...contextPlacements] : placements
  // …then pass `others` instead of `placements` into validatePlacement
```

`validatePlacement` already skips `other.entityId === candidate.entityId`, so no self-collision is introduced.

```ts
// SpatialWorkspace.tsx
const contextPlacements = useMemo(
  () => scopedBaseScene.contextWorkstations
    .filter((ws) => !(ws.id in base))
    .map(placementFromWorkstation),
  [base, scopedBaseScene],
)
```

The `!(ws.id in base)` filter matters: desks belonging to *other* AI areas are already in the draft, and adding them twice would report the same overlap twice.

The conflict message must also be able to name a context desk. `codeOf` currently only looks in `departmentDesks` and falls back to printing a raw entity id:

```ts
const codeOf = useCallback(
  (entityId: string) => (departmentDesks.get(entityId) ?? allDesks.get(entityId))?.seat.code.split('-').at(-1) ?? entityId,
  [allDesks, departmentDesks],
)
```

### Defect 3 — the active area is identified by a stringified float bbox

```ts
const scopeKey = workspaceScopeKey(scope)            // "bbox:946.51,245.73,991.87,342.21"
const activeArea = displayAreas.find((area) => workspaceScopeKey(area.scope) === scopeKey)
```

The target bbox is derived at runtime from polygon geometry, so this identity survives only as long as every recomputation produces bit-identical floats. Change the context padding, re-extract, or introduce any arithmetic drift, and `activeArea` silently becomes `undefined`: the scene keeps rendering, the breadcrumb loses the area name, and the Edit button disables itself with no stated reason.

Fix — hold the area id in state and derive the scope from it. `scope.ts` stays as it is; the UI grouping must not leak into it.

```ts
const [areaId, setAreaId] = useState<string | null>(null)
const activeArea = areaId ? displayAreas.find((a) => a.id === areaId) ?? null : null
const scope = activeArea?.scope ?? overviewScope

const changeScope = useCallback((nextAreaId: string | null) => {
  setAreaId(nextAreaId)
  reset()
}, [reset])
```

The `<select>` then uses `area.id` as its option value, and the "Tổng quan" button calls `changeScope(null)`.

### Defect 4 — `deriveEditableArea` is called twice on the same scene

`SpatialWorkspace.tsx:176` and `:180` build two `EditableArea` objects from identical arguments, differing only in `editableIds`: one goes to validation, the other to `EditGround` and `EditInspector`. Two near-identical area objects with different membership semantics, consumed by different parts of the same screen, is exactly the shape that produces a "why is the grid drawn somewhere the validator disagrees with" bug later.

Fix — derive once, extend once:

```ts
const baseArea = useMemo(() => deriveEditableArea(dataset, scopedBaseScene), [dataset, scopedBaseScene])
const area = useMemo(
  () => ({ ...baseArea, editableIds: activeArea?.workstationIds ?? [], contextPlacements }),
  [activeArea, baseArea, contextPlacements],
)
```

Pass `baseArea` to `EditGround` and `EditInspector` (they read only `boundary`, `displayBoundary`, `obstacles` and `grid`), and `area` to `useLayoutEditor`.

### Defect 5 — the overview's empty `editableIds` makes an invalid draft look valid

With no active area, `editableIds` is `[]`. `validateDraft` then writes no entries, and `draftIsValid` over an empty map returns `true`. Nothing reaches that state today only because the Edit button is disabled — a UI guard standing in for a model guard.

Fix — refuse at the editor:

```ts
// useLayoutEditor.ts, enterEdit
if (area.editableIds && area.editableIds.length === 0) return
```

and keep the empty array meaning "nothing is editable" rather than overloading `undefined`, which already means "everything is editable".

### Defect 6 — the room boundary is inferred from one desk through a cast

```ts
const roomId = (scene.workstations.find((w) => (w as unknown as { roomId?: string }).roomId) as unknown as { roomId?: string } | undefined)?.roomId ?? null
…
room = dataset.rooms.find((r) => pointInPolygon(firstWsCenter, r.polygon))
```

Two problems. The cast reaches for a field that is not on `Workstation`, so the type system is being told to look away rather than the model being fixed. And a whole area's room containment is decided by whichever desk happens to be first: an area spanning two rooms validates every desk against one of them.

Fix — either add `roomId` to `Workstation` in `domain/spatial.ts` and drop the cast, or drop the room boundary entirely for areas that span more than one room polygon:

```ts
const rooms = new Set(scene.workstations.map((w) => dataset.rooms.find((r) => pointInPolygon(w.center, r.polygon))?.id).filter(Boolean))
const room = rooms.size === 1 ? dataset.rooms.find((r) => r.id === [...rooms][0]) : undefined
```

A missing room boundary is safe — the department zone still contains the desk. A wrong one is not.

### Defect 7 — whole-floor obstacles in the edit overlay, and a whole-department grid sweep

`deriveEditableArea` sets `obstacles: dataset.obstacles` (all 128 on the floor). `buildEditOverlay` then draws a clearance polygon for each of the 90 door clearances, unclipped and mostly off-camera, while `scene.obstacles` right next to it is clipped to `contextBounds`.

Separately, `gridPoints` iterates `area.boundary.bbox` — the entire department zone, roughly 202 × 431 pt at a 5.67 pt cell, so about 2,700 candidate points — and then filters each one with `pointInPolygon` against the much smaller display boundary. The grid is re-anchored per selected desk (`gridFor(selectedId)`), so that sweep runs on every selection change in edit mode.

Fix both without weakening validation:

- add `displayObstacles?: readonly FloorObstacle[]` to `EditableArea`, set it to `scene.obstacles`, and have `buildEditOverlay` read `area.displayObstacles ?? area.obstacles ?? []`. Validation keeps `dataset.obstacles`, because a desk may legally move outside the camera window;
- in `gridPoints`, iterate `(area.displayBoundary ?? area.boundary).bbox`. Only points the `contains` predicate would have discarded are skipped, so the dot set is unchanged. Re-run `layoutEditor.test.tsx` — it asserts on overlay dots.

### Defect 8 — Edit on the overview is a disabled dead end

The prior handoff asked for "a minimal area-selection step" when editing is invoked from the overview. What shipped is a disabled button carrying a `title`. Tooltips on disabled buttons do not fire reliably, are absent on touch, and the button is out of the tab order, so a keyboard or screen-reader user gets no explanation at all.

Fix — keep the button enabled and let it ask:

```ts
const startEditing = () => {
  if (!activeArea) { setAreaPrompt(true); return }
  changeMode('edit')
}
```

With the locator map in place (part 3) the prompt is one line plus a highlight: set `data-prompt="true"` on the locator, announce `LAYOUT_EDIT.chooseArea` through the existing `aria-live` region, and let the user click an area on the map or pick one from the select. Clear the prompt on the next scope change.

This changes `FloorPlanningPage.workspace.test.tsx:133`, which asserts `disabled: true`. Update that assertion to the new behaviour rather than working around it.

### Defect 9 — search always abandons the focused area

```ts
onPick={(item) => {
  if (!editing) changeScope(overviewScope)
  selectDesk(item.target.id)
}}
```

The handoff asked for a return to overview when the hit is *outside* the current area. As written, searching for a desk you are already looking at throws the focus away.

```ts
onPick={(item) => {
  if (!editing && !activeArea?.workstationIds.includes(item.target.id)) changeScope(null)
  selectDesk(item.target.id)
}}
```

### Defect 10 — small honesty gaps in the focused view

- The map-top caption reads `Đang chọn ws-16-xxx` even when that desk is outside the focused area and not drawn. Append the out-of-scope state to the caption; the existing explanation sits far down in the side panel.
- The legend lists one boundary rule while the scene draws two dashed boundaries (department zone, and the scope rectangle) in different blues, and says nothing about the muted context desks. Add a "Bàn lân cận · không chỉnh sửa" entry.
- Clicking a context desk does nothing at all, silently. Give it the same `<title>` treatment the markers get, so a hover at least names it.
- `buildWorkspaceDisplayAreas` returns `[]` for any floor other than 16, which disables editing with a message telling the user to choose an area that does not exist. Say "Tầng này chưa có khu vực chỉnh sửa" instead.

### Not in this slice

Deep-linking a focused area (`&area=ai-area-a` in `urlState.ts`) is worth doing — a focused edit session is currently unshareable and does not survive reload — but it means lifting area state into `FloorPlanningPage` and belongs to its own change. Record it; do not fold it in here.

## 3. The area locator map

### Why

The context window is deliberately tight: `DISPLAY_CONTEXT_PADDING_PT = 25`, about 2.6 m. A focused area is therefore a small crop of a 1190 × 842 pt floor, drawn in an isometric projection that has no north, no page edge and no consistent horizon. The scope navigation is disabled during editing. So at exactly the moment the user is moving furniture, there is nothing on screen that answers "which part of the floor is this".

A locator map answers it with geometry that already exists. Nothing new is derived and no dataset is touched.

### What it draws

Plan view, not isometric. A miniature of the 2.5D projection would be unreadable at this size, and the whole point is a stable frame of reference.

Window: the department bbox `[806.9, 234.7, 1009.3, 665.6]` padded by 60 pt. That includes the eastern part of `zone-16-unlabeled-01`, which is the adjacent unlabeled area and the most useful landmark on that side of the floor.

Layers, back to front:

1. other zone polygons inside the window, in a flat grey — real landmark shapes, five polygons total;
2. the accepted department polygon;
3. the six area rectangles, lettered A–F, the active one filled;
4. the live camera quad.

The camera quad is a parallelogram, because the main scene is projected. That is correct and worth showing: it tells the user not only where they are but which way the view is skewed.

Below it, a floor locator strip: a 1190 × 842 thumbnail with the department rectangle marked, so the department's place on the whole floor is answered once, statically.

### Where it goes

Docked at the top of `.sw-context`, above the inspector and the scope summary.

The stage already carries two floating widgets (the zoom toolbar and the settings card), and an inset in the corner would compete with pan gestures and with the desks near the edge of a focused crop. The side panel is a fixed-width column with vertical room, it is where "Phạm vi hiện tại" already lives, and it needs no z-index work.

The component is self-contained, so moving it to a stage overlay later is a CSS change.

### Geometry helper

Pure, so it is testable without a DOM. Put it in `scene.ts` next to `fitViewBox`:

```ts
/**
 * The floor region currently visible on the stage, as a quad.
 *
 * The scene content carries `translate(pan) translate(origin) scale(zoom)
 * translate(-origin)`, so a projected point p is drawn at
 * `pan + origin + zoom * (p - origin)`. Inverting that for the four corners of
 * the fitted viewBox, then unprojecting, gives the camera footprint in floor
 * coordinates — a parallelogram, because the scene is projected.
 */
export function cameraFootprint(frame: BBox, origin: Point, pan: Point, zoom: number): Point[] {
  const [fx, fy, fw, fh] = frame
  const scale = zoom > 0 ? zoom : 1
  const corners: Point[] = [[fx, fy], [fx + fw, fy], [fx + fw, fy + fh], [fx, fy + fh]]
  return corners.map(([sx, sy]) => unproject([
    origin[0] + (sx - pan[0] - origin[0]) / scale,
    origin[1] + (sy - pan[1] - origin[1]) / scale,
  ]))
}
```

Note that `frame` here is `fitViewBox`'s `[x, y, width, height]`, not a bbox in the `[x0, y0, x1, y1]` sense used elsewhere. Keep that distinction in the parameter name if it reads ambiguously.

### The area letter

`WorkspaceDisplayArea` needs a short form for the map label. Add it to the definition table rather than parsing it back out of `label`:

```ts
interface DisplayAreaDefinition {
  id: string
  label: string
  short: string          // 'A' … 'F', for the locator map
  clusterIds: readonly string[]
}
```

and carry `short` through to `WorkspaceDisplayArea`.

### Component

New file `frontend/src/features/floor-planning/workspace/AreaMinimap.tsx`:

```tsx
import { memo, type KeyboardEvent } from 'react'
import type { BBox, Point, Zone } from '../domain/spatial'
import { SPATIAL_MINIMAP } from '../labels'
import type { WorkspaceDisplayArea } from './displayAreas'
import { points } from './scene'

const rectPoints = ([x0, y0, x1, y1]: BBox): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]

/**
 * Plan-view locator for the focused area.
 *
 * Deliberately not the scene's projection: at this size an isometric thumbnail
 * is unreadable, and the job here is a stable frame of reference, not a second
 * rendering of the same space. It derives nothing — every polygon comes from
 * canonical data the workspace already holds.
 */
export const AreaMinimap = memo(function AreaMinimap({
  window: win,
  floor,
  departmentBBox,
  departmentPolygons,
  zones,
  areas,
  activeAreaId,
  cameraPoints,
  disabled = false,
  prompting = false,
  onPick,
}: {
  /** padded department bbox: the plan window this map frames */
  window: BBox
  floor: { width: number; height: number }
  departmentBBox: BBox
  departmentPolygons: readonly Point[][]
  zones: readonly Zone[]
  areas: readonly WorkspaceDisplayArea[]
  activeAreaId: string | null
  /** camera footprint, already projected to a points string by the caller */
  cameraPoints: string
  disabled?: boolean
  /** the user asked to edit from the overview and must choose an area */
  prompting?: boolean
  onPick: (areaId: string) => void
}) {
  const [wx0, wy0, wx1, wy1] = win
  const activate = (areaId: string) => () => { if (!disabled) onPick(areaId) }
  const onKeyDown = (areaId: string) => (event: KeyboardEvent<SVGGElement>) => {
    if (disabled || (event.key !== 'Enter' && event.key !== ' ')) return
    event.preventDefault()
    onPick(areaId)
  }

  return (
    <nav className="sw-minimap" aria-label={SPATIAL_MINIMAP.label} data-prompt={prompting ? 'true' : undefined}>
      <p className="fp-eyebrow">{SPATIAL_MINIMAP.title}</p>
      <svg className="sw-minimap-plan" viewBox={`${wx0} ${wy0} ${wx1 - wx0} ${wy1 - wy0}`}>
        <g aria-hidden="true">
          {zones.map((zone) => <polygon key={zone.id} className="sw-minimap-zone" points={points(zone.polygon)} />)}
          {departmentPolygons.map((polygon, index) => (
            <polygon key={index} className="sw-minimap-dept" points={points(polygon)} />
          ))}
        </g>
        {areas.map((area) => {
          const [x0, y0, x1, y1] = area.targetBBox
          const active = area.id === activeAreaId
          return (
            <g
              key={area.id}
              className={`sw-minimap-area${active ? ' is-active' : ''}`}
              data-area-id={area.id}
              role="button"
              tabIndex={disabled ? -1 : 0}
              aria-pressed={active}
              aria-disabled={disabled || undefined}
              aria-label={active ? SPATIAL_MINIMAP.current(area.label) : area.label}
              onClick={activate(area.id)}
              onKeyDown={onKeyDown(area.id)}
            >
              <title>{area.label}</title>
              <rect x={x0} y={y0} width={x1 - x0} height={y1 - y0} rx={2} />
              <text x={(x0 + x1) / 2} y={(y0 + y1) / 2} textAnchor="middle" dy={4}>{area.short}</text>
            </g>
          )
        })}
        {cameraPoints && <polygon className="sw-minimap-camera" points={cameraPoints} aria-hidden="true" />}
      </svg>
      <svg className="sw-minimap-locator" viewBox={`0 0 ${floor.width} ${floor.height}`} aria-hidden="true">
        <rect x={0} y={0} width={floor.width} height={floor.height} className="sw-minimap-floor" />
        <rect
          x={departmentBBox[0]}
          y={departmentBBox[1]}
          width={departmentBBox[2] - departmentBBox[0]}
          height={departmentBBox[3] - departmentBBox[1]}
          className="sw-minimap-dept-mark"
        />
      </svg>
      <p className="sw-minimap-caption">
        {prompting ? SPATIAL_MINIMAP.choose : (areas.find((a) => a.id === activeAreaId)?.label ?? SPATIAL_MINIMAP.overview)}
      </p>
    </nav>
  )
})
```

`rectPoints` is there for the camera fallback if you decide to draw the window outline too; drop it if unused rather than leaving it dead.

### Wiring

In `SpatialWorkspace`, above the inspector inside `.sw-context`:

```tsx
<AreaMinimap
  window={minimapWindow}
  floor={dataset.layout.floor}
  departmentBBox={overviewScene.resolvedScope.bbox}
  departmentPolygons={overviewScene.resolvedScope.polygons}
  zones={minimapZones}
  areas={displayAreas}
  activeAreaId={activeArea?.id ?? null}
  cameraPoints={cameraPoints}
  disabled={editing}
  prompting={areaPrompt}
  onPick={(id) => { setAreaPrompt(false); changeScope(id) }}
/>
```

with:

```ts
const MINIMAP_PADDING_PT = 60

const minimapWindow = useMemo<BBox>(() => {
  const [x0, y0, x1, y1] = overviewScene.resolvedScope.bbox
  const { width, height } = dataset.layout.floor
  return [
    Math.max(0, x0 - MINIMAP_PADDING_PT),
    Math.max(0, y0 - MINIMAP_PADDING_PT),
    Math.min(width, x1 + MINIMAP_PADDING_PT),
    Math.min(height, y1 + MINIMAP_PADDING_PT),
  ]
}, [dataset.layout.floor, overviewScene])

const minimapZones = useMemo(
  () => dataset.zones.filter((zone) => bboxesIntersect(zone.bbox, minimapWindow)),
  [dataset.zones, minimapWindow],
)

const cameraPoints = useMemo(
  () => points(cameraFootprint(frame, origin, pan, zoom)),
  [frame, origin, pan, zoom],
)
```

`cameraPoints` recomputes on every pan frame, which is why it is passed as a joined string: `AreaMinimap` is `memo`'d, so a pan that does not change the string costs nothing, and one that does re-renders a four-point polygon.

Keep the existing `<select>`. It is the accessible, already-tested control; the map is a second, spatial way to reach the same action. Removing the select to "replace it with the map" would trade a working control for a nicer one.

### Styles

Append to `workspace.css`, using the existing tokens:

```css
/* ------------------------------------------------------------ locator map */

.sw-minimap { margin-bottom: 18px; padding-bottom: 16px; border-bottom: 1px solid var(--sw-line); }
.sw-minimap-plan { display: block; width: 100%; height: auto; background: #f9fbfc; border: 1px solid var(--sw-line); border-radius: 4px; }
.sw-minimap-zone { fill: #eceff1; stroke: #cdd6dd; stroke-width: 1.5; }
.sw-minimap-dept { fill: #e5edf4; stroke: #7c9bb6; stroke-width: 2; }
.sw-minimap-area rect { fill: #fff; fill-opacity: 0.55; stroke: #8ea6b8; stroke-width: 1.5; }
.sw-minimap-area text { fill: var(--sw-muted); font-size: 13px; font-weight: 600; }
.sw-minimap-area { cursor: pointer; }
.sw-minimap-area:hover rect { stroke: var(--sw-selected); }
.sw-minimap-area.is-active rect { fill: #cfe0f2; fill-opacity: 1; stroke: var(--sw-selected); stroke-width: 2.5; }
.sw-minimap-area.is-active text { fill: var(--sw-selected); }
.sw-minimap-area[aria-disabled='true'] { cursor: default; }
.sw-minimap-area:focus-visible rect { outline: none; stroke: var(--sw-selected); stroke-width: 3; }
.sw-minimap-camera { fill: #245bb7; fill-opacity: 0.08; stroke: var(--sw-selected); stroke-width: 1.5; stroke-dasharray: 5 3; }
.sw-minimap-locator { display: block; width: 74px; height: auto; margin-top: 8px; }
.sw-minimap-floor { fill: none; stroke: #c3ccd3; stroke-width: 8; }
.sw-minimap-dept-mark { fill: #245bb7; fill-opacity: 0.22; stroke: var(--sw-selected); stroke-width: 8; }
.sw-minimap-caption { margin: 6px 0 0; font-size: var(--fp-t-small); color: var(--sw-muted); }
.sw-minimap[data-prompt='true'] .sw-minimap-plan { border-color: var(--sw-selected); box-shadow: 0 0 0 2px #cfe0f2; }
.sw-minimap[data-prompt='true'] .sw-minimap-caption { color: var(--sw-selected); font-weight: 600; }
```

Stroke widths are in source points, so they scale with the viewBox; the values above are tuned for the ~320 × 550 pt plan window and the 1190 × 842 pt locator, which is why the two differ by an order of magnitude.

### Labels

Add to `labels.ts`, next to the other `SPATIAL_*` exports:

```ts
export const SPATIAL_MINIMAP = {
  label: 'Bản đồ định vị khu vực',
  title: 'Vị trí trên mặt bằng',
  overview: 'Toàn bộ bộ phận',
  choose: 'Chọn một khu vực để bắt đầu chỉnh sửa.',
  current: (area: string) => `${area} · đang xem`,
}
```

and `chooseArea: 'Chọn khu vực trước khi chỉnh sửa bố trí.'` inside `LAYOUT_EDIT`.

## 4. Tests

Add to the existing suites; do not create a new file per defect.

Correctness:

1. a target desk dragged onto an adjacent `zone-16-unlabeled-01` desk reports `overlap`, and Save is refused;
2. the overlap reason names the neighbour's seat code, not a raw entity id;
3. context placements never appear in the save payload, in `changedIds`, or in the dirty count;
4. a desk from another AI area is reported once, not twice, when overlapped;
5. focusing an area yields `data-detail-tier` of `medium` or better at zoom 1, with desk codes and status markers present for exactly the target desks;
6. the overview still reports `far` at zoom 1 and `medium` after two zoom-in clicks — the existing assertions, unchanged;
7. `enterEdit` is a no-op when `editableIds` is empty;
8. changing the context padding constant does not break area identity (guards defect 3 — assert `activeArea` by id after a padding change, or simply that scope state holds an id).

Locator map:

9. six area controls render, lettered A–F, with the active one `aria-pressed`;
10. clicking an area control focuses that area — `data-rendered-workstations` matches the area's seat count;
11. the controls are `aria-disabled` and inert during editing, while the camera polygon still updates;
12. `cameraFootprint` returns the full scope bounds at zoom 1 with no pan, and a strictly smaller quad at zoom 2 — a pure unit test in `workspaceScene.test.ts`;
13. invoking Edit from the overview prompts for an area instead of doing nothing, and the prompt clears once an area is chosen. This replaces the current `disabled: true` assertion.

Then the full gates: `vitest run`, `tsc -b`, `oxlint`, `vite build`, `git diff --check`.

## 5. Browser validation

Beyond the checks in the previous handoff, confirm specifically:

- each of the six areas opens with status markers already visible, no manual zoom;
- the camera quad on the locator tracks pan and zoom without visible lag during a drag;
- dragging a desk toward the western edge of area D or E, onto the adjacent unlabeled desks, now shows a conflict;
- the locator remains legible at the narrowest supported inspector width.

## 6. Stop conditions

Fix the ten defects, add the locator, and stop.

Do not, in this slice: add the area to the URL state; change department membership or the meaning of 145; widen `contextBBox` to substitute for the locator; convert the locator into a second editable renderer; or replace the area `<select>`.

## 7. Follow-up layout adjustment

Place the area minimap in the left-hand corner of the workspace stage so it is
available as a persistent spatial locator without covering the inspector.

Move the workspace view controls — zoom out (`−`), zoom in (`+`), fit-to-view,
and any closely related view actions — to the upper-right corner of the
workspace stage. Keep their existing behavior, labels, keyboard access, and
zoom readout unchanged.

The minimap and controls must remain visually separate at narrow widths:

- the minimap stays left-aligned and legible;
- controls stay right-aligned and do not overlap the minimap;
- editing still makes minimap area controls inert/`aria-disabled`;
- the minimap camera footprint and area selection behavior are unchanged.

Update the workspace CSS/layout and add or adjust focused UI tests for these
placements. Do not redesign the surrounding page shell.
