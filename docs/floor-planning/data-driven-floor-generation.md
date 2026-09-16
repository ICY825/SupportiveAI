# Data-driven floor generation assessment

This assessment is based on the current `lystiger` branch at `0d739f8` on 16 September 2026. The repository already has an offline, deterministic floor extraction pipeline and a complete Floor 16 dataset. The visible 19-seat workspace is a deliberately fixed presentation crop, not the extent of the canonical data.

# A. Current Architecture

The implemented path is:

```text
CAD-exported PDF
  -> tools/floorplan_extract/extract_floor.py + per-floor config
  -> six generated JSON artifacts + verification raster
  -> floor loader / buildDataset()
  -> FloorDataset
  -> either FloorMap (full 2D verification view)
     or buildSpikeScene() (fixed 19-seat 2.5D crop)
  -> floor-coordinate projection
  -> React/SVG shapes
```

`tools/floorplan_extract/extract_floor.py` reads CAD layers, vector paths, text and PDF annotations. It detects labelled 1200×600 desk outlines, chair symbols, connected desk clusters, facilities, concrete obstacles and door clearances. It emits source hashes and compact JSON deterministically. `data/floors/floor-16/index.ts` imports those files, and `data/buildDataset.ts` assembles the renderer-facing `FloorDataset`.

`FloorMap.tsx` consumes the dataset directly. It renders base layers as large SVG paths and zones, rooms, objects and workstations as individual selectable polygons. `SpatialWorkspace.tsx` instead calls `buildSpikeScene()`, derives editable `SpatialPlacement` records, attaches allocation state with `buildDeskIndex()`, and passes the result to `WorkspaceScene.tsx`. The 2.5D renderer projects floor coordinates with a fixed orthographic transform and generates the SVG desk/chair faces itself.

# B. Hardcoded vs Data-Driven

Already data-driven:

- Floor geometry, grid, scale and labels in `floor16.layout.json`.
- Five zones, three rooms, 61 desk clusters, 382 workstations, 15 semantic objects and 128 obstacles in generated JSON.
- Workstation polygons, chair footprints, rotations, cluster membership and zone membership.
- Full-floor 2D rendering, selection, verification panels, search and fit/focus behavior.
- Seat, employee and assignment attachment by stable workstation ID. Current records are deterministic demo fixtures, clearly separated from geometry.
- Layout edits as `SpatialPlacement` records, with collision/boundary validation and a replaceable `LayoutStore` seam.

Manually authored or fixed today:

- Floor-specific extraction knowledge in `tools/floorplan_extract/floors/floor16.py`: source identity, grid spans, CAD layer mapping, annotation IDs, room boxes, facility labels and detection thresholds.
- The 2.5D workspace scope in `workspace/scene.ts`: three cluster IDs, `[900, 225, 1008, 294]` crop, camera origin, captions and label anchors.
- `WorkspaceScene.tsx` uses that fixed crop for its ground and clipping rectangle.
- `layoutDraft.ts` derives its editable boundary from the same crop and contains one source-specific wall snap at y=234.72/232.91.
- Workspace headings and accessible copy name the AI department and 19-seat crop directly.
- Editor saves are session memory only. They disappear on reload.

No individual desk is hardcoded in JSX. The 19 rendered desks are references to extracted canonical workstations. The actual scale barrier is the fixed scene/scope configuration and crop-specific editor logic.

# C. Scaling Assessment

The current architecture can support the complete department without replacing the renderer. The full dataset already reaches the generic 2D SVG renderer, and business state attaches by workstation ID independently of geometry. The 2.5D view needs a scope/camera refactor before it can show a whole department or arbitrary zone.

Required before full 2.5D scale-up:

1. Replace `SPIKE_CLUSTER_IDS`, `SPIKE_CROP` and fixed captions with a `WorkspaceScope` derived from floor, zone or selection.
2. Make projection and path culling depend on the active scope bounds rather than module constants.
3. Derive editable boundaries from the selected room/zone; remove the Floor 16 wall-coordinate adjustment from generic editor code.
4. Add zoom-dependent labels and viewport culling, then profile the actual 116/145-seat scope.
5. Persist layout revisions outside session memory before edits become authoritative.

Keep `FloorDataset`, the floor coordinate system, SVG entity rendering, allocation attachment, inspectors, search, selection and verification view. They already express the required separation.

Use semantic scope over the same dataset:

```text
department scope -> zone/bbox scope -> selected entity
```

The verification view already focuses a selected entity by bbox without creating another scene definition. Apply the same principle to the 2.5D workspace: scope changes camera bounds, culling and label density; it does not load a different hardcoded page or duplicate objects.

# D. Canonical Data Model

The smallest useful canonical model is substantially present:

