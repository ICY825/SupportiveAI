# Luna handoff: authored-desk placement, display-area data, and floor-density readiness

Prepared 18 September 2026 for the `lystiger/dev` branch.

Read this before changing code. The previous diagnosis found one real design weakness but attributed the reported failure to the wrong mechanism. This handoff separates observed facts, required behavior, and follow-up performance work so the placement fix does not turn into a speculative floor-planning rewrite.

## 1. Outcomes

Deliver these in order:

1. Adding a desk preserves the user's intended snapped position, chooses a locally sensible four-way orientation, and visibly explains any invalid placement.
2. A rejected desk never jumps to a distant "nearest valid" location.
3. Floor-specific display areas are data-driven and scale beyond Floor 16 without being misrepresented as physical or business zones.
4. Floor loading has measured performance evidence and a separately scoped optimization recommendation. Do not mix an unmeasured payload rewrite into the placement fix.

## 2. Working-tree warning

The tree is already dirty. Preserve these changes and determine their owner before editing overlapping code:

```text
M  frontend/src/features/floor-planning/__tests__/authoredEntities.test.ts
M  frontend/src/features/floor-planning/domain/authoredEntities.ts
?? output/bds-spur.png
?? output/bds-trim.png
?? output/zone-b-proposal.png
```

The two TypeScript files currently contain chair-generation and authored-chair normalization work. Do not discard, reconstruct, or silently absorb it. Review the diff first and coordinate if your placement work needs those files.

Do not edit generated files under `data/floors/floor-16/` by hand.

## 3. What is proven

### 3.1 The template selection is brittle

`SpatialWorkspace.addAuthoredDesk` selects `targetArea.workstationIds[0]`, finds that workstation, and copies its width, depth, and rotation into the pending desk.

This makes array order a product decision. It is not a stable way to choose the size or facing of a desk being placed somewhere else in a mixed area.

### 3.2 The earlier Area A explanation does not explain the reported example

The reported image shows the middle row around desks 205 and 206 in Khu vực D. Khu vực D's first template is `ws-16-201`, whose raw `rotationDeg` is already 90 degrees, matching the 205–206 footprint axis.

Therefore, "Area A supplied a 0-degree desk into a 90-degree row" is a real possible failure elsewhere, but it is not the demonstrated cause of this example.

### 3.3 Raw rotation is only a two-way footprint axis

The extracted data mostly stores `rotationDeg` as 0 or 90. The chair position supplies the missing facing direction:

```text
raw 0   + chair south = 0
raw 0   + chair north = 180
raw 90  + chair west  = 90
raw 90  + chair east  = 270
```

`determineWorkstationRotation` already derives this four-way value from the chair, but `placementFromWorkstation` currently uses `rotationDeg` directly.

The AI display areas contain opposing chair directions even where every desk has the same raw axis:

```text
Area A: 14 at 0,   14 at 180
Area B: 10 at 90,   1 at 180, 10 at 270
Area C:  7 at 90,   1 at 180,  7 at 270
Area D:  4 at 0,    3 at 90,   4 at 180, 3 at 270
Area E: 11 at 0,   11 at 180
Area F:  8 at 90,   8 at 270
```

Copying the nearest desk's raw 0/90 value is therefore insufficient. The pending desk needs an explicit four-way seated direction.

### 3.4 Some of the distance is legitimate chair clearance

Reproducing the row beside `ws-16-206` shows that a desk snapped immediately against it overlaps 206's extracted chair space. The next snapped position still intersects that chair. A farther position becomes valid.

That is not automatically a validator bug: the requested floor area is occupied by a real chair/occupant footprint. The current UI makes it look arbitrary because the pending preview draws only a flat desk rectangle and exposes no rejection reason.

### 3.5 The previous percentages were not interaction evidence

The reported 57.2%, 54.7%, and 23.6% figures came from sweeping unsnapped candidate centres across an entire zone. The real interaction:

- snaps the desk corner to a 600 mm grid;
- displays only the focused area's context window;
- validates the department draft plus context desks;
- lets the pointer reach only what is currently framed.

Do not use those percentages as an acceptance baseline. Replace them with focused, grid-snapped regression cases and browser evidence.

## 4. Placement behavior to build

### 4.1 Preserve position; resolve orientation locally

The pointer-selected grid cell is authoritative. Do not search the floor and move the desk elsewhere.

At that same snapped position:

1. Determine a stable desk size from canonical metadata, preferably `source.nominalSizeMm` converted with `mmPerPt`, with a documented fallback when metadata is absent. Do not let the first array element's extraction noise define every authored desk.
2. Identify nearby canonical desks relevant to the local row.
3. Derive their four-way facing with chair geometry, not raw `rotationDeg` alone.
4. Evaluate the plausible quarter rotations at the intended position with the existing full validation context.
5. Prefer a valid orientation aligned with the local row and nearest desk. Make the tie-break deterministic.
6. If no orientation is valid at that position, keep the preview there and show why. Do not relocate it.

