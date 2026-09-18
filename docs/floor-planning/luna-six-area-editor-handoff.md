# Luna handoff: six-area workspace editor with spatial context

Prepared 17 September 2026 for the current `lystiger` branch and working tree. Continue from the current uncommitted state; do not discard or reconstruct the dynamic workspace changes already present.

## 1. Outcome

Replace the 21-item extracted-cluster focus navigation with approximately six useful editing areas for the accepted `Mô hình & Nền tảng AI` department.

Each focused area must show enough canonical floor context to make drag-and-drop understandable:

- editable desks at normal emphasis;
- nearby desks as optional muted, non-editable context;
- walls, partitions, doors, columns, rooms, circulation edges, and the department boundary;
- a clear boundary around the area whose desks can be moved.

Do not draw six independent maps. The result must remain one canonical `FloorDataset`, one renderer, and multiple view/edit scopes.

## 2. Current state

The dynamic department workspace refactor is already implemented in the working tree:

- `WorkspaceScope` supports `department`, `zone`, and `bbox` scopes.
- `buildWorkspaceScene(dataset, scope)` replaced `buildSpikeScene(dataset)`.
- The accepted AI annotation renders 116 canonical workstations across 21 extracted clusters.
- Projection, scene bounds, clipping, fit-to-view, and captions are no longer tied to the old 19-seat crop.
- Semantic zoom is present:
  - FAR below `1.3x`;
  - MEDIUM from `1.3x`;
  - CLOSE from `2x`.
- Search, status, selection, inspector, keyboard navigation, pan, and zoom work across the full department.
- The navigation currently exposes every extracted cluster as a `bbox` focus option.
- Entering edit mode currently focuses the first extracted AI cluster. This is intentionally limited but is not the desired final interaction.

Last verified state:

- Vitest: 24 files, 259 tests passed.
- TypeScript typecheck passed.
- Oxlint passed.
- Production build passed with the existing large-bundle advisory.

## 3. Why the current focused view is weak

An extracted desk cluster is a geometry-detection result, not a user-recognizable office area. Exposing all 21 clusters creates excessive navigation and produces scopes averaging only about five desks.

The focused `bbox` currently does two unrelated jobs:

```text
which desks belong to the focus
and
which geometry is visible in the camera
```

Because the bbox tightly wraps the desks, architectural paths are clipped at the desk group and the focused view appears as tables floating on a blank plane. A user cannot judge aisles, walls, columns, doors, or safe movement boundaries from that view.

Separate editable membership from visible context.

## 4. Non-negotiable data constraints

- Keep all 21 extracted clusters unchanged in canonical data.
- Do not merge, delete, or rewrite extracted clusters.
- Six areas are UI display/editing scopes, not departments, rooms, or permanent business zones.
- Do not modify verified Floor 16 extraction geometry.
- Do not add the adjacent 38 workstations in `zone-16-unlabeled-01` to the AI department.
- Do not force the source label figure `145` to match physical desks.
- The accepted department remains exactly 116 extracted workstations in `zone-16-ai-platform`.
- Do not create separate components or scene files for the six areas.

## 5. Provisional six-area grouping

Use this as the initial UI grouping. Validate it visually against the canonical floor before polishing labels. The cluster membership is presentation metadata and must live outside the generic renderer.

| UI area | Extracted clusters | Seats | Target bbox in source points |
| --- | --- | ---: | --- |
| A — upper right | `13`, `18`, `22`, `30` | 28 | `[946.51, 245.73, 991.87, 342.21]` |
| B — upper middle | `16`, `17`, `27`, `28` | 21 | `[882.43, 255.95, 922.03, 329.68]` |
| C — upper left | `25`, `26` | 15 | `[825.70, 284.32, 865.44, 341.06]` |
| D — middle row | `32`, `33`, `34`, `35` | 14 | `[825.70, 359.20, 991.87, 370.58]` |
| E — lower right | `52`, `54`, `56` | 22 | `[946.51, 482.03, 991.87, 550.00]` |
| F — bottom row | `58`, `59`, `60`, `61` | 16 | `[813.74, 632.37, 910.22, 654.98]` |

Total: 21 extracted clusters and 116 workstations.

The visible product labels should remain neutral, such as `Khu vực A · 28 chỗ`. Do not imply that directional names are recognized Facilities or HR terminology.