```text
Building
  Floor / FloorLayout
    Zone[]                organizational or review boundaries
    Room[]                physical enclosed spaces when known
    FloorObstacle[]       columns, core walls, door clearances
    DeskCluster[]         grouping/navigation metadata
    Workstation[]         physical workstation identities
    FloorObject[]         facilities and unresolved objects

FloorAllocationData       separate business state
  Department[]
  Seat[] -> workstationId
  Assignment[] -> seatId + employeeId
  Employee[]
```

Reuse `SpatialPlacement` for editable `{entityId, x, y, width, depth, rotation}` state. Today `Workstation` also stores materialized polygon, bbox, center and rotation because that is the established renderer contract. Do not introduce a second workstation model. If durable editing becomes authoritative, persist identity/provenance plus a placement map and adapt it once into the current materialized `Workstation` form at the dataset boundary.

| Concern | Reuse now |
|---|---|
| Identity/type | `Workstation.id`, `Room.id`, `Zone.id`, `FloorObject.kind/classification` |
| Placement | `SpatialPlacement`; materialized `polygon/bbox/center/rotationDeg` for the current renderer |
| Business state | `FloorAllocationData`, linked through `Seat.workstationId` |
| Extraction/review | `VerificationState`, `EntitySource`, entity `bbox`, floor source path and SHA-256 |

`Department` belongs to allocation/business data and should link to one or more zone IDs. It should not be duplicated as a spatial entity. Zone boundaries may describe department territory, but the physical floor remains one model.

For provenance, the existing floor source path/hash, entity bbox, `EntitySource` and `VerificationState` are nearly sufficient. The spike adds `authoring-rule` and `templateId`. Numeric confidence should be added only when a detector produces calibrated scores. A separate `CORRECTED` state or audit record becomes useful when corrected geometry is durably saved; it is not needed for this authoring proof.

# E. Extraction Architecture

Use a staged offline job:

```text
source registration + hash
  -> format-specific deterministic extraction
  -> normalized floor coordinates
  -> object candidates + provenance
  -> schema/invariant validation
  -> review queue for ambiguity
  -> human correction/approval
  -> versioned canonical dataset
```

Deterministic work:

- Prefer vector PDF, SVG or DXF export. Read layers, lines, closed shapes, blocks, text positions and annotations directly.
- Normalize coordinates and scale; detect walls, rectangles, doors and repeated templates; cluster connected desks; run polygon containment and collision checks.
- Raster inputs can use desk-template matching, line/rectangle detection and OCR as candidate generators, each retaining source regions.
- Validate unique IDs, references, containment and geometry before publication.

AI assistance:

- Classify ambiguous symbols and unlabeled rooms from bounded source crops.
- Reconcile broken/missing boundaries and inconsistent annotations.
- Propose structured candidates for unusual furniture or incomplete raster drawings.
- Compare an ambiguous old/new region when deterministic matching cannot decide.

Human verification:

- Confirm department and room boundaries, uncertain objects, removals and identity matches.
- Correct geometry and approve a version for publication.
- Resolve business meaning that a drawing cannot prove, such as whether “(145)” is headcount or physical capacity.

The current Python extractor is already the practical import boundary. A TypeScript `FloorExtractor` interface would not simplify the next step because extraction is offline Python and rendering is browser TypeScript. Add a job contract when a second source adapter exists.

Initial authoring options compare as follows:

| Option | Engineering cost | Accuracy | Maintainability/repeatability |
|---|---|---|---|
| A. Hand-author every object | High and linear with seat count | Prone to transcription drift | Poor; every revision repeats manual work |
| B. One AI-generated dataset | Low first-pass effort | Inconsistent on exact geometry and identity | Weak unless every result is validated; reruns can differ |
| C. Deterministic extraction + pattern materialization + bounded AI + review | Moderate setup, then reusable | Highest because exact geometry stays deterministic and ambiguity is explicit | Best; source hash, rules, review and persisted output are repeatable |

Choose C. The repository already implements most of its deterministic path, so replacing that work with whole-plan AI generation would reduce reliability.

# F. Astra/AI Usage

The proposed offline use is correct. Call a multimodal model only from an ingestion/review job, never from page rendering. Send small ambiguous regions plus the extractor's candidate geometry and ask for schema-constrained structure. Reject output that fails schema, bounds or reference validation, and require review for low-confidence or high-impact changes.

Avoid asking AI to redraw the floor, enumerate obvious repeated desks, calculate polygons, assign stable IDs or produce SVG. Those operations are cheaper, repeatable and testable in deterministic code. Cache AI results by source hash + region + prompt/schema version so retries and normal rendering have zero model cost.

# G. Repeated Pattern Strategy

The current vector extractor already uses the source desk block pattern: nominal outline + `1200x600` label + exactly one chair, followed by connected-component clustering. That is why it can materialize 382 independent workstations without JSX authoring.