Do not weaken boundary, obstacle, door-clearance, desk-overlap, or chair-overlap validation merely to turn the preview blue.

### 4.2 Make chair space visible before commit

The pending preview must show both:

- the desk footprint;
- the chair/occupant clearance footprint on the chosen seated side.

Use the same geometry for preview, validation, committed authored entity, reload, and subsequent editing. A placement must not validate with one chair rectangle and render or persist a different one.

The current uncommitted authored-chair work appears relevant, but verify its semantics. An extracted chair symbol and a safety-clearance region may be different concepts; do not silently conflate them. If both are needed, name and model both explicitly.

### 4.3 Explain rejection at the point of action

Red alone is not enough. While a pending desk is invalid, display the concise primary reason in the edit caption or adjacent status region, with full details available accessibly.

Examples:

```text
Không thể đặt ở đây: chỗ ngồi của bàn 206 chiếm vị trí này.
Không thể đặt ở đây: bàn sẽ chạm lõi thang máy.
Không thể đặt ở đây: bàn nằm ngoài khu vực của bộ phận.
```

Keep the existing structured `PlacementIssue` values. Reuse the label formatter instead of inventing validation text inside the pointer handler.

The message must update with the preview, be available to screen readers, and disappear when placement becomes valid or is cancelled.

### 4.4 Pending-placement controls

Allow the user to cycle the pending desk through quarter rotations before committing, using the established `R` convention or an equally visible control. Automatic local orientation is a default, not a lock.

`Esc` continues to cancel. A click on an invalid preview must not commit anything, issue a desk number permanently, or clear the pending state without explanation.

### 4.5 Explicit non-goal

Do not implement unconstrained "snap to nearest valid position." It can move a desk across a row, aisle, obstacle, or camera boundary and reproduces the complaint that the desk lands far from where the user aimed.

If a future assisted-placement feature is wanted, it needs a small maximum search radius, a visible original ghost, an explicit confirmation, and tests. It is out of this slice.

## 5. Placement regression cases

Add focused tests that prove behavior rather than sweeping until something happens:

1. Khu vực D uses four-way chair direction, not only raw 90-degree footprint rotation.
2. A candidate directly beside `ws-16-206` is rejected specifically because of 206's chair space and remains at the requested snapped cell.
3. The pending preview renders the same chair side and bounds that validation uses.
4. A valid alternate rotation at the same cell is preferred without translating the desk.
5. When all four rotations are invalid, none is presented as valid and the preview does not move.
6. Areas A and E distinguish 0 from 180 despite raw `rotationDeg` being 0 for both sides of their rows.
7. Areas B, C, D, and F distinguish 90 from 270.
8. Manual pending rotation updates validation and the visible clearance footprint.
9. The rejection reason names the conflicting desk or obstacle in office language.
10. A committed authored desk round-trips through storage with identical desk and chair geometry.
11. Cancelling an invalid pending desk leaves authored entities and issued numbers unchanged.
12. Tests choose named floor coordinates or workstation-relative positions. Remove the current "sweep screen pixels until a valid preview appears" pattern where the behavior under test needs a deterministic location.

## 6. Display areas: make them data-driven without calling them zones

### 6.1 Current problem

`workspace/displayAreas.ts` hardcodes AI Area A–F as Floor 16 cluster-id lists and special-cases `dept-ai-data`. A fallback collector now creates Area G for unclaimed clusters, so desks no longer disappear, but the model still does not scale cleanly to eight floors.

Cluster ids are extraction products. Moving the same cluster-id arrays from TypeScript into `floor16.py` would relocate the brittleness without removing it.

### 6.2 Semantic rule

Display areas are UI focus/edit scopes. They are not:

- department zones;
- rooms;
- source-verified physical boundaries;
- backend organizational records.

Do not emit them as ordinary entries in `*.zones.json`, and do not give them `Zone` semantics merely to reuse an existing file.

### 6.3 Data shape

Add dedicated per-floor display-area metadata, either as its own generated/static artifact or as a clearly separate top-level dataset section. Keep the generic renderer unaware of Floor 16 and AI-specific ids.

Prefer stable geometry and business keys over extraction-order ids. A suitable conceptual shape is:

```ts
interface FloorDisplayAreaDefinition {
  id: string                 // stable across re-extraction
  label: string
  short: string
  departmentCode: string
  polygon?: Point[]          // preferred for explicit curated membership
  bbox?: BBox                // acceptable for simple non-overlapping areas
  contextPaddingMm?: number
}
```

Derive current workstation membership from canonical workstation centres and the definition geometry. If a floor genuinely requires explicit membership exceptions, record stable workstation/source anchors and explain why; do not default back to cluster sequence numbers.

Keep these runtime invariants:

- memberships within one department are disjoint;
- every accepted department workstation belongs to exactly one display area after fallback;
- context bounds never grant edit membership;
- unclaimed desks degrade into a deterministic zone-backed fallback instead of disappearing;
- stale definitions produce a visible/testable warning, not silent data loss.

The existing A–F labels are neutral product labels. Preserve them unless product supplies recognized facilities names.

