# Bố trí chỗ ngồi — spatial visual spike

> **Historical record.** Written on the date below and not maintained since.
> For how the module works now, read [`engine-architecture.md`](engine-architecture.md)
> and [`persistence.md`](persistence.md); [`README.md`](README.md) explains the split.

Implemented on `lystiger`, 16 September 2026. This is a read-only visual decision prototype, limited to 19 workstations. It is not a full-floor conversion.

## Open the prototype

```bash
cd frontend
npm run dev -- --host 127.0.0.1
```

Open the Vite URL with `#/floor-planning?floor=floor-16&view=workspace`. To open the available-desk example directly, append `&select=workstation:ws-16-066`.

## Rendering approach and data fidelity

Separate React/SVG renderer with a fixed orthographic projection: 30° plan rotation and 45° elevation. SVG provides crisp selectable geometry, keyboard interaction, and deterministic depth ordering without a new dependency, WebGL context, or animation loop.

The shared `FloorDataset` remains authoritative. The spike takes the original workstation objects from complete clusters `cluster-16-13`, `cluster-16-17`, and `cluster-16-18`: 19 of Floor 16's 382 workstations, with both desk orientations. The original polygons already encode rotation; the renderer does not reconstruct desks from axis-aligned bounds.

The viewing crop is `[900, 225, 1008, 294]` in source PDF points. It includes the upper AI-zone boundary, façade, and structural/wall context. The rectangular presentation plane is a **crop**, not a new floor or room outline; the UI labels the continuation of the floor. Zone polygons and architectural path segments use the same affine projection as furniture. Path culling retains entire intersecting source subpaths, including cubic curves, and SVG clips them at the viewing boundary. No source path is resampled.

Chair positions and bounding footprints come from each workstation's paired chair. Furniture forms are intentionally schematic. Display heights of 750 mm for desks and 450 mm for chair seats, plus low wall relief, are presentation assumptions, not newly asserted source measurements. Plan coordinates, rotations, boundaries, and the domain model are unchanged.

Seat states and people come from the existing `createDemoAllocation` → `buildDeskIndex` flow. The crop contains 15 occupied, one available, one reserved, one conflict, and one unavailable desk. Extraction verification states do not drive workspace colors or occupancy.

`FloorMap.tsx`, verification styles, all authoritative floor JSON files, allocation fixtures, dependencies, and backend files are unchanged. The page routes workspace mode to the new component and verification mode to the existing renderer.

## Screenshots and iteration

All final screenshots are from the production build in Chromium.

| View | Artifact |
| --- | --- |
| Overview, 1440 × 900 | [Overview](../../output/playwright/spatial-overview.png) |
| Selected occupied desk | [Occupied](../../output/playwright/spatial-occupied.png) |
| Selected available desk | [Available](../../output/playwright/spatial-available.png) |
| Selected conflict desk | [Conflict](../../output/playwright/spatial-conflict.png) |
| Laptop, 1280 × 800 | [Laptop](../../output/playwright/spatial-laptop.png) |
| Existing verification mode | [Verification](../../output/playwright/verification-preserved.png) |
| First implementation before refinement, 1600 × 1000 | [First pass](../../output/playwright/spatial-first-pass.png) |

The first visual inspection exposed competing façade detail, a faint zone boundary, and a selection outline partly occluded by adjacent desktops. The next pass softened architectural strokes, emphasized the exact zone boundary, moved the selection outline above the furniture drawing order, and matched its blue with the inspector and selected-desk caption. A further desktop-size inspection led to tighter framing, giving the desks more screen space. Browser inspection also identified Chromium's default mouse-focus outline; keyboard focus now retains its own deliberate indicator. A workspace-only top-bar wrapping rule removes horizontal overflow on narrower screens.

## What worked

- Original desk clusters, alternating chair positions, and façade corner remain recognizable. The elevated view reveals the arrangement without camera rotation.
- Occupied desks have solid employee-initial markers; available desks have green open-circle markers. Reservation clocks, conflict triangles, and unavailable slashes provide additional non-color cues.
- Restrained furniture depth and low architectural relief preserve visibility; no tall walls or decorative objects obscure the desks.
- A continuous blue desktop outline and matching inspector accent make selection distinct from operational status.
- Vietnamese labels, the existing VSF shell, quiet materials, and a compact read-only inspector retain an enterprise tone.

