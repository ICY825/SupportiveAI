# Handoff: adding and removing desks and rooms

Prepared 17 September 2026 for the `lystiger` branch, after the zone-presentation, assign-employee and area-framing work landed.

Two features share one foundation: the floor plan gains entities that were never on the drawing, and it must stay honest about which ones those are. Read section 2 before designing anything; it is the rule the rest hangs off.

## 1. Outcome

An administrator can:

- add a desk, which receives a new number, and remove a desk they added;
- create a room — pantry, meeting room, manager's office — and remove a room they created;
- never delete anything that came from the CAD drawing.

## 2. The rule: authored is not extracted

Everything on the floor plan today came out of the source PDF and carries a `source.kind` of `pdf-annotation`, `pdf-vector`, `pdf-text` or `authoring-rule`. That provenance is the whole reason the verification view can be trusted: it compares what the app says against what the drawing says.

A desk somebody adds in the browser is none of those. It must be marked as such, and the two kinds must behave differently:

| | Extracted | Authored |
| --- | --- | --- |
| Delete | **never** | allowed |
| Take out of use | `OUT_OF_SERVICE` | `OUT_OF_SERVICE` |
| Verification state | as extracted | `UNVERIFIED` |
| Survives re-extraction | replaced by the new extraction | carried forward |

This is exactly the distinction the request already makes — "remove the room that was created only, not the sketch". Make it a property of the data, not a rule someone has to remember.

Two changes carry it:

```ts
// domain/spatial.ts
export interface EntitySource {
  kind: 'pdf-annotation' | 'pdf-vector' | 'pdf-text' | 'authoring-rule' | 'user-authored'
  …
  /** user-authored only */
  authoredBy?: string
  authoredAt?: string
}
```

and every authored entity gets `verification: 'UNVERIFIED'`, which already means "not confirmed against the source" and already renders with its own treatment.

`deskActions.ts` currently offers `'delete-desk'` ("Xóa bàn") in the overflow menu for every desk regardless of origin. That is the rule being broken today, before the feature even exists. Offer it only for authored desks; for extracted ones the honest action is `'mark-unavailable'`.

## 3. Numbering

Floor 16's extracted workstations are `ws-16-001` through `ws-16-382`, contiguous. So:

- **Entity id**: `ws-16-a001`, `ws-16-a002`, … The letter makes a collision with any future extraction structurally impossible.
- **Seat code**: the existing `F16-<zoneLetter>-<number>` shape, numbered from **900**. A reserved band rather than "carry on from 383", because a re-extraction that finds more real desks would otherwise collide with numbers already handed out — and because `F16-B-901` tells a reader at a glance that this desk was added, not surveyed.

Never reuse a number. The next one is *highest ever issued + 1*, not the first gap. A desk removed last month and a desk added today must not share a code, or the assignment history stops making sense.

Numbering is per floor and belongs in one pure function with the store behind it, so two admins cannot be handed the same number.

## 4. Room types

The request lists open workspace, pantry, boss and meeting. One of those is not a room.

**Open workspace is a zone.** It has no walls. `Room` in this model is an enclosed polygon; `Zone` is a highlighted region that need not be. Creating an "open workspace room" would make the app assert walls the drawing does not have, and the verification view would report a disagreement that is the app's own fault. Open workspace is created as a zone, which the zone editor already partly covers.

The enclosed ones become a room type:

```ts
export type RoomType = 'MEETING' | 'PANTRY' | 'OFFICE' | 'PHONE_BOOTH' | 'SERVICE' | 'OTHER'
```

`Room.type` is currently the constant `'ROOM'`, which carries no information. Replace it with the above, defaulting extracted rooms to `'OTHER'` unless their source label says otherwise — `Phòng CBLĐ` is an `OFFICE`, and the extractor config is where that mapping belongs, not the renderer.

`OFFICE` rather than `BOSS`: the drawing names a room, not a person, and the room outlives the occupant. Who sits there is an assignment, and that already exists.

## 5. How a room is drawn

Three options were considered. Build the first.

**Rectangle with wall snapping.** The user drags a rectangle; while dragging, each edge snaps to a nearby wall or partition segment within a tolerance, and to the 600 mm grid otherwise. Most rooms on this floor are rectangles bounded by real walls, the geometry to snap against is already extracted — the `walls`, `partitions` and `core` layers plus 4 `wall` and 34 `column` obstacles — and the result is orthogonal by construction.

Rejected: **click-to-fill an enclosed area**, which reads as magic when it works and is opaque when it does not; the wall layers are SVG paths, not a topological graph, so there is nothing cheap to flood-fill against. Also rejected: **free polygon lasso**, which is precisely what produced the zone outlines we spent this week straightening.

Apply `regularizeZonePolygon` on commit, so an authored room lands orthogonal the same way a tidied zone does.

Constrain to axis-aligned rectangles in this slice. A room that genuinely needs an L-shape can be two rooms or a later feature; do not open with the tool that caused the last problem.

## 6. Creating a room over occupied desks

A pantry dragged across six desks must not silently take six people's seats away.