## 6. Smallest useful model change

Do not enlarge a focused bbox and then treat every desk inside the enlarged rectangle as editable. That could pull adjacent or unlabeled desks into the editing set.

Represent the two bounds explicitly, conceptually:

```ts
interface WorkspaceDisplayArea {
  id: string
  label: string
  scope: WorkspaceScope       // target membership / target bbox
  clusterIds: readonly string[]
  contextBBox: BBox            // larger camera and architecture window
}
```

Equivalent naming is fine. Keep floor-specific grouping metadata in one isolated module, for example `workspace/displayAreas.ts`. The renderer must remain generic.

The scene should make the distinction obvious, conceptually:

```ts
interface WorkspaceSceneModel {
  workstations: Workstation[]         // active/target desks
  contextWorkstations: Workstation[]  // optional muted neighbors
  scopeBounds: BBox                   // active/edit boundary
  contextBounds: BBox                 // clipping and fit-to-view
  // existing canonical layers, zones, rooms, heights...
}
```

Avoid duplicating a workstation into a second domain model. Both collections must reference canonical `Workstation` objects.

## 7. Context-bounds rule

Start with a context expansion of approximately 25 source points around each target bbox. Floor 16 is approximately 105.8 mm per source point, so this provides about 2.6 metres of surrounding context.

Requirements:

- derive the target bbox from the grouped cluster geometry rather than trusting copied numbers at runtime;
- expand it to form `contextBBox`;
- clamp context to floor bounds, not to the department polygon;
- clip architectural layers to `contextBBox`;
- derive fit-to-view from visible context geometry;
- keep target desk selection/counting based on the area membership, not `contextBBox` containment.

Allowing context to extend beyond the department is intentional. A wall, aisle, or neighboring desk just outside the department can be necessary to understand the space. Such objects must not become editable or count toward the area's capacity.

If 25 points is visually too loose or tight, adjust once after browser inspection and keep the value centralized. Do not tune six unrelated crops by hand unless a real physical barrier requires an explicit exception.

## 8. Context rendering

Render from existing canonical data:

- source `walls`, `partitions`, `doors`, `structure`, and façade paths intersecting `contextBBox`;
- extracted column obstacles and other major collision geometry;
- intersecting room polygons and labels;
- the exact accepted AI department boundary;
- target workstations and chairs;
- optionally, neighboring workstations intersecting `contextBBox` as muted silhouettes.

Visual hierarchy:

1. Target desks: normal status color, selectable, draggable in edit mode.
2. Active area boundary: clear but quiet blue outline or wash.
3. Structural context: visible enough to judge placement without competing with desks.
4. Context desks: low opacity or neutral outline, not selectable and never draggable.
5. Geometry outside `contextBBox`: culled.

Do not add decorative furniture, textures, shadows, plants, monitors, or true 3D. This slice is about spatial comprehension during editing.

## 9. Navigation and editing behavior

Preferred flow:

```text
Mô hình & Nền tảng AI
  -> Tổng quan
  -> choose Khu vực A–F
  -> focused contextual view
  -> Edit layout
```

Behavior requirements:

- Replace the 21-option UI with six areas.
- Preserve full-department overview.
- Preserve selection when moving between overview and an area.
- If the selected desk is outside the focused area, keep the inspector state but do not draw an in-scope selection affordance.
- Search remains indexed over all 116 accepted department desks.
- Selecting a search result outside the current area should return to overview and reveal the desk, matching current behavior.
- Edit mode must use the currently focused area instead of always switching to the first area.
- Do not make all 116 desks editable from overview.
- If the user invokes Edit from overview, direct them to choose an area or use a minimal area-selection step. Do not silently choose Area A.
- Only target desks participate in drag, nudge, rotate, collision validation, dirty state, and save payloads.

## 10. Editor boundaries

Keep these concepts separate:

- `contextBounds`: camera and rendering extent;
- `scopeBounds`: highlighted area extent;
- canonical department/room polygons: physical containment validation;
- obstacles and door clearances: collision validation;
- target workstation membership: what the user can edit.

Never use the context rectangle as a physical wall. A desk may be visually close to the edge of the camera while still being valid according to canonical room/department geometry.

## 11. Files to inspect first