## What remains weak or unproven

- The 2–3 second recognition target needs a timed test with actual administrators. It has not been established by screenshots or automated tests.
- This crop has only one available desk and one department boundary. Dense adjacent departments and more varied availability need a later visual check before committing to a full-floor rollout.
- Desk codes and boundary labels become small on narrower viewports; zoom helps. Full-floor views will need labels that change with zoom and visible-area culling.
- Source façade/column detail still looks more like a drawing than solid BIM architecture. The subtle treatment is sufficient for this spike, but any future simplification must preserve source geometry.
- Depth sorting is adequate for these low, separate primitives. Taller or overlapping architecture elsewhere on the floor has not been evaluated.
- Avatar markers mean an assigned person, not live physical presence. Demo people and allocations are clearly labeled.

## Validation and performance

- `npm run build`: passed, including TypeScript.
- `npm run lint`: passed.
- `npm test`: 60 tests passed across 11 files.
- Geometry tests verify original object identity, complete crop membership, shared path/furniture projection, unchanged dataset contents, and conservative source-path culling.
- Browser checks cover all five states, desktop and marker selection, inspector contents, single selection, pan without changing selection, zoom/reset, arrow keys, Escape, accent-insensitive search, and the verification/workspace roundtrip.
- No page errors or non-GET/HEAD requests were observed during that browser exercise.
- Checked widths 1600, 1440, 1280, 1024, and 768 px without document-level horizontal overflow. This is primarily a desktop prototype.
- The crop has 576 SVG descendants with no selection. Five production-build selection samples took approximately **18–25 ms from pointer-up to the second animation frame** on this local headless Chromium run. This is a small interaction-settling proxy, not a formal paint-latency or sustained-frame-rate benchmark.
- The unchanged floor-layout asset is still **2.91 MB minified / 692 KB gzip** and triggers Vite's large-chunk warning. Culling reduces rendered architecture, but the spike still loads the existing full authoritative dataset. Full-floor load time and rendering performance are unproven.

The browser measurements and assertions are recorded in [validation.json](../../output/playwright/validation.json). The repeatable browser exercise is [validate-spatial.js](../../output/playwright/validate-spatial.js); it expects `npm run preview -- --host 127.0.0.1 --port 4173` and can be run with `playwright-cli run-code --filename output/playwright/validate-spatial.js` after opening a browser session.

## Recommendation and next step

**Conditional go for this visual language; stop at the representative-area spike.** The view provides useful spatial depth at low complexity and can continue to consume the shared domain model. It does not yet prove full-floor rendering performance or administrator recognition speed.

Next, run a short session with 3–5 Vietnamese administrators: show the overview for three seconds, ask them to locate an available desk and identify the selected desk, then ask them to identify reserved/unavailable desks and the zone boundary. Record timing and mistakes. Use those observations for the go/no-go decision.

If that passes, the next implementation slice should parameterize the visible area and add zoom-dependent labels and viewport culling against the **same** `FloorDataset`. Validate a neighboring section with a second department and overlapping architectural context, then profile the 382-workstation floor before broadening the rollout. No drag/attach/detach, assignment writes, optimization, or HR integration belongs in that visual-validation step.

## File inventory

| Change | File |
| --- | --- |
| New spatial composition, read-only inspector, scoped search and navigation | `frontend/src/features/floor-planning/workspace/SpatialWorkspace.tsx` |
| New SVG furniture, architecture and selection renderer | `frontend/src/features/floor-planning/workspace/WorkspaceScene.tsx` |
| New source-data crop and orthographic projection helpers | `frontend/src/features/floor-planning/workspace/scene.ts` |
| New workspace-scoped visual and responsive styles | `frontend/src/features/floor-planning/workspace/workspace.css` |
| Workspace renderer routing and workspace-only page class | `frontend/src/features/floor-planning/pages/FloorPlanningPage.tsx` |
| Updated integration checks and scope/mode guards | `frontend/src/features/floor-planning/__tests__/FloorPlanningPage.workspace.test.tsx` |
| New source-fidelity and projection checks | `frontend/src/features/floor-planning/__tests__/workspaceScene.test.ts` |
| Decision report | `docs/floor-planning/workspace-spatial-spike.md` |
| Screenshots, browser exercise and measurement evidence | `output/playwright/` |