For raster plans or reconstructed gaps, use a compact authoring pattern only as an import tool:

```text
template dimensions + origin + rows/columns + pitch + row rotations
  -> materialize individual Workstation records with stable IDs
  -> verify
  -> persist those records
  -> discard runtime dependency on the pattern
```

The spike implements this behavior for 18 desks. Every output desk owns its geometry and can move independently. A later edit never regenerates the cluster or changes its siblings. After first approval, persisted IDs are authoritative; re-extraction should match to them rather than renumbering from a changed grid definition.

# H. Persistence Strategy

For the current stage, keep extracted canonical geometry as version-controlled generated JSON. It provides source hashes, reviewable diffs, reproducible builds and simple rollback without adding infrastructure. Keep seat/employee/assignment data outside those files.

The current editor store is an intentional session-only seam. The next durable step should be a small layout revision API/table containing floor ID, base source hash/version, placement records, author/time and approval state. The backend can later publish a compiled `FloorDataset` artifact for the frontend. This hybrid retains fast deterministic reads and auditability while business state stays in normal database tables.

For source updates, compare the newly extracted candidates to the last approved revision. Match by asset type and dimensions, then minimum spatial distance/orientation with zone as a soft signal. Use one-to-one assignment, classify matches as unchanged/moved/changed, and present additions/removals/ambiguous matches for review. The current extractor already reuses workstation IDs within 1 point and cluster IDs within 1.5 points; this is a good POC but too brittle for larger rearrangements.

# I. Renderer Assessment

React + SVG remains appropriate. The generic verification map already renders all 382 workstation polygons plus source geometry. A 145-seat 2.5D department is likely a few thousand low-complexity SVG nodes, which is within a realistic desktop browser budget when geometry is memoized and offscreen detail is culled.

Profile before changing engines. Konva would become attractive for a much larger interactive editor with heavy drag/hit-testing. PixiJS would be justified for many thousands of animated sprites. Three.js/R3F would add complexity without solving a demonstrated problem; this view uses a fixed orthographic projection and schematic extrusion.

# J. Spike Implemented

- `data/authoring/materializeWorkstationCluster.ts` defines a serializable cluster pattern and deterministically expands it to one existing `DeskCluster` plus existing `Workstation` records.
- `domain/spatial.ts` extends source provenance with `authoring-rule` and `templateId`; no parallel canonical entity type was added.
- `generatedCluster.test.tsx` materializes a 3×6, 18-workstation cluster with stable IDs `ws-16-901` through `ws-16-918`.
- The test attaches existing demo seat/status records, feeds all 18 desks through `WorkspaceScene`, selects one through the existing SVG marker, opens the existing `DeskInspector`, and moves one desk through the existing placement/application functions.
- The production Floor 16 JSON and verified geometry are unchanged.

# K. Test Results

The spike test covers deterministic count and serialization, stable IDs, row-major geometry, chair rotation, provenance, allocation/status attachment, 2.5D projection and SVG rendering, selection, inspector compatibility, and independent editing.

- Focused spike: 3/3 tests passed.
- Full frontend suite: 239/239 tests passed across 22 files.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm run build`: passed. Vite still reports the existing large-chunk warning: the main minified bundle is about 3.3 MB / 814 KB gzip, dominated in part by the 2.8 MB source layout asset.

# L. Known Unknowns

- The source annotation says `MÔ HÌNH & NỀN TẢNG AI (145)`, but the extractor finds 116 workstations inside that polygon. Adding the adjacent unlabeled 38-desk area gives 154, not 145. The drawing does not state what 145 means.
- It is unknown whether the adjacent unlabeled highlighted area belongs to the AI department.
- Most enclosed rooms are visible as base geometry but have no reliable semantic room entities or names.
- Private-office L-shaped desks and nonstandard furniture are not counted by the 1200×600 rule.
- The source's revision authority and the meaning of hidden annotations remain unconfirmed.
- Full-department 2.5D interaction and label readability have not yet been profiled with real administrators.

# M. Recommended Next Sprint

1. Confirm the AI department boundary and the meaning of “145” with Facilities/Admin using the source overlay.
2. Introduce a data-driven `WorkspaceScope` for floor/zone/bbox and parameterize projection, clipping, captions and editable boundaries.
3. Render the existing 116 extracted AI-zone workstations in 2.5D; do not invent the missing 29.
4. Add zoom-dependent labels and viewport culling, then measure DOM size, first render, selection latency and pan/zoom responsiveness.
5. Add a review artifact that lists extracted, ambiguous, added and removed objects with source-region links.
6. Design the small durable layout revision endpoint behind the existing `LayoutStore` only after scope rendering is proven.

Stop there. A production raster/CV service, generalized CAD ingestion and advanced identity matcher should wait for a second real source format or updated drawing to establish their requirements.