### 6.4 Migration boundary

Migrate Floor 16 through the same public loader path future floors will use. Remove the `dept-ai-data` special case from the generic area builder once the floor metadata supplies it.

Do not rewrite extracted clusters, department zones, or source geometry. Display-area metadata sits over the canonical dataset.

## 7. Display-area tests

1. Floor 16's definitions produce the intended A–G areas and all 154 AI desks exactly once.
2. Area A–F membership remains consistent with the currently accepted curated groups; Area G covers the second AI zone/fallback set.
3. Reordering the cluster array does not change area membership.
4. Changing a cluster id while leaving workstation geometry intact does not make desks disappear.
5. Another floor/department can supply display areas without editing `displayAreas.ts`.
6. Missing metadata falls back by canonical zone with stable labels and complete coverage.
7. Overlapping definitions fail validation loudly.
8. Context padding is converted from millimetres and clamped to the floor, while target membership remains unchanged.

## 8. Performance: measure first, then split the right thing

Current generated Floor 16 JSON is approximately 3.25 MB uncompressed:

```text
layout         2,907,237 bytes
workstations     258,649 bytes
obstacles         63,929 bytes
other files       ~15 KB
```

The existing floor loader already dynamically imports Floor 16, but once selected it waits for layout, zones, workstations, objects, obstacles, and extraction metadata together. The 2.9 MB layout geometry dominates, not the area definitions.

Before changing payload architecture, record in a production build and a throttled browser profile:

- floor-chunk transfer size and parse/evaluation time;
- time from selecting Floor 16 to first meaningful floor paint;
- time to workstation interactivity;
- overview render cost versus a focused area;
- object/path counts by semantic-zoom tier.

Then write a separate recommendation based on the measurements. Likely candidates include a lightweight overview artifact, splitting heavy base-layer geometry by layer/detail tier, or deferring furniture/detail data—but do not assume the order before profiling. A map cannot paint early if the proposed first phase still waits for the 2.9 MB layout.

Stop this slice after measurement and a bounded recommendation unless the user explicitly authorizes the payload refactor.

## 9. Files to inspect first

- `frontend/src/features/floor-planning/workspace/SpatialWorkspace.tsx`
- `frontend/src/features/floor-planning/workspace/EditLayer.tsx`
- `frontend/src/features/floor-planning/workspace/displayAreas.ts`
- `frontend/src/features/floor-planning/workspace/layoutDraft.ts`
- `frontend/src/features/floor-planning/domain/placement.ts`
- `frontend/src/features/floor-planning/domain/authoredEntities.ts`
- `frontend/src/features/floor-planning/labels.ts`
- `frontend/src/features/floor-planning/data/buildDataset.ts`
- `frontend/src/features/floor-planning/data/floors/floor-16/index.ts`
- `tools/floorplan_extract/floors/floor16.py`
- `tools/floorplan_extract/extract_floor.py`
- placement, authored-entity, workspace-scene, and page-workspace tests under `frontend/src/features/floor-planning/__tests__/`

Also read:

- `docs/floor-planning/luna-authored-entities-handoff.md`
- `docs/floor-planning/luna-six-area-editor-handoff.md`
- `docs/floor-planning/luna-seating-usability-handoff.md`

Where an older handoff says exactly six areas or 116 AI desks, the current accepted state wins: the second AI zone has been added, producing Area G and 154 desks.

## 10. Sequencing and stop conditions

### Slice A — placement truth and feedback

Implement four-way local orientation, visible chair/clearance geometry, deterministic rejection tests, and rejection messaging. Stop when the authored desk stays at the requested cell and the UI truthfully explains both valid and invalid cases.

### Slice B — area metadata

Introduce the dedicated data shape and migrate Floor 16 without changing canonical extraction entities. Stop when the generic builder has no Floor 16/AI special case and coverage invariants pass.

### Slice C — performance evidence

Measure the production behavior and write the recommendation. Do not begin a broad streaming, tiling, or renderer rewrite under this handoff.

Do not combine all three slices into one commit.

## 11. Verification gates

For each implementation slice, run the narrow regression tests first. Before handing work back, run:

```text
cd frontend
npx vitest run
npx tsc -b
npx oxlint .
npx vite build
cd ..
git diff --check
```

Report the exact commands and results. Do not claim the placement is fixed from unit tests alone: inspect the authored-desk flow in a real browser at a representative desktop viewport, including Khu vực D beside desks 205–206.

## 12. Definition of done

The work is complete only when:

- the pointer's snapped position is preserved;
- four-way facing and chair side are derived and persisted consistently;
- valid orientation assistance never translates the desk;
- every invalid pending placement gives an understandable reason;
- chair/clearance geometry is visible and matches validation;
- no unconstrained nearest-valid search exists;
- display-area definitions are floor data but are not masquerading as zones;
- Floor 16 has complete, disjoint, extraction-order-independent area coverage;
- performance claims are backed by fresh measurements;
- existing dirty work is preserved or explicitly coordinated;
- focused tests and the full verification gates pass.