Creating or moving a room never changes desk or seat state. It reports the overlap — "6 chỗ ngồi nằm trong phòng này" — and offers the admin the explicit action of marking them unavailable. The decision is theirs and it is one they can see.

The same applies in reverse: removing an authored room does not restore anything automatically.

## 7. Where authored entities live

`zoneCustomization.ts` keeps zone edits in `localStorage`. That is defensible for a colour preference. It is the wrong home for desks and rooms.

An added desk is seat inventory. It changes capacity, it appears in search, it can be assigned to a person, and other people have to see it. `localStorage` is one browser on one machine, invisible to everyone else and lost when the profile is cleared.

Authored entities go behind a replaceable store, the same shape as `LayoutStore` and `AllocationStore`:

```ts
export interface AuthoredEntityStore {
  read(floorId: string): AuthoredEntities | null
  /** Merges. Absent ids keep what they had — PATCH, never PUT. */
  write(floorId: string, changes: AuthoredEntities): Promise<void>
}
```

`localStorage` may be the implementation behind it today. The interface is what matters, because it is where the API arrives — and `PUT` semantics are what cost us a day's debugging in `LayoutStore` already.

The dataset itself is never written. Authored entities are merged over the canonical `FloorDataset` by a pure function, the way `applyPlacements` and `applyZoneCustomizations` do:

```ts
export function applyAuthoredEntities(dataset: FloorDataset, authored: AuthoredEntities): FloorDataset
```

Same object identity back when there is nothing to apply, so the renderer's memoisation still hits.

## 8. Validation

Reuse `validatePlacement` for authored desks — they are placements like any other, and the boundary, obstacle and overlap rules already exist. An added desk must satisfy the same checks as a moved one.

For rooms, the checks are:

- the rectangle has a usable area — reject a stray click, say under 2 m²;
- it does not overlap another room;
- it is inside the floor outline.

It may overlap a zone. Zones are labelled regions, not containers, and a meeting room inside a department is normal.

## 9. Scope

In:

- `user-authored` provenance and the delete asymmetry, including fixing `delete-desk` for extracted desks;
- authored desk: add, place, validate, number, remove;
- authored room: draw, type, name, remove;
- the overlap report from section 6;
- `AuthoredEntityStore` and the pure merge.

Out:

- editing extracted rooms' geometry;
- open-workspace zone creation — it belongs with the zone editor, and that is agy's area;
- re-extraction reconciliation, beyond stamping `authoredAt` so a later diff has something to work with;
- L-shaped or rotated rooms;
- any backend work.

## 10. Sequencing

Three steps, each shippable:

1. **Foundation** — `user-authored` kind, `RoomType`, the numbering function, `AuthoredEntityStore`, `applyAuthoredEntities`, and the `delete-desk` correction. No new UI. This is where the tests earn their keep.
2. **Desks** — add and remove, reusing the existing placement editor for positioning.
3. **Rooms** — the rectangle tool with wall snapping, the type picker, and the overlap report.

Do not start step 3 before step 1 is reviewed. The drawing tool is the visible part and the easiest to get absorbed in; the provenance rule is the part that is expensive to retrofit.

## 11. File ownership

Three agents are active in this tree. Check before saving.

Free: `domain/spatial.ts`, `domain/authoredEntities.ts` (new), `domain/roomTypes.ts` (new), `components/desk-inspector/deskActions.ts`, new tests.

Coordinate: `components/FloorMap.tsx` and `floorPlanning.css` — agy, zone work and the room drawing tool both land here. `workspace/SpatialWorkspace.tsx` — whoever holds it.

Do not touch `data/floors/floor-16/*.json` or `tools/floorplan_extract/`. Authored entities never enter the extraction.

## 12. Tests

1. An authored desk gets an id no extraction can produce, and a code in the 900 band.
2. Numbers are never reused after a delete.
3. An extracted desk offers no delete action; an authored one does.
4. Deleting an authored desk removes it from the seat count, search and the map.
5. An authored desk fails the same boundary and overlap checks as a moved one.
6. `applyAuthoredEntities` returns the dataset unchanged, same identity, when there is nothing to apply.
7. The canonical dataset is never mutated.
8. A room drawn across desks reports the overlap and changes no desk status.
9. A room under 2 m², or overlapping another room, is refused with a stated reason.
10. A drawn rectangle lands orthogonal after regularisation.
11. The store merges two separate writes instead of replacing.
12. Room types round-trip, and extracted rooms keep the type the extractor gave them.

Then the gates: `vitest run`, `tsc -b`, `oxlint`, `vite build`, `git diff --check`.

## 13. Open questions

```text
does an added desk need approval before it counts toward capacity?
should an authored room appear in the verification view, or only in the workspace view?
who is "authoredBy" before there is a login?
what happens to authored entities when a new PDF arrives — carried, re-confirmed, or dropped?
```

The last one is the re-extraction question. It does not block this slice, but `authoredAt` and `sourcePdfSha256` must be recorded now so that whoever answers it has something to work with.
