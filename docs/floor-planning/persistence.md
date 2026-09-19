# What survives a reload

Floor planning writes to four different places with three different lifetimes.
Nothing in the UI currently says which is which, so this document is the answer
to "I moved a desk, where did it go?".

Kept true against the code. See [`README.md`](README.md).

## The matrix

| The user does this | Store | Lives in | Survives reload | Visible to other people |
| --- | --- | --- | --- | --- |
| Moves or rotates a desk | `sessionLayoutStore` (`workspace/layoutDraft.ts`) | A module-level `Map` | **No** | No |
| Adds or removes a desk or room | `authoredEntityStore` (`domain/authoredEntities.ts`) | `localStorage`, key `vsf.authored-entities.<floorId>` | Yes | **No** — one browser profile only |
| Renames or recolours a zone | `zoneCustomization.ts` | `localStorage`, key `vsf.zones.<floorId>` | Yes | **No** — one browser profile only |
| Assigns or releases a seat, live | `createApiAllocationStore` → `/api/seats/*` | The backend database | Yes | **Yes** |
| Assigns or releases a seat, demo | `sessionAllocationStore` (`allocation/allocationStore.ts`) | A module-level `Map` | **No** | No |

Live and demo are not a setting. `useFloorAllocation` reports a status of
`demo`, `loading`, `live` or `failed`, and `FloorPlanningPage` only hands the
workspace the API-backed store, the directory search and the reconcile report
when the status is `live`. Without a session, the view runs on demo fixtures
and says so.

## Why placements are not durable

There is no layout endpoint. `layoutDraft.ts` states it at the store:

> NOT DURABLE. There is no layout endpoint yet, so a saved layout lives in this
> module for the lifetime of the page and is gone on reload. It exists so the
> editor has one real commit boundary to hand to an API later: replacing this
> object with an HTTP-backed `LayoutStore` is the whole integration.

The seam is already the right shape. `LayoutStore` is two methods:

```ts
read(floorId: string): Record<string, SpatialPlacement> | null
write(floorId: string, placements: Record<string, SpatialPlacement>): Promise<void>
```

`write` **merges**. A save covers one editing area, not a whole floor, so a
store that replaced its contents would drop every other area's committed
positions. An HTTP-backed store has to behave the same way: PATCH, never PUT.

`AuthoredEntityStore.write` follows the same rule, for the same reason: absent
ids keep what they had.

`mergeStoredPlacements` guards the read: a stored layout is only trusted for
entities the current dataset still has, so a layout that predates a
re-extraction cannot resurrect deleted ids or carry stale footprints.

## The gap worth knowing about

Seat assignments are durable and shared. Authored desks are not — they exist in
one browser's `localStorage`. So the database can hold an assignment pointing
at a workstation id that only one person's browser can resolve.

This was anticipated on the assignment side: `/api/seats/floors/<id>/reconcile`
returns a report whose entries carry `reason: 'missing-seat' | 'old-layout'`,
and the workspace surfaces it when the allocation status is `live`. Authored
entities widen the gap rather than create it. Until layouts are server-side,
treat authored desks as a local drafting tool, not as shared facts.

## Test and development seams

- `clearSessionLayouts()` — clears the in-memory layout store.
- `clearSessionAllocations()` — clears the in-memory allocation mutations.
- `clearAuthoredEntityStore()` — clears both the in-memory copy and every
  `vsf.authored-entities.` key in `localStorage`.

All three exist so tests and floor switches start from a known state. Reading
`localStorage` is wrapped and optional throughout: storage can be absent or
throw, and the module must still render.
