# Floor planning engine

How an architectural PDF becomes a floor people can look at, search and edit.
This document is kept true against the code; the dated handoffs in this folder
are not. See [`README.md`](README.md).

## 1. The pipeline

```
docs/references/<drawing>.pdf
        │  tools/floorplan_extract/extract_floor.py  +  floors/<floor>.py
        ▼
data/floors/<floor-id>/*.json          generated, never hand-edited
        │  data/floorAssets.ts   (fetch)
        │  data/floorLoader.ts   (assemble)
        ▼
FloorDataset                            domain/spatial.ts
        │  workspace/scene.ts    buildWorkspaceScene(dataset, scope)
        ▼
WorkspaceSceneModel                     one editing area's worth of floor
        │  workspace/layoutDraft.ts  applyPlacements(scene, base, edits)
        ▼
rendered scene                          workspace/WorkspaceScene.tsx
```

Each arrow is one-way. Nothing downstream writes back upstream: the renderer
never mutates the dataset, and the editor never rewrites the generated files.

## 2. Extraction

`tools/floorplan_extract/extract_floor.py` is generic — about 1,100 lines that
know how to read a PDF, not how to read *this* PDF. Everything drawing-specific
lives in a per-floor config module under `tools/floorplan_extract/floors/`,
which maps CAD layer names to render groups, declares the grid spans used to
derive millimetres per point, and names the source file.

The extractor works in stages, in this order: grid, base geometry per render
group, text labels, zones and rooms from PDF annotations, workstation
detection, facilities and unknown objects from CAD labels, concrete columns and
core walls, door swing clearance sectors, then write.

It emits one artifact per concern:

| Artifact | Contents | Floor 16 size |
| --- | --- | --- |
| `<f>.layout.json` | Floor bounds, grid, and ten base layers, each a single SVG path string | 2,907,237 B |
| `<f>.workstations.json` | Every desk: polygon, bbox, centre, `rotationDeg`, chair | 258,649 B |
| `<f>.obstacles.json` | Columns, core walls, door clearance sectors | 63,929 B |
| `<f>.overview.json` | Bounds, display areas, department polygons, reduced desks | 71,476 B |
| `<f>.objects.json` | Facilities and unknown labelled objects | 6,868 B |
| `<f>.zones.json` | Department zones and rooms | 5,598 B |
| `<f>.extraction.json` | Provenance and verification counts | 3,325 B |
| `<f>.display-areas.json` | Which parts of the floor the UI offers as editing areas | 1,061 B |

The overview artifact is **derived data**. It exists so the workspace can paint
before the geometry arrives. It never becomes a second source of truth, and it
carries no `Zone` semantics.

**Invariant.** Files under `data/floors/` are generated. Needing different
output means changing the extractor and re-running it, never editing the JSON.

## 3. Loading

`data/floorAssets.ts` resolves artifact URLs from one glob over
`data/floors/*/*.json`, asking for `?url` so the files stay static `.json`
assets instead of becoming JavaScript modules. Importing them as modules made
the bundler rewrite 2.9 MB of geometry into an object literal in the JS graph;
fetching them means `JSON.parse` and no chunking rule to maintain.

`readJsonAsset` fetches in a browser and reads from disk under Node, because
vitest resolves `?url` to a `/@fs` path that no fetch can follow. The branch is
on whether a filesystem is reachable, not on `typeof window` — the component
tests run in jsdom, which has a `window` and no server.

`data/floorLoader.ts` turns a floor id plus two facts the drawing cannot state
(its building, and the source PDF name) into a loader. Every floor assembles
the same artifacts the same way, so there is no per-floor loader module.

`data/registry.ts` declares each floor exactly once in `FLOOR_DECLARATIONS`.
`FLOOR_INVENTORY` (what the picker shows: all the real estate, extracted or
not) and `FLOORS` (what the renderer can open) are both derived from it, so a
floor's level and label cannot drift between them.

`data/buildDataset.ts` checks file shape only and assembles a `FloorDataset`.
Semantic invariants are checked separately by `data/validateFloorDataset.ts`.

## 4. The domain

`domain/spatial.ts` holds the shared vocabulary. The important distinctions:

- **`SpatialEntity`** carries an `EntitySource` and a `VerificationState`
  (`SOURCE_VERIFIED`, `EXTRACTED`, `UNVERIFIED`, `UNKNOWN`). Nothing the
  extractor could not confirm is silently upgraded; `UNKNOWN` is a real value
  the UI shows, not a gap to fill in.
- **`Zone`** is a department area read off the drawing. **`FloorDisplayAreaDefinition`**
  is a UI framing decision about which slice of the floor to edit at a time.
  They are deliberately different types: a display area is not a business or
  physical boundary and must not be presented as one.
- **`BaseLayer`** is one of ten render groups — `facade`, `structure`, `core`,
  `walls`, `partitions`, `doors`, `fixtures`, `furniture`, `grid`, `dimensions`
  — each a single SVG path.

## 5. Scene building

`workspace/scene.ts` `buildWorkspaceScene(dataset, scope, options)` reduces a
whole floor to one editing area:

- workstations by explicit id list or by scope membership;
- zones, rooms and obstacles by intersection with `contextBounds`;
- base layers filtered to the five context layers (`facade`, `structure`,
  `walls`, `partitions`, `doors`) and then clipped, subpath by subpath, by
  `clipSourcePathToBBox`.

The projection is orthographic and lives here too (`project`, `unproject`,
`planeTransform`); no viewport origin is baked into it.

`sceneWallSegments` extracts straight runs from the alignable layers — `walls`,
`partitions`, `facade` — for the editor's align-to-wall action. `structure` and
`doors` are excluded on purpose: a column grid and a door leaf are obstacles to
avoid, not surfaces to sit against.

Scene building is memoised on `[dataset, scope]` in `SpatialWorkspace.tsx`, not
run per frame. Switching display areas on Floor 16 measured about 210 ms.

## 6. Placement

`domain/placement.ts` is the editing rule set. A `SpatialPlacement` holds a real
angle in degrees, not a quarter turn: Floor 16 has eighteen desks drawn at
about 45° along the angled facade, and rounding them to quarters split one
physical row across two perpendicular facings.

- `placementCorners` gives the four oriented corners. Everything else —
  footprint, bounds, outline, collision, chair — is derived from them, so the
  footprint that validates is the footprint that is drawn and the footprint
  that is stored.
- `QUARTER_ROTATIONS` survives as the rotate-button cycle, so the 364
  orthogonal desks behave exactly as before.
- `rotateQuarter` in `domain/geometry.ts` remains the fast path for the
  orthogonal majority; `rotatePoint` is the general case beside it.
- Grid snapping projects the leading corner into the placement's own frame,
  snaps there, and projects back. The lattice is anchored per entity by
  `gridForEntity`, not globally.
- Validation reports reasons (`PlacementIssue`) rather than relocating a desk.
  A rejected desk stays where the user aimed it; there is no nearest-valid
  search.

`workspace/layoutDraft.ts` `applyPlacements` composes edits onto a scene to
produce the render model. It is derived output — it does not write back to the
dataset.

## 7. Rendering

`workspace/WorkspaceScene.tsx` draws the scene as SVG. A detail tier
(`WorkspaceDetailTier`: far / medium / close) is selected from effective zoom.

Measured on Floor 16: the overview draws 4,043 SVG descendants for 154 desks —
roughly twenty-six nodes per desk before chairs — rising to 4,937 at 144% zoom.
This is a known budget, not a target that has been optimised; see
[`non-orthogonal-desks-and-render-budget.md`](non-orthogonal-desks-and-render-budget.md)
section 2.3 for the proposed slice and the reasons it has not been done.

## 8. What the module does not own

- **Seat assignments.** Who sits where is the backend's
  (`backend/app/modules/resource_allocation/seat/`), reached through
  `frontend/src/api/seats.ts`. The map's geometry never waits on it.
- **Where a moved desk stays put.** Saved placements are the backend's
  (`backend/app/modules/resource_allocation/layout/`), reached through
  `frontend/src/api/layout.ts`. That module holds the difference from the
  drawing, not the drawing. See [`persistence.md`](persistence.md).

## 9. Known outside consumer

`frontend/src/features/lockers/components/LockerMap.tsx` imports
`floor16.layout.json` directly as a module, hardcoded to Floor 16, bypassing
the registry. It is the reason `vite.config.ts` still carries a per-floor
chunking rule and an entry-chunk assertion. Anyone generalising the lockers
view should route it through `data/floorAssets.ts` instead.