- `frontend/src/features/floor-planning/workspace/scope.ts`
- `frontend/src/features/floor-planning/workspace/scene.ts`
- `frontend/src/features/floor-planning/workspace/WorkspaceScene.tsx`
- `frontend/src/features/floor-planning/workspace/SpatialWorkspace.tsx`
- `frontend/src/features/floor-planning/workspace/layoutDraft.ts`
- `frontend/src/features/floor-planning/workspace/workspace.css`
- `frontend/src/features/floor-planning/domain/spatial.ts`
- `frontend/src/features/floor-planning/domain/placement.ts`
- `frontend/src/features/floor-planning/data/floors/floor-16/floor16.workstations.json`
- `frontend/src/features/floor-planning/data/floors/floor-16/floor16.zones.json`
- affected tests under `frontend/src/features/floor-planning/__tests__/`

Before editing, inspect the current diff. The dynamic workspace files are already modified and `scope.ts` is currently untracked.

## 12. Focused tests

Add or update tests for at least:

1. Six display areas cover exactly the 21 accepted AI clusters.
2. Their workstation memberships are disjoint.
3. Their union contains exactly 116 accepted AI workstations.
4. The expected area counts are `28, 21, 15, 14, 22, 16`.
5. Context bounds are larger than target bounds and clamped to the floor.
6. Context expansion does not add editable desks.
7. Adjacent unlabeled workstations never enter the target/editable collection.
8. Canonical walls, doors, partitions, rooms, and columns intersecting context bounds render.
9. Context desks are non-interactive and excluded from status counts.
10. Fit-to-view uses context geometry after area changes.
11. Overview-to-area-to-overview preserves selection.
12. Search resolves a desk in another area and returns to overview.
13. Edit mode operates on the currently selected area.
14. Edit cannot begin on the 116-desk overview without choosing an area.
15. Drag, nudge, rotate, collision, undo/redo, cancel, and save remain limited to target desks.
16. Semantic zoom still hides and reveals detail at the existing thresholds.

Run the full test, typecheck, lint, and production build gates after focused tests pass.

## 13. Browser validation

Inspect all six focused areas in a real browser at a representative desktop viewport.

For every area, verify:

- the target desk group is immediately recognizable;
- at least one useful physical anchor is visible where the source provides one;
- walls, doors, columns, or aisles do not overpower desk status;
- context desks cannot be selected or dragged;
- the active editing boundary is understandable;
- fit-to-view does not leave a tiny desk group floating in empty space;
- desk IDs/status become readable through semantic zoom;
- selection and inspector behavior remain stable.

Record approximate SVG node count and pan/zoom/selection response for the largest 28-seat area. Do not change rendering engines without measured evidence.

## 14. Acceptance criteria

The slice is complete when:

1. The department overview still renders all 116 accepted workstations.
2. Navigation exposes six editing areas rather than 21 extraction clusters.
3. The six areas partition the same 116 workstations without overlap or omission.
4. Each focused area shows useful canonical surrounding geometry.
5. Visible context is larger than the editable membership.
6. Nearby context never changes department counts or edit/save payloads.
7. Users can focus an area, understand its physical surroundings, and drag a desk relative to real walls/columns/aisles.
8. The currently focused area, not a hardcoded first area, enters edit mode.
9. Overview, search, selection, status, inspector, semantic zoom, pan, zoom, and verification integration still work.
10. No floor geometry or workstation list was duplicated or manually redrawn.

## 15. Stop conditions

Stop after six-area contextual editing is proven.

Do not in this slice:

- redefine department ownership;
- include the adjacent 38 desks;
- interpret `145` as capacity;
- rewrite the extractor;
- create permanent business zones from these six areas;
- create six renderer components or independent maps;
- expand editing to the full department;
- redesign the entire floor-planning shell;
- migrate away from React and SVG;
- add detailed office decoration.

## 16. Known business ambiguity

Keep this visible in the implementation report:

```text
source label: MÔ HÌNH & NỀN TẢNG AI (145)
accepted extracted AI workstations: 116
adjacent unlabeled workstations: 38
meaning of 145: unresolved
ownership of adjacent highlighted area: unresolved
```

The six-area change is a usability partition of the accepted 116 desks. It provides no new evidence about department capacity or ownership.
