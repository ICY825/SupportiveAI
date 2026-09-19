# What survives a reload

Floor planning writes to four different places with three different lifetimes.
This document is the answer to "I moved a desk, where did it go?".

Kept true against the code. See [`README.md`](README.md).

## The matrix

| The user does this | Store | Lives in | Survives reload | Visible to other people |
| --- | --- | --- | --- | --- |
| Moves or rotates a desk, signed in | `createApiLayoutStore` → `/api/layouts/*` | The backend database | Yes | **Yes** |
| Moves or rotates a desk, no session | `sessionLayoutStore` (`workspace/layoutDraft.ts`) | A module-level `Map` | **No** | No |
| Adds or removes a desk or room | `authoredEntityStore` (`domain/authoredEntities.ts`) | `localStorage`, key `vsf.authored-entities.<floorId>` | Yes | **No** — one browser profile only |
| Renames or recolours a zone | `zoneCustomization.ts` | `localStorage`, key `vsf.zones.<floorId>` | Yes | **No** — one browser profile only |
| Assigns or releases a seat, live | `createApiAllocationStore` → `/api/seats/*` | The backend database | Yes | **Yes** |
| Assigns or releases a seat, demo | `sessionAllocationStore` (`allocation/allocationStore.ts`) | A module-level `Map` | **No** | No |

Neither pair is a setting. `useFloorAllocation` reports `demo`, `loading`,
`live` or `failed`; `useFloorLayout` reports `session`, `loading`, `server` or
`failed`. In both cases the page hands the workspace the API-backed store only
on the live branch, and says on screen which branch it is on — the seating view
labels itself demo data, and the workspace states that edits will not survive a
reload. Silence would read as "saved".

## Where a moved desk goes

`LayoutStore` is two methods, and the HTTP implementation is
`workspace/apiLayoutStore.ts`:

```ts
read(floorId: string): Record<string, SpatialPlacement> | null
write(floorId: string, placements: Record<string, SpatialPlacement>): Promise<void>
```

`write` **merges**. A save covers one editing area, not a whole floor, so a
store that replaced its contents would drop every other area's committed
positions. The HTTP store behaves the same way: PATCH, never PUT. It also takes
the floor the server returns rather than the payload it just sent, for the same
reason — the server is the one that merged.

`AuthoredEntityStore.write` follows the same rule, for the same reason: absent
ids keep what they had.

`mergeStoredPlacements` guards the read: a stored layout is only trusted for
entities the current dataset still has, so a layout that predates a
re-extraction cannot resurrect deleted ids or carry stale footprints.

### The layout API

| Route | Does |
| --- | --- |
| `GET /api/layouts/floors/{floor_id}` | Every saved placement, plus the drawing version in force and how many rows follow an older one. |
| `PATCH /api/layouts/floors/{floor_id}` | Merges a batch, then returns the whole floor. |
| `DELETE /api/layouts/floors/{floor_id}/entities/{entity_id}` | Forgets one placement, returning that desk to where the drawing puts it. 204 even when there was nothing to forget. Server-side only so far; no UI calls it. |
| `GET /api/layouts/floors/{floor_id}/reconcile` | Read-only: which saved placements no longer match the drawing. |

Viewing needs `layout.view`, writing needs `layout.manage`. Moving a desk
changes the plan for the whole floor, so an ordinary employee can look and not
touch.

The table holds the difference from the drawing, never the drawing. The dataset
still decides which desks exist; `layout_version` is the source PDF's sha256 at
the time of saving, so re-running the extractor needs no data migration and
reconcile can name the rows that were placed against the old drawing.

### Why the workspace waits for it

`LayoutStore.read` is synchronous — `useLayoutEditor` calls it inside a
`useState` initialiser. A snapshot that arrives one tick later is never read, so
`useFloorLayout` resolves which store to use *before* the page mounts the
workspace, and `createApiLayoutStore` is handed the already-loaded floor. The
request is small; the dataset it waits alongside is 2.9 MB.

It also waits for `Session.ready`. `employee` starts null and is filled from the
cached copy an effect later, so treating the first tick as "signed out" would
build the editor against the page store and then tear it down.

## The gap worth knowing about

Placements and seat assignments are both durable and shared. Authored desks —
desks and rooms a user *added* — are not: they live in one browser's
`localStorage`. So the database can hold a placement, or an assignment, naming
an entity id that only one person's browser can resolve.

Both sides report it rather than hiding it: `/api/seats/floors/<id>/reconcile`
carries `reason: 'missing-seat' | 'old-layout'`, and
`/api/layouts/floors/<id>/reconcile` carries
`reason: 'missing-entity' | 'old-layout'`. An unknown id is deliberately not an
error on the layout write path — a user-added desk is not in the drawing by
definition, and refusing it would break the feature. Until authored entities are
server-side, treat an added desk as a local drafting tool, not a shared fact.

## Test and development seams

- `clearSessionLayouts()` — clears the in-memory layout store.
- `clearSessionAllocations()` — clears the in-memory allocation mutations.
- `clearAuthoredEntityStore()` — clears both the in-memory copy and every
  `vsf.authored-entities.` key in `localStorage`.

All three exist so tests and floor switches start from a known state. Reading
`localStorage` is wrapped and optional throughout: storage can be absent or
throw, and the module must still render.
